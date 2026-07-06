import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSave, applySave } from '../js/game/gamestate.js';
import { Inventory } from '../js/game/items.js';
import { Arsenal } from '../js/game/weapons.js';
import { Zombie } from '../js/game/enemies/zombie.js';
import { Player } from '../js/game/player.js';
import { World } from '../js/game/world.js';
import { ARENA } from '../js/levels/arena.js';

test('存檔快照完整往返（經 JSON 序列化）', () => {
  const player = new Player({ x: 8, z: 2.2, yaw: 1.1 });
  player.hp = 55;
  const inv = new Inventory();
  inv.add('green_herb', 2);
  inv.add('handgun_ammo', 23);
  const ars = new Arsenal();
  ars.give('handgun', 9);
  ars.give('shotgun', 4);
  ars.select('shotgun');
  const z1 = new Zombie({ id: 'z1', x: 15, z: 2 });
  z1.hurt(30, 'body');
  const z2 = new Zombie({ id: 'z2', x: 18, z: 5 });
  z2.hurt(999, 'body');

  const data = buildSave({
    levelId: 'arena',
    player,
    inventory: inv,
    arsenal: ars,
    enemies: [z1, z2],
    takenPickups: ['p-hgammo'],
    gameTime: 123.5,
  });
  const roundtripped = JSON.parse(JSON.stringify(data)); // 模擬 localStorage

  const target = new Player({ x: 0, z: 0, yaw: 0 });
  const restored = applySave(roundtripped, { player: target });

  assert.equal(target.x, 8);
  assert.equal(target.hp, 55);
  assert.equal(restored.levelId, 'arena');
  assert.deepEqual(restored.inventory.toJSON(), inv.toJSON());
  assert.deepEqual(restored.arsenal.toJSON(), ars.toJSON());
  assert.equal(restored.takenPickups.has('p-hgammo'), true);
  assert.equal(restored.gameTime, 123.5);

  // 敵人快照套回
  const fresh1 = new Zombie({ id: 'z1', x: 15, z: 2 });
  const fresh2 = new Zombie({ id: 'z2', x: 18, z: 5 });
  const byId = new Map(restored.enemySnapshots.map((s) => [s.id, s]));
  fresh1.restore(byId.get('z1'));
  fresh2.restore(byId.get('z2'));
  assert.equal(fresh1.hp, 40);
  assert.equal(fresh2.dead, true);
});

test('nextDoorToward：走向正確的門、關門擋路', () => {
  const world = new World(ARENA);
  // 全關：無路
  assert.equal(world.nextDoorToward('arena', 'armory'), null);
  world.setDoorOpen('d-corridor-arena', true);
  world.setDoorOpen('d-armory-corridor', true);
  assert.equal(world.nextDoorToward('arena', 'armory'), 'd-corridor-arena');
  assert.equal(world.nextDoorToward('corridor', 'armory'), 'd-armory-corridor');
  world.setDoorOpen('d-armory-corridor', false);
  assert.equal(world.nextDoorToward('arena', 'armory'), null);
});

test('玩家：無敵幀與 Danger 減速', () => {
  const world = new World(ARENA);
  const p = new Player({ x: 3, z: 2.5, yaw: 0 });
  assert.equal(p.hurt(20), true);
  assert.equal(p.hurt(20), false); // 無敵幀內
  assert.equal(p.hp, 80);
  // 消化無敵幀
  const idle = { moveX: 0, moveZ: 0, run: false, interact: false, look: [0, 0] };
  for (let i = 0; i < 60; i++) p.update(1 / 60, idle, world);
  assert.equal(p.hurt(60), true);
  assert.equal(p.hp, 20); // Danger
  assert.equal(p.healthTier(), 'danger');
  // Danger 走路 1 秒 = 3.2 × 0.8（移到競技場開闊處量測，避免撞牆）
  p.x = 16;
  p.z = 1;
  const before = p.z;
  for (let i = 0; i < 60; i++) p.update(1 / 60, { ...idle, moveZ: 1 }, world); // 往 +z
  assert.ok(Math.abs((p.z - before) - 3.2 * 0.8) < 0.02, `位移 ${p.z - before}`);
});
