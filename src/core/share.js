// 通关分享（小红书小工具）：结尾卡上的“发笔记”“发评论”。
// 只在小红书 App 的小工具容器里出现：window.xhs.miniTool 有 postNote / interactionOpenApi 才给按钮，网页版和口袋方舟包没有。
// 接口见小红书小工具开发者文档 https://miniapp-sandbox.xiaohongshu.com/minitool/doc 的 §3.3 postNote、§3.5 writeTempFile、§3.9 interactionOpenApi：
//   笔记：标题 ≤ 20 字、正文 ≤ 1000 字；图片先用 writeTempFile 换成本地路径，换不到就直接传 data: base64（postNote 两种都收）。
//         成功只代表发布页唤起了，玩家在发布页里还能改、能取消。
//   评论：客户端 9.49+；容器会先关掉小工具再拉起评论区，所以调用前先把存档写完（beforeLeave）。
//         图片只收本地文件句柄（不收 data:），换不到路径就只发文字；miniToolSnapshotInfo ≤ 2 KB（这里只记章节 id，从评论区重开时还没做恢复）。
// 通关卡：3:4（1080×1440）JPEG，上半是此刻的 3D 画面，下半是游戏名、章节、成就和日期，画面右下角盖一个“通关”印章。
// 这个文件顶层不碰 window / document（node --test 直接 import 它测文案）。

export const GAME = {
  name: '锈湖 天堂岛',          // 小工具的名字（正文里“小红书小工具「…」”）
  short: '锈湖天堂岛',          // 笔记标题里用（标题最多 20 字）
  card: '锈湖·天堂岛',          // 通关卡上的大字（字间距在画的时候加）
  en: 'RUSTY LAKE PARADISE · 3D 同人重制',
  unit: '灾',                   // “已通关 5 / 5 灾”
  clearedWord: '已通关',
  fan: '这是《锈湖：天堂岛》的 3D 同人重制，喜欢解谜的可以来试试～',
  tags: ['锈湖', '锈湖天堂岛', '解谜游戏'],
};

export const NOTE_TITLE_MAX = 20;
export const NOTE_CONTENT_MAX = 1000;
export const SNAPSHOT_MAX = 2048;
export const COMMENT_MIN_CLIENT = 9490;   // 客户端 9.49.0（buildVersion 去掉末 3 位编译序号）
export const CARD_W = 1080;
export const CARD_H = 1440;
const SCENE_H = 860;                      // 通关卡上半的 3D 画面高度
const TEMP_MS = 5000;                     // writeTempFile 最多等多久
const VERSION_MS = 800;                   // getLaunchOptions 最多等多久
const SERIF = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';
const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

// ------------------------------------------------------------------------------------------- 文案（纯函数）
const LATIN = /[A-Za-z]/;   // 打包副本里审核敏感字换成了字母（“x灾”“长子之S”），这种标题不写进分享文字

/** “第五灾 · 疫灾”；标题被打码（含字母）或没有标题时只写“第五灾”。 */
export function chapterName(c) {
  const label = (c && c.label && c.label.zh) || '';
  const title = (c && c.title && c.title.zh) || '';
  return title && !LATIN.test(title) ? `${label} · ${title}` : label;
}

/** 按字（码点）截断，不切坏汉字和表情。 */
export function clip(s, n) {
  const a = Array.from(String(s || ''));
  return a.length <= n ? a.join('') : a.slice(0, n).join('');
}

function achLine(info) {
  const parts = [];
  if (info.achTotal > 0) parts.push(`成就 ${info.achGot} / ${info.achTotal}`);
  if (info.total > 0) parts.push(`${info.game.clearedWord} ${info.cleared} / ${info.total} ${info.game.unit}`);
  return parts.join('，');
}

/** 笔记的标题和正文。info 见 main.js 的 shareInfo()。 */
export function noteText(info) {
  const g = info.game;
  const label = (info.chapter && info.chapter.label && info.chapter.label.zh) || '';
  const title = clip(`我通关了${g.short}${label}`, NOTE_TITLE_MAX);
  const lines = [`在小红书小工具「${g.name}」里通关了${chapterName(info.chapter)}！`];
  const ach = achLine(info);
  if (ach) lines.push(`${ach}。`);
  lines.push(g.fan);
  if (g.tags && g.tags.length) lines.push(g.tags.map((t) => `#${t}`).join(' '));
  return { title, content: clip(lines.join('\n'), NOTE_CONTENT_MAX) };
}

