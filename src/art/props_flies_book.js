// 第四灾的线索道具：翻页书和带罗马数字滑轨的窗闩。
// 四枚纹章的位置线索都画在书里：S:Ⅰ、箭头:Ⅲ、⊖ 与 8、△=Ⅹ（见 dev/common/ref/P04 抽帧 13:15–16:30）。
import { THREE, toon, unlit, canvasTexture, TAU, group, mesh, bake } from './props_flies_kit.js';
import { rng } from './materials.js';

const HAND = '"Kaiti SC","STKaiti","KaiTi","Segoe Script","Microsoft YaHei",serif';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** 四枚纹章的画法；窗上的滑片和书里的线索共用同一套笔画。 */
export const WINDOW_GLYPHS = ['S', 'arrow', 'bar', 'tri'];
export function drawGlyph(g, kind, cx, cy, s, color = '#2a2a26', width = s * 0.13) {
  g.save(); g.translate(cx, cy); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'S') {
    g.moveTo(0.38 * s, -0.52 * s); g.bezierCurveTo(-0.5 * s, -0.78 * s, -0.55 * s, -0.04 * s, 0, 0);
    g.bezierCurveTo(0.55 * s, 0.04 * s, 0.5 * s, 0.78 * s, -0.38 * s, 0.52 * s);
  } else if (kind === 'arrow') {
    g.moveTo(0, 0.6 * s); g.lineTo(0, -0.6 * s); g.moveTo(-0.34 * s, -0.18 * s); g.lineTo(0, -0.6 * s); g.lineTo(0.34 * s, -0.18 * s);
  } else if (kind === 'bar') {
    g.arc(0, 0, 0.46 * s, 0, TAU); g.moveTo(-0.6 * s, 0); g.lineTo(0.6 * s, 0);
  } else {
    g.moveTo(0, -0.52 * s); g.lineTo(0.5 * s, 0.4 * s); g.lineTo(-0.5 * s, 0.4 * s); g.closePath();
  }
  g.stroke(); g.restore();
}

// ---------------------------------------------------------------------------
// 书页：赭黄色纸，手绘线条。每个跨页由左右两张 640×820 的画布组成。
const PW = 640, PH = 820, PAPER = '#e8bb61', INK = '#7a5326', FAINT = '#a9803d';

