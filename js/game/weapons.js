// 武器定義與玩家軍火庫。純邏輯模組，node 可測。
// 時間一律用「邏輯時間」（累積的固定時步秒數），不用牆鐘。
export const WEAPONS = {
  knife: { name: '開山刀', melee: true, damage: 15, range: 1.6, interval: 0.55 },
  katana: { name: '祖傳古劍', melee: true, damage: 45, range: 1.9, interval: 0.7, sweep: 3 }, // 三向扇形掃擊
  handgun: { name: '左輪手槍', damage: 25, magazine: 15, interval: 0.4, ammoItem: 'handgun_ammo', spread: 0.012 },
  shotgun: { name: '雙管獵槍', pellets: 8, damage: 12, magazine: 7, interval: 1.05, ammoItem: 'shotgun_shells', spread: 0.07 },
  magnum: { name: '獵象槍', damage: 150, magazine: 6, interval: 0.95, ammoItem: 'magnum_ammo', spread: 0.008, pierce: true },
  smg: { name: '衝鋒槍', damage: 12, magazine: 30, interval: 0.09, ammoItem: 'smg_ammo', spread: 0.035, auto: true },
  flamethrower: {
    name: '火油噴燈', spray: true, damage: 8, range: 4, arc: 0.44,
    magazine: 100, interval: 0.1, ammoItem: 'fuel', auto: true,
  },
  rocket: {
    name: '火箭炮', projectile: true, damage: 300, radius: 2.5, speed: 14,
    magazine: 1, interval: 1.6, ammoItem: 'rocket_ammo',
  },
};

export class Arsenal {
  constructor() {
    this.owned = ['knife', 'katana']; // 武士刀開局持有
    this.current = 'knife';
    this.loaded = {}; // weaponId → 彈匣內發數
    this._nextFireAt = 0;
  }

  has(id) {
    return this.owned.includes(id);
  }

  give(id, rounds = 0) {
    if (!this.has(id)) this.owned.push(id);
    if (!WEAPONS[id].melee) {
      this.loaded[id] = Math.min(WEAPONS[id].magazine, (this.loaded[id] || 0) + rounds);
    }
  }

  select(id) {
    if (!this.has(id)) return false;
    this.current = id;
    return true;
  }

  loadedRounds(id = this.current) {
    return WEAPONS[id].melee ? Infinity : this.loaded[id] || 0;
  }

  // 回傳 null（射速冷卻中）、{empty:true}（空膛）、或射擊描述
  fire(now) {
    if (now < this._nextFireAt) return null;
    const def = WEAPONS[this.current];
    if (def.melee) {
      this._nextFireAt = now + def.interval;
      return {
        weapon: this.current, melee: true, damage: def.damage,
        range: def.range, sweep: def.sweep || 1,
      };
    }
    if ((this.loaded[this.current] || 0) <= 0) {
      this._nextFireAt = now + 0.25; // 空膛喀聲也有間隔
      return { empty: true };
    }
    this.loaded[this.current] -= 1;
    this._nextFireAt = now + def.interval;
    if (def.spray) {
      return { weapon: this.current, spray: true, damage: def.damage, range: def.range, arc: def.arc };
    }
    if (def.projectile) {
      return { weapon: this.current, projectile: true, damage: def.damage, radius: def.radius, speed: def.speed };
    }
    return {
      weapon: this.current,
      pellets: def.pellets || 1,
      damage: def.damage,
      spread: def.spread,
      pierce: !!def.pierce,
    };
  }

  // 從物品欄取彈補滿彈匣，回傳補入發數
  reload(inventory) {
    const def = WEAPONS[this.current];
    if (def.melee) return 0;
    const need = def.magazine - (this.loaded[this.current] || 0);
    if (need <= 0) return 0;
    const got = inventory.takeAmmo(def.ammoItem, need);
    this.loaded[this.current] = (this.loaded[this.current] || 0) + got;
    return got;
  }

  toJSON() {
    return { owned: [...this.owned], current: this.current, loaded: { ...this.loaded } };
  }

  static fromJSON(data) {
    const a = new Arsenal();
    a.owned = [...data.owned];
    a.current = data.current;
    a.loaded = { ...data.loaded };
    return a;
  }
}
