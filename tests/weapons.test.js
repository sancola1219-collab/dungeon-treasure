import test from 'node:test';
import assert from 'node:assert/strict';
import { Arsenal, WEAPONS } from '../js/game/weapons.js';
import { Inventory } from '../js/game/items.js';
import { Player } from '../js/game/player.js';

test('武士刀：開局持有、三向掃擊描述', () => {
  const a = new Arsenal();
  assert.ok(a.has('katana'));
  a.select('katana');
  const shot = a.fire(0);
  assert.equal(shot.melee, true);
  assert.equal(shot.sweep, 3);
  assert.equal(shot.damage, 45);
});

test('衝鋒槍：auto 旗標與 0.09 間隔連發', () => {
  const a = new Arsenal();
  a.give('smg', 30);
  a.select('smg');
  assert.ok(WEAPONS.smg.auto);
  assert.ok(a.fire(0));
  assert.equal(a.fire(0.05), null); // 間隔內
  assert.ok(a.fire(0.1));
  assert.equal(a.loadedRounds(), 28);
});

test('火焰噴射：spray 描述含範圍與扇角、耗燃料', () => {
  const a = new Arsenal();
  a.give('flamethrower', 10);
  a.select('flamethrower');
  const s = a.fire(0);
  assert.equal(s.spray, true);
  assert.equal(s.range, 4);
  assert.ok(s.arc > 0);
  assert.equal(a.loadedRounds(), 9);
});

test('火箭炮：projectile 描述、彈匣 1 發、可用火箭彈補充', () => {
  const a = new Arsenal();
  a.give('rocket', 1);
  a.select('rocket');
  const s = a.fire(0);
  assert.equal(s.projectile, true);
  assert.equal(s.speed, 14);
  assert.equal(a.loadedRounds(), 0);
  const inv = new Inventory();
  inv.add('rocket_ammo', 2);
  assert.equal(a.reload(inv), 1); // 彈匣上限 1 → 只補 1
  assert.equal(inv.countOf('rocket_ammo'), 1);
});

test('中毒：每 0.8 秒扣 3、不會毒死、藍草藥解毒', () => {
  const p = new Player({ x: 0, z: 0 });
  const world = { roomAt: () => null };
  const idle = { moveX: 0, moveZ: 0, run: false, look: [0, 0] };
  p.poison = 6;
  for (let i = 0; i < 60; i++) p.update(1 / 60, idle, world); // 1 秒 → 一次毒傷
  assert.equal(p.hp, 97);
  const inv = new Inventory();
  inv.add('blue_herb', 1);
  assert.ok(inv.useHeal(0, p));
  assert.equal(p.poison, 0);
  assert.equal(inv.countOf('blue_herb'), 0);
  inv.add('blue_herb', 1);
  assert.equal(inv.useHeal(0, p), false); // 無中毒不可用
});

test('射速間隔：間隔內 fire 回 null', () => {
  const a = new Arsenal();
  a.give('handgun', 15);
  a.select('handgun');
  const shot = a.fire(0);
  assert.ok(shot && !shot.empty);
  assert.equal(a.fire(0.2), null); // 0.4s 間隔內
  assert.ok(a.fire(0.5));
});

test('彈耗與空膛', () => {
  const a = new Arsenal();
  a.give('handgun', 2);
  a.select('handgun');
  a.fire(0);
  a.fire(1);
  assert.equal(a.loadedRounds(), 0);
  const dry = a.fire(2);
  assert.equal(dry.empty, true);
});

test('裝填：從物品欄取彈補滿彈匣', () => {
  const a = new Arsenal();
  a.give('handgun', 3);
  a.select('handgun');
  const inv = new Inventory();
  inv.add('handgun_ammo', 20);
  const got = a.reload(inv);
  assert.equal(got, 12); // 15 - 3
  assert.equal(a.loadedRounds(), 15);
  assert.equal(inv.countOf('handgun_ammo'), 8);
  assert.equal(a.reload(inv), 0); // 已滿
});

test('裝填：彈藥不足取到多少算多少', () => {
  const a = new Arsenal();
  a.give('shotgun', 0);
  a.select('shotgun');
  const inv = new Inventory();
  inv.add('shotgun_shells', 3);
  assert.equal(a.reload(inv), 3);
  assert.equal(a.loadedRounds(), 3);
});

test('霰彈槍一發 8 顆彈丸、消耗 1 發', () => {
  const a = new Arsenal();
  a.give('shotgun', 7);
  a.select('shotgun');
  const shot = a.fire(0);
  assert.equal(shot.pellets, 8);
  assert.equal(a.loadedRounds(), 6);
});

test('小刀無限、melee 描述', () => {
  const a = new Arsenal();
  const swing = a.fire(0);
  assert.equal(swing.melee, true);
  assert.equal(a.loadedRounds(), Infinity);
});

test('give 補彈不超過彈匣、select 未持有失敗', () => {
  const a = new Arsenal();
  a.give('handgun', 99);
  assert.equal(a.loaded.handgun, WEAPONS.handgun.magazine);
  assert.equal(a.select('magnum'), false);
  assert.equal(a.current, 'knife');
});

test('JSON 往返', () => {
  const a = new Arsenal();
  a.give('handgun', 10);
  a.give('shotgun', 4);
  a.select('shotgun');
  a.fire(0);
  const copy = Arsenal.fromJSON(a.toJSON());
  assert.deepEqual(copy.toJSON(), a.toJSON());
});