function page(draw, seed = 1) {
  return canvasTexture(PW, PH, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) { g.fillStyle = r() > 0.5 ? 'rgba(120,80,30,0.07)' : 'rgba(255,230,160,0.12)'; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 3); }
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(34, 34, w - 68, h - 68);
    g.lineWidth = 1.5; g.strokeRect(46, 46, w - 92, h - 92);
    for (const [x, y] of [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]]) { g.beginPath(); g.arc(x, y, 12, 0, TAU); g.stroke(); }
    g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
    draw(g, w, h, r);
  }, { wrap: false });
}
const text = (g, s, x, y, size = 40, color = INK, align = 'center') => {
  g.save(); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.font = `${size}px ${HAND}`; g.fillText(s, x, y); g.restore();
};
const poly = (g, pts, close = false) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); g.stroke(); };
const circle = (g, x, y, r, fill = false) => { g.beginPath(); g.arc(x, y, r, 0, TAU); fill ? g.fill() : g.stroke(); };
const cubeIcon = (g, x, y, s) => {
  poly(g, [[x, y - s], [x + s * 0.87, y - s * 0.5], [x + s * 0.87, y + s * 0.5], [x, y + s], [x - s * 0.87, y + s * 0.5], [x - s * 0.87, y - s * 0.5]], true);
  poly(g, [[x - s * 0.87, y - s * 0.5], [x, y], [x + s * 0.87, y - s * 0.5]]); poly(g, [[x, y], [x, y + s]]);
};
const flame = (g, x, y, s) => {
  g.beginPath(); g.moveTo(x, y + s); g.bezierCurveTo(x - s * 0.9, y + s * 0.6, x - s * 0.5, y - s * 0.1, x - s * 0.1, y - s * 0.6);
  g.bezierCurveTo(x, y - s * 0.2, x + s * 0.2, y - s * 0.1, x + s * 0.2, y - s * 0.4); g.bezierCurveTo(x + s * 0.9, y + s * 0.1, x + s * 0.8, y + s * 0.7, x, y + s); g.stroke();
};
function owlTotem(g, cx, cy, s = 1) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.lineWidth = 3;
  for (const m of [-1, 1]) {
    poly(g, [[m * 40, -170], [m * 58, -214], [m * 78, -168]]);
    g.beginPath(); g.moveTo(m * 70, -110); for (let i = 0; i < 4; i++) g.quadraticCurveTo(m * (130 + i * 36), -112 + i * 30, m * (100 + i * 36), -86 + i * 30);
    g.lineTo(m * 70, -20); g.stroke();
    poly(g, [[m * 70, -86], [m * 190, -70]]); poly(g, [[m * 70, -62], [m * 170, -44]]);
  }
  g.beginPath(); g.moveTo(-76, -140); g.quadraticCurveTo(-90, -190, 0, -190); g.quadraticCurveTo(90, -190, 76, -140); g.lineTo(60, -92); g.lineTo(-60, -92); g.closePath(); g.stroke();
  for (const m of [-1, 1]) { circle(g, m * 34, -140, 22); circle(g, m * 34, -140, 9); poly(g, [[m * 12, -168], [m * 56, -158]]); }
  poly(g, [[-8, -128], [0, -104], [8, -128]]);
  g.strokeRect(-62, -90, 124, 150);
  for (let y = -60; y < 60; y += 30) poly(g, [[-62, y], [62, y]]);
  g.beginPath(); g.moveTo(-26, 60); g.lineTo(-26, 8); g.arc(0, 8, 26, Math.PI, 0); g.lineTo(26, 60); g.stroke();
  poly(g, [[-80, 60], [80, 60]]); poly(g, [[-96, 76], [96, 76]]);
  g.restore();
}
function owlFace(g, cx, cy, s = 1) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.lineWidth = 4;
  for (const m of [-1, 1]) {
    poly(g, [[m * 40, -120], [m * 110, -176], [m * 130, -96]]);
    circle(g, m * 60, -62, 44); circle(g, m * 60, -62, 20, true);
    g.beginPath(); g.moveTo(m * 20, -96); g.quadraticCurveTo(m * 70, -128, m * 126, -96); g.stroke();
  }
  poly(g, [[-14, -52], [0, 4], [14, -52]], true);
  g.fillStyle = FAINT;
  for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(i * 16, 30); g.lineTo(i * 14, 230 - Math.abs(i) * 24); g.lineTo(i * 14 + 8, 30); g.fill(); }
  g.restore();
}
function stickFigure(g, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = '#1a1612'; g.strokeStyle = '#1a1612'; g.lineWidth = 6;
  circle(g, 0, -90, 14, true); poly(g, [[0, -76], [0, 10]]); poly(g, [[-26, -50], [0, -70], [26, -50]]); poly(g, [[0, 10], [-18, 90]]); poly(g, [[0, 10], [18, 90]]);
  poly(g, [[-26, -50], [-30, -4]]); poly(g, [[26, -50], [30, -4]]); g.restore();
}
function fontIcon(g, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.lineWidth = 3;
  poly(g, [[-70, 0], [-56, 56], [56, 56], [70, 0]]); g.beginPath(); g.ellipse(0, 0, 70, 18, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(0, 56, 56, 12, 0, 0, Math.PI); g.stroke();
  for (const x of [-30, 0, 30]) poly(g, [[x, 8], [x + 10, 40]]);
  g.restore();
}

const SPREAD_DRAW = [
  [ // 猫头鹰图腾 + S:Ⅰ ；「将会有一个人遇见死亡 / 另一个启发」
    (g) => {
      drawGlyph(g, 'S', 100, 112, 52, INK, 6); text(g, ':', 142, 112, 48); text(g, 'Ⅰ', 176, 112, 50);
      owlTotem(g, PW / 2, 420, 1.3);
      text(g, '锈湖的光辉之日', PW / 2, 676, 40); text(g, '终将来临', PW / 2, 724, 40);
    },
    (g) => {
      text(g, '将会有一个人', PW / 2, 150, 44); text(g, '遇见死亡', PW / 2, 206, 44);
      text(g, '另一个', PW / 2, 330, 40); text(g, '启发', PW / 2, 384, 40);
      g.lineWidth = 3; flame(g, PW / 2 - 40, 560, 76); flame(g, PW / 2 + 36, 580, 60); flame(g, PW / 2, 610, 40);
    },
  ],
  [ // 圆轮「启发 / 被选择的人」 + 长生不老药配方图（含 Λ:3）
    (g) => {
      text(g, '启发', PW / 2, 118, 44);
      g.lineWidth = 3; circle(g, PW / 2, 400, 176); circle(g, PW / 2, 400, 160);
      poly(g, [[PW / 2, 240], [PW / 2, 560]]); poly(g, [[PW / 2 - 160, 400], [PW / 2 + 160, 400]]);
      poly(g, [[PW / 2, 330], [PW / 2 - 30, 280], [PW / 2 - 52, 296]]); poly(g, [[PW / 2, 330], [PW / 2 + 30, 280], [PW / 2 + 52, 296]]);   // 鹿角
      circle(g, PW / 2, 350, 18);
      stickFigure(g, PW / 2 + 90, 420, 0.55);
      g.beginPath(); g.ellipse(PW / 2 - 92, 480, 36, 18, 0, 0, TAU); g.stroke(); poly(g, [[PW / 2 - 56, 480], [PW / 2 - 34, 462], [PW / 2 - 34, 498]], true);   // 鱼
      circle(g, PW / 2 + 36, 492, 14); circle(g, PW / 2 + 74, 492, 14); poly(g, [[PW / 2 + 55, 506], [PW / 2 + 55, 520]]);   // 猫头鹰
      text(g, '被选择的人', PW / 2, 676, 40);
    },
    (g) => {
      text(g, '长生不老药', PW / 2, 118, 38);
      g.lineWidth = 2.5;
      circle(g, 112, 200, 16); for (let i = 0; i < 5; i++) circle(g, 112 + Math.cos(i * 1.26) * 26, 200 + Math.sin(i * 1.26) * 26, 9); text(g, '花', 112, 258, 28);
      poly(g, [[180, 190], [210, 170], [240, 200], [270, 176]]); text(g, '头发', 224, 232, 28);
      poly(g, [[470, 170], [500, 130], [530, 160], [560, 126]]); poly(g, [[500, 130], [498, 100]]); poly(g, [[530, 160], [540, 112]]);   // 鹿角
      cubeIcon(g, PW / 2 + 10, 360, 46); text(g, '?', PW / 2 + 10, 372, 50);
      poly(g, [[110, 440], [220, 480]]); text(g, '铜', 150, 500, 28);
      flame(g, 130, 600, 40); drawGlyph(g, 'arrow', 196, 590, 30, INK, 4); text(g, ':3', 232, 592, 34);
      g.strokeRect(170, 650, 110, 34); text(g, '木', 224, 706, 28);
      g.strokeRect(470, 620, 56, 70); text(g, '粉笔', 498, 714, 28);
      circle(g, 496, 420, 22); g.fillStyle = '#9a2f27'; circle(g, 496, 420, 14, true); g.fillStyle = INK;
      g.setLineDash([8, 8]); poly(g, [[150, 250], [PW / 2 - 30, 330]]); poly(g, [[498, 180], [PW / 2 + 50, 330]]); poly(g, [[PW / 2 + 10, 410], [496, 410]]); poly(g, [[170, 560], [PW / 2 - 20, 410]]); g.setLineDash([]);
    },
  ],
  [ // 提取记忆：头颅取出大脑，上面是方块 + 8 与 ⊖ ；右页「饥饿的幽灵」
    (g) => {
      text(g, '8', PW / 2 - 70, 140, 44); cubeIcon(g, PW / 2, 150, 34); drawGlyph(g, 'bar', PW / 2 + 82, 144, 24, INK, 4);
      g.setLineDash([8, 8]); poly(g, [[PW / 2, 200], [PW / 2, 300]]); g.setLineDash([]); poly(g, [[PW / 2 - 12, 280], [PW / 2, 304], [PW / 2 + 12, 280]]);
      g.lineWidth = 3; g.beginPath(); g.ellipse(PW / 2, 400, 84, 96, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(PW / 2, 346, 74, 40, 0, Math.PI, TAU); g.stroke();
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(PW / 2 - 40 + i * 26, 336, 14, Math.PI, TAU); g.stroke(); }
      for (const m of [-1, 1]) { g.beginPath(); g.ellipse(PW / 2 + m * 32, 392, 12, 6, 0, 0, TAU); g.stroke(); }
      poly(g, [[PW / 2, 400], [PW / 2 - 8, 434], [PW / 2 + 10, 434]]); poly(g, [[PW / 2 - 24, 462], [PW / 2 + 24, 462]]);
      text(g, '提取记忆', PW / 2, 640, 42);
    },
    (g) => {
      stickFigure(g, PW / 2, 300, 1.4);
      text(g, '饥饿的幽灵', PW / 2, 590, 40); text(g, '平衡你前世', PW / 2, 660, 34); text(g, '中的物质', PW / 2, 708, 34);
    },
  ],
  [ // 方块沉入水盆 + △=Ⅹ ；右页「被选择的人」猫头鹰脸
    (g) => {
      drawGlyph(g, 'tri', 500, 130, 38, INK, 5); text(g, '=', 546, 130, 44); text(g, 'Ⅹ', 590, 130, 44);
      cubeIcon(g, PW / 2, 220, 44);
      g.setLineDash([8, 8]); poly(g, [[PW / 2, 280], [PW / 2, 400]]); g.setLineDash([]); poly(g, [[PW / 2 - 12, 380], [PW / 2, 404], [PW / 2 + 12, 380]]);
      fontIcon(g, PW / 2, 470, 1.5);
      g.lineWidth = 2.5; circle(g, 130, 380, 10); poly(g, [[190, 330], [220, 350], [190, 368]]); circle(g, 470, 330, 8); poly(g, [[120, 500], [150, 480], [170, 510]]);
      text(g, '我们的记忆', PW / 2, 676, 38); text(g, '属于锈湖', PW / 2, 724, 38);
    },
    (g) => {
      text(g, '被选择的人', PW / 2, 118, 40);
      owlFace(g, PW / 2, 360, 1.25);
    },
  ],
];

export const BOOK_SPREADS = [
  { id: 'glory', title: '锈湖的光辉之日终将来临' },
  { id: 'elixir', title: '长生不老药' },
  { id: 'extraction', title: '平衡你前世中的物质' },
  { id: 'memories', title: '我们的记忆属于锈湖' },
];

function coverTexture() {
  return canvasTexture(256, 340, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#7e3a1f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = r() > 0.5 ? 'rgba(40,10,0,0.2)' : 'rgba(200,110,60,0.14)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = '#d4a63b'; g.lineWidth = 6; g.strokeRect(12, 12, w - 24, h - 24); g.lineWidth = 2.5; g.strokeRect(24, 24, w - 48, h - 48);
    for (const [x, y, sx, sy] of [[24, 24, 1, 1], [w - 24, 24, -1, 1], [24, h - 24, 1, -1], [w - 24, h - 24, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + sy * 40); g.quadraticCurveTo(x, y, x + sx * 40, y); g.stroke(); g.beginPath(); g.arc(x + sx * 16, y + sy * 16, 7, 0, TAU); g.stroke();
    }
    g.fillStyle = '#4a4038'; g.fillRect(52, 54, 40, 36); g.strokeStyle = '#d9d0bd'; g.lineWidth = 3; g.strokeRect(52, 54, 40, 36);
    g.beginPath(); g.moveTo(62, 64); g.lineTo(72, 80); g.lineTo(82, 64); g.stroke();
  });
}

/**
 * 书：合上时是棕色皮面书；setOpen(true) 摊开，setSpread(i) 切换跨页，flipTo(i) 带翻页动画。
 * 书脊在局部原点，合上时书身在 +x 一侧；摊开后左右对称。
 */
export function makeBook() {
  const root = group('p4_book'), pivot = group('book_pivot'); root.add(pivot);
  const W = 0.32, D = 0.42, leather = toon('#ffffff', { map: coverTexture() }), plain = toon('#6b3319'), paper = toon('#e6d5a8');
  mesh(pivot, new THREE.BoxGeometry(W + 0.03, 0.018, D + 0.03), plain, [W / 2, 0.009, 0]);                  // 封底
  mesh(pivot, new THREE.BoxGeometry(W, 0.034, D), paper, [W / 2 - 0.003, 0.035, 0]);                         // 书页块
  mesh(pivot, new THREE.BoxGeometry(0.02, 0.048, D + 0.03), plain, [-0.004, 0.024, 0]);                       // 书脊
  const front = group('book_front'); front.position.set(0, 0.07, 0); pivot.add(front);                          // 封面绕书脊翻
  mesh(front, new THREE.BoxGeometry(W + 0.03, 0.018, D + 0.03), [plain, plain, leather, plain, plain, plain], [(W + 0.03) / 2, 0.009, 0]);
  const pages = [];
  for (let i = 0; i < BOOK_SPREADS.length; i++) pages.push({ l: null, r: null });
  const getPage = (i, side) => {
    const slot = pages[i];
    if (!slot[side]) slot[side] = page(SPREAD_DRAW[i][side === 'l' ? 0 : 1], 11 + i * 2 + (side === 'l' ? 0 : 1));
    return slot[side];
  };
  const makePage = () => new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02), unlit('#ffffff'));
  const left = makePage(), right = makePage();
  for (const m of [left, right]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.0555; pivot.add(m); }
  left.position.x = -(W - 0.02) / 2 - 0.006; right.position.x = (W - 0.02) / 2 + 0.006;
  const underlay = mesh(pivot, new THREE.BoxGeometry(W, 0.012, D), paper, [-W / 2, 0.047, 0]);
  const leaf = group('book_leaf'); leaf.position.set(0, 0.058, 0); pivot.add(leaf); leaf.visible = false;
  const leafFront = makePage(), leafBack = makePage();
  leafFront.rotation.x = -Math.PI / 2; leafFront.position.set((W - 0.02) / 2 + 0.006, 0.002, 0);
  leafBack.rotation.x = Math.PI / 2; leafBack.position.set((W - 0.02) / 2 + 0.006, -0.002, 0); leaf.add(leafFront, leafBack);

  let open = false, spread = 0, flip = null;
  const show = () => {
    const l = getPage(spread, 'l'), r = getPage(spread, 'r');
    left.material.map = l; left.material.needsUpdate = true; right.material.map = r; right.material.needsUpdate = true;
  };
  const apply = () => {
    front.rotation.z = open ? Math.PI : 0; front.position.set(0, open ? 0.012 : 0.07, 0);
    left.visible = right.visible = open; underlay.visible = open;
    pivot.position.x = open ? 0 : -W / 2;
    if (open) show();
  };
  root.setOpen = (v) => { open = !!v; apply(); };
  root.setSpread = (i) => { spread = Math.min(BOOK_SPREADS.length - 1, Math.max(0, i)); flip = null; leaf.visible = false; if (open) show(); };
  root.spread = () => spread;
  root.isOpen = () => open;
  root.spreadCount = BOOK_SPREADS.length;
  /** 带翻页动画；返回 Promise，动画结束时完成（需要被登记为 prop 才会推进）。 */
  root.flipTo = (i, ms = 420) => {
    const to = Math.min(BOOK_SPREADS.length - 1, Math.max(0, i));
    if (!open || to === spread) { root.setSpread(to); return Promise.resolve(); }
    return new Promise((resolve) => {
      const forward = to > spread;
      leaf.visible = true; leaf.rotation.z = forward ? 0 : Math.PI;
      leafFront.material.map = forward ? getPage(spread, 'r') : getPage(spread, 'l');
      leafBack.material.map = forward ? getPage(to, 'l') : getPage(to, 'r');
      for (const m of [leafFront, leafBack]) m.material.needsUpdate = true;
      leafFront.position.x = forward ? (W - 0.02) / 2 + 0.006 : -(W - 0.02) / 2 - 0.006;
      leafBack.position.x = leafFront.position.x; leafFront.scale.x = leafBack.scale.x = 1;
      const target = forward ? to : to;
      // 底下先换成新页的另一面，翻过去后就是新的跨页
      if (forward) { right.material.map = getPage(to, 'r'); right.material.needsUpdate = true; } else { left.material.map = getPage(to, 'l'); left.material.needsUpdate = true; }
      flip = { t: 0, ms, forward, to: target, resolve };
    });
  };
  root.update = (dt) => {
    if (!flip) return;
    flip.t += dt * 1000; const k = Math.min(1, flip.t / flip.ms), e = k * k * (3 - 2 * k);
    leaf.rotation.z = flip.forward ? e * Math.PI : (1 - e) * Math.PI;
    leaf.position.y = 0.058 + Math.sin(k * Math.PI) * 0.05;
    if (k >= 1) { const done = flip; flip = null; leaf.visible = false; spread = done.to; show(); done.resolve(); }
  };
  root.setOpen(false);
  return root;
}

