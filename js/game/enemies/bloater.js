// 脹屍：緩慢逼近、近距鼓脹自爆（AoE＋中毒）。爆頭或打死都會引爆——
// 在遠處引爆牠反而是安全的打法。
import { Enemy } from './base.js';

export class Bloater extends Enemy {
  constructor(o) {
    super({ ...o, type: 'bloater', hp: 60, speed: 0.9, radius: 0.5 });
  }

  hitSpheres() {
    return [
      { y: 0.8, r: 0.6, zone: 'body' },
      { y: 1.5, r: 0.25, zone: 'head' },
    ];
  }

  // 覆寫：不進入 stagger；爆頭或歸零＝進入鼓脹引爆（縮短前搖）
  hurt(damage, zone = 'body') {
    if (this.dead) return 0;
    this.alerted = true;
    const dmg = zone === 'head' ? damage * this.headZoneMultiplier : damage;
    this.hp -= dmg;
    if ((zone === 'head' || this.hp <= 0) && this.state !== 'swell') {
      this.hp = Math.max(1, this.hp); // 引爆由 think 執行
      this.setState('swell');
      this.stateTime = 0.6; // 受擊引爆前搖較短（自主鼓脹從 0 起算）
    }
    return dmg;
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    if (!this.alerted) {
      if (d < 7) this.alert();
      else return;
    }
    switch (this.state) {
      case 'idle':
        this.setState('chase');
        break;
      case 'chase': {
        const [tx, tz] = this.chaseTarget(ctx);
        this.moveToward(tx, tz, this.speed, dt, ctx.world);
        if (d < 2.0) this.setState('swell');
        break;
      }
      case 'swell':
        if (this.stateTime >= 1.0) {
          const dd = this.distTo(ctx.player.x, ctx.player.z);
          if (dd < 2.8) {
            ctx.attackPlayer(Math.max(10, Math.round(45 * (1 - dd / 4))));
            ctx.poison(5);
          }
          if (ctx.boom) ctx.boom(this.x, 0.9, this.z);
          this.hp = 0;
          this.dead = true;
          this.setState('dead');
        }
        break;
    }
  }
}
