// 命中判定：射線對敵人命中球（頭/身）＋牆段遮擋。純邏輯模組，node 可測。
// 牆為全高，遮擋用 2D（x,z）射線對線段；命中球用 3D 射線對球。

// 2D 射線對線段，回傳最近距離 t（沿 dir 的長度）或 null
export function rayHitsWall(x0, z0, dirX, dirZ, maxDist, segments) {
  let best = null;
  for (const [x1, z1, x2, z2] of segments) {
    const sx = x2 - x1;
    const sz = z2 - z1;
    const denom = dirX * sz - dirZ * sx;
    if (Math.abs(denom) < 1e-12) continue; // 平行
    const t = ((x1 - x0) * sz - (z1 - z0) * sx) / denom;
    const u = Math.abs(sx) > Math.abs(sz) ? (x0 + dirX * t - x1) / sx : (z0 + dirZ * t - z1) / sz;
    if (t > 1e-6 && t <= maxDist && u >= 0 && u <= 1) {
      if (best === null || t < best) best = t;
    }
  }
  return best;
}

// 3D 射線對球，回傳 t 或 null（dir 需為單位向量）
export function rayHitsSphere(origin, dir, center, r) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 1e-6 ? t : null;
}

// 散佈：在垂直於 dir 的平面上抖動（rng 為 mulberry32 類函式）
export function jitterDir(dir, spread, rng) {
  if (!spread) return { ...dir };
  const a = rng() * Math.PI * 2;
  const m = rng() * spread;
  // 取 dir 的兩個垂直基底
  const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let bx = dir.y * up.z - dir.z * up.y;
  let by = dir.z * up.x - dir.x * up.z;
  let bz = dir.x * up.y - dir.y * up.x;
  const bl = Math.hypot(bx, by, bz) || 1;
  bx /= bl; by /= bl; bz /= bl;
  const cx = dir.y * bz - dir.z * by;
  const cy = dir.z * bx - dir.x * bz;
  const cz = dir.x * by - dir.y * bx;
  const jx = dir.x + (bx * Math.cos(a) + cx * Math.sin(a)) * m;
  const jy = dir.y + (by * Math.cos(a) + cy * Math.sin(a)) * m;
  const jz = dir.z + (bz * Math.cos(a) + cz * Math.sin(a)) * m;
  const l = Math.hypot(jx, jy, jz) || 1;
  return { x: jx / l, y: jy / l, z: jz / l };
}

// 對一組敵人取最近命中：{enemy, zone, dist} 或 null。牆擋在敵人前面則不命中。
export function castShot({ origin, dir, enemies, wallSegments = [], maxRange = 40 }) {
  const wallT = rayHitsWall(origin.x, origin.z, dir.x, dir.z, maxRange, wallSegments);
  const limit = wallT === null ? maxRange : wallT;
  let best = null;
  for (const e of enemies) {
    if (e.dead) continue;
    for (const s of e.hitSpheres()) {
      const t = rayHitsSphere(origin, dir, { x: e.x, y: s.y, z: e.z }, s.r);
      if (t !== null && t <= limit && (best === null || t < best.dist)) {
        best = { enemy: e, zone: s.zone, dist: t };
      }
    }
  }
  return best;
}