// ---------------------------------------------------------------------------
// 窗：拱形双扇百叶窗，扇面中部一条罗马数字滑轨，四枚纹章滑片挂在轨上。
const SLOT_X = ROMAN.map((_, i) => (i < 6 ? -0.74 + i * 0.135 : 0.065 + (i - 6) * 0.135));

function arch(cx, cy, r, bottom, half = 0) {
  // half: 0 整扇；-1 左半；1 右半。以拱心 (cx,cy)、半径 r、底边 bottom 为参数的轮廓
  const s = new THREE.Shape();
  if (half === 0) { s.moveTo(cx - r, bottom); s.lineTo(cx + r, bottom); s.lineTo(cx + r, cy); s.absarc(cx, cy, r, 0, Math.PI, false); s.lineTo(cx - r, bottom); }
  else if (half < 0) { s.moveTo(cx - 0.012, bottom); s.lineTo(cx - 0.012, cy + r); s.absarc(cx, cy, r, Math.PI / 2, Math.PI, false); s.lineTo(cx - r, bottom); s.closePath(); }
  else { s.moveTo(cx + 0.012, bottom); s.lineTo(cx + 0.012, cy + r); s.absarc(cx, cy, r, Math.PI / 2, 0, true); s.lineTo(cx + r, bottom); s.closePath(); }
  return s;
}

