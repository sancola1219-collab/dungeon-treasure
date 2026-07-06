// 關卡驗證測試範本：每個新關卡都複製這份改 import 即可。
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/game/world.js';
import { DUNGEON2 } from '../js/levels/dungeon2.js';
import { ITEMS } from '../js/game/items.js';

const LEVEL = DUNGEON2;

test(`${LEVEL.id}：門連接的房間都存在`, () => {
  const ids = new Set(LEVEL.rooms.map((r) => r.id));
  for (const d of LEVEL.doors) {
    assert.ok(ids.has(d.from), `${d.id} from 不存在`);
    if (d.to !== null) assert.ok(ids.has(d.to), `${d.id} to 不存在`);
  }
});

test(`${LEVEL.id}：所有實體都落在房間內、道具都有定義`, () => {
  const w = new World(LEVEL);
  const all = [
    ...LEVEL.entities.pickups,
    ...LEVEL.entities.enemies,
    ...LEVEL.entities.typewriters,
    ...(LEVEL.documents || []),
    ...(LEVEL.npcs || []),
  ];
  for (const e of all) {
    assert.ok(w.roomAt(e.x, e.z) !== null, `${e.id} (${e.x},${e.z}) 不在任何房間內`);
  }
  for (const p of LEVEL.entities.pickups) assert.ok(ITEMS[p.item], `未定義道具 ${p.item}`);
});

test(`${LEVEL.id}：鎖鏈無死鎖（每把鑰匙都在拿得到的地方）`, () => {
  const w = new World(LEVEL);
  const fromSpawn = w.reachableRooms(w.roomAt(LEVEL.spawn.x, LEVEL.spawn.z));
  // 每個上鎖門的鑰匙，必須放在「不用過這道門」就可達的區域
  for (const d of LEVEL.doors) {
    if (!d.lock || d.lock === 'chapterExit') continue;
    if (d.lock === 'bossdead') {
      // Boss 擊破授予：來源＝Boss 敵人本體，須在可達區
      const boss = LEVEL.entities.enemies.find((e) => e.id === LEVEL.boss);
      assert.ok(boss, 'boss 欄位對應的敵人不存在');
      assert.ok(fromSpawn.has(w.roomAt(boss.x, boss.z)), 'Boss 不在可達區（死鎖！）');
      continue;
    }
    const key =
      LEVEL.entities.pickups.find((p) => p.item === d.lock) ||
      (LEVEL.documents || []).find((doc) => doc.grantsKey === d.lock);
    assert.ok(key, `鎖 ${d.lock} 沒有對應的鑰匙來源`);
    assert.ok(fromSpawn.has(w.roomAt(key.x, key.z)), `鑰匙 ${d.lock} 不在可達區（死鎖！）`);
  }
  // 全部解鎖後，出生點應能走遍所有房間
  const everything = w.reachableRooms(w.roomAt(LEVEL.spawn.x, LEVEL.spawn.z), { ignoreLocks: true });
  for (const r of LEVEL.rooms) assert.ok(everything.has(r.id), `房間 ${r.id} 與世界不連通`);
});

test(`${LEVEL.id}：觸發器房間存在、出口門格式正確`, () => {
  const ids = new Set(LEVEL.rooms.map((r) => r.id));
  for (const t of LEVEL.triggers || []) assert.ok(ids.has(t.room), `觸發器 ${t.id} 房間不存在`);
  const exit = LEVEL.doors.find((d) => d.lock === 'chapterExit');
  assert.ok(exit && exit.to === null, '應有 to:null 的 chapterExit 出口門');
});
