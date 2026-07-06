// 玩家：第一人稱移動與視角。純邏輯模組，可在 node --test 下測試。
// yaw=0 面向 -z；滑鼠右移（dx>0）向右轉（yaw 減少）。
export const WALK_SPEED = 3.2;
export const RUN_SPEED = 5.2;
export const PLAYER_RADIUS = 0.35;
export const EYE_HEIGHT = 1.6;

export function closestPointOnSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - x1) * dx + (pz - z1) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [x1 + t * dx, z1 + t * dz];
}

// 圓（半徑 r）對一組線段的推出解算。迭代數輪處理角落。
export function resolveCircleVsSegments(x, z, r, segments, iterations = 3) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const [x1, z1, x2, z2] of segments) {
      const [cx, cz] = closestPointOnSegment(x, z, x1, z1, x2, z2);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        x += dx * push;
        z += dz * push;
      } else {
        // 圓心正好落在線段上：沿線段法線推出
        const sx = x2 - x1;
        const sz = z2 - z1;
        const len = Math.hypot(sx, sz) || 1;
        x += (sz / len) * r;
        z += (-sx / len) * r;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

export class Player {
  constructor({ x = 0, z = 0, yaw = 0 } = {}) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.pitch = 0;
    this.radius = PLAYER_RADIUS;
    this.eyeHeight = EYE_HEIGHT;
    this.hp = 100;
    this.iframes = 0; // 受擊後短暫無敵，避免被連續咬融化
    this.poison = 0; // 中毒剩餘秒數（>0 時每 0.8s 扣 3 血，藍草藥可解）
    this._poisonTick = 0;
  }

  // 回傳是否實際受傷（無敵幀中回 false）
  hurt(damage) {
    if (this.iframes > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.iframes = 0.7;
    return true;
  }

  healthTier() {
    if (this.hp > 66) return 'fine';
    if (this.hp >= 33) return 'caution';
    return 'danger';
  }

  look(dx, dy, sensitivity = 0.0025) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * sensitivity));
  }

  forward() {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }

  update(dt, actions, world) {
    if (this.iframes > 0) this.iframes = Math.max(0, this.iframes - dt);
    if (this.poison > 0) {
      this.poison = Math.max(0, this.poison - dt);
      this._poisonTick += dt;
      if (this._poisonTick >= 0.8) {
        this._poisonTick = 0;
        if (this.hp > 1) this.hp = Math.max(1, this.hp - 3); // 毒不會直接毒死
      }
    }
    const fwd = -actions.moveZ; // W 為 -1 → fwd=+1 前進
    let dirX = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * actions.moveX;
    let dirZ = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * actions.moveX;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1) {
      dirX /= len;
      dirZ /= len;
    }
    // Danger（HP<33）跛行減速——經典設計
    const speed = (actions.run ? RUN_SPEED : WALK_SPEED) * (this.hp < 33 ? 0.8 : 1);
    this.running = !!(actions.run && len > 0.01); // 供潛伏者等 AI 感知
    let nx = this.x + dirX * speed * dt;
    let nz = this.z + dirZ * speed * dt;

    const roomId = world.roomAt(this.x, this.z);
    if (roomId !== null) {
      let segs = world.collisionSegments(roomId);
      // 站在門口跨房時，把「開著門的相鄰房」牆段一併納入，避免穿進鄰房牆內
      for (const d of world.doorsOfRoom(roomId)) {
        if (!d.open) continue;
        const other = d.from === roomId ? d.to : d.from;
        if (other) segs = segs.concat(world.wallSegments(other));
      }
      [nx, nz] = resolveCircleVsSegments(nx, nz, this.radius, segs);
    }
    this.x = nx;
    this.z = nz;
  }
}
