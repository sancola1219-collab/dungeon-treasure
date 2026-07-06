// 覆蓋層 UI：物品欄（鍵盤導航）、打字機選單、死亡畫面。
// 全鍵盤操作，不退出 pointer lock。只透過回傳值影響遊戲狀態。
import { ITEMS } from '../game/items.js';

export class Overlays {
  constructor() {
    this.invEl = document.getElementById('inv');
    this.gridEl = document.getElementById('inv-grid');
    this.descEl = document.getElementById('inv-desc');
    this.twEl = document.getElementById('typewriter');
    this.twInfoEl = document.getElementById('tw-info');
    this.deathEl = document.getElementById('death');
    this.cursor = 0;
    this.marked = null; // 組合模式：已選取的格
  }

  // === 物品欄 ===

  openInventory(inv) {
    this.cursor = 0;
    this.marked = null;
    this.invEl.style.display = 'flex';
    this._renderGrid(inv);
  }

  closeInventory() {
    this.invEl.style.display = 'none';
  }

  // 每 tick 呼叫。回傳 true 表示要關閉。
  inventoryInput(input, inv, player, audio) {
    if (input.consumePressed('Tab') || input.consumePressed('Escape')) return true;

    const cols = 4;
    let moved = false;
    if (input.consumePressed('KeyA') || input.consumePressed('ArrowLeft')) {
      this.cursor = (this.cursor + inv.size - 1) % inv.size;
      moved = true;
    }
    if (input.consumePressed('KeyD') || input.consumePressed('ArrowRight')) {
      this.cursor = (this.cursor + 1) % inv.size;
      moved = true;
    }
    if (input.consumePressed('KeyW') || input.consumePressed('ArrowUp')) {
      this.cursor = (this.cursor + inv.size - cols) % inv.size;
      moved = true;
    }
    if (input.consumePressed('KeyS') || input.consumePressed('ArrowDown')) {
      this.cursor = (this.cursor + cols) % inv.size;
      moved = true;
    }

    if (input.consumePressed('KeyE')) {
      if (inv.useHeal(this.cursor, player)) {
        audio.play('heal');
        this.marked = null;
      }
      moved = true;
    }
    if (input.consumePressed('KeyF')) {
      if (this.marked === null) {
        if (inv.slots[this.cursor]) this.marked = this.cursor;
      } else {
        if (inv.combine(this.marked, this.cursor)) audio.play('pickup');
        this.marked = null;
      }
      moved = true;
    }
    if (input.consumePressed('KeyG')) {
      inv.remove(this.cursor, Infinity);
      this.marked = null;
      moved = true;
    }
    if (moved) this._renderGrid(inv);
    return false;
  }

  _renderGrid(inv) {
    this.gridEl.innerHTML = '';
    for (let i = 0; i < inv.size; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      if (i === this.cursor) cell.classList.add('sel');
      if (i === this.marked) cell.classList.add('marked');
      const s = inv.slots[i];
      if (s) {
        const def = ITEMS[s.id];
        cell.innerHTML = `<span class="inv-name">${def.name}</span>` +
          (s.count > 1 ? `<span class="inv-count">×${s.count}</span>` : '');
      }
      // 觸控/滑鼠點格子＝移動游標（僅 UI 游標，不動遊戲狀態）
      cell.addEventListener('click', () => {
        this.cursor = i;
        this._renderGrid(inv);
      });
      this.gridEl.appendChild(cell);
    }
    const s = inv.slots[this.cursor];
    this.descEl.textContent = s ? (ITEMS[s.id].desc || ITEMS[s.id].name) : '';
  }

  // === 打字機 ===

  openTypewriter(hasSave) {
    this.twInfoEl.textContent = hasSave ? '發現既有的存檔紀錄。' : '尚無存檔紀錄。';
    this.twEl.style.display = 'flex';
  }

  closeTypewriter() {
    this.twEl.style.display = 'none';
  }

  // 回傳 'save' | 'load' | 'close' | null
  typewriterInput(input) {
    if (input.consumePressed('KeyE')) return 'save';
    if (input.consumePressed('KeyR')) return 'load';
    if (input.consumePressed('Tab') || input.consumePressed('Escape')) return 'close';
    return null;
  }

  // === 死亡 ===

  showDeath(hasSave) {
    document.getElementById('death-tip').textContent = hasSave
      ? 'R 讀取存檔．Enter 重新開始'
      : 'Enter 重新開始';
    this.deathEl.style.display = 'flex';
  }

  // 回傳 'load' | 'restart' | null
  deathInput(input) {
    if (input.consumePressed('KeyR')) return 'load';
    if (input.consumePressed('Enter')) return 'restart';
    return null;
  }
}
