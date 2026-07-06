import test from 'node:test';
import assert from 'node:assert/strict';
import { castShot, rayHitsSphere, rayHitsWall, jitterDir } from '../js/game/combat.js';
import { mulberry32 } from '../js/engine/rng.js';

function fakeZombie(x, z) {
  return {
    x, z, dead: false,
    hitSpheres: () => [
      { y: 0.95, r: 0.42, zone: 'body' },
      { y: 1.55, r: 0.22, zone: 'head' },
    ],
  };
}

test('rayHitsSphere：正對命中與偏離未命中', () => {
  const t = rayHitsSphere({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: -5 }, 0.5);
  assert.ok(Math.abs(t - 4.5) < 1e-9);
  assert.equal(rayHitsSphere({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 2, y: 1, z: -5 }, 0.5), null);
});

test('rayHitsWall：垂直牆的距離', () => {
  const t = rayHitsWall(0, 5, 0, -1, 40, [[-3, 2, 3, 2]]);
  assert.ok(Math.abs(t - 3) < 1e-9);
  assert.equal(rayHitsWall(0, 5, 0, -1, 40, [[1, 2, 3, 2]]), null); // 射線不過牆段範圍
});

test('castShot：平射命中身體、瞄高命中頭', () => {
  const z = fakeZombie(0, -4);
  const body = castShot({
    origin: { x: 0, y: 1.0, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    enemies: [z],
  });
  assert.equal(body.zone, 'body');
  // 從眼高 1.6 平射 → 命中頭球（中心 1.55）
  const head = castShot({
    origin: { x: 0, y: 1.6, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    enemies: [z],
  });
  assert.equal(head.zone, 'head');
});

test('castShot：牆擋住後方敵人', () => {
  const z = fakeZombie(0, -6);
  const hit = castShot({
    origin: { x: 0, y: 1, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    enemies: [z],
    wallSegments: [[-2, -3, 2, -3]],
  });
  assert.equal(hit, null);
  // 敵人在牆前面則正常命中
  const z2 = fakeZombie(0, -2);
  const hit2 = castShot({
    origin: { x: 0, y: 1, z: 0 },
    dir: { x: 0, y: 0, z: -1 },
    enemies: [z2],
    wallSegments: [[-2, -3, 2, -3]],
  });
  assert.ok(hit2 && hit2.enemy === z2);
});

test('castShot：兩敵取較近者、死亡敵人忽略', () => {
  const near = fakeZombie(0, -3);
  const far = fakeZombie(0, -8);
  const hit = castShot({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 }, enemies: [far, near] });
  assert.equal(hit.enemy, near);
  near.dead = true;
  const hit2 = castShot({ origin: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 }, enemies: [far, near] });
  assert.equal(hit2.enemy, far);
});

test('jitterDir：結果為單位向量且偏差受 spread 限制', () => {
  const rng = mulberry32(9);
  for (let i = 0; i < 50; i++) {
    const d = jitterDir({ x: 0, y: 0, z: -1 }, 0.05, rng);
    assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
    const dot = -d.z; // 與原方向的夾角餘弦
    assert.ok(dot > 0.99, `偏差過大 dot=${dot}`);
  }
  const same = jitterDir({ x: 0, y: 0, z: -1 }, 0, rng);
  assert.deepEqual(same, { x: 0, y: 0, z: -1 });
});
