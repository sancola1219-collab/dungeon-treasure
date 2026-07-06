import test from 'node:test';
import assert from 'node:assert/strict';
import { Projectiles, segmentsIntersect } from '../js/game/projectiles.js';
import { World } from '../js/game/world.js';

const ROOM = {
  id: 't',
  rooms: [{ id: 'r', x: 0, z: 0, w: 20, d: 10, h: 3 }],
  doors: [],
};

function ctx(world, enemies = [], player = { x: -50, z: -50 }) {
  return { world, enemies, player };
}

test('線段相交判定', () => {
  assert.equal(segmentsIntersect(0, 0, 2, 2, 0, 2, 2, 0), true);
  assert.equal(segmentsIntersect(0, 0, 1, 1, 3, 0, 4, 1), false);
});

test('火箭撞牆爆炸', () => {
  const world = new World(ROOM);
  const p = new Projectiles();
  p.spawn({ x: 18, y: 1.4, z: 5, dirX: 1, dirY: 0, dirZ: 0, speed: 14, damage: 300, radius: 2.5 });
  let events = [];
  for (let i = 0; i < 30 && events.length === 0; i++) {
    events = p.update(1 / 60, ctx(world));
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'explode');
  assert.ok(events[0].x > 19.5, `爆點 x=${events[0].x} 應在牆邊`);
  assert.equal(p.list.length, 0);
});

test('火箭命中敵人：AoE 距離衰減、近者傷害高', () => {
  const world = new World(ROOM);
  const near = { x: 10, z: 5, radius: 0.35, dead: false };
  const far = { x: 11.8, z: 5, radius: 0.35, dead: false };
  const outside = { x: 16, z: 5, radius: 0.35, dead: false };
  const p = new Projectiles();
  p.spawn({ x: 6, y: 1.4, z: 5, dirX: 1, dirY: 0, dirZ: 0, speed: 14, damage: 300, radius: 2.5 });
  let events = [];
  for (let i = 0; i < 60 && events.length === 0; i++) {
    events = p.update(1 / 60, ctx(world, [near, far, outside]));
  }
  assert.equal(events.length, 1);
  const hitEnemies = events[0].hits.map((h) => h.enemy);
  assert.ok(hitEnemies.includes(near) && hitEnemies.includes(far), 'AoE 應包含兩個近距敵人');
  assert.ok(!hitEnemies.includes(outside), '範圍外不受傷');
  const dNear = events[0].hits.find((h) => h.enemy === near).damage;
  const dFar = events[0].hits.find((h) => h.enemy === far).damage;
  assert.ok(dNear >= dFar, `近距傷害 ${dNear} 應 >= 遠距 ${dFar}`);
});

test('玩家在爆炸半徑內吃半傷', () => {
  const world = new World(ROOM);
  const dummy = { x: 10, z: 5, radius: 0.35, dead: false };
  const p = new Projectiles();
  p.spawn({ x: 8, y: 1.4, z: 5, dirX: 1, dirY: 0, dirZ: 0, speed: 14, damage: 300, radius: 2.5 });
  let events = [];
  for (let i = 0; i < 60 && events.length === 0; i++) {
    events = p.update(1 / 60, ctx(world, [dummy], { x: 9.5, z: 5 }));
  }
  assert.ok(events[0].playerDamage > 0, '玩家應受爆炸波及');
  assert.ok(events[0].playerDamage <= 150, '玩家傷害為半傷上限');
});
