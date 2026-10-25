r"""233 乐园版口袋方舟 H5 包 = `build.py --ark` 的产物 + 提示按钮开关（window.__RLP_233）+ 233 广告 SDK。

不改 build.py（别的会话在改它）：先调它打出 ark 包，再在输出目录里
  1. ark_cfg.js 末尾加 `window.__RLP_233 = true;`（src/core/leyuan.js 读它，灯泡按钮才显示）
  2. index.html 里在 ark_cfg.js 之后加广告 SDK <script async>（async：CDN 慢或不通时不挡游戏启动，也不会让载入页卡住；
     SDK 没到时点灯泡只会提示“当前环境暂不支持广告”）
  3. 重新打 zip（根目录就是 index.html）

用法：python dev/minitool/make_leyuan.py [--out <目录>] [--zip <zip 路径>]
默认输出 dev/minitool/dist-ark-leyuan-<日期>/ 和 upload/ark/rusty-lake-ark-ch1234-leyuan-<日期>.zip。
验收：python dev/minitool/test_leyuan.py <目录>；再用 MINITOOL_DIST=<目录> python dev/minitool/test_ark.py --full 跑原有的 ark 验收。
"""
import argparse
import datetime
import hashlib
import os
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SDK_URL = 'https://cdn.233xyx.com/h5ad/metah5ad_v1.min.js'


def main():
    day = datetime.date.today().strftime('%Y%m%d')
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, f'dist-ark-leyuan-{day}'))
    ap.add_argument('--zip', default=os.path.join(ROOT, 'upload', 'ark', f'rusty-lake-ark-ch1234-leyuan-{day}.zip'))
    a = ap.parse_args()
    out, final_zip = os.path.abspath(a.out), os.path.abspath(a.zip)

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, os.path.join(HERE, 'build.py'), '--ark', '--out', out, '--zip', os.path.join(tmp, 'base.zip')], check=True)

    cfg = os.path.join(out, 'ark_cfg.js')
    with open(cfg, encoding='utf-8', newline='') as f:
        s = f.read()
    assert '__RLP_233' not in s, 'ark_cfg.js 已经有 __RLP_233'
    with open(cfg, 'w', encoding='utf-8', newline='') as f:
        f.write(s.rstrip('\n') + '\n// 233 乐园版：显示提示按钮（看广告得提示，见 src/core/leyuan.js、hintflow.js）\nwindow.__RLP_233 = true;\n')

    idx = os.path.join(out, 'index.html')
    with open(idx, encoding='utf-8', newline='') as f:
        h = f.read()
    anchor = '<script src="./ark_cfg.js"></script>'
    assert h.count(anchor) == 1, 'index.html 里找不到 ark_cfg.js 的 script 标签（build.py 改了输出格式？）'
    assert SDK_URL not in h
    h = h.replace(anchor, anchor + f'\n<script async src="{SDK_URL}"></script>')
    with open(idx, 'w', encoding='utf-8', newline='') as f:
        f.write(h)

    os.makedirs(os.path.dirname(final_zip), exist_ok=True)
    if os.path.exists(final_zip):
        os.remove(final_zip)
    names = sorted(n for n in os.listdir(out) if os.path.isfile(os.path.join(out, n)))
    assert 'index.html' in names
    with zipfile.ZipFile(final_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.write(os.path.join(out, n), n)   # 根目录平铺，index.html 在根
    with open(final_zip, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    print(f'输出目录 {out}\n文件 {names}\nzip {final_zip}  {os.path.getsize(final_zip)} 字节  SHA256 {sha}')


if __name__ == '__main__':
    main()
