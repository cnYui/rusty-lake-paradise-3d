"""演示视频录制：Playwright 页面的画面（CDP screencast，JPEG）+ 游戏自己合成的声音（WebAudio 抓取）→ mp4。

用法（见 record_plague2_demo.py）：
    rec = Recorder(context, out_dir, size=(1280, 720))
    page = context.new_page(); rec.attach(page)        # 要在 goto 之前
    ...玩...
    rec.finish(Path('demo.mp4'))

为什么不用 Playwright 自带的 record_video：它把视频码率固定在 1 Mbps 左右，3D 画面糊；而且没有声音。
这里画面和声音的时间戳都取自同一台机器的墙钟（screencast 的 metadata.timestamp、页面里的 Date.now()），
所以不需要再手工对口型。页面里的每一次重载（标题菜单选章会重载）都会产生一段新的声音，按开始时刻拼回时间线。
"""
import base64
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

# 注入每个文档：① 假光标和点击涟漪（无头浏览器录不到系统光标）② 把送往 AudioContext.destination 的声音再接一路到 MediaRecorder
INIT_JS = r"""
(() => {
  if (window.__demoTap) return;
  window.__demoTap = true;

  // ---------- 假光标 ----------
  let cur = null, last = null;
  const ensure = () => {
    if (cur || !document.documentElement) return;
    cur = document.createElement('div');
    cur.id = '__demo_cursor';
    cur.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;will-change:transform;display:none';
    cur.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L17 23.4 L13.6 16 L20.5 16 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cur);
  };
  const place = (x, y) => {
    ensure();
    if (!cur) return;
    last = [x, y];
    cur.style.display = 'block';
    cur.style.transform = `translate(${x - 5}px,${y - 3}px)`;
  };
  window.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') place(e.clientX, e.clientY); }, true);
  window.addEventListener('mousedown', (e) => {
    ensure();
    const r = document.createElement('div');
    r.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.95);box-shadow:0 0 10px rgba(0,0,0,.5);z-index:2147483646;pointer-events:none`;
    document.documentElement.appendChild(r);
    r.animate([{ transform: 'scale(.25)', opacity: 1 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 480, easing: 'ease-out' }).onfinish = () => r.remove();
  }, true);

  // ---------- 声音抓取 ----------
  const orig = AudioNode.prototype.connect;
  const taps = new WeakMap();
  const docId = Math.random().toString(36).slice(2, 8);
  let ctxCount = 0;
  const toB64 = (buf) => {
    const u8 = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const tapFor = (ctx) => {
    let t = taps.get(ctx);
    if (t) return t;
    if (typeof ctx.createMediaStreamDestination !== 'function' || ctx instanceof OfflineAudioContext) return null;
    const md = ctx.createMediaStreamDestination();
    const id = docId + '-' + (ctxCount++);
    const rec = new MediaRecorder(md.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
    let startEpoch = 0, idx = 0, chain = Promise.resolve();
    rec.onstart = () => { startEpoch = Date.now(); };
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const i = idx++, st = startEpoch;
      chain = chain.then(async () => {
        const b64 = toB64(await e.data.arrayBuffer());
        if (window.__audioChunk) await window.__audioChunk(id, i, st, b64);
      }).catch(() => {});
    };
    rec.start(500);
    t = { md, rec };
    taps.set(ctx, t);
    return t;
  };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    try {
      if (dest instanceof AudioDestinationNode) {
        const t = tapFor(dest.context);
        if (t) orig.call(this, t.md);
      }
    } catch (e) { /* 抓不到声音不影响游戏 */ }
    return r;
  };
})();
"""


