import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore } from '../js/engine/save.js';

function fakeStorage() {
  const m = new Map();
  return {
    setItem: (k, v) => m.set(k, String(v)),
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('往返：存進去讀出來 deepEqual', () => {
  const s = new SaveStore(fakeStorage());
  assert.equal(s.persistent, true);
  const data = { chapter: 1, room: 'hall', flags: ['a', 'b'], hp: 87 };
  s.save('slot', data);
  assert.deepEqual(s.load('slot'), data);
});

test('probe 失敗：直接降級記憶體', () => {
  const broken = {
    setItem() { throw new Error('QuotaExceeded'); },
    getItem: () => null,
    removeItem() {},
  };
  const s = new SaveStore(broken);
  assert.equal(s.persistent, false);
  s.save('slot', { x: 1 });
  assert.deepEqual(s.load('slot'), { x: 1 });
});

test('建構後才失敗：自動降級且資料不遺失', () => {
  const flaky = {
    setItem(k) { if (k !== '__zw_probe') throw new Error('quota'); },
    getItem: () => null,
    removeItem() {},
  };
  const s = new SaveStore(flaky);
  assert.equal(s.persistent, true);
  s.save('slot', { x: 2 });
  assert.equal(s.persistent, false);
  assert.deepEqual(s.load('slot'), { x: 2 });
});

test('降級後仍能讀到降級前寫入 storage 的存檔', () => {
  const st = fakeStorage();
  let broken = false;
  const flaky = {
    setItem(k, v) {
      if (broken && k !== '__zw_probe') throw new Error('quota');
      st.setItem(k, v);
    },
    getItem: (k) => st.getItem(k),
    removeItem: (k) => st.removeItem(k),
  };
  const s = new SaveStore(flaky);
  s.save('old', { hp: 50 });     // 正常寫入 storage
  broken = true;
  s.save('new', { hp: 99 });     // 觸發降級，進 mem
  assert.equal(s.persistent, false);
  assert.deepEqual(s.load('old'), { hp: 50 }); // storage 後備仍讀得到
  assert.deepEqual(s.load('new'), { hp: 99 }); // mem 優先
});

test('降級後 remove 也會刪 storage，存檔不會復活', () => {
  const st = fakeStorage();
  let broken = false;
  const flaky = {
    setItem(k, v) {
      if (broken && k !== '__zw_probe') throw new Error('quota');
      st.setItem(k, v);
    },
    getItem: (k) => st.getItem(k),
    removeItem: (k) => st.removeItem(k),
  };
  const s = new SaveStore(flaky);
  s.save('slot', { x: 1 });
  broken = true;
  s.save('other', { y: 2 }); // 降級
  s.remove('slot');
  const reborn = new SaveStore(st); // 下次載入 probe 成功
  assert.equal(reborn.load('slot'), null);
});

test('壞 JSON 回 null', () => {
  const st = fakeStorage();
  st.setItem('slot', '{壞掉的');
  const s = new SaveStore(st);
  assert.equal(s.load('slot'), null);
});

test('無 storage：純記憶體模式', () => {
  const s = new SaveStore(null);
  assert.equal(s.persistent, false);
  s.save('slot', [1, 2, 3]);
  assert.deepEqual(s.load('slot'), [1, 2, 3]);
  s.remove('slot');
  assert.equal(s.load('slot'), null);
});
