// The ten plagues. Only Plague I is playable so far; the rest show as locked in the menu.
// wip: true = 开发中：菜单里仍显示“敬请期待”，只有 URL 带 ?wip=1（或 localStorage rlp3d.wip=1）才能选；?chapter=N 的开发跳转不受影响。完工后删掉 wip。
export const CHAPTERS = [
  { number: 1, id: 'plague1', label: { zh: '第一灾', en: 'Plague I' }, title: { zh: 'x灾', en: 'x' }, load: () => import('./plague1/index.js') },
  { number: 2, id: 'plague2', label: { zh: '第二灾', en: 'Plague II' }, title: { zh: '蛙灾', en: 'Frogs' }, load: () => import('./plague2/index.js'), wip: true },
  { number: 3, id: 'plague3', label: { zh: '第三灾', en: 'Plague III' }, title: { zh: '虱灾', en: 'Lice' }, load: null },
  { number: 4, id: 'plague4', label: { zh: '第四灾', en: 'Plague IV' }, title: { zh: '蝇灾', en: 'Flies' }, load: null },
  { number: 5, id: 'plague5', label: { zh: '第五灾', en: 'Plague V' }, title: { zh: '疫灾', en: 'Pestilence' }, load: null },
  { number: 6, id: 'plague6', label: { zh: '第六灾', en: 'Plague VI' }, title: { zh: '疮灾', en: 'Boils' }, load: null },
  { number: 7, id: 'plague7', label: { zh: '第七灾', en: 'Plague VII' }, title: { zh: '雹灾', en: 'Hail' }, load: null },
  { number: 8, id: 'plague8', label: { zh: '第八灾', en: 'Plague VIII' }, title: { zh: '蝗灾', en: 'Locusts' }, load: null },
  { number: 9, id: 'plague9', label: { zh: '第九灾', en: 'Plague IX' }, title: { zh: '夜灾', en: 'Darkness' }, load: null },
  { number: 10, id: 'plague10', label: { zh: '第十灾', en: 'Plague X' }, title: { zh: '长子之死', en: 'Death of the Firstborn' }, load: null },
];