class Recorder:
    def __init__(self, context, out_dir, size=(1280, 720), fps=30, quality=None):
        self.context = context
        self.out_dir = Path(out_dir)
        self.size = size
        self.fps = fps
        # 画质可以用环境变量拉高（发布用的母版）：DEMO_JPEG_Q（截屏的 JPEG 质量，默认 92）、DEMO_CRF（H.264，默认 25）、DEMO_PRESET（默认 faster）
        self.quality = int(quality if quality is not None else os.environ.get('DEMO_JPEG_Q', 92))
        self.frames_dir = self.out_dir / 'frames'
        if self.out_dir.exists():
            shutil.rmtree(self.out_dir)
        self.frames_dir.mkdir(parents=True)
        self.frames = []            # [(timestamp 秒, 文件名)]
        self.audio = {}             # id → {'start': 毫秒, 'chunks': {i: bytes}}
        self.lock = threading.Lock()
        self.cdp = None
        self.page = None
        context.add_init_script(INIT_JS)
        context.expose_function('__audioChunk', self._on_audio)

    # ------------------------------------------------------------ 抓取
    def _on_audio(self, seg_id, idx, start_ms, b64):
        with self.lock:
            seg = self.audio.setdefault(seg_id, {'start': start_ms, 'chunks': {}})
            seg['chunks'][idx] = base64.b64decode(b64)
        return True

    def _on_frame(self, ev):
        data = base64.b64decode(ev['data'])
        ts = ev['metadata']['timestamp']
        name = f'{len(self.frames):06d}.jpg'
        (self.frames_dir / name).write_bytes(data)
        self.frames.append((ts, name))
        try:
            self.cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
        except Exception:
            pass

    def attach(self, page):
        self.page = page
        self.cdp = self.context.new_cdp_session(page)
        self.cdp.on('Page.screencastFrame', self._on_frame)
        self.cdp.send('Page.startScreencast', {
            'format': 'jpeg', 'quality': self.quality,
            'maxWidth': self.size[0], 'maxHeight': self.size[1], 'everyNthFrame': 1,
        })

    # ------------------------------------------------------------ 合成
    def finish(self, out_path, tail_seconds=2.0, keep_frames=False):
        out_path = Path(out_path)
        time.sleep(0.5)
        try:
            self.page.wait_for_timeout(int(tail_seconds * 1000))   # 让结尾多停几秒，也让事件泵一遍
            self.cdp.send('Page.stopScreencast')
        except Exception:
            pass
        frames = sorted(self.frames)
        if len(frames) < 2:
            raise RuntimeError(f'只抓到 {len(frames)} 帧画面')
        t0 = frames[0][0]
        t_end = frames[-1][0] + 1.0 / self.fps
        duration = t_end - t0
        # 画面：concat 清单（变帧率，按时间戳给每帧时长）→ 固定 fps 的 H.264
        lst = self.out_dir / 'frames.txt'
        with lst.open('w', encoding='utf-8') as f:
            for i, (ts, name) in enumerate(frames):
                nxt = frames[i + 1][0] if i + 1 < len(frames) else t_end
                f.write(f"file 'frames/{name}'\nduration {max(nxt - ts, 0.001):.6f}\n")
            f.write(f"file 'frames/{frames[-1][1]}'\n")
        silent = self.out_dir / 'video_silent.mp4'
        self._ffmpeg(['-f', 'concat', '-safe', '0', '-i', str(lst),
                      '-vf', f'fps={self.fps},scale={self.size[0]}:{self.size[1]}:flags=lanczos,format=yuv420p',
                      '-c:v', 'libx264', '-preset', os.environ.get('DEMO_PRESET', 'faster'), '-crf', os.environ.get('DEMO_CRF', '25'), '-movflags', '+faststart', str(silent)])
        # 声音：每段按开始时刻放回时间线
        segs = []
        with self.lock:
            for seg_id, seg in sorted(self.audio.items(), key=lambda kv: kv[1]['start']):
                data = b''.join(seg['chunks'][i] for i in sorted(seg['chunks']))
                if len(data) < 1000:
                    continue
                p = self.out_dir / f'audio_{seg_id}.webm'
                p.write_bytes(data)
                segs.append((p, seg['start'] / 1000.0 - t0))
        report = {'frames': len(frames), 'duration': round(duration, 2), 'audio_segments': [(p.name, round(off, 2)) for p, off in segs]}
        if not segs:
            shutil.copy(silent, out_path)
            report['audio'] = 'none'
            if not keep_frames:
                shutil.rmtree(self.frames_dir, ignore_errors=True)
            return report
        cmd = ['-i', str(silent)]
        for p, _ in segs:
            cmd += ['-i', str(p)]
        parts, labels = [], []
        for k, (_, off) in enumerate(segs, start=1):
            if off >= 0:
                parts.append(f'[{k}:a]adelay={int(off * 1000)}|{int(off * 1000)},asetpts=PTS-STARTPTS[a{k}]')
            else:
                parts.append(f'[{k}:a]atrim=start={-off:.3f},asetpts=PTS-STARTPTS[a{k}]')
            labels.append(f'[a{k}]')
        mix = ''.join(labels) + f'amix=inputs={len(segs)}:normalize=0:dropout_transition=0,apad,atrim=0:{duration:.3f}[a]'
        self._ffmpeg(cmd + ['-filter_complex', ';'.join(parts + [mix]), '-map', '0:v', '-map', '[a]',
                            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out_path)])
        if not keep_frames:
            shutil.rmtree(self.frames_dir, ignore_errors=True)
            for f in [silent, lst, *[p for p, _ in segs]]:
                try:
                    f.unlink()
                except OSError:
                    pass
        return report

    @staticmethod
    def _ffmpeg(args):
        res = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], capture_output=True, text=True)
        if res.returncode:
            raise RuntimeError('ffmpeg 失败：' + res.stderr[-1500:])
