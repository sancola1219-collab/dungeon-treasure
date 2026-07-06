// 殭屍：慢速直追、近身咬擊。經典配置：慢但成群時有壓迫感。
import { Enemy } from './base.js';

const AGGRO_RANGE = 12;   // 同房內察覺距離
const ATTACK_RANGE = 0.95; // 進入咬擊準備
const HIT_RANGE = 1.15;    // 出手判定距離
const WINDUP = 0.45;       // 咬擊前搖
const COOLDOWN = 0.6;
const STAGGER = 0.3;
const BITE_DAMAGE = 20;

export class Zombie extends Enemy {
  constructor(opts) {
    super({ ...opts, type: 'zombie', hp: 70, speed: 0.9, radius: 0.35 });
    this._groanTimer = 2 + (opts.seed ?? 0) % 3;
  }

  hitSpheres() {
    return [
      { y: 0.95, r: 0.42, zone: 'body' },
      { y: 1.55, r: 0.22, zone: 'head' },
    ];
  }

  think(dt, ctx) {
    const dist = this.distTo(ctx.player.x, ctx.player.z);
    const sameRoom = ctx.world.roomAt(this.x, this.z) === ctx.world.roomAt(ctx.player.x, ctx.player.z);

    switch (this.state) {
      case 'idle':
        if (this.alerted || (sameRoom && dist < AGGRO_RANGE) || dist < 2) {
          this.setState('chase');
          ctx.sound('groan', this.x, this.z);
        }
        break;
      case 'chase': {
        this._groanTimer -= dt;
        if (this._groanTimer <= 0) {
          this._groanTimer = 3 + ctx.rng() * 4;
          ctx.sound('groan', this.x, this.z);
        }
        if (sameRoom && dist < ATTACK_RANGE) {
          this.setState('windup');
          this.faceToward(ctx.player.x, ctx.player.z);
        } else {
          const [tx, tz] = this.chaseTarget(ctx);
          this.moveToward(tx, tz, this.speed, dt, ctx.world);
        }
        break;
      }
      case 'windup':
        if (this.stateTime >= WINDUP) {
          if (this.distTo(ctx.player.x, ctx.player.z) < HIT_RANGE) {
            ctx.attackPlayer(BITE_DAMAGE);
            ctx.sound('bite', this.x, this.z);
          }
          this.setState('cooldown');
        }
        break;
      case 'cooldown':
        if (this.stateTime >= COOLDOWN) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= STAGGER) this.setState('chase');
        break;
    }
  }
}
