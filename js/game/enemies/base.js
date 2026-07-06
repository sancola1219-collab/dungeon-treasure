// 敵人基底：狀態機骨架與共用行為。純邏輯模組，node 可測。
// ctx = { player, world, rng, gameTime, attackPlayer(dmg), sound(name,x,z) }
import { resolveCircleVsSegments } from '../player.js';

export class Enemy {
  constructor({ id, x, z, type, hp, speed, radius = 0.35 }) {
    this.id = id;
    this.x = x;
    this.z = z;
    this.type = type;
    this.hp = hp;
    this.speed = speed;
    this.radius = radius;
    this.yaw = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.dead = false;
    this.alerted = false;
    this.headZoneMultiplier = 2;
  }

  // 子類覆寫：命中球清單 [{y, r, zone}]
  hitSpheres() {
    return [{ y: 0.9, r: 0.5, zone: 'body' }];
  }

  alert() {
    this.alerted = true;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  hurt(damage, zone = 'body') {
    if (this.dead) return 0;
    const dmg = zone === 'head' ? damage * this.headZoneMultiplier : damage;
    this.hp -= dmg;
    this.alerted = true;
    if (this.hp <= 0) {
      this.dead = true;
      this.setState('dead');
    } else {
      this.setState('stagger');
    }
    return dmg;
  }

  distTo(px, pz) {
    return Math.hypot(px - this.x, pz - this.z);
  }

  faceToward(px, pz) {
    // yaw 約定與玩家一致：yaw=0 面向 -z
    this.yaw = Math.atan2(-(px - this.x), -(pz - this.z));
  }

  // 朝 (tx,tz) 移動並解算與牆的碰撞
  moveToward(tx, tz, speed, dt, world) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    let nx = this.x + (dx / d) * speed * dt;
    let nz = this.z + (dz / d) * speed * dt;
    const room = world.roomAt(this.x, this.z);
    if (room !== null) {
      let segs = world.collisionSegments(room);
      for (const door of world.doorsOfRoom(room)) {
        if (!door.open) continue;
        const other = door.from === room ? door.to : door.from;
        if (other) segs = segs.concat(world.wallSegments(other));
      }
      [nx, nz] = resolveCircleVsSegments(nx, nz, this.radius, segs);
    }
    this.x = nx;
    this.z = nz;
    this.faceToward(tx, tz);
  }

  // 追擊導航：同房直奔玩家；不同房走向通往玩家房間的門中心
  chaseTarget(ctx) {
    const myRoom = ctx.world.roomAt(this.x, this.z);
    const playerRoom = ctx.world.roomAt(ctx.player.x, ctx.player.z);
    if (myRoom === playerRoom || myRoom === null || playerRoom === null) {
      return [ctx.player.x, ctx.player.z];
    }
    const doorId = ctx.world.nextDoorToward(myRoom, playerRoom);
    if (!doorId) return [ctx.player.x, ctx.player.z];
    const d = ctx.world.doors.get(doorId);
    return [d.at[0], d.at[1]];
  }

  snapshot() {
    return { id: this.id, type: this.type, x: this.x, z: this.z, hp: this.hp, dead: this.dead };
  }

  restore(s) {
    this.x = s.x;
    this.z = s.z;
    this.hp = s.hp;
    this.dead = s.dead;
    if (this.dead) this.setState('dead');
  }

  update(dt, ctx) {
    this.stateTime += dt;
    if (this.dead) return;
    this.think(dt, ctx);
  }

  // 子類實作
  think() {}
}

// 敵人之間圓對圓推開（避免疊在同一點）
export function separateEnemies(enemies) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d > 1e-9 && d < min) {
        const push = (min - d) / 2 / d;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
  }
}
