import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Player,
  resolveCircleVsSegments,
  WALK_SPEED,
  RUN_SPEED,
} from '../js/game/player.js';
import { World } from '../js/game/world.js';

// 單房 10×10 夾具（無門）
const ROOM = {
  id: 'test',
  spawn: { x: 5, z: 5, yaw: 0 },
  rooms: [{ id: 'only', x: 0, z: 0, w: 10, d: 10, h: 3 }],
  doors: [],
};

const IDLE = { moveX: 0, moveZ: 0, run: false, interact: false, look: [0, 0] };

function step(player, world, actions, seconds = 1) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) player.update(1 / 60, actions, world);
}

test('正面走向牆壁：停在半徑 0.35 處', () => {
  const world = new World(ROOM);
  const p = new Player({ x: 5, z: 1, yaw: 0 }); // yaw=0 面向 -z
  step(p, world, { ...IDLE, moveZ: -1 });
  assert.ok(Math.abs(p.z - 0.35) < 1e-6, `z=${p.z} 應為 0.35`);
  assert.ok(Math.abs(p.x - 5) < 1e-9, 'x 不應改變');
});

test('斜向撞牆沿牆滑行', () => {
  const world = new World(ROOM);
  const p = new Player({ x: 5, z: 1, yaw: Math.PI / 4 }); // 前方偏西
  step(p, world, { ...IDLE, moveZ: -1 });
  assert.ok(Math.abs(p.z - 0.35) < 1e-6, `z=${p.z} 應貼牆 0.35`);
  assert.ok(p.x < 4.9, `x=${p.x} 應沿牆滑動減少`);
});

test('走路與跑步速度', () => {
  const world = new World(ROOM);
  const walk = new Player({ x: 5, z: 8, yaw: 0 });
  step(walk, world, { ...IDLE, moveZ: -1 }); // 往 -z 走 1 秒
  assert.ok(Math.abs (8 - walk.z - WALK_SPEED) < 0.01, `走路位移 ${8 - walk.z}`);
  const run = new Player({ x: 5, z: 8, yaw: 0 });
  step(run, world, { ...IDLE, moveZ: -1, run: true });
  assert.ok(Math.abs(8 - run.z - RUN_SPEED) < 0.01, `跑步位移 ${8 - run.z}`);
});

test('對角移動速度不超過單向速度', () => {
  const world = new World(ROOM);
  const p = new Player({ x: 2, z: 8, yaw: 0 });
  step(p, world, { ...IDLE, moveZ: -1, moveX: 1 });
  const dist = Math.hypot(p.x - 2, p.z - 8);
  assert.ok(Math.abs(dist - WALK_SPEED) < 0.01, `對角位移 ${dist} 應等於 ${WALK_SPEED}`);
});

test('resolveCircleVsSegments：推出到恰好距離 r', () => {
  const [x, z] = resolveCircleVsSegments(5, 0.2, 0.35, [[0, 0, 10, 0]]);
  assert.ok(Math.abs(z - 0.35) < 1e-9);
  assert.ok(Math.abs(x - 5) < 1e-9);
});

test('resolveCircleVsSegments：正好在線上也能推出', () => {
  const [, z] = resolveCircleVsSegments(5, 0, 0.35, [[0, 0, 10, 0]]);
  assert.ok(Math.abs(Math.abs(z) - 0.35) < 1e-9, `|z|=${Math.abs(z)} 應為 0.35`);
});

test('角落不會卡死也不會穿出', () => {
  const world = new World(ROOM);
  const p = new Player({ x: 1, z: 1, yaw: Math.PI / 4 + Math.PI }); // 朝西北角外
  // 往角落推 2 秒
  step(p, world, { ...IDLE, moveZ: -1 }, 2);
  assert.ok(p.x >= 0.35 - 1e-9 && p.z >= 0.35 - 1e-9, `(${p.x},${p.z}) 不應穿出`);
});