/** 评论文字（评论挂在玩家打开小工具的那条笔记下面，不用再写游戏名）。 */
export function commentText(info) {
  const ach = info.achTotal > 0 ? `成就 ${info.achGot}/${info.achTotal}，` : '';
  return `我通关了${chapterName(info.chapter)}！${ach}你们卡在哪一步了？`;
}

/** 从评论区重开小工具时能读到的附加状态（≤ 2 KB）。 */
export function snapshotInfo(info) {
  const s = JSON.stringify({ v: 1, from: 'ending', chapter: (info.chapter && info.chapter.id) || '' });
  return s.length <= SNAPSHOT_MAX ? s : '';
}

function dateText(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// ------------------------------------------------------------------------------------------- 容器接口
function tool() { return (typeof window !== 'undefined' && window.xhs && window.xhs.miniTool) || null; }
function has(name) { const t = tool(); return !!t && typeof t[name] === 'function'; }

function withTimeout(p, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 超时`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function readBuildVersion(lo) {
  const env = lo && lo.miniToolEnv;
  return Number(env && env.buildVersion) || 0;
}

async function buildVersion() {
  const x = window.xhs;
  const v = readBuildVersion(x && x.launchOptions);
  if (v) return v;
  if (!has('getLaunchOptions')) return 0;
  try { return readBuildVersion(await withTimeout(tool().getLaunchOptions(), VERSION_MS, 'getLaunchOptions')); } catch { return 0; }
}

/** 这里能发什么：{ note, comment }。评论要客户端 9.49+，取不到版本号时按不支持处理。 */
export async function shareCaps() {
  if (!tool()) return { note: false, comment: false };
  const note = has('postNote');
  let comment = has('interactionOpenApi');
  if (comment) comment = Math.floor((await buildVersion()) / 1000) >= COMMENT_MIN_CLIENT;
  return { note, comment };
}

function errText(e) {
  const m = String((e && (e.errMsg || e.message)) || e || '');
  if (/cancel|取消/i.test(m)) return '已取消';
  return e && e.errCode != null ? `错误 ${e.errCode}` : '';
}

async function toTempPath(dataUrl) {
  if (!dataUrl || !has('writeTempFile')) return null;
  try {
    const r = await withTimeout(tool().writeTempFile({ data: dataUrl }), TEMP_MS, 'writeTempFile');
    return (r && r.filePath) || null;
  } catch (e) {
    console.warn('[share] writeTempFile 失败', e);
    return null;
  }
}

// ------------------------------------------------------------------------------------------- 通关卡
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = url;
  });
}

/** 此刻的 3D 画面（engine.capture 先渲染一帧再读画布）；拿不到就 null，卡片照样画。 */
async function sceneImage(engine) {
  try {
    const url = engine && typeof engine.capture === 'function' ? engine.capture({ type: 'image/jpeg', quality: 0.92 }) : null;
    if (!url || url.length < 2000) return null;
    return await loadImage(url);
  } catch (e) {
    console.warn('[share] 截取画面失败', e);
    return null;
  }
}

/** 按 cover 方式把图铺满矩形（居中裁掉多出来的部分）。 */
function drawCover(g, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k, sh = h / k;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** 居中写一行字，字间距手动加（Chrome 61 的画布没有 letterSpacing）。 */
function spaced(g, text, cx, y, font, color, gap = 0) {
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const chars = Array.from(text);
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => { g.fillText(c, x, y); x += widths[i] + gap; });
}

function seal(g, cx, cy, size) {
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.16);
  g.globalAlpha = 0.92;
  g.fillStyle = '#9b2d24';
  const r = size * 0.12, s = size / 2;
  g.beginPath();
  g.moveTo(-s + r, -s); g.lineTo(s - r, -s); g.quadraticCurveTo(s, -s, s, -s + r);
  g.lineTo(s, s - r); g.quadraticCurveTo(s, s, s - r, s);
  g.lineTo(-s + r, s); g.quadraticCurveTo(-s, s, -s, s - r);
  g.lineTo(-s, -s + r); g.quadraticCurveTo(-s, -s, -s + r, -s);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(243, 233, 220, 0.85)';
  g.lineWidth = size * 0.035;
  g.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
  g.fillStyle = '#f3e9dc';
  g.font = `${Math.round(size * 0.36)}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('通', 0, -size * 0.19);
  g.fillText('关', 0, size * 0.21);
  g.restore();
}

/** 画通关卡，返回 JPEG 的 data URL。 */
export async function shareCard(info, engine) {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0c0b';
  g.fillRect(0, 0, CARD_W, CARD_H);

  const shot = await sceneImage(engine);
  if (shot) drawCover(g, shot, 0, 0, CARD_W, SCENE_H);
  // 画面下沿渐隐到底色，四角压暗
  const fade = g.createLinearGradient(0, SCENE_H - 340, 0, SCENE_H);
  fade.addColorStop(0, 'rgba(13, 12, 11, 0)');
  fade.addColorStop(1, 'rgba(13, 12, 11, 1)');
  g.fillStyle = fade;
  g.fillRect(0, SCENE_H - 340, CARD_W, 340);
  const vig = g.createRadialGradient(CARD_W / 2, SCENE_H * 0.45, SCENE_H * 0.35, CARD_W / 2, SCENE_H * 0.45, CARD_W * 0.85);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, CARD_W, SCENE_H);

  g.strokeStyle = 'rgba(232, 217, 168, 0.38)';
  g.lineWidth = 2;
  g.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);

  const gm = info.game;
  spaced(g, gm.card, CARD_W / 2, 975, `72px ${SERIF}`, '#efebe2', 14);
  spaced(g, gm.en, CARD_W / 2, 1032, `italic 28px Georgia, "Times New Roman", serif`, '#b9b4a8', 2);
  spaced(g, chapterName(info.chapter), CARD_W / 2, 1150, `58px ${SERIF}`, '#e8d9a8', 8);
  const ach = achLine(info).replace('，', '　·　');
  if (ach) spaced(g, ach, CARD_W / 2, 1232, `34px ${SANS}`, '#b9b4a8', 1);
  spaced(g, `${dateText()}　·　小红书小工具「${gm.name}」`, CARD_W / 2, 1352, `26px ${SANS}`, '#8f8a80', 1);
  seal(g, CARD_W - 190, SCENE_H - 150, 150);

  return c.toDataURL('image/jpeg', 0.9);
}

