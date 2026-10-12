// Shared palette, material factories and procedural canvas textures.
// Landscape → flat()/standard materials without outlines (painterly).
// Characters & props → toon() with black outlines (cartoon Rusty Lake look).
import * as THREE from 'three';

// Colours sampled from the playthrough frames (see _analysis/plague1_design.md §2.4).
export const PALETTE = {
  ink: '#141414',
  sky: '#cfe8f2',
  skyTop: '#a9cfe2',
  haze: '#dfe4e3',
  mountainFar: '#949ba6',
  mountainNear: '#7d8579',
  snow: '#eef0f0',
  meadow: '#a7a76b',
  conifer: '#4f5a4c',
  lakeGrey: '#c5c9cc',
  lakeLight: '#dfe2e2',
  lakeDark: '#9aa3a6',
  blood: '#8a1c1c',
  bloodFresh: '#a3282a',
  bloodDark: '#5e1414',
  bloodPink: '#a85a5a',
  sand: '#bfae87',
  sandDark: '#a8a487',
  ground: '#6b6a65',
  path: '#a9a69b',
  wood: '#c59767',
  woodMid: '#997c5c',
  woodDark: '#6b5840',
  plank: '#977a5a',
  barkLight: '#8b8577',
  barkDark: '#121411',
  birch: '#98958b',
  leaf: '#768941',
  leafDark: '#4e5e2c',
  stone: '#9b9a95',
  stoneDark: '#5f5e5a',
  rock: '#a1aeb0',
  plaster: '#d9d4c8',
  thatch: '#8a6a3e',
  gold: '#c9a13b',
  goldDark: '#8a6a1c',
  brass: '#b8913a',
  iron: '#3c3c3c',
  skin: '#e6d6c6',
  skinPale: '#d9d2cc',
  skinOld: '#b9adb0',
  cloth: '#c8c0b5',
  shirt: '#e8e2d6',
  vest: '#8a4a2e',
  trousers: '#4a443c',
  boots: '#3a2c22',
  hat: '#6a4a32',
  white: '#f2f0ea',
  black: '#0d0d0d',
};

// ---------------------------------------------------------------------------
// Toon gradient (3 hard steps) shared by every toon material.
let gradientMap = null;
function getGradientMap() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

/**
 * Cartoon material with black outline (OutlineEffect).
 * opts: { map, transparent, opacity, side, emissive, outline: thickness (default 0.0045) | false }
 */
export function toon(color = '#ffffff', opts = {}) {
  const { outline = 0.0045, ...rest } = opts;
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...rest });
  if (outline === false) noOutline(mat);
  else mat.userData.outlineParameters = { thickness: outline, color: [0.05, 0.05, 0.05], alpha: 1, visible: true };
  return mat;
}

/** Soft painterly material for landscape; outline disabled. */
export function flat(color = '#ffffff', opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...opts });
  return noOutline(mat);
}

/** Unlit material (backdrops, glowing things, painted cards); outline disabled. */
export function unlit(color = '#ffffff', opts = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, ...opts });
  return noOutline(mat);
}

export function noOutline(material) {
  material.userData.outlineParameters = { visible: false };
  return material;
}

// ---------------------------------------------------------------------------
// Canvas textures

/**
 * Create a CanvasTexture by drawing on a fresh canvas.
 * opts: { repeat: [x, y], srgb = true, wrap = true, filter = 'linear'|'nearest', anisotropy = 4 }
 */
