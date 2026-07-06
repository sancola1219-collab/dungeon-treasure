// 原體（KY-Prime）：吞噬六個 KY-02 容器後成形的聚合體巨物。最終 Boss。
// 第一階段：緩慢逼近＋衝撞；半血進入第二階段：加速＋酸液噴吐（中毒）。
// 不易硬直（單發 120 傷以上才會打斷動作）。
import { Enemy } from './base.js';

export class Prime extends Enemy {
  constructor(o) {
    super({ ...o, type: 'prime', hp: 900, speed: 1.6, radius: 0.7 });
    this.phase = 1;
    this._chargeCd = 3;
    this._acidCd = 2;
  }

  hitSpheres() {
    return [
      { y: 1.1, r: 0.85, zone: 'body' },
      { y: 2.2, r: 0.4, zone: 'head' }, // 外露核心，2 倍傷
    ];
  }

  hurt(damage, zone = 'body') {
    if (this.dead) return 0;
    this.alerted = true;
    const dmg = zone === 'head' ? damage * this.headZoneMultiplier : damage;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      this.setState('dead');
      return dmg;
    }
    if (this.phase === 1 && this.hp <= 450) {
      this.phase = 2;
      this.speed = 2.6;
      this.setState('roar'); // 階段轉換咆哮
    } else if (dmg >= 120) {
      this.setState('stagger'); // 只有重擊能打斷
    }
    return dmg;
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    if (!this.alerted) {
      if (d < 10) this.alert();
      else return;
    }
    switch (this.state) {
      case 'idle':
        this.setState('chase');
        break;
      case 'chase': {
        this._chargeCd -= dt;
        this._acidCd -= dt;
        const [tx, tz] = this.chaseTarget(ctx);
        this.moveToward(tx, tz, this.speed, dt, ctx.world);
        if (d < 2.2) this.setState('swipe');
        else if (this.phase === 2 && d < 9 && this._acidCd <= 0) this.setState('spit');
        else if (d > 4 && d < 9 && this._chargeCd <= 0) this.setState('windup');
        break;
      }
      case 'windup': // 衝撞前搖（可側閃）
        this.faceToward(ctx.player.x, ctx.player.z);
        if (this.stateTime >= 0.6) this.setState('charge');
        break;
      case 'charge': {
        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        this.moveToward(this.x + fx * 4, this.z + fz * 4, 9, dt, ctx.world);
        if (this.distTo(ctx.player.x, ctx.player.z) < 1.7) {
          ctx.attackPlayer(45);
          this._chargeCd = this.phase === 2 ? 2.4 : 3.5;
          this.setState('recover');
        } else if (this.stateTime >= 0.6) {
          this._chargeCd = this.phase === 2 ? 2.4 : 3.5;
          this.setState('recover');
        }
        break;
      }
      case 'swipe':
        if (this.stateTime >= 0.4) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 2.7) ctx.attackPlayer(30);
          this.setState('cooldown');
        }
        break;
      case 'spit': // 酸液（中毒）
        this.faceToward(ctx.player.x, ctx.player.z);
        if (this.stateTime >= 0.5) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 10) {
            ctx.attackPlayer(12);
            ctx.poison(6);
            ctx.sound('bite');
          }
          this._acidCd = 2.6;
          this.setState('chase');
        }
        break;
      case 'roar':
        if (this.stateTime === dt) ctx.sound('groan');
        if (this.stateTime >= 1.2) this.setState('chase');
        break;
      case 'recover':
        if (this.stateTime >= 0.9) this.setState('chase');
        break;
      case 'cooldown':
        if (this.stateTime >= 0.5) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= 0.5) this.setState('chase');
        break;
    }
  }
}
