// 獵痕者：蛙型獵殺生物——高速 Z 字接近，近距跳斬（前搖 0.5s 可側閃）。
import { Enemy } from './base.js';

export class Hunter extends Enemy {
  constructor(o) {
    super({ ...o, type: 'hunter', hp: 200, speed: 3.4, radius: 0.4 });
    this._zig = 0;
  }

  hitSpheres() {
    return [
      { y: 0.8, r: 0.5, zone: 'body' },
      { y: 1.35, r: 0.24, zone: 'head' },
    ];
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    if (!this.alerted) {
      if (d < 9) this.alert();
      else return;
    }
    switch (this.state) {
      case 'idle':
        this.setState('chase');
        break;
      case 'chase': {
        this._zig += dt * 6;
        const [tx, tz] = this.chaseTarget(ctx);
        const dx = tx - this.x;
        const dz = tz - this.z;
        const len = Math.hypot(dx, dz) || 1;
        const off = Math.sin(this._zig) * 1.2; // 垂直方向蛇行
        this.moveToward(tx + (-dz / len) * off, tz + (dx / len) * off, this.speed, dt, ctx.world);
        this.faceToward(ctx.player.x, ctx.player.z);
        if (d < 2.6) this.setState('windup');
        break;
      }
      case 'windup':
        this.faceToward(ctx.player.x, ctx.player.z);
        if (this.stateTime >= 0.5) this.setState('lunge');
        break;
      case 'lunge': {
        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        this.moveToward(this.x + fx * 3, this.z + fz * 3, 10, dt, ctx.world);
        if (this.distTo(ctx.player.x, ctx.player.z) < 1.1) {
          ctx.attackPlayer(40);
          this.setState('recover');
        } else if (this.stateTime >= 0.3) {
          this.setState('recover');
        }
        break;
      }
      case 'recover':
        if (this.stateTime >= 0.8) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= 0.35) this.setState('chase');
        break;
    }
  }
}