function buildWindow() {
  const root = group('p4_window'), shutters = group('window_shutters'), railGroup = group('window_rail'); root.add(shutters);
  // 窗外的风景：赭黄色的天，灰色的山
  const view = canvasTexture(512, 640, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#c99a52'); sky.addColorStop(1, '#dcb676');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6d7479'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.78 - Math.abs(Math.sin(x * 0.015 + 0.6) * Math.cos(x * 0.03)) * 120);
    g.lineTo(w, h); g.fill();
    g.fillStyle = '#8b9396'; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * 0.86 - Math.abs(Math.sin(x * 0.02 + 2) * Math.cos(x * 0.04)) * 60);
    g.lineTo(w, h); g.fill();
  }, { wrap: false });
  view.repeat.set(1 / 1.7, 1 / 1.9); view.offset.set(0.5, 0.5);
  mesh(root, new THREE.ShapeGeometry(arch(0, 0.1, 0.85, -0.95), 24), unlit('#ffffff', { map: view }), [0, 0, -0.03]);
  // 石框
  const frame = arch(0, 0.1, 1.0, -1.08); frame.holes.push(arch(0, 0.1, 0.85, -0.95));
  mesh(root, new THREE.ExtrudeGeometry(frame, { depth: 0.13, bevelEnabled: false, curveSegments: 24 }), toon('#6a6c62'), [0, 0, -0.04]);
  // 两扇百叶
  const shutterTex = canvasTexture(256, 256, (g, w, h) => {
    const r = rng(31); g.fillStyle = '#a9aca0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,74,66,0.7)'; g.lineWidth = 3;
    for (let x = 18; x < w; x += 34) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 2, h); g.stroke(); }
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(60,62,56,0.1)'; g.fillRect(r() * w, r() * h, 3, 1 + r() * 8); }
  });
  const panels = [];
  for (const side of [-1, 1]) {
    const hinge = group('window_shutter'); hinge.position.set(side * 0.85, 0, 0); shutters.add(hinge);
    const geo = new THREE.ExtrudeGeometry(arch(0, 0.1, 0.85, -0.95, side), { depth: 0.05, bevelEnabled: false, curveSegments: 20 });
    geo.translate(-side * 0.85, 0, 0);
    geo.computeBoundingBox(); const bb = geo.boundingBox, uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    mesh(hinge, geo, toon('#ffffff', { map: shutterTex }));
    for (const y of [-0.8, 0.5]) mesh(hinge, new THREE.BoxGeometry(0.05, 0.05, 0.03), toon('#4f5249'), [-side * 0.04, y, 0.06]);
    hinge.userData.side = side; panels.push(hinge);
  }
  mesh(shutters, new THREE.BoxGeometry(0.025, 1.98, 0.07), toon('#4c4f46'), [0, 0.02, 0.01]);   // 中缝

  // 滑轨：灰白条上标出 Ⅰ–Ⅻ
  root.add(railGroup);
  const railTex = canvasTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#d4d3c6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4a4a42'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    g.fillStyle = '#34342d'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 34px "Times New Roman", serif';
    ROMAN.forEach((n, i) => g.fillText(n, (SLOT_X[i] + 0.8) / 1.6 * w, h / 2 + 2));
  }, { wrap: false });
  const rail = mesh(railGroup, new THREE.PlaneGeometry(1.6, 0.1), unlit('#ffffff', { map: railTex }), [0, -0.5, 0.075]); rail.name = 'window_rail_strip';

  // 四枚纹章滑片
  const tabs = [], shield = new THREE.Shape();
  shield.moveTo(-0.062, 0.085); shield.lineTo(0.062, 0.085); shield.lineTo(0.062, -0.02); shield.lineTo(0, -0.085); shield.lineTo(-0.062, -0.02); shield.closePath();
  const shieldGeo = new THREE.ExtrudeGeometry(shield, { depth: 0.022, bevelEnabled: false });
  WINDOW_GLYPHS.forEach((kind, i) => {
    const tab = group(`window_dial_${i}`); railGroup.add(tab);
    const body = mesh(tab, shieldGeo, toon('#cdbf9c')); body.name = 'tab_body';
    const tex = canvasTexture(128, 128, (g, w, h) => drawGlyph(g, kind, w / 2, h / 2, 46, '#2b2a24', 8), { wrap: false });
    const face = mesh(tab, new THREE.PlaneGeometry(0.11, 0.11), unlit('#ffffff', { map: tex, transparent: true }), [0, 0.012, 0.0235]);
    face.name = 'tab_glyph';
    tab.userData.kind = kind; tabs.push(tab);
  });

  const confirmSlot = [];
  const values = [], state = { selected: null };
  const place = (numbers, selected) => {
    const used = {};
    tabs.forEach((tab, i) => {
      const n = numbers[i], stack = used[n] = (used[n] || 0) + 1;
      tab.position.set(SLOT_X[n - 1] + (stack - 1) * 0.032, -0.4 + (selected === i ? 0.06 : 0), 0.082 + (stack - 1) * 0.004);
      tab.getObjectByName('tab_body').material.emissive.set(selected === i ? '#6e5a1c' : '#000000');
    });
  };
  root.setState = (numbers, open, selected = null) => {
    state.selected = selected;
    const confirm = (root.parent || root).getObjectByName('window_confirm'); if (confirm) confirm.visible = !open;
    railGroup.visible = !open;
    panels.forEach((p) => { p.rotation.y = open ? -p.userData.side * 1.55 : 0; });
    place(numbers, selected); values.splice(0, values.length, ...numbers);
  };
  root.setState([1, 1, 1, 1], false);
  root.tabs = tabs; root.dials = tabs;                         // dials 是旧名，保留给旧逻辑
  root.slotCount = ROMAN.length;
  root.slotCenter = (i) => [SLOT_X[i], -0.5, 0.09];            // 窗局部坐标，供逻辑生成点击盒
  root.slotSize = [0.13, 0.12, 0.04];
  root.railGroup = railGroup;
  return root;
}

/** 窗：按 0.78 倍做成约 1.55 × 1.7 m 的拱窗；slotCenter / slotSize 已换算到窗的局部坐标（米）。 */
export function makeWindow() {
  const K = 0.78, inner = buildWindow(), outer = bake(inner, K, 'p4_window');
  outer.slotCenter = (i) => inner.slotCenter(i).map((v) => v * K);
  outer.slotSize = inner.slotSize.map((v) => v * K);
  return outer;
}
