import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/game/world.js';
import { mulberry32 } from '../js/engine/rng.js';
import { Hunter } from '../js/game/enemies/hunter.js';
import { Lurker } from '../js/game/enemies/lurker.js';
import { Spider } from '../js/game/enemies/spider.js';
import { Creeper } from '../js/game/enemies/creeper.js';
import { Bloater } from '../js/game/enemies/bloater.js';

const ROOM = {
  id: 't',
  rooms: [{ id: 'r', x: 0, z: 0, w: 20, d: 20, h: 3 }],
  doors: [],
};

function makeCtx(px, pz, { running = false } = {}) {
  const hits = [];
  const poisons = [];
  const booms = [];
  return {
    player: { x: px, z: pz, running },
    world: new World(ROOM),
    rng: mulberry32(1),
    gameTime: 0,
    attackPlayer: (d) => hits.push(d),
    sound() {},
    poison: (s) => poisons.push(s),
    boom: (x, y, z) => booms.push([x, y, z]),
    hits, poisons, booms,
  };
}

function run(e, ctx, seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) e.update(1 / 60, ctx);
}

test('獵痕者：警覺→追擊→近距前搖→跳斬命中', () => {
  const ctx = makeCtx(5, 5);
  const h = new Hunter({ id: 'h', x: 9, z: 5 });
  run(h, ctx, 0.1);
  assert.equal(h.state, 'chase');
  run(h, ctx, 3); // 追近
  assert.ok(ctx.hits.includes(40), `應命中 40 傷，實際 ${ctx.hits}`);
});

test('潛伏者：天花板待機、玩家奔跑靠近觸發落地', () => {
  const ctx = makeCtx(4, 5, { running: true });
  const l = new Lurker({ id: 'l', x: 6, z: 5 });
  assert.equal(l.state, 'ceiling');
  assert.ok(l.yOffset > 2);
  run(l, ctx, 0.05);
  assert.equal(l.state, 'drop');
  run(l, ctx, 0.5);
  assert.equal(l.yOffset, 0);
  assert.ok(['chase', 'windup', 'cooldown'].includes(l.state));
});

test('潛伏者：槍聲（alert）也會觸發落地', () => {
  const ctx = makeCtx(15, 15);
  const l = new Lurker({ id: 'l2', x: 3, z: 3 });
  l.alert();
  assert.equal(l.state, 'drop');
});

test('巨蛛：同房中距噴毒——傷害＋中毒', () => {
  const ctx = makeCtx(5, 10);
  const s = new Spider({ id: 's', x: 9, z: 10 });
  s._spitCd = 0;
  run(s, ctx, 1.2);
  assert.ok(ctx.poisons.length >= 1, '應施加中毒');
  assert.ok(ctx.hits.includes(10), '應造成噴毒傷害');
});

test('蔓噬花：固定不動、近距藤鞭', () => {
  const ctx = makeCtx(11, 10);
  const c = new Creeper({ id: 'c', x: 10, z: 10 });
  const ox = c.x;
  run(c, ctx, 1.5);
  assert.equal(c.x, ox, '植物不應移動');
  assert.ok(ctx.hits.includes(20), '近距應被藤鞭掃中');
});

test('脹屍：爆頭引爆——鼓脹後自爆、近距傷害＋中毒＋boom', () => {
  const ctx = makeCtx(11.5, 10);
  const b = new Bloater({ id: 'b', x: 10, z: 10 });
  b.hurt(25, 'head');
  assert.equal(b.state, 'swell');
  run(b, ctx, 0.6);
  assert.ok(b.dead, '應已自爆死亡');
  assert.ok(ctx.hits.length >= 1, '玩家在半徑內應受傷');
  assert.ok(ctx.poisons.length >= 1, '應中毒');
  assert.equal(ctx.booms.length, 1, '應觸發爆炸特效回呼');
});

test('脹屍：打死也會引爆（遠處安全）', () => {
  const ctx = makeCtx(18, 18); // 玩家在遠處
  const b = new Bloater({ id: 'b2', x: 5, z: 5 });
  b.alerted = true;
  b.hurt(100, 'body');
  assert.equal(b.state, 'swell');
  run(b, ctx, 1.2);
  assert.ok(b.dead);
  assert.equal(ctx.hits.length, 0, '遠處玩家不應受傷');
});
