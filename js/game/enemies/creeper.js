// 蔓噬花：固定式食人植物——近距藤鞭橫掃、中距噴毒霧；花心（head）承受雙倍傷害。
import { Enemy } from './base.js';

export class Creeper extends Enemy {
  constructor(o) {
    super({ ...o, type: 'creeper', hp: 160, speed: 0, radius: 0.55 });
    this.alerted = true; // 植物沒有未警覺狀態
    this._gasCd = 4;
  }

  hitSpheres() {
    return [
      { y: 0.7, r: 0.6, zone: 'body' },
      { y: 1.5, r: 0.35, zone: 'head' }, // 花心弱點
    ];
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    this.faceToward(ctx.player.x, ctx.player.z);
    switch (this.state) {
      case 'idle':
        this._gasCd -= dt;
        if (d < 3) this.setState('windup');
        else if (d < 6 && this._gasCd <= 0) this.setState('gas');
        break;
      case 'windup': // 藤鞭橫掃
        if (this.stateTime >= 0.45) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 3.4) ctx.attackPlayer(20);
          this.setState('cooldown');
        }
        break;
      case 'gas': // 毒霧
        if (this.stateTime >= 0.8) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 5.5) {
            ctx.poison(6);
            ctx.sound('groan');
          }
          this._gasCd = 5;
          this.setState('idle');
        }
        break;
      case 'cooldown':
        if (this.stateTime >= 0.9) this.setState('idle');
        break;
      case 'stagger':
        if (this.stateTime >= 0.3) this.setState('idle');
        break;
    }
  }
}
