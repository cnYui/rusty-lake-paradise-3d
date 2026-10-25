// 233 乐园版开关。提示按钮（看广告得提示）只在 233 乐园版出现，网页版、小红书包、口袋方舟包都没有 MetaH5Ad。
// 233 乐园的打包在 index.html 里先写 window.__RLP_233 = true；开发时用 ?leyuan=1 在本机看效果。
export function isLeyuan() {
  try {
    if (window.__RLP_233 === true) return true;
    return new URLSearchParams(location.search).get('leyuan') === '1';
  } catch {
    return false;
  }
}
