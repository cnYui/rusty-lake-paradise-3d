// 十灾入口；已完成的第一、二、三、四灾可直接玩，开发中的章节由 wip 控制。
// wip: true = 开发中：菜单里仍显示“敬请期待”，只有 URL 带 ?wip=1（或 localStorage rlp3d.wip=1）才能选；?chapter=N 的开发跳转不受影响。完工后删掉 wip。
// requires: 前置章节 id。没通关前置章节时，菜单里这一章是锁着的（通关记录存在本机，见 src/core/progress.js）；
//   通关一章后会自动接着进入下一章（ui.ending 的“进入下一灾”）。第二灾要先通关第一灾，第三灾要先通关第一、二灾（requires 写成数组：全部通关才解锁，所以三灾必须按顺序玩）；
//   第四灾不依赖第二、三灾，所以不写 requires。
// achievements: 这一章的成就表（标题菜单的成就面板按章节列出）。没写的章节，解锁过的成就仍会出现在“其他章节”里。
import { ACHIEVEMENTS as ACH1 } from './plague1/text.js';
import { ACHIEVEMENTS as ACH2 } from './plague2/text.js';
import { ACHIEVEMENTS as ACH3 } from './plague3/text.js';

export const CHAPTERS = [
  { number: 1, id: 'plague1', label: { zh: '第一灾', en: 'Plague I' }, title: { zh: 'x灾', en: 'x' }, achievements: ACH1, load: () => import('./plague1/index.js') },
  { number: 2, id: 'plague2', label: { zh: '第二灾', en: 'Plague II' }, title: { zh: '蛙灾', en: 'Frogs' }, achievements: ACH2, requires: 'plague1', load: () => import('./plague2/index.js') },
  { number: 3, id: 'plague3', label: { zh: '第三灾', en: 'Plague III' }, title: { zh: '蚊灾和虱灾', en: 'Gnats & Lice' }, achievements: ACH3, requires: ['plague1', 'plague2'], load: () => import('./plague3/index.js') },
  { number: 4, id: 'plague4', label: { zh: '第四灾', en: 'Plague IV' }, title: { zh: '蝇灾', en: 'Flies' }, load: () => import('./plague4/index.js') },
  { number: 5, id: 'plague5', label: { zh: '第五灾', en: 'Plague V' }, title: { zh: '疫灾', en: 'Pestilence' }, load: () => import('./plague5/index.js'), wip: true },
  { number: 6, id: 'plague6', label: { zh: '第六灾', en: 'Plague VI' }, title: { zh: '疮灾', en: 'Boils' }, load: null },
  { number: 7, id: 'plague7', label: { zh: '第七灾', en: 'Plague VII' }, title: { zh: '雹灾', en: 'Hail' }, load: null },
  { number: 8, id: 'plague8', label: { zh: '第八灾', en: 'Plague VIII' }, title: { zh: '蝗灾', en: 'Locusts' }, load: null },
  { number: 9, id: 'plague9', label: { zh: '第九灾', en: 'Plague IX' }, title: { zh: '夜灾', en: 'Darkness' }, load: null },
  { number: 10, id: 'plague10', label: { zh: '第十灾', en: 'Plague X' }, title: { zh: '长子之死', en: 'Death of the Firstborn' }, load: null },
];