export function canvasTexture(w, h, draw, opts = {}) {
  const { repeat, srgb = true, wrap = true, anisotropy = 4 } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// Deterministic PRNG so textures look the same every load.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return '#' + c.getHexString();
}
export { shade };

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function speckle(g, w, h, r, count, colors, alpha = 0.15, size = 2) {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = colors[(r() * colors.length) | 0];
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

export const tex = {
  /** Wood with long grain lines (cartoon style: dark ink grain strokes). */
  wood({ base = PALETTE.wood, seed = 3, lines = 14, ink = true } = {}) {
    return cached(`wood:${base}:${seed}:${lines}:${ink}`, () =>
      canvasTexture(256, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 900, [shade(base, -0.08), shade(base, 0.06)], 0.25, 3);
        g.lineCap = 'round';
        for (let i = 0; i < lines; i++) {
          const x = r() * w;
          g.strokeStyle = ink ? 'rgba(25,18,10,0.55)' : shade(base, -0.15);
          g.lineWidth = 1 + r() * 2;
          g.beginPath();
          g.moveTo(x, -10);
          let cx = x;
          for (let y = 0; y <= h + 10; y += 32) { cx += (r() - 0.5) * 6; g.lineTo(cx, y); }
          g.stroke();
        }
        // a couple of knots
        for (let i = 0; i < 2; i++) {
          g.strokeStyle = 'rgba(25,18,10,0.6)'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(r() * w, r() * h, 5 + r() * 5, 12 + r() * 10, 0, 0, Math.PI * 2); g.stroke();
        }
      }));
  },

  /** Vertical planks with dark seams (fences, gate, shed door, boat). */
  planks({ base = PALETTE.plank, count = 6, seed = 5 } = {}) {
    return cached(`planks:${base}:${count}:${seed}`, () =>
      canvasTexture(512, 512, (g, w, h) => {
        const r = rng(seed);
        const pw = w / count;
        for (let i = 0; i < count; i++) {
          g.fillStyle = shade(base, (r() - 0.5) * 0.08);
          g.fillRect(i * pw, 0, pw, h);
          g.strokeStyle = 'rgba(30,20,12,0.45)'; g.lineWidth = 1.2;
          for (let k = 0; k < 4; k++) {
            const x = i * pw + 6 + r() * (pw - 12);
            g.beginPath(); g.moveTo(x, 0);
            let cx = x;
            for (let y = 0; y <= h; y += 40) { cx += (r() - 0.5) * 4; g.lineTo(cx, y); }
            g.stroke();
          }
          g.fillStyle = 'rgba(15,10,5,0.9)';
          g.fillRect(i * pw, 0, 3, h);
        }
      }));
  },

  /** Vertical bark stripes for the tall grey forest trunks (light #8b8577 / dark #121411). */
  bark({ light = PALETTE.barkLight, dark = PALETTE.barkDark, seed = 7 } = {}) {
    return cached(`bark:${light}:${dark}:${seed}`, () =>
      canvasTexture(256, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = light; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          const x = r() * w, bw = 2 + r() * 10;
          g.fillStyle = r() < 0.5 ? shade(dark, r() * 0.25) : shade(light, -0.12 - r() * 0.1);
          g.globalAlpha = 0.55 + r() * 0.45;
          g.beginPath();
          g.moveTo(x, -5);
          let cx = x;
          const pts = [];
          for (let y = 0; y <= h + 20; y += 20) { cx += (r() - 0.5) * 3; pts.push([cx, y]); }
          pts.forEach(([px, py]) => g.lineTo(px, py));
          for (let j = pts.length - 1; j >= 0; j--) g.lineTo(pts[j][0] + bw, pts[j][1]);
          g.closePath(); g.fill();
        }
        g.globalAlpha = 1;
      }));
  },

  /** Pale birch-like bark with dark patches (white trees). */
  birch({ base = PALETTE.birch, seed = 9 } = {}) {
    return cached(`birch:${base}:${seed}`, () =>
      canvasTexture(256, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 600, [shade(base, 0.08), shade(base, -0.06)], 0.3, 4);
        for (let i = 0; i < 30; i++) {
          g.fillStyle = 'rgba(40,40,38,' + (0.35 + r() * 0.4) + ')';
          const x = r() * w, y = r() * h;
          g.beginPath(); g.ellipse(x, y, 4 + r() * 16, 1.5 + r() * 4, 0, 0, Math.PI * 2); g.fill();
        }
      }));
  },

  /** Off-white plaster with grey stains (interiors). */
  plaster({ base = PALETTE.plaster, stains = 0.5, seed = 11 } = {}) {
    return cached(`plaster:${base}:${stains}:${seed}`, () =>
      canvasTexture(512, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 4000, [shade(base, -0.05), shade(base, 0.04)], 0.35, 2);
        for (let i = 0; i < 40 * stains; i++) {
          const x = r() * w, y = h * (0.3 + r() * 0.7), rad = 20 + r() * 80;
          const grd = g.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0, 'rgba(70,68,64,' + 0.18 * stains + ')');
          grd.addColorStop(1, 'rgba(70,68,64,0)');
          g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        // drip streaks
        for (let i = 0; i < 12 * stains; i++) {
          g.strokeStyle = 'rgba(60,58,55,0.12)'; g.lineWidth = 2 + r() * 6;
          const x = r() * w; g.beginPath(); g.moveTo(x, h * r() * 0.5); g.lineTo(x + (r() - 0.5) * 8, h); g.stroke();
        }
      }));
  },

  /** Irregular stone blocks with dark mortar (house walls, temple, tower). */
  stone({ base = PALETTE.stone, rows = 8, seed = 13 } = {}) {
    return cached(`stone:${base}:${rows}:${seed}`, () =>
      canvasTexture(512, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = '#3a3936'; g.fillRect(0, 0, w, h);
        const rh = h / rows;
        for (let row = 0; row < rows; row++) {
          let x = -r() * 40;
          while (x < w) {
            const bw = 40 + r() * 50;
            g.fillStyle = shade(base, (r() - 0.5) * 0.12);
            const inset = 2.5;
            g.beginPath();
            g.roundRect(x + inset, row * rh + inset, bw - inset * 2, rh - inset * 2, 6);
            g.fill();
            x += bw;
          }
        }
        speckle(g, w, h, r, 3000, [shade(base, -0.15), shade(base, 0.1)], 0.25, 2);
      }));
  },

  /** Beach sand / dirt ground. */
  sand({ base = PALETTE.sand, seed = 17 } = {}) {
    return cached(`sand:${base}:${seed}`, () =>
      canvasTexture(512, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 9000, [shade(base, -0.08), shade(base, 0.06), shade(base, -0.15)], 0.35, 2);
      }));
  },

  /** Woven cloth (tablecloth, dresses). */
  cloth({ base = PALETTE.cloth, seed = 19 } = {}) {
    return cached(`cloth:${base}:${seed}`, () =>
      canvasTexture(256, 256, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.08;
        g.fillStyle = '#000';
        for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
        for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
        g.globalAlpha = 1;
        speckle(g, w, h, r, 500, [shade(base, -0.08)], 0.2, 2);
      }));
  },

  /** Old paper (letters, photos). */
  paper({ base = '#eadfc4', seed = 23 } = {}) {
    return cached(`paper:${base}:${seed}`, () =>
      canvasTexture(512, 512, (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 3000, [shade(base, -0.06), shade(base, 0.03)], 0.3, 2);
        const grd = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(90,60,20,0.25)');
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      }));
  },

  /** Generic value noise (grayscale), useful for alpha/bump/variation. */
  noise({ size = 256, scale = 8, seed = 29 } = {}) {
    return cached(`noise:${size}:${scale}:${seed}`, () =>
      canvasTexture(size, size, (g, w, h) => {
        const r = rng(seed);
        const n = scale + 1;
        const grid = Array.from({ length: n * n }, () => r());
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const fx = (x / w) * scale, fy = (y / h) * scale;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const a = grid[y0 * n + x0], b = grid[y0 * n + x0 + 1];
          const c = grid[(y0 + 1) * n + x0], d = grid[(y0 + 1) * n + x0 + 1];
          const v = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
          const i = (y * w + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }, { srgb: false }));
  },
};

/** Text drawn onto a transparent canvas texture (plaques, signs, coffin lettering). */
export function textTexture(text, {
  w = 512, h = 128, font = '64px Georgia, serif', color = '#2a1d10', bg = null, align = 'center',
} = {}) {
  return canvasTexture(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.font = font; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(text, align === 'center' ? w / 2 : 10, h / 2);
  }, { wrap: false });
}
