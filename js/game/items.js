// 道具定義與物品欄。純邏輯模組，node 可測。
// 武器不佔格（由 Arsenal 管理）；關鍵道具（鑰匙等）記在 keyItems 不受 8 格限制。
export const ITEMS = {
  green_herb: { name: '治傷藥草', type: 'heal', stack: 3, desc: '恢復少量生命（+40）' },
  red_herb: { name: '活血紅根', type: 'heal', stack: 3, desc: '單獨使用無效，可與綠色草藥調和' },
  mixed_herb: { name: '濃縮藥膏', type: 'heal', stack: 1, desc: '綠紅調和，完全恢復生命' },
  first_aid_spray: { name: '急救藥箱', type: 'heal', stack: 1, desc: '完全恢復生命' },
  blue_herb: { name: '解毒地衣', type: 'heal', stack: 3, desc: '解除中毒' },
  treasure_coin: { name: '金幣袋', type: 'treasure', value: 1, desc: '沉甸甸的古金幣' },
  treasure_gem: { name: '血紅寶石', type: 'treasure', value: 2, desc: '在火光下像凝固的血' },
  treasure_idol: { name: '黃金神像', type: 'treasure', value: 5, desc: '無名王朝的守護神' },
  treasure_crown: { name: '沉默王冠', type: 'treasure', value: 10, desc: '傳說的核心——王的冠冕' },
  bronzekey: { name: '青銅鑰匙', type: 'key', desc: '打開封門廳青銅鎖的鑰匙' },
  keycard: { name: '貨梯鑰匙卡', type: 'key', desc: '晨星工業的門禁卡，可開啟貨梯' },
  labkey: { name: '實驗區通行卡', type: 'key', desc: '生物危害等級4區域的通行卡' },
  magnum_weapon: { name: '獵象槍', type: 'weapon', weapon: 'magnum', rounds: 6 },
  handgun_ammo: { name: '左輪彈', type: 'ammo', stack: 45, weapon: 'handgun' },
  shotgun_shells: { name: '獵槍彈', type: 'ammo', stack: 21, weapon: 'shotgun' },
  magnum_ammo: { name: '重型彈', type: 'ammo', stack: 12, weapon: 'magnum' },
  smg_ammo: { name: '衝鋒槍彈', type: 'ammo', stack: 90, weapon: 'smg' },
  fuel: { name: '燈油罐', type: 'ammo', stack: 100, weapon: 'flamethrower' },
  rocket_ammo: { name: '火箭彈', type: 'ammo', stack: 3, weapon: 'rocket' },
  handgun_weapon: { name: '左輪手槍', type: 'weapon', weapon: 'handgun', rounds: 15 },
  shotgun_weapon: { name: '雙管獵槍', type: 'weapon', weapon: 'shotgun', rounds: 4 },
  smg_weapon: { name: '衝鋒槍', type: 'weapon', weapon: 'smg', rounds: 30 },
  flamethrower_weapon: { name: '火油噴燈', type: 'weapon', weapon: 'flamethrower', rounds: 60 },
  rocket_weapon: { name: '火箭炮', type: 'weapon', weapon: 'rocket', rounds: 1 },
};

export class Inventory {
  constructor(size = 8) {
    this.size = size;
    this.slots = new Array(size).fill(null); // {id, count} | null
    this.keyItems = [];
  }

  // 先疊進既有堆，再開新格。回傳實際加入數與放不下的餘量。
  add(id, count = 1) {
    const def = ITEMS[id];
    let left = count;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < def.stack) {
        const take = Math.min(def.stack - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(def.stack, left);
        this.slots[i] = { id, count: take };
        left -= take;
      }
    }
    return { added: count - left, leftover: left };
  }

  remove(index, count = 1) {
    const s = this.slots[index];
    if (!s) return 0;
    const take = Math.min(s.count, count);
    s.count -= take;
    if (s.count <= 0) this.slots[index] = null;
    return take;
  }

  countOf(id) {
    return this.slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  }

  isFull() {
    return this.slots.every((s) => s !== null);
  }

  // 裝填用：從彈藥堆中取出至多 max 發
  takeAmmo(id, max) {
    let need = max;
    for (let i = 0; i < this.size && need > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) need -= this.remove(i, need);
    }
    return max - need;
  }

  // 組合：綠＋紅 → 調和草藥（放回 a 格）。不符合配方回 false。
  combine(a, b) {
    const sa = this.slots[a];
    const sb = this.slots[b];
    if (!sa || !sb || a === b) return false;
    const pair = [sa.id, sb.id].sort().join('+');
    if (pair !== 'green_herb+red_herb') return false;
    this.remove(a, 1);
    this.remove(b, 1);
    if (this.slots[a]) {
      // a 格還有剩（堆疊>1），調和結果找空格；沒空格則失敗還原
      const r = this.add('mixed_herb', 1);
      if (r.leftover > 0) {
        this.add(sa.id === 'green_herb' ? 'green_herb' : 'red_herb', 1);
        this.add(sb.id === 'red_herb' ? 'red_herb' : 'green_herb', 1);
        return false;
      }
    } else {
      this.slots[a] = { id: 'mixed_herb', count: 1 };
    }
    return true;
  }

  // 治療道具使用。成功回 true 並消耗一個。
  useHeal(index, player) {
    const s = this.slots[index];
    if (!s) return false;
    if (s.id === 'green_herb') {
      if (player.hp >= 100) return false;
      player.hp = Math.min(100, player.hp + 40);
    } else if (s.id === 'mixed_herb' || s.id === 'first_aid_spray') {
      if (player.hp >= 100) return false;
      player.hp = 100;
    } else if (s.id === 'blue_herb') {
      if (!(player.poison > 0)) return false;
      player.poison = 0;
    } else {
      return false; // 紅草藥單用無效、非治療道具
    }
    this.remove(index, 1);
    return true;
  }

  toJSON() {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), keyItems: [...this.keyItems] };
  }

  static fromJSON(data, size = 8) {
    const inv = new Inventory(size);
    data.slots.forEach((s, i) => {
      if (s && i < size) inv.slots[i] = { ...s };
    });
    inv.keyItems = [...(data.keyItems || [])];
    return inv;
  }
}
