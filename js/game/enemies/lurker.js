// 潛伏者：天花板爬行者——玩家奔跑靠近或槍聲（alert）觸發落地，快速爬行鞭擊。
import { Enemy } from './base.js';

export class Lurker extends Enemy {
  constructor(o) {
    super({ ...o, type: 'lurker', hp: 90, speed: 4.2, radius: 0.35 });
    this.setState('ceiling');
    this.yOffset = 2.4; // 渲染側依此把模型貼上天花板（狀態值，非動畫）
  }

  hitSpheres() {
    return this.state === 'ceiling' || this.yOffset > 0.2
      ? [{ y: 0.45 + this.yOffset, r: 0.4, zone: 'body' }]
      : [
          { y: 0.45, r: 0.4, zone: 'body' },
          { y: 0.8, r: 0.2, zone: 'head' },
        ];
  }

  alert() {
    super.alert();
    if (this.state === 'ceiling') this.setState('drop');
  }

  think(dt, ctx) {
    const d = this.distTo(ctx.player.x, ctx.player.z);
    switch (this.state) {
      case 'ceiling': {
        const same =
          ctx.world.roomAt(this.x, this.z) === ctx.world.roomAt(ctx.player.x, ctx.player.z);
        if (same && d < 5 && ctx.player.running) this.setState('drop');
        break;
      }
      case 'drop':
        this.yOffset = Math.max(0, this.yOffset - dt * 9);
        if (this.yOffset <= 0) {
          this.alerted = true;
          this.setState('chase');
        }
        break;
      case 'chase': {
        const [tx, tz] = this.chaseTarget(ctx);
        this.moveToward(tx, tz, this.speed, dt, ctx.world);
        if (d < 1.6) this.setState('windup');
        break;
      }
      case 'windup':
        this.faceToward(ctx.player.x, ctx.player.z);
        if (this.stateTime >= 0.35) {
          if (this.distTo(ctx.player.x, ctx.player.z) < 2.0) ctx.attackPlayer(25);
          this.setState('cooldown');
        }
        break;
      case 'cooldown':
        if (this.stateTime >= 0.7) this.setState('chase');
        break;
      case 'stagger':
        if (this.stateTime >= 0.4) this.setState(this.yOffset > 0 ? 'drop' : 'chase');
        break;
      case 'idle':
        this.setState(this.yOffset > 0 ? 'ceiling' : 'chase');
        break;
    }
  }
}
