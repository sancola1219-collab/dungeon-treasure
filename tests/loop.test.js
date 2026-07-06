import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLoop } from '../js/engine/loop.js';
import { mulberry32 } from '../js/engine/rng.js';

test('固定時步：0.1 秒累積 6 次更新', () => {
  let count = 0;
  const loop = new GameLoop({ update: () => count++ });
  assert.equal(loop.tick(0), 0); // 第一次只建立時間基準
  assert.equal(loop.tick(0.1), 6);
  assert.equal(count, 6);
});

test('固定時步：更新間隔恆為 1/60', () => {
  const dts = [];
  const loop = new GameLoop({ update: (dt) => dts.push(dt) });
  loop.tick(0);
  loop.tick(0.05);
  loop.tick(0.1);
  for (const dt of dts) assert.ok(Math.abs(dt - 1 / 60) < 1e-12);
});

test('大跳幀被 clamp 到 maxFrameTime（0.25s → 15 次）', () => {
  let count = 0;
  const loop = new GameLoop({ update: () => count++ });
  loop.tick(0);
  loop.tick(10); // 掛起 10 秒後回來
  assert.equal(count, 15);
});

test('maxUpdatesPerTick 螺旋死亡保險：超限後清空累積器', () => {
  let count = 0;
  const loop = new GameLoop({ update: () => count++, maxUpdatesPerTick: 5 });
  loop.tick(0);
  assert.equal(loop.tick(0.2), 5);
  assert.equal(loop.accumulator, 0);
});

test('start() 在頁面已隱藏時直接使用 interval 後備而非 rAF', () => {
  const g = globalThis;
  const saved = { doc: g.document, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
  let rafCalls = 0;
  g.document = { hidden: true, addEventListener() {}, removeEventListener() {} };
  g.requestAnimationFrame = () => { rafCalls++; return 1; };
  g.cancelAnimationFrame = () => {};
  try {
    const loop = new GameLoop({ update() {} });
    loop.start();
    assert.equal(rafCalls, 0, '隱藏狀態不應排 rAF');
    assert.ok(loop._interval, '應建立 setInterval 後備');
    loop.stop();
  } finally {
    g.document = saved.doc;
    g.requestAnimationFrame = saved.raf;
    g.cancelAnimationFrame = saved.caf;
  }
});

test('mulberry32：同種子重現、不同種子相異、值域 [0,1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(7);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});
