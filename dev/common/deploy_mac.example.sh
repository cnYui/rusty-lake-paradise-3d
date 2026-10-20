#!/usr/bin/env bash
# 示例：把游戏部署到一台自己的服务器。真正的 dev/common/deploy_mac.sh 里写了私有的主机地址 / 用户名 / 密钥路径，只放本地、不进公开仓库；
# 这个文件把它们改成必须通过环境变量传入：DEPLOY_HOST、DEPLOY_USER、DEPLOY_KEY、DEPLOY_DIR（DEPLOY_URL 可选）。
# 把游戏部署到 MacBook（经 Tailscale SSH），公网地址 https://aaccx.pw/rusty-lake/
#
# 公网链路：Cloudflare（aaccx.pw）→ cloudflared 隧道（Mac 上 ~/.cloudflared/config.yml 里
#   `^/rusty-lake(/.*)?$` 这条规则）→ nginx 127.0.0.1:8081（/opt/homebrew/etc/nginx/servers/yui-web-extras.conf）
#   → 部署目录。同一域名下的主页（node 4173）和 Sub2API（Docker 127.0.0.1:8080）走各自的规则，互不影响。
#
# 部署目录结构：
#   index.html          入口页，每次请求都回源确认（no-cache）
#   v<时间戳>/           这一版的 styles.css、src/、lib/three/，内容不再变化，可以长期缓存
# 每次部署上传一个新的版本目录，最后才覆盖 index.html：正在玩的人不会加载到新旧混杂的模块，
# 也不需要手动清 Cloudflare 缓存。旧版本目录保留（每个约 4MB），需要时手动删除。
# 注意：Cloudflare 的 WAF 会拦截路径里带 /vendor/ 的请求，所以 three.js 以 lib/ 的名字上线。
#
# 用法（在项目根目录，Git Bash / macOS / Linux 均可）：bash dev/common/deploy_mac.sh
# 可用环境变量覆盖：DEPLOY_HOST、DEPLOY_USER、DEPLOY_KEY、DEPLOY_DIR、DEPLOY_URL
set -euo pipefail

HOST="${DEPLOY_HOST:?请设置 DEPLOY_HOST（部署用的主机，例如它的 Tailscale 地址）}"
USER_NAME="${DEPLOY_USER:?请设置 DEPLOY_USER（SSH 用户名）}"
KEY="${DEPLOY_KEY:?请设置 DEPLOY_KEY（SSH 私钥路径）}"
DEST="${DEPLOY_DIR:?请设置 DEPLOY_DIR（主机上的部署目录）}"
URL="${DEPLOY_URL:-https://aaccx.pw/rusty-lake/}"
VER="v$(date +%Y%m%d-%H%M%S)"

cd "$(dirname "$0")/../.."
for f in index.html styles.css src vendor/three; do [ -e "$f" ] || { echo "缺少 $f" >&2; exit 1; }; done

# 1. 在临时目录里组装这一版
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$VER/lib"
cp styles.css "$STAGE/$VER/"
cp -r src "$STAGE/$VER/src"
cp -r vendor/three "$STAGE/$VER/lib/three"
sed -e "s#href=\"styles.css\"#href=\"$VER/styles.css\"#" \
    -e "s#\"\./vendor/three/#\"./$VER/lib/three/#g" \
    -e "s#src=\"src/main.js\"#src=\"$VER/src/main.js\"#" \
    index.html > "$STAGE/index.html"
grep -q "\"$VER/styles.css\"" "$STAGE/index.html" \
  && grep -q "\"./$VER/lib/three/three.module.js\"" "$STAGE/index.html" \
  && grep -q "\"./$VER/lib/three/addons/\"" "$STAGE/index.html" \
  && grep -q "\"$VER/src/main.js\"" "$STAGE/index.html" \
  && ! grep -q "vendor/" "$STAGE/index.html" \
  || { echo "index.html 里的资源路径没有全部换成 $VER/" >&2; exit 1; }

# 2. 上传：tar 按顺序解压，先写完版本目录，最后才覆盖 index.html
echo "→ 上传 $VER 到 $USER_NAME@$HOST:$DEST"
tar -C "$STAGE" -czf - "$VER" index.html | ssh -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 \
  -i "$KEY" "$USER_NAME@$HOST" "set -e
  mkdir -p '$DEST' && cd '$DEST'
  tar -xzf -
  chmod -R a+rX '$VER' index.html
  echo \"  $VER：\$(find '$VER' -type f | wc -l | tr -d ' ') 个文件；现有版本：\$(ls -d v[0-9]*/ | tr -d '/' | tr '\n' ' ')\""

# 3. 线上检查：入口页是游戏、模块是 JavaScript
echo "→ 检查 $URL"
title=$(curl -s --max-time 30 "$URL" | grep -o '<title>[^<]*</title>' || true)
js=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 30 "$URL$VER/src/main.js" || true)
three=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$URL$VER/lib/three/three.module.js" || true)
echo "  入口：$title"
echo "  $VER/src/main.js：$js；three.module.js：$three"
case "$title|$js|$three" in
  *Rusty*"|200 "*javascript*"|200") echo "✓ 部署完成：$URL" ;;
  *) echo "⚠ 线上检查没通过（隧道规则或 nginx 的 /rusty-lake/ 配置是否还在？）" >&2; exit 1 ;;
esac
