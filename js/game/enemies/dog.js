// 殭屍犬：高速繞行、近距撲擊，撲擊後有硬直破綻。
import { Enemy } from './base.js';

const AGGRO_RANGE = 14;
const LUNGE_RANGE = 3;
const LUNGE_SPEED = 6.5;
const LUNGE_TIME = 0.45;
const LUNGE_HIT = 0.8;
const RECOVER = 0.9;
const STAGGER = 0.3;
const BITE_DAMAGE = 15;
const LUNGE_COOLDOWN = 0.8; // 恢復後至少追這麼久才能再撲，避免貼臉無限連撲

export class Dog extends Enemy {
  constructor(opts) {
    super({ ...opts, type: 'dog', hp: 40, speed: 3.4, radius: 0.3 });
    this._lungeDir = [0, 0];
    this._lungeBit = false;
    this._lungeCd = 0;
  }

  hitSpheres() {
    return [
      { y: 0.4, r: 0.35, zone: 'body' },
      { y: 0.55, r: 0.16, zone: 'head' },
    ];
  }

  think(dt, ctx) {
    const dist = this.distTo(ctx.player.x, ctx.player.z);
    const sameRoom = ctx.world.roomAt(this.x, this.z) === ctx.world.roomAt(ctx.player.x, ctx.player.z);

    switch (this.state) {
      case 'idle':
        if (this.alerted || (sameRoom && dist < AGGRO_RANGE) || dist < 2.5) {
          this.setState('chase');
          ctx.sound('dogbark', this.x, this.z);
        }
        break;
      case 'chase':
        if (this._lungeCd > 0) this._lungeCd -= dt;
        if (sameRoom && dist < LUNGE_RANGE && this._lungeCd <= 0) {
          // 鎖定撲擊方向
          const dx = ctx.player.x - this.x;
          const dz = ctx.player.z - this.z;
          const d = Math.hypot(dx, dz) || 1;
          this._lungeDir = [dx / d, dz / d];
          this._lungeBit = false;
          this.setState('lunge');
          ctx.sound('dogbark', this.x, this.z);
        } else {
          const [tx, tz] = this.chaseTarget(ctx);
          this.moveToward(tx, tz, this.speed, dt, ctx.world);
        }
        break;
      case 'lunge': {
        // 沿鎖定方向衝刺（方向不再修正，可被閃避）
        this.moveToward(
          this.x + this._lungeDir[0] * 10,
          this.z + this._lungeDir[1] * 10,
          LUNGE_SPEED,
          dt,
          ctx.world
        );
        if (!this._lungeBit && this.distTo(ctx.player.x, ctx.player.z) < LUNGE_HIT) {
          this._lungeBit = true;
          ctx.attackPlayer(BITE_DAMAGE);
          ctx.sound('bite', this.x, this.z);
        }
        if (this.stateTime >= LUNGE_TIME) this.setState('recover');
        break;
      }
      case 'recover':
        if (this.stateTime >= RECOVER) {
          this._lungeCd = LUNGE_COOLDOWN;
          this.setState('chase');
        }
        break;
      case 'stagger':
        if (this.stateTime >= STAGGER) this.setState('chase');
        break;
    }
  }
}
