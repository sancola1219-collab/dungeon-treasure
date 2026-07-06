// 固定時步遊戲迴圈：邏輯永遠以 1/hz 秒為單位前進，與渲染（rAF）解耦。
// 分頁隱藏時 rAF 會停擺，改由 setInterval 驅動 tick；受瀏覽器節流與
// maxFrameTime 限制，隱藏期間遊戲時間會慢於牆鐘（上層可選擇自動暫停）。
export class GameLoop {
  constructor({ update, render = null, hz = 60, maxFrameTime = 0.25, maxUpdatesPerTick = 240 }) {
    this.update = update;
    this.render = render;
    this.step = 1 / hz;
    this.maxFrameTime = maxFrameTime;
    this.maxUpdatesPerTick = maxUpdatesPerTick;
    this.accumulator = 0;
    this.lastTime = null;
    this.running = false;
    this._raf = 0;
    this._interval = 0;
    this._onVis = null;
  }

  // now 以秒為單位。回傳本次執行的 update 次數（供測試與診斷）。
  tick(now) {
    if (this.lastTime === null) {
      this.lastTime = now;
      return 0;
    }
    let frame = now - this.lastTime;
    this.lastTime = now;
    if (frame < 0) frame = 0;
    if (frame > this.maxFrameTime) frame = this.maxFrameTime;
    this.accumulator += frame;
    let updates = 0;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
      if (++updates >= this.maxUpdatesPerTick) {
        this.accumulator = 0;
        break;
      }
    }
    return updates;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const rafStep = (ms) => {
      if (!this.running) return;
      this.tick(ms / 1000);
      if (this.render) this.render();
      this._raf = requestAnimationFrame(rafStep);
    };
    // 每次切換驅動器前先取消兩種舊排程，避免重複 rAF 鏈；
    // 啟動當下就依 document.hidden 選擇（頁面可能一載入就是隱藏狀態）
    const startDriver = () => {
      cancelAnimationFrame(this._raf);
      clearInterval(this._interval);
      if (document.hidden) {
        this._interval = setInterval(() => {
          // 自我修復：若視窗其實已可見（某些瀏覽器漏發 visibilitychange），
          // 立刻切回 rAF，避免以 interval 節流頻率驅動造成畫面抖動
          if (!document.hidden) {
            startDriver();
            return;
          }
          this.tick(performance.now() / 1000);
        }, 50);
      } else {
        this._raf = requestAnimationFrame(rafStep);
      }
    };
    startDriver();
    this._onVis = () => {
      if (!this.running) return;
      startDriver();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    clearInterval(this._interval);
    if (this._onVis) {
      document.removeEventListener('visibilitychange', this._onVis);
      this._onVis = null;
    }
    this.lastTime = null;
    this.accumulator = 0;
  }
}
