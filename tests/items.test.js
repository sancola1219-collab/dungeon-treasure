import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, ITEMS } from '../js/game/items.js';

test('堆疊：同種彈藥先疊滿再開新格', () => {
  const inv = new Inventory();
  inv.add('handgun_ammo', 30);
  assert.equal(inv.slots.filter(Boolean).length, 1);
  inv.add('handgun_ammo', 30);
  assert.equal(inv.countOf('handgun_ammo'), 60);
  assert.equal(inv.slots.filter(Boolean).length, 2); // 45 + 15
});

test('滿格：放不下回報 leftover', () => {
  const inv = new Inventory(2);
  inv.add('green_herb', 3);
  inv.add('red_herb', 3);
  const r = inv.add('first_aid_spray', 1);
  assert.equal(r.added, 0);
  assert.equal(r.leftover, 1);
  assert.equal(inv.isFull(), true);
});

test('組合：綠+紅 → 調和草藥', () => {
  const inv = new Inventory();
  inv.add('green_herb', 1);
  inv.add('red_herb', 1);
  assert.equal(inv.combine(0, 1), true);
  assert.equal(inv.countOf('mixed_herb'), 1);
  assert.equal(inv.countOf('green_herb'), 0);
  assert.equal(inv.countOf('red_herb'), 0);
});

test('組合：不符合配方失敗', () => {
  const inv = new Inventory();
  inv.add('green_herb', 2); // 同格堆疊
  inv.add('handgun_ammo', 5);
  assert.equal(inv.combine(0, 1), false);
  assert.equal(inv.countOf('green_herb'), 2);
});

test('治療：綠+40 上限 100、紅單用無效、調和全滿', () => {
  const inv = new Inventory();
  inv.add('green_herb', 1);
  inv.add('red_herb', 1);
  inv.add('mixed_herb', 1);
  const player = { hp: 30 };
  assert.equal(inv.useHeal(0, player), true);
  assert.equal(player.hp, 70);
  assert.equal(inv.useHeal(1, player), false); // 紅單用
  assert.equal(player.hp, 70);
  assert.equal(inv.useHeal(2, player), true); // 調和
  assert.equal(player.hp, 100);
  assert.equal(inv.useHeal(1, { hp: 100 }), false); // 滿血不浪費
});

test('takeAmmo：跨堆取出、不足時取到多少算多少', () => {
  const inv = new Inventory();
  inv.add('handgun_ammo', 50); // 45 + 5 兩堆
  assert.equal(inv.takeAmmo('handgun_ammo', 12), 12);
  assert.equal(inv.countOf('handgun_ammo'), 38);
  assert.equal(inv.takeAmmo('handgun_ammo', 99), 38);
  assert.equal(inv.countOf('handgun_ammo'), 0);
  assert.equal(inv.takeAmmo('handgun_ammo', 5), 0);
});

test('JSON 往返', () => {
  const inv = new Inventory();
  inv.add('green_herb', 2);
  inv.add('shotgun_shells', 7);
  inv.keyItems.push('moon_key');
  const copy = Inventory.fromJSON(inv.toJSON());
  assert.deepEqual(copy.toJSON(), inv.toJSON());
});

test('道具定義完整性：ammo 都指向存在的武器', () => {
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.type === 'ammo') assert.ok(def.weapon, `${id} 缺 weapon`);
    assert.ok(def.name, `${id} 缺名稱`);
  }
});
