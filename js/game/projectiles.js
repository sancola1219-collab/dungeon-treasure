// 投射物（火箭彈）：直線飛行、撞牆或敵人爆炸、AoE 傷害含距離衰減。
// 純邏輯模組，node 可測。爆炸事件回傳給呼叫端做特效與音效。
export class Projectiles {
  constructor() {
    this.list = []; // {x,y,z,dirX,dirY,dirZ,speed,damage,radius,life}
  }

  spawn({ x, y, z, dirX, dirY, dirZ, speed, damage, radius }) {
    this.list.push({ x, y, z, dirX, dirY, dirZ, speed, damage, radius, life: 4 });
  }

  // 回傳事件陣列 [{type:'explode', x,y,z, hits:[{enemy,damage}], playerDamage}]
  update(dt, { world, enemies, player }) {
    const events = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      const ox = p.x;
      const oz = p.z;
      p.x += p.dirX * p.speed * dt;
      p.y += p.dirY * p.speed * dt;
      p.z += p.dirZ * p.speed * dt;

      let hit = p.life <= 0 || p.y <= 0.05 || p.y >= 4;
      // 敵人命中（球形近似）
      if (!hit) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) < e.radius + 0.35 && p.y < 2.1) {
            hit = true;
            break;
          }
        }
      }
      // 牆面命中：移動線段與碰撞段相交
      if (!hit) {
        const room = world.roomAt(ox, oz);
        if (room !== null) {
          for (const [x1, z1, x2, z2] of world.collisionSegments(room)) {
            if (segmentsIntersect(ox, oz, p.x, p.z, x1, z1, x2, z2)) {
              hit = true;
              break;
            }
          }
        } else {
          hit = true; // 飛出世界
        }
      }
      if (!hit) continue;

      // 爆炸：AoE 距離衰減；玩家也吃半傷（經典自炸風險）
      const hits = [];
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d <= p.radius) {
          hits.push({ enemy: e, damage: Math.round(p.damage * (1 - (d / p.radius) * 0.6)) });
        }
      }
      let playerDamage = 0;
      const pd = Math.hypot(player.x - p.x, player.z - p.z);
      if (pd <= p.radius) {
        playerDamage = Math.round(p.damage * 0.5 * (1 - (pd / p.radius) * 0.6));
      }
      events.push({ type: 'explode', x: p.x, y: p.y, z: p.z, hits, playerDamage });
      this.list.splice(i, 1);
    }
    return events;
  }
}

// 2D 線段相交判定
export function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = cross(dx - cx, dz - cz, ax - cx, az - cz);
  const d2 = cross(dx - cx, dz - cz, bx - cx, bz - cz);
  const d3 = cross(bx - ax, bz - az, cx - ax, cz - az);
  const d4 = cross(bx - ax, bz - az, dx - ax, dz - az);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(x1, z1, x2, z2) {
  return x1 * z2 - z1 * x2;
}
