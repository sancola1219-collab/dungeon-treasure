// 存檔層：localStorage 可用就用，不可用（隱私模式、配額滿）自動降級為記憶體存檔。
// 降級後 persistent=false，呼叫端可據此提示「關閉頁面將遺失進度」。
export class SaveStore {
  constructor(storage = null) {
    this.mem = new Map();
    this.storage = null;
    this.persistent = false;
    if (storage) {
      try {
        storage.setItem('__zw_probe', '1');
        storage.removeItem('__zw_probe');
        this.storage = storage;
        this.persistent = true;
      } catch {
        // 保持記憶體模式
      }
    }
  }

  save(key, data) {
    const json = JSON.stringify(data);
    if (this.persistent) {
      try {
        this.storage.setItem(key, json);
        return true;
      } catch {
        this.persistent = false;
      }
    }
    this.mem.set(key, json);
    return true;
  }

  // mem 優先：mem 只在寫入失敗後才有資料，必定不比 storage 舊。
  // 降級後 storage 仍要當讀取後備，否則配額滿的瞬間所有舊存檔會「消失」。
  load(key) {
    let json = this.mem.has(key) ? this.mem.get(key) : null;
    if (json === null && this.storage) {
      try {
        json = this.storage.getItem(key);
      } catch {
        json = null;
      }
    }
    if (json === null || json === undefined) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // 兩邊都刪：只刪 mem 的話，降級期間刪除的存檔會在下次載入時從 storage 復活
  remove(key) {
    this.mem.delete(key);
    if (this.storage) {
      try {
        this.storage.removeItem(key);
      } catch {
        // 忽略
      }
    }
  }
}
