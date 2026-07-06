// HUD：心電圖、彈藥、受擊紅暈、命中標記。只讀狀態、不改狀態。
import { WEAPONS } from '../game/weapons.js';

const TIER_COLOR = { fine: '#57d06a', caution: '#e0b83a', danger: '#e04040' };
const TIER_PERIOD = { fine: 1.25, caution: 0.9, danger: 0.55 };

export class HUD {
  constructor() {
    this.ammoEl = document.getElementById('ammo');
    this.vignetteEl = document.getElementById('vignette');
    this.hitEl = document.getElementById('hitmarker');
    this.ecg = document.getElementById('ecg');
    this.ecgCtx = this.ecg.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this.bigmap = document.getElementById('bigmap-canvas');
    this.bigmapCtx = this.bigmap ? this.bigmap.getContext('2d') : null;
    this._phase = 0;
    this._samples = new Array(110).fill(0.5);
    this._vignette = 0;
    this._hitTime = 0;
    this._lastAmmoText = '';
  }

  setAmmo(arsenal, inventory) {
    const id = arsenal.current;
    const def = WEAPONS[id];
    let text;
    if (def.melee) {
      text = def.name;
    } else {
      const reserve = inventory.countOf(def.ammoItem);
      text = `${def.name}　${arsenal.loadedRounds()} / ${reserve}`;
    }
    if (text !== this._lastAmmoText) {
      this._lastAmmoText = text;
      this.ammoEl.textContent = text;
    }
  }

  damageFlash() {
    this._vignette = 0.9;
  }

  hitmark() {
    this._hitTime = 0.09;
  }

  update(dt, player) {
    // 紅暈衰減
    if (this._vignette > 0.01) {
      this._vignette *= Math.pow(0.06, dt); // 約 0.7 秒淡出
      this.vignetteEl.style.opacity = String(this._vignette);
    } else if (this.vignetteEl.style.opacity !== '0') {
      this.vignetteEl.style.opacity = '0';
    }
    // 命中標記
    if (this._hitTime > 0) {
      this._hitTime -= dt;
      this.hitEl.style.opacity = this._hitTime > 0 ? '1' : '0';
    }
    // 心電圖
    const tier = player.healthTier();
    this._phase += dt / TIER_PERIOD[tier];
    if (this._phase > 1) this._phase -= 1;
    this._samples.push(ecgSample(this._phase, player.hp <= 0));
    this._samples.shift();
    this._drawEcg(TIER_COLOR[tier], player.hp <= 0);
  }

  _drawEcg(color, flat) {
    const c = this.ecgCtx;
    const W = this.ecg.width;
    const H = this.ecg.height;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(90,100,90,0.35)';
    c.strokeRect(0.5, 0.5, W - 1, H - 1);
    c.beginPath();
    c.strokeStyle = flat ? '#666' : color;
    c.lineWidth = 1.6;
    for (let i = 0; i < this._samples.length; i++) {
      const x = (i / (this._samples.length - 1)) * (W - 8) + 4;
      const y = H - 6 - this._samples[i] * (H - 14);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
}

// === 地圖（小地圖＋M 大地圖共用繪製；只畫「已探索」房間） ===

HUD.prototype.drawMinimap = function (world, player, visited, typewriters) {
  if (this.minimapCtx) {
    renderMap(this.minimapCtx, this.minimap.width, this.minimap.height, world, player, visited, typewriters, false);
  }
};

HUD.prototype.drawBigmap = function (world, player, visited, typewriters) {
  if (this.bigmapCtx) {
    renderMap(this.bigmapCtx, this.bigmap.width, this.bigmap.height, world, player, visited, typewriters, true);
  }
};

function renderMap(c, W, H, world, player, visited, typewriters, big) {
  c.clearRect(0, 0, W, H);
  const rooms = [...world.rooms.values()].filter((r) => visited.has(r.id));
  if (!rooms.length) return;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x);
    minZ = Math.min(minZ, r.z);
    maxX = Math.max(maxX, r.x + r.w);
    maxZ = Math.max(maxZ, r.z + r.d);
  }
  const pad = big ? 30 : 12;
  const s = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * s) / 2 - minX * s;
  const oz = (H - (maxZ - minZ) * s) / 2 - minZ * s;
  const px = (x) => x * s + ox;
  const pz = (z) => z * s + oz;

  for (const r of rooms) {
    c.fillStyle = 'rgba(70, 74, 88, 0.45)';
    c.fillRect(px(r.x), pz(r.z), r.w * s, r.d * s);
    c.strokeStyle = 'rgba(190, 182, 160, 0.8)';
    c.lineWidth = big ? 2 : 1.2;
    c.strokeRect(px(r.x), pz(r.z), r.w * s, r.d * s);
    if (big && r.name) {
      c.fillStyle = 'rgba(210, 202, 180, 0.85)';
      c.font = '13px "Noto Sans TC", sans-serif';
      c.textAlign = 'center';
      c.fillText(r.name, px(r.x + r.w / 2), pz(r.z + r.d / 2) + 4);
    }
  }
  // 門（缺口標記）：兩側房間任一已探索就畫
  for (const d of world.doors.values()) {
    if (!visited.has(d.from) && !visited.has(d.to)) continue;
    c.fillStyle = d.lock ? 'rgba(200, 80, 60, 0.9)' : 'rgba(190, 182, 160, 0.9)';
    const w = (big ? 5 : 3) + d.width * s * 0.3;
    c.fillRect(px(d.at[0]) - w / 2, pz(d.at[1]) - w / 2, w, w);
  }
  // 打字機
  for (const t of typewriters || []) {
    const room = world.roomAt(t.x, t.z);
    if (!visited.has(room)) continue;
    c.fillStyle = 'rgba(120, 200, 140, 0.95)';
    c.beginPath();
    c.arc(px(t.x), pz(t.z), big ? 5 : 3, 0, Math.PI * 2);
    c.fill();
  }
  // 玩家箭頭（yaw=0 面向 -z＝畫面上方）
  c.save();
  c.translate(px(player.x), pz(player.z));
  c.rotate(-player.yaw);
  c.fillStyle = '#e8dfc8';
  const a = big ? 9 : 6;
  c.beginPath();
  c.moveTo(0, -a);
  c.lineTo(a * 0.62, a * 0.8);
  c.lineTo(-a * 0.62, a * 0.8);
  c.closePath();
  c.fill();
  c.restore();
}

// 一個心跳週期的波形（0..1 相位 → 0..1 振幅，0.5 為基線偏下）
function ecgSample(phase, flat) {
  if (flat) return 0.28;
  if (phase < 0.08) return 0.28 + 0.1 * Math.sin((phase / 0.08) * Math.PI); // P 波
  if (phase < 0.14) return 0.28;
  if (phase < 0.18) return 0.28 - 0.12 * ((phase - 0.14) / 0.04); // Q
  if (phase < 0.24) return 0.16 + 0.84 * ((phase - 0.18) / 0.06); // R 尖峰
  if (phase < 0.3) return 1.0 - 1.05 * ((phase - 0.24) / 0.06); // S
  if (phase < 0.36) return -0.05 + 0.33 * ((phase - 0.3) / 0.06);
  if (phase < 0.55) return 0.28 + 0.08 * Math.sin(((phase - 0.36) / 0.19) * Math.PI); // T 波
  return 0.28;
}
