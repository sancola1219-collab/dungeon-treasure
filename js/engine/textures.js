// Canvas 程序貼圖＋外部貼圖熱插拔：
// getTexture 先回程序生成的貼圖，背景嘗試載入 assets/textures/<kind>.jpg，
// 成功就把同一個 Texture 的 image 換成圖片（材質不需重建；缺檔靜默退回程序貼圖）。
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

const cache = new Map();
const FILE_KINDS = new Set(['wood', 'wallpaper', 'tile', 'plaster', 'carpet', 'metal', 'door', 'stone']);

export function getTexture(kind) {
  if (!cache.has(kind)) {
    const gen = GENERATORS[kind];
    if (!gen) throw new Error(`未知貼圖種類：${kind}`);
    const tex = gen();
    cache.set(kind, tex);
    upgradeFromFile(kind, tex);
  }
  return cache.get(kind);
}

function upgradeFromFile(kind, tex) {
  if (!FILE_KINDS.has(kind)) return;
  const img = new Image();
  img.onload = () => {
    tex.image = img;
    tex.needsUpdate = true;
  };
  img.src = `assets/textures/${kind}.jpg`;
}

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GENERATORS = {
  // 地牢石磚：交錯磚縫＋青苔陰影
  stone() {
    const rng = mulberry32(88);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#4a4640';
    g.fillRect(0, 0, 256, 256);
    const bh = 32;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 === 0 ? 0 : 32;
      for (let x = -32; x < 256; x += 64) {
        const v = 62 + rng() * 22;
        g.fillStyle = `rgb(${v}, ${v - 3}, ${v - 8})`;
        g.fillRect(x + off + 2, row * bh + 2, 60, bh - 4);
        if (rng() < 0.3) { // 青苔
          g.fillStyle = `rgba(52, 68, 40, ${0.15 + rng() * 0.25})`;
          g.fillRect(x + off + 2 + rng() * 30, row * bh + 2 + rng() * 16, 10 + rng() * 22, 6 + rng() * 10);
        }
      }
      g.fillStyle = 'rgba(18, 16, 12, 0.9)';
      g.fillRect(0, row * bh, 256, 2);
    }
    for (let i = 0; i < 1400; i++) {
      const v = rng();
      g.fillStyle = v > 0.5 ? `rgba(20,18,14,${0.04 + v * 0.08})` : `rgba(120,114,100,${0.04 + v * 0.06})`;
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
    }
    return toTexture(c, 2);
  },

  // 直紋木板：分板條、每條木紋色差＋縱向紋理線
  wood() {
    const rng = mulberry32(11);
    const c = makeCanvas();
    const g = c.getContext('2d');
    const plank = 64;
    for (let px = 0; px < 256; px += plank) {
      const base = 58 + rng() * 18;
      g.fillStyle = `rgb(${base + 20}, ${base - 4}, ${base - 28})`;
      g.fillRect(px, 0, plank, 256);
      for (let i = 0; i < 22; i++) {
        g.strokeStyle = `rgba(28, 16, 8, ${0.1 + rng() * 0.25})`;
        g.lineWidth = 0.5 + rng() * 1.5;
        const x = px + rng() * plank;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= 256; y += 16) {
          g.lineTo(x + Math.sin(y * 0.04 + rng() * 6) * 2.5, y);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(px, 0, 2, 256);
    }
    return toTexture(c, 2);
  },

  // 磁磚：格線＋每格微妙明度差
  tile() {
    const rng = mulberry32(22);
    const c = makeCanvas();
    const g = c.getContext('2d');
    const size = 64;
    for (let ty = 0; ty < 256; ty += size) {
      for (let tx = 0; tx < 256; tx += size) {
        const v = 72 + rng() * 16;
        g.fillStyle = `rgb(${v}, ${v + 3}, ${v + 2})`;
        g.fillRect(tx, ty, size, size);
        g.fillStyle = `rgba(0, 0, 0, ${0.04 + rng() * 0.08})`;
        for (let i = 0; i < 14; i++) {
          g.fillRect(tx + rng() * size, ty + rng() * size, 1 + rng() * 3, 1 + rng() * 3);
        }
      }
    }
    g.strokeStyle = 'rgba(30, 32, 30, 0.85)';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += size) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    return toTexture(c, 3);
  },

  // 壁紙：暗色直條紋＋歲月污漬
  wallpaper() {
    const rng = mulberry32(33);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#4c4436';
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = 'rgba(76, 62, 44, 0.9)';
      g.fillRect(x, 0, 14, 256);
      g.fillStyle = 'rgba(30, 25, 16, 0.35)';
      g.fillRect(x + 14, 0, 2, 256);
    }
    for (let i = 0; i < 26; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const r = 8 + rng() * 34;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(18, 14, 8, ${0.1 + rng() * 0.22})`);
      grad.addColorStop(1, 'rgba(18, 14, 8, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return toTexture(c, 2);
  },

  // 舊地毯：暗紅底＋菱形織紋＋磨損
  carpet() {
    const rng = mulberry32(55);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#4a1d1a';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(122, 84, 48, 0.35)';
    g.lineWidth = 1.5;
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        g.beginPath();
        g.moveTo(x + 16, y);
        g.lineTo(x + 32, y + 16);
        g.lineTo(x + 16, y + 32);
        g.lineTo(x, y + 16);
        g.closePath();
        g.stroke();
      }
    }
    for (let i = 0; i < 2200; i++) {
      const v = rng();
      g.fillStyle = v > 0.5 ? `rgba(20, 8, 6, ${0.06 + v * 0.1})` : `rgba(140, 60, 46, ${0.04 + v * 0.07})`;
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
    }
    return toTexture(c, 2);
  },

  // 鏽蝕鋼板：面板分割線＋鉚釘＋鏽斑
  metal() {
    const rng = mulberry32(66);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#4e5257';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(20, 22, 25, 0.7)';
    g.lineWidth = 3;
    for (const p of [0, 128, 256]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
    }
    g.fillStyle = 'rgba(28, 30, 34, 0.9)';
    for (const px of [12, 116, 140, 244]) {
      for (const py of [12, 116, 140, 244]) {
        g.beginPath();
        g.arc(px, py, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let i = 0; i < 22; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const r = 6 + rng() * 26;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(122, 62, 30, ${0.18 + rng() * 0.25})`);
      grad.addColorStop(1, 'rgba(122, 62, 30, 0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return toTexture(c, 2);
  },

  // 老木門：深色直板＋門板凹槽
  door() {
    const rng = mulberry32(77);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#3d2b1a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(20, 12, 6, ${0.1 + rng() * 0.2})`;
      g.lineWidth = 0.6 + rng() * 1.2;
      const x = rng() * 256;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (rng() - 0.5) * 6, 256);
      g.stroke();
    }
    g.strokeStyle = 'rgba(16, 10, 5, 0.8)';
    g.lineWidth = 5;
    for (const [rx, ry, rw, rh] of [[36, 24, 184, 88], [36, 144, 184, 88]]) {
      g.strokeRect(rx, ry, rw, rh);
    }
    return toTexture(c, 1);
  },

  // 斑駁灰泥：噪點＋裂痕
  plaster() {
    const rng = mulberry32(44);
    const c = makeCanvas();
    const g = c.getContext('2d');
    g.fillStyle = '#5e5a4f';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = rng();
      g.fillStyle = v > 0.5 ? `rgba(40, 37, 30, ${0.05 + v * 0.1})` : `rgba(130, 124, 110, ${0.05 + v * 0.1})`;
      g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3);
    }
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = 'rgba(40, 36, 28, 0.5)';
      g.lineWidth = 0.8;
      let x = rng() * 256;
      let y = rng() * 256;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += (rng() - 0.5) * 40;
        y += rng() * 24;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return toTexture(c, 2);
  },
};