// ------------------------------------------------------------------------------------------- 发笔记 / 发评论
/** 唤起笔记发布页，带上通关卡。返回 { ok, msg }（不会 reject）。 */
export async function postClearNote(info, engine) {
  if (!has('postNote')) return { ok: false, msg: '这里不能发笔记' };
  let url = null;
  try { url = await shareCard(info, engine); } catch (e) { console.warn('[share] 通关卡没画出来', e); }
  if (!url) return { ok: false, msg: '通关卡没生成出来' };
  const media = (await toTempPath(url)) || url;
  const { title, content } = noteText(info);
  try {
    await tool().postNote({ title, content, pageType: 'photo_publish', mediaInfo: { image_resources: [{ url: media }] } });
    return { ok: true, msg: '' };
  } catch (e) {
    console.warn('[share] postNote 失败', e);
    return { ok: false, msg: errText(e) };
  }
}

/** 带着评论草稿（文字 + 通关卡）拉起评论区；容器会先关掉小工具，所以先跑 beforeLeave（存档）。返回 { ok, msg }（不会 reject）。 */
export async function postClearComment(info, engine, beforeLeave) {
  if (!has('interactionOpenApi')) return { ok: false, msg: '这里不能发评论' };
  let path = null;
  try { path = await toTempPath(await shareCard(info, engine)); } catch (e) { console.warn('[share] 通关卡没画出来', e); }
  const payload = { action: 'post_comment', content: commentText(info) };
  if (path) payload.media_bean = [{ media_type: 'image', cover_image_url: path }];
  const snap = snapshotInfo(info);
  if (snap) payload.miniToolSnapshotInfo = snap;
  if (beforeLeave) { try { await beforeLeave(); } catch (e) { console.warn('[share] 存档失败', e); } }
  try {
    const r = await tool().interactionOpenApi({ payload, saveToAlbum: false });
    if (r && r.routed === false) return { ok: false, msg: '' };
    return { ok: true, msg: '' };
  } catch (e) {
    console.warn('[share] interactionOpenApi 失败', e);
    return { ok: false, msg: errText(e) };
  }
}
