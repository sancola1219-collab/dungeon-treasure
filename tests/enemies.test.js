import test from 'node:test';
import assert from 'node:assert/strict';
import { Zombie } from '../js/game/enemies/zombie.js';
import { Dog } from '../js/game/enemies/dog.js';
import { separateEnemies } from '../js/game/enemies/base.js';
import { World } from '../js/game/world.js';
import { ARENA } from '../js/levels/arena.js';
import { mulberry32 } from '../js/engine/rng.js';

function makeCtx(world, player, over = {}) {
  return {
    player,
    world,
    rng: mulberry32(1),
    gameTime: 0,
    attackPlayer: () => {},
    sound: () => {},
    ...over,
  };
}

function tick(enemy, ctx, seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) enemy.update(1 / 60, ctx);
}

test('殭屍：同房近距自動警覺並追近', () => {
  const world = new World(ARENA);
  const z = new Zombie({ id: 'z', x: 15, z: 2 });
  const player = { x: 18, z: 5 };
  const ctx = makeCtx(world, player);
  const d0 = z.distTo(player.x, player.z);
  tick(z, ctx, 2);
  assert.notEqual(z.state, 'idle');
  assert.ok(z.distTo(player.x, player.z) < d0, '應朝玩家靠近');
});

test('殭屍：不同房未警覺時維持 idle；alert() 後開始追', () => {
  const world = new World(ARENA);
  const z = new Zombie({ id: 'z', x: 15, z: 2 }); // 競技場
  const player = { x: 2, z: 2.5 }; // 軍械室
  const ctx = makeCtx(world, player);
  tick(z, ctx, 1);
  assert.equal(z.state, 'idle');
  z.alert();
  tick(z, ctx, 0.5);
  assert.equal(z.state, 'chase');
});

test('殭屍：近身 windup 後咬到玩家（0.45s 前搖）', () => {
  const world = new World(ARENA);
  const player = { x: 15, z: 2.6 };
  let bitten = 0;
  const z = new Zombie({ id: 'z', x: 15, z: 2 });
  const ctx = makeCtx(world, player, { attackPlayer: (d) => { bitten += d; } });
  tick(z, ctx, 0.3); // 進 windup，前搖未完
  assert.equal(bitten, 0);
  tick(z, ctx, 1);
  assert.equal(bitten, 20);
});

test('殭屍：受擊硬直、頭部兩倍傷（手槍兩發頭擊殺 70HP）', () => {
  const z = new Zombie({ id: 'z', x: 0, z: 0 });
  z.hurt(25, 'head');
  assert.equal(z.hp, 20);
  assert.equal(z.state, 'stagger');
  z.hurt(25, 'head');
  assert.equal(z.dead, true);
  assert.equal(z.state, 'dead');
});

test('殭屍：跨房追擊走向連接門（門開著）', () => {
  const world = new World(ARENA);
  world.setDoorOpen('d-corridor-arena', true);
  const z = new Zombie({ id: 'z', x: 15, z: 2 }); // 競技場
  const player = { x: 7, z: 2.5 }; // 走廊
  const ctx = makeCtx(world, player);
  z.alert();
  tick(z, ctx, 2);
  // 應朝門 [12, 2.5] 移動（x 減少）
  assert.ok(z.x < 15, `x=${z.x} 應向門移動`);
});

test('犬：3m 內鎖向撲擊、撲擊後硬直、離開後恢復追擊', () => {
  const world = new World(ARENA);
  const player = { x: 17, z: 4 };
  let bitten = 0;
  const dog = new Dog({ id: 'd', x: 19.4, z: 4 });
  const ctx = makeCtx(world, player, { attackPlayer: (d) => { bitten += d; } });
  tick(dog, ctx, 0.2);
  assert.equal(dog.state, 'lunge');
  tick(dog, ctx, 0.6);
  assert.equal(bitten, 15);
  assert.equal(dog.state, 'recover');
  tick(dog, ctx, 1);
  assert.equal(dog.state, 'chase');
});

test('separateEnemies：重疊的殭屍被推開', () => {
  const a = new Zombie({ id: 'a', x: 5, z: 5 });
  const b = new Zombie({ id: 'b', x: 5.1, z: 5 });
  separateEnemies([a, b]);
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  assert.ok(d >= a.radius + b.radius - 1e-9, `間距 ${d} 不足`);
});

test('快照往返：位置/血量/死亡狀態', () => {
  const z = new Zombie({ id: 'z', x: 3, z: 4 });
  z.hurt(200, 'body');
  const snap = z.snapshot();
  const z2 = new Zombie({ id: 'z', x: 0, z: 0 });
  z2.restore(snap);
  assert.equal(z2.dead, true);
  assert.equal(z2.x, 3);
});
