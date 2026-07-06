// WebAudio 合成音效：零外部音檔。AudioContext 需使用者手勢後建立（unlock）。
// ctx 尚未建立時所有播放都安靜跳過。心跳由 tier 驅動（fine 無、caution 慢、danger 快）。
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._noise = null;
    this._hbTier = 'fine';
    this._hbTimer = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startAmbient();
      this._startMusic();
      this._hbInterval = setInterval(() => this._heartbeatPump(), 120);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // === 恐怖配樂（程序生成，零外部音檔） ===
  // 三層：低音 drone（常駐）＋不和諧敲擊（隨機）＋高頻幽鳴（漂移）。
  // intensity 0=探索 →1=戰鬥（drone 變厚、敲擊變密、加入低音脈衝）。
  setMusicIntensity(v) {
    this._musicIntensity = Math.max(0, Math.min(1, v));
    if (this._droneGain && this.ctx) {
      const t = this.ctx.currentTime;
      this._droneGain.gain.linearRampToValueAtTime(0.05 + this._musicIntensity * 0.05, t + 1.2);
      this._pulseGain.gain.linearRampToValueAtTime(this._musicIntensity * 0.14, t + 0.8);
    }
  }

  _startMusic() {
    this._musicIntensity = 0;
    const t = this.ctx.currentTime;
    // 層 1：雙鋸齒微失諧 drone（不和諧小二度），慢速濾波起伏
    this._droneGain = this.ctx.createGain();
    this._droneGain.gain.value = 0.05;
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 160;
    const fLfo = this.ctx.createOscillator();
    fLfo.frequency.value = 0.045;
    const fLfoG = this.ctx.createGain();
    fLfoG.gain.value = 70;
    fLfo.connect(fLfoG);
    fLfoG.connect(droneFilter.frequency);
    for (const freq of [55, 58.3]) { // A1 與升半音的摩擦
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.connect(droneFilter);
      o.start(t);
    }
    droneFilter.connect(this._droneGain);
    this._droneGain.connect(this.master);
    fLfo.start(t);

    // 層 2：戰鬥低音脈衝（平時 0）
    this._pulseGain = this.ctx.createGain();
    this._pulseGain.gain.value = 0;
    const pulseOsc = this.ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 42;
    const pulseTrem = this.ctx.createGain();
    const pulseLfo = this.ctx.createOscillator();
    pulseLfo.type = 'square';
    pulseLfo.frequency.value = 2.2;
    const pulseLfoG = this.ctx.createGain();
    pulseLfoG.gain.value = 1;
    pulseLfo.connect(pulseLfoG);
    pulseLfoG.connect(pulseTrem.gain);
    pulseOsc.connect(pulseTrem);
    pulseTrem.connect(this._pulseGain);
    this._pulseGain.connect(this.master);
    pulseOsc.start(t);
    pulseLfo.start(t);

    // 層 3：隨機不和諧敲擊與幽鳴（setInterval 排程，隱藏分頁節流無妨——遊戲會暫停）
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const roll = Math.random();
      const dense = this._musicIntensity > 0.5;
      if (roll < (dense ? 0.55 : 0.3)) {
        // 小二度音對敲擊（鋼琴弦悶擊感）
        const base = [110, 147, 196][Math.floor(Math.random() * 3)];
        this._tone({ type: 'triangle', from: base, vol: 0.05, dur: 1.6 });
        this._tone({ type: 'triangle', from: base * 1.06, vol: 0.04, dur: 1.8, when: 0.04 });
      } else if (roll < 0.45) {
        // 高頻幽鳴滑音
        this._tone({ type: 'sine', from: 1450 + Math.random() * 600, to: 1200, vol: 0.016, dur: 3.5 });
      } else if (roll < 0.55) {
        // 遠處低沉悶響
        this._burst({ freq: 120, vol: 0.12, dur: 0.9 });
      }
    }, 4200);
  }

  play(name) {
    if (!this.ctx) return;
    const fn = this['_' + name];
    if (fn) fn.call(this);
  }

  gunshot(weapon) {
    if (!this.ctx) return;
    if (weapon === 'shotgun') this._shotgunShot();
    else if (weapon === 'magnum') this._bigShot();
    else if (weapon === 'smg') this._smgShot();
    else this._handgunShot();
  }

  setHeartbeat(tier) {
    this._hbTier = tier;
  }

  _heartbeatPump() {
    if (!this.ctx || this._hbTier === 'fine') return;
    const period = this._hbTier === 'danger' ? 0.62 : 1.05;
    const now = this.ctx.currentTime;
    if (this._hbTimer > now - 0.01) return;
    this._hbTimer = now + period;
    this._thump(now, 0.5);
    this._thump(now + 0.16, 0.32);
  }

  _thump(t, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  _noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  // 噪音脈衝工具：filterType/freq、增益、時長
  _burst({ type = 'lowpass', freq = 400, vol = 0.3, dur = 0.12, when = 0 }) {
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.6, dur + 0.05);
  }

  _tone({ type = 'sine', from = 440, to = null, vol = 0.1, dur = 0.15, when = 0 }) {
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _step() {
    this._burst({ freq: 320, vol: 0.32, dur: 0.11 });
  }

  _door() {
    this._tone({ type: 'sawtooth', from: 180, to: 70, vol: 0.06, dur: 0.5 });
    this._burst({ freq: 140, vol: 0.5, dur: 0.28 });
  }

  _locked() {
    this._tone({ type: 'square', from: 900, vol: 0.08, dur: 0.05 });
    this._tone({ type: 'square', from: 1400, vol: 0.08, dur: 0.05, when: 0.13 });
  }

  _handgunShot() {
    this._burst({ type: 'highpass', freq: 900, vol: 0.55, dur: 0.07 });
    this._burst({ freq: 220, vol: 0.6, dur: 0.12 });
  }

  _shotgunShot() {
    this._burst({ type: 'highpass', freq: 600, vol: 0.6, dur: 0.1 });
    this._burst({ freq: 130, vol: 0.9, dur: 0.28 });
    this._tone({ type: 'sine', from: 70, to: 40, vol: 0.3, dur: 0.25 });
  }

  _bigShot() {
    this._burst({ type: 'highpass', freq: 700, vol: 0.6, dur: 0.09 });
    this._burst({ freq: 160, vol: 0.85, dur: 0.2 });
  }

  _dry() {
    this._tone({ type: 'square', from: 1100, vol: 0.06, dur: 0.035 });
  }

  _reload() {
    this._tone({ type: 'square', from: 700, vol: 0.07, dur: 0.04 });
    this._burst({ freq: 800, type: 'bandpass', vol: 0.2, dur: 0.06, when: 0.12 });
    this._tone({ type: 'square', from: 500, vol: 0.08, dur: 0.05, when: 0.24 });
  }

  _knife() {
    this._burst({ type: 'bandpass', freq: 2400, vol: 0.15, dur: 0.08 });
  }

  _katana() {
    // 破空聲：帶通噪音由高掃低＋薄金屬鳴
    this._burst({ type: 'bandpass', freq: 3200, vol: 0.22, dur: 0.14 });
    this._burst({ type: 'bandpass', freq: 1600, vol: 0.14, dur: 0.1, when: 0.05 });
    this._tone({ type: 'sine', from: 2200, to: 900, vol: 0.03, dur: 0.16 });
  }

  _smgShot() {
    this._burst({ type: 'highpass', freq: 1100, vol: 0.4, dur: 0.05 });
    this._burst({ freq: 260, vol: 0.35, dur: 0.07 });
  }

  _flame() {
    this._burst({ type: 'lowpass', freq: 1100, vol: 0.5, dur: 0.16 });
    this._burst({ type: 'bandpass', freq: 2400, vol: 0.16, dur: 0.12 });
    // 劈啪爆裂
    this._burst({ type: 'highpass', freq: 4200, vol: 0.08, dur: 0.03, when: Math.random() * 0.06 });
  }

  _rocketLaunch() {
    this._burst({ type: 'lowpass', freq: 500, vol: 1.1, dur: 0.45 });
    this._burst({ type: 'bandpass', freq: 1500, vol: 0.35, dur: 0.2 });
    this._tone({ type: 'sawtooth', from: 240, to: 55, vol: 0.22, dur: 0.5 });
  }

  _explosion() {
    this._burst({ freq: 90, vol: 1.4, dur: 0.9 });
    this._burst({ type: 'bandpass', freq: 700, vol: 0.7, dur: 0.35 });
    this._tone({ type: 'sine', from: 75, to: 28, vol: 0.7, dur: 0.9 });
    this._burst({ freq: 60, vol: 0.5, dur: 1.2, when: 0.15 }); // 餘震隆隆
  }

  _doggrowl() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.linearRampToValueAtTime(48, t + 0.5);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 240;
    const trem = this.ctx.createGain(); // 喉音顫動
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 26;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.4;
    lfo.connect(lfoG);
    lfoG.connect(trem.gain);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(f);
    f.connect(trem);
    trem.connect(g);
    g.connect(this.master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.7);
    lfo.stop(t + 0.7);
  }

  _groan() {
    const t = this.ctx.currentTime;
    for (const detune of [0, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(85 + detune, t);
      osc.frequency.linearRampToValueAtTime(65 + detune, t + 0.9);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
      osc.connect(f);
      f.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 1.1);
    }
  }

  _dogbark() {
    this._tone({ type: 'square', from: 320, to: 150, vol: 0.12, dur: 0.09 });
    this._burst({ type: 'bandpass', freq: 900, vol: 0.25, dur: 0.08 });
  }

  _bite() {
    this._burst({ type: 'bandpass', freq: 500, vol: 0.5, dur: 0.1 });
    this._burst({ freq: 200, vol: 0.4, dur: 0.14, when: 0.05 });
  }

  _hurt() {
    this._tone({ type: 'sine', from: 220, to: 90, vol: 0.2, dur: 0.18 });
    this._burst({ freq: 300, vol: 0.3, dur: 0.1 });
  }

  _pickup() {
    this._tone({ type: 'triangle', from: 520, vol: 0.08, dur: 0.07 });
    this._tone({ type: 'triangle', from: 780, vol: 0.08, dur: 0.09, when: 0.08 });
  }

  _heal() {
    this._tone({ type: 'sine', from: 400, to: 800, vol: 0.08, dur: 0.4 });
  }

  _typewriter() {
    for (let i = 0; i < 3; i++) {
      this._tone({ type: 'square', from: 1600 + i * 120, vol: 0.05, dur: 0.03, when: i * 0.09 });
    }
    this._tone({ type: 'triangle', from: 1180, vol: 0.09, dur: 0.5, when: 0.34 });
  }

  _startAmbient() {
    const src = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998;
      data[i] = last * 3.5;
    }
    src.buffer = buf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.16;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
  }
}
