// 巨蛛：斜移接近、遠程噴毒（前搖 0.6s、中毒 DoT）、近身雙螯。
import { Enemy } from './base.js';

export class Spider extends Enemy {
  constructor(o) {
    super({ ...o, type: 'spider', hp: 120, speed: 2.6, radius: 0.45 });
    this._strafe = 1;
    this._spitCd = 2;
  }

  hitSpheres() {
    return [{ y: 0.45, r: 0.5, zone: 'body' }];
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    if (!this.alerted) {
      if (d < 8) this.alert();
      else return;
    }
    switch (this.state) {
      case 'idle':
        this.setState('chase');
        break;
      case 'chase': {
        this._spitCd -= dt;
        const [tx, tz] = this.chaseTarget(ctx);
        const dx = tx - this.x;
        const dz = tz - this.z;
        const len = Math.hypot(dx, dz) || 1;
        this.moveToward(
          tx + (-dz / len) * this._strafe * 1.5,
          tz + (dx / len) * this._strafe * 1.5,
          this.speed, dt, ctx.world
        );
        if (ctx.rng() < dt * 0.5) this._strafe *= -1;
        const sameRoom =
          ctx.world.roomAt(this.x, this.z) === ctx.world.roomAt(ctx.player.x, ctx.player.z);
        if (d < 1.5) this.setState('claw');
        else if (this._spitCd <= 0 && d < 7 && sameRoom) this.setState('spit');
        break;
      }
      case 'spit':
        this.faceToward(ctx.player.x, ctx.player.z);
        if (this.stateTime >= 0.6) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 7.5) {
            ctx.attackPlayer(10);
            ctx.poison(6);
            ctx.sound('bite');
          }
          this._spitCd = 3.2;
          this.setState('chase');
        }
        break;
      case 'claw':
        if (this.stateTime >= 0.4) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 1.9) ctx.attackPlayer(18);
          this.setState('cooldown');
        }
        break;
      case 'cooldown':
        if (this.stateTime >= 0.6) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= 0.35) this.setState('chase');
        break;
    }
  }
}
