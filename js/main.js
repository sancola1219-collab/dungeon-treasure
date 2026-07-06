// 進入點：組裝引擎與遊戲。階段二：戰鬥示範場。
import { GameLoop } from './engine/loop.js';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { AudioEngine } from './engine/audio.js';
import { SaveStore } from './engine/save.js';
import { loadExternalModels } from './engine/models.js';
import { mulberry32 } from './engine/rng.js';
import { World } from './game/world.js';
import { Player } from './game/player.js';
import { Inventory, ITEMS } from './game/items.js';
import { Arsenal, WEAPONS } from './game/weapons.js';
import { Projectiles } from './game/projectiles.js';
import { castShot, jitterDir } from './game/combat.js';
import { Zombie } from './game/enemies/zombie.js';
import { Dog } from './game/enemies/dog.js';
import { Hunter } from './game/enemies/hunter.js';
import { Lurker } from './game/enemies/lurker.js';
import { Spider } from './game/enemies/spider.js';
import { Creeper } from './game/enemies/creeper.js';
import { Bloater } from './game/enemies/bloater.js';
import { Prime } from './game/enemies/prime.js';
import { separateEnemies } from './game/enemies/base.js';

const ENEMY_TYPES = { zombie: Zombie, dog: Dog, hunter: Hunter, lurker: Lurker, spider: Spider, creeper: Creeper, bloater: Bloater, prime: Prime };
import { buildSave, applySave, computeRank } from './game/gamestate.js';
import { DUNGEON1 } from './levels/dungeon1.js';
import { DUNGEON2 } from './levels/dungeon2.js';

const CHAPTERS = { dungeon1: DUNGEON1, dungeon2: DUNGEON2 };
const PROGRESS_KEY = 'zombie-world-progress';
import { HUD } from './ui/hud.js';
import { Overlays } from './ui/overlays.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'zombie-world-save';
const WEAPON_SLOTS = ['knife', 'katana', 'handgun', 'shotgun', 'magnum', 'smg', 'flamethrower', 'rocket'];
const DIFFICULTY = {
  easy: { name: '輕鬆', dmg: 0.6, hp: 0.8, ammo: 1.5 },
  standard: { name: '標準', dmg: 1.0, hp: 1.0, ammo: 1.0 },
  hard: { name: '艱難', dmg: 1.4, hp: 1.2, ammo: 0.7 },
};
let LEVEL = DUNGEON1; // boot 內依進度切換章節

function boot() {
  const container = $('app');

  let renderer;
  try {
    renderer = new Renderer(container);
  } catch {
    $('loading').style.display = 'none';
    $('error').style.display = 'flex';
    return;
  }

  let saves;
  try {
    saves = new SaveStore(window.localStorage);
  } catch {
    saves = new SaveStore(null);
  }
  // 章節進度：{ chapter, difficulty, auto }（auto='story' 表示章末銜接直接播開場）
  const progress = saves.load(PROGRESS_KEY) || {};
  if (progress.chapter && CHAPTERS[progress.chapter]) LEVEL = CHAPTERS[progress.chapter];

  const world = new World(LEVEL);
  const player = new Player(LEVEL.spawn);
  const input = new Input();
  const audio = new AudioEngine();
  const hud = new HUD();
  const overlays = new Overlays();

  let inventory = new Inventory();
  let arsenal = new Arsenal();
  for (const w of LEVEL.start.weapons) arsenal.give(w.id, w.rounds);
  if (LEVEL.start.weapons.length) arsenal.select(LEVEL.start.weapons[0].id);

  // === 實體 ===
  const pickups = new Map(); // id → {item, count, x, z}
  let takenPickups = new Set();
  const enemies = LEVEL.entities.enemies.map(
    (d) => new (ENEMY_TYPES[d.type] || Zombie)({ id: d.id, x: d.x, z: d.z })
  );
  const applyDifficultyHp = () => {
    for (const e of enemies) {
      if (!e._baseHp) e._baseHp = e.hp;
      if (!e.dead) e.hp = Math.round(e._baseHp * diff().hp);
    }
  }; // 初始呼叫在狀態區宣告之後（避免 TDZ）

  renderer.buildLevel(world);
  for (const e of enemies) renderer.addEnemy(e.id, e.type);
  for (const p of LEVEL.entities.pickups) {
    pickups.set(p.id, { item: p.item, count: p.count, x: p.x, z: p.z });
    renderer.addPickup(p.id, ITEMS[p.item].type);
    renderer.placePickup(p.id, p.x, p.z);
  }
  for (const t of LEVEL.entities.typewriters) renderer.addTypewriter(t.x, t.z);
  for (const n of LEVEL.npcs || []) renderer.addNpc(n.x, n.z, n.yaw || 0);
  for (const d of LEVEL.documents || []) {
    renderer.addPickup('doc:' + d.id, 'doc');
    renderer.placePickup('doc:' + d.id, d.x, d.z);
  }
  renderer.setWeaponView(arsenal.current);
  // 外部 .glb 模型（assets/models/ 有檔才替換；非同步，不擋啟動）
  loadExternalModels().then((m) => {
    if (m) renderer.setExternalModels(m);
  }).catch(() => {});

  const canvas = renderer.renderer.domElement;
  input.attach(canvas);
  canvas.addEventListener('click', () => audio.unlock());

  // === 觸控裝置：顯示虛擬搖桿與按鈕，全部合成既有輸入 ===
  // 偵測放寬：部分手機瀏覽器/WebView 的 hover/pointer 媒體查詢會誤報，
  // 補上「有觸控點＋螢幕短邊 ≤900」的後備條件（觸控筆電因短邊>900不會誤中）
  const isTouchOnly = !!(
    (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
    (navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) <= 900)
  );
  if (isTouchOnly) {
    document.body.classList.add('touch');
    $('touch-ui').style.display = 'block';
    input.enableDragMode(); // 不請求 pointer lock、失鎖不觸發暫停
    input.attachTouch({
      stick: $('stick'),
      knob: $('stick-knob'),
      lookZone: $('look-zone'),
      buttons: document.querySelectorAll('#touch-ui .tbtn'),
    });
    document.addEventListener('touchstart', () => audio.unlock(), { once: true });
  }
  // 覆蓋層的觸控按鈕：合成按鍵事件，走與鍵盤完全相同的路徑
  for (const btn of document.querySelectorAll('.synth-btn')) {
    btn.addEventListener('click', () => {
      input.onKeyDown(btn.dataset.code);
      input.onKeyUp(btn.dataset.code);
    });
  }

  // === 後處理：顆粒層（JS 生成噪點圖）與選單背景（有 menu-bg.jpg 就用） ===
  {
    const nc = document.createElement('canvas');
    nc.width = nc.height = 128;
    const ng = nc.getContext('2d');
    const img = ng.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(Math.random() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ng.putImageData(img, 0, 0);
    $('grain').style.backgroundImage = `url(${nc.toDataURL()})`;

    const bg = new Image();
    bg.onload = () => {
      for (const id of ['loading', 'pause']) {
        $(id).style.backgroundImage =
          'linear-gradient(rgba(3,4,7,0.72), rgba(3,4,7,0.88)), url(assets/textures/menu-bg.jpg)';
        $(id).style.backgroundSize = 'cover';
        $(id).style.backgroundPosition = 'center';
      }
    };
    bg.src = 'assets/textures/menu-bg.jpg'; // 缺檔靜默跳過
  }

  // === 狀態 ===
  let mode = 'title'; // title | difficulty | story | help | play | paused | inventory | typewriter | map | dead
  let storyPage = 0;
  let storyChars = 0; // 逐字顯示進度（邏輯時步驅動，非牆鐘）
  let gameTime = 0;
  let stepDistance = 0;
  let activeRoom = null;
  let activeRoomIds = [];
  let lastHint = null;
  let everLocked = false;
  let hintOverride = null; // {text, t}
  let difficulty = 'standard';
  let bossDone = false;
  let countdownLeft = -1; // >0 表示自毀倒數進行中（邏輯時鐘）
  const npcTalked = new Set(); // 已完成首次對話的 NPC
  const firedTriggers = new Set(); // 已觸發的房間事件
  const docsRead = new Set(); // 已閱讀文件（計入評價）
  let readingDoc = null;
  let dialogNpc = null;
  let dialogPage = 0;
  const projectiles = new Projectiles();
  const burning = new Map(); // enemy → {left, next}（火焰 DoT）
  const visited = new Set(); // 已探索房間（小地圖）
  let mapDrawTick = 0;
  let growlCooldown = 0;
  let musicOn = false;
  const rngFire = mulberry32(1234);
  const rngAI = mulberry32(5678);

  const diff = () => DIFFICULTY[difficulty];

  function hint(text) {
    if (text === lastHint) return;
    lastHint = text;
    $('hint').textContent = text;
  }

  function hintFlash(text, seconds = 1.4) {
    hintOverride = { text, t: seconds };
  }

  function setMode(m) {
    mode = m;
    $('title').style.display = m === 'title' ? 'flex' : 'none';
    $('difficulty').style.display = m === 'difficulty' ? 'flex' : 'none';
    $('story').style.display = m === 'story' ? 'flex' : 'none';
    $('help').style.display = m === 'help' ? 'flex' : 'none';
    $('pause').style.display = m === 'paused' ? 'flex' : 'none';
    // 觸控層（含覆蓋全螢幕的視角滑動區）只在「遊戲進行中」顯示，
    // 否則會攔截章末/暫停/選單畫面上的按鈕點擊（手機卡住的主因）
    const tui = $('touch-ui');
    if (tui && isTouchOnly) tui.style.display = m === 'play' ? 'block' : 'none';
    if (m === 'paused') {
      $('pause-tip').textContent = isTouchOnly
        ? '左下搖桿移動（推滿奔跑）．滑動畫面轉視角．右下按鈕互動'
        : (input.dragMode ? '按住滑鼠拖曳調整視角' : '點擊畫面鎖定視角') +
          '．WASD 移動．Shift 奔跑．E 互動．Esc 暫停';
    }
  }

  // === 標題/難度/劇情選單接線 ===
  const STORY = { title: LEVEL.name, pages: LEVEL.story || [] };

  function startStory() {
    storyPage = 0;
    storyChars = 0;
    $('story-title').textContent = STORY.title;
    $('story-text').textContent = '';
    setMode('story');
  }

  function advanceStory() {
    const page = STORY.pages[storyPage];
    if (storyChars < page.length) {
      storyChars = page.length; // 第一下：整頁顯示
      return;
    }
    storyPage += 1;
    storyChars = 0;
    if (storyPage >= STORY.pages.length) beginPlay();
  }

  function beginPlay() {
    setMode('play');
    if (isTouchOnly) {
      // 二次保險：確保觸控介面在入局時一定可見
      document.body.classList.add('touch');
      $('touch-ui').style.display = 'block';
    }
    hintFlash((isTouchOnly ? '點右下「物品」鈕用道具．' : '按 Tab 開物品欄用道具．') + (LEVEL.objective || '活下去'), 6);
    if (!input.dragMode && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  }

  $('btn-start').addEventListener('click', () => {
    audio.unlock();
    setMode('difficulty');
  });
  $('btn-continue').addEventListener('click', () => {
    audio.unlock();
    if (doLoad()) beginPlay();
    else $('title-tip').textContent = '沒有存檔紀錄';
  });
  $('btn-help').addEventListener('click', () => setMode('help'));
  $('btn-help-back').addEventListener('click', () => setMode('title'));
  for (const b of document.querySelectorAll('.btn-diff')) {
    b.addEventListener('click', () => {
      difficulty = b.dataset.diff;
      applyDifficultyHp();
      startStory();
    });
  }
  $('story').addEventListener('click', () => {
    if (mode === 'story') advanceStory();
  });
  $('dialog').addEventListener('click', () => {
    if (mode === 'dialog') advanceDialog();
  });
  $('docread').addEventListener('click', () => {
    if (mode === 'read') closeDocument();
  });
  $('btn-chapend').addEventListener('click', () => {
    saves.remove(PROGRESS_KEY);
    window.location.reload();
  });
  $('btn-nextchap').addEventListener('click', gotoNextChapter);

  $('resume').addEventListener('click', () => {
    setMode('play');
    audio.unlock();
    if (!input.dragMode && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      everLocked = true;
    } else if (!input.dragMode && mode === 'play') {
      setMode('paused');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'play') setMode('paused');
  });

  function idleHint() {
    if (isTouchOnly) return '';
    if (everLocked) return '';
    if (input.dragMode) return '按住滑鼠拖曳調整視角．WASD 移動．E 互動';
    return '點擊畫面鎖定視角．WASD 移動．E 互動';
  }

  // === 房間可視性 ===

  function updateActiveRooms(force = false) {
    const roomId = world.roomAt(player.x, player.z) ?? activeRoom;
    if (roomId === null || (roomId === activeRoom && !force)) return;
    activeRoom = roomId;
    visited.add(roomId);
    // 房間事件觸發器（一次性）：提示、音效、驚醒房內敵人
    for (const trg of LEVEL.triggers || []) {
      if (trg.room !== roomId || firedTriggers.has(trg.id)) continue;
      firedTriggers.add(trg.id);
      hintFlash(trg.text, 3.6);
      if (trg.sound) audio.play(trg.sound);
      if (trg.shake) renderer.shake(trg.shake);
      if (trg.alert) {
        for (const e of enemies) {
          if (!e.dead && world.roomAt(e.x, e.z) === roomId) e.alert();
        }
      }
    }
    activeRoomIds = [roomId];
    for (const d of world.doorsOfRoom(roomId)) {
      const other = d.from === roomId ? d.to : d.from;
      if (other) activeRoomIds.push(other);
    }
    renderer.setActiveRooms(activeRoomIds);
    for (const [id, p] of pickups) {
      renderer.setPickupVisible(id, !takenPickups.has(id) && activeRoomIds.includes(world.roomAt(p.x, p.z)));
    }
  }

  // === 互動目標 ===

  function nearestDoor() {
    const roomId = world.roomAt(player.x, player.z);
    if (!roomId) return null;
    let best = null;
    let bestDist = 1.6;
    for (const d of world.doorsOfRoom(roomId)) {
      const dist = Math.hypot(d.at[0] - player.x, d.at[1] - player.z);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }

  function nearestPickup() {
    let best = null;
    let bestDist = 1.1;
    for (const [id, p] of pickups) {
      if (takenPickups.has(id)) continue;
      const dist = Math.hypot(p.x - player.x, p.z - player.z);
      if (dist < bestDist) {
        best = { id, def: p };
        bestDist = dist;
      }
    }
    return best;
  }

  function nearestDocument() {
    for (const d of LEVEL.documents || []) {
      if (Math.hypot(d.x - player.x, d.z - player.z) < 1.1) return d;
    }
    return null;
  }

  function openDocument(doc) {
    readingDoc = doc;
    $('doc-title').textContent = doc.title;
    $('doc-text').textContent = doc.text;
    $('docread').style.display = 'flex';
    setMode('read');
    if (!docsRead.has(doc.id)) {
      docsRead.add(doc.id);
      if (doc.grantsKey && !inventory.keyItems.includes(doc.grantsKey)) {
        inventory.keyItems.push(doc.grantsKey);
        hintFlash('記下了大門備援密碼：0746', 3.5);
      }
      audio.play('pickup');
    }
  }

  function closeDocument() {
    $('docread').style.display = 'none';
    readingDoc = null;
    setMode('play');
  }

  function nearestNpc() {
    for (const n of LEVEL.npcs || []) {
      if (Math.hypot(n.x - player.x, n.z - player.z) < 1.5) return n;
    }
    return null;
  }

  function openDialog(npc) {
    dialogNpc = npc;
    dialogPage = 0;
    $('dialog-name').textContent = npc.name;
    $('dialog-text').textContent = npcTalked.has(npc.id) ? npc.dialogAfter : npc.dialog[0];
    $('dialog').style.display = 'block';
    setMode('dialog');
  }

  function advanceDialog() {
    if (npcTalked.has(dialogNpc.id)) return closeDialog();
    dialogPage += 1;
    if (dialogPage < dialogNpc.dialog.length) {
      $('dialog-text').textContent = dialogNpc.dialog[dialogPage];
      return;
    }
    // 首次對話結束：贈禮
    npcTalked.add(dialogNpc.id);
    for (const g of dialogNpc.gift || []) {
      inventory.add(g.item, g.count);
      hintFlash(`取得 ${ITEMS[g.item].name}${g.count > 1 ? ' ×' + g.count : ''}`, 2.2);
    }
    audio.play('pickup');
    hud.setAmmo(arsenal, inventory);
    closeDialog();
  }

  function closeDialog() {
    $('dialog').style.display = 'none';
    dialogNpc = null;
    setMode('play');
  }

  function chapterEnd() {
    setMode('end');
    const m = Math.floor(gameTime / 60);
    const s = Math.floor(gameTime % 60);
    const ts = treasureStats();
    const rank = computeRank(gameTime, ts.got, ts.total, difficulty);
    $('chapend-title').textContent = `${LEVEL.name.split('：')[0]}　完`;
    $('chapend-rank').textContent = rank;
    $('chapend-stats').textContent =
      `存活時間 ${m} 分 ${String(s).padStart(2, '0')} 秒．寶藏 ${ts.got}/${ts.total}（價值 ${ts.val}）．難度 ${DIFFICULTY[difficulty].name}`;
    const hasNext = LEVEL.next && CHAPTERS[LEVEL.next];
    $('btn-nextchap').style.display = hasNext ? '' : 'none';
    if (!hasNext) {
      $('chapend-title').textContent = '全章節　完';
      saves.remove(PROGRESS_KEY); // 通關後回到乾淨狀態
    }
    $('chapend-note').textContent = LEVEL.endingText || '';
    $('countdown').style.display = 'none';
    $('chapend').style.display = 'flex';
    audio.setMusicIntensity(0);
  }

  function gotoNextChapter() {
    saves.remove(SAVE_KEY); // 新章節重新開始（進度另存）
    saves.save(PROGRESS_KEY, { chapter: LEVEL.next, difficulty, auto: 'story' });
    window.location.reload();
  }

  function nearestTypewriter() {
    for (const t of LEVEL.entities.typewriters) {
      if (Math.hypot(t.x - player.x, t.z - player.z) < 1.25) return t;
    }
    return null;
  }

  // === 戰鬥 ===

  function camDir() {
    const cp = Math.cos(player.pitch);
    return { x: -Math.sin(player.yaw) * cp, y: Math.sin(player.pitch), z: -Math.cos(player.yaw) * cp };
  }

  function shotWallSegments() {
    const roomId = world.roomAt(player.x, player.z);
    if (!roomId) return [];
    let segs = world.collisionSegments(roomId);
    for (const d of world.doorsOfRoom(roomId)) {
      if (!d.open) continue;
      const other = d.from === roomId ? d.to : d.from;
      if (other) segs = segs.concat(world.collisionSegments(other));
    }
    return segs;
  }

  function alertNearbyEnemies() {
    const roomId = world.roomAt(player.x, player.z);
    if (!roomId) return;
    const rooms = new Set([roomId]);
    for (const d of world.doorsOfRoom(roomId)) {
      const other = d.from === roomId ? d.to : d.from;
      if (other) rooms.add(other);
    }
    for (const e of enemies) {
      if (!e.dead && rooms.has(world.roomAt(e.x, e.z))) e.alert();
    }
  }

  function tryFire() {
    const shot = arsenal.fire(gameTime);
    if (!shot) return;
    if (shot.empty) {
      audio.play('dry');
      hintFlash('沒有子彈了——按 R 裝填');
      return;
    }
    const origin = { x: player.x, y: player.eyeHeight, z: player.z };
    const baseDir = camDir();
    const segs = shotWallSegments();

    if (shot.melee) {
      // 武士刀：三向扇形掃擊（可同時命中多個敵人）；小刀：單向
      if (shot.sweep > 1) {
        audio.play('katana');
        renderer.swingViewmodel();
        const hitEnemies = new Set();
        for (const off of [-0.35, 0, 0.35]) {
          const cy = Math.cos(player.pitch);
          const dir = {
            x: -Math.sin(player.yaw + off) * cy,
            y: Math.sin(player.pitch),
            z: -Math.cos(player.yaw + off) * cy,
          };
          const hit = castShot({ origin, dir, enemies, wallSegments: segs, maxRange: shot.range });
          if (hit && !hitEnemies.has(hit.enemy)) {
            hitEnemies.add(hit.enemy);
            applyHit(hit, dir, shot.damage);
          }
        }
      } else {
        audio.play('knife');
        renderer.kickViewmodel(0.03);
        const hit = castShot({ origin, dir: baseDir, enemies, wallSegments: segs, maxRange: shot.range });
        if (hit) applyHit(hit, baseDir, shot.damage);
      }
      return;
    }

    if (shot.spray) {
      // 火焰噴射：錐形範圍傷害＋點燃 DoT
      audio.play('flame');
      renderer.flameJet();
      alertNearbyEnemies();
      const cosArc = Math.cos(shot.arc);
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - player.x;
        const dz = e.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > shot.range || d < 1e-6) continue;
        const dot = (dx / d) * baseDir.x + (dz / d) * baseDir.z;
        if (dot < cosArc) continue;
        e.hurt(shot.damage, 'body');
        burning.set(e, { left: 2, next: 0.5 });
        hud.hitmark();
      }
      hud.setAmmo(arsenal, inventory);
      return;
    }

    if (shot.projectile) {
      audio.play('rocketLaunch');
      renderer.kickViewmodel(0.13);
      alertNearbyEnemies();
      projectiles.spawn({
        x: player.x + baseDir.x * 0.6,
        y: player.eyeHeight - 0.1,
        z: player.z + baseDir.z * 0.6,
        dirX: baseDir.x,
        dirY: baseDir.y,
        dirZ: baseDir.z,
        speed: shot.speed,
        damage: shot.damage,
        radius: shot.radius,
      });
      hud.setAmmo(arsenal, inventory);
      return;
    }

    audio.gunshot(shot.weapon);
    renderer.muzzleFlash();
    renderer.kickViewmodel(shot.weapon === 'shotgun' ? 0.1 : shot.weapon === 'smg' ? 0.035 : 0.06);
    alertNearbyEnemies();
    for (let i = 0; i < shot.pellets; i++) {
      const dir = jitterDir(baseDir, shot.spread, rngFire);
      const hit = castShot({ origin, dir, enemies, wallSegments: segs });
      if (hit) applyHit(hit, dir, shot.damage);
    }
    hud.setAmmo(arsenal, inventory);
  }

  function applyHit(hit, dir, damage) {
    hit.enemy.hurt(damage, hit.zone);
    hud.hitmark();
    renderer.bloodBurst(
      player.x + dir.x * hit.dist,
      player.eyeHeight + dir.y * hit.dist,
      player.z + dir.z * hit.dist
    );
  }

  const enemyCtx = {
    player,
    world,
    rng: rngAI,
    get gameTime() {
      return gameTime;
    },
    attackPlayer(dmg) {
      if (player.hurt(Math.round(dmg * diff().dmg))) {
        hud.damageFlash();
        renderer.shake(0.1);
        audio.play('hurt');
        if (player.hp <= 0) die();
      }
    },
    sound(name) {
      audio.play(name);
    },
    poison(seconds) {
      const was = player.poison > 0;
      player.poison = Math.max(player.poison, seconds);
      if (!was) hintFlash('中毒了——找藍色草藥解毒', 3.2);
    },
    boom(x, y, z) {
      renderer.explosion(x, y, z);
      audio.play('explosion');
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - x, e.z - z) < 2.5) e.hurt(60, 'body');
      }
    },
  };

  function die() {
    setMode('dead');
    overlays.showDeath(saves.load(SAVE_KEY) !== null);
  }

  // === 寶藏統計（type:'treasure' 不佔格，由 takenPickups 計） ===
  function treasureStats() {
    let val = 0, got = 0, total = 0;
    for (const p of LEVEL.entities.pickups) {
      const d = ITEMS[p.item];
      if (!d || d.type !== 'treasure') continue;
      total += 1;
      if (takenPickups.has(p.id)) { got += 1; val += (d.value || 1) * (p.count || 1); }
    }
    return { got, total, val };
  }
  function updateTreasureHud() {
    const s = treasureStats();
    $('treasure').textContent = s.total ? `寶藏 ${s.got}/${s.total}　價值 ${s.val}` : '';
  }

  // === 拾取 ===

  function tryPickup(p) {
    const def = ITEMS[p.def.item];
    if (def.type === 'weapon') {
      arsenal.give(def.weapon, def.rounds || 0);
      arsenal.select(def.weapon);
      renderer.setWeaponView(def.weapon);
    } else if (def.type === 'treasure') {
      // 寶藏不佔格；統計見 treasureStats()
    } else if (def.type === 'key') {
      inventory.keyItems.push(p.def.item); // 關鍵道具不佔格
    } else {
      // 難度影響彈藥拾取量
      const def0 = ITEMS[p.def.item];
      const count = def0.type === 'ammo' ? Math.max(1, Math.round(p.def.count * diff().ammo)) : p.def.count;
      const r = inventory.add(p.def.item, count);
      if (r.leftover > 0) {
        // 全有或全無：部分拾取會讓存檔狀態變複雜
        inventory.takeAmmo(p.def.item, r.added); // 還原
        hintFlash('物品欄已滿');
        audio.play('locked');
        return;
      }
    }
    takenPickups.add(p.id);
    renderer.removePickup(p.id);
    audio.play('pickup');
    hintFlash(`取得 ${def.name}${p.def.count > 1 ? ' ×' + p.def.count : ''}`);
    hud.setAmmo(arsenal, inventory);
    updateTreasureHud();
  }

  // === 存讀檔 ===

  function doSave() {
    const data = buildSave({
      levelId: LEVEL.id,
      player,
      inventory,
      arsenal,
      enemies,
      takenPickups,
      gameTime,
    });
    data.difficulty = difficulty;
    data.visited = [...visited];
    data.docsRead = [...docsRead];
    data.npcTalked = [...npcTalked];
    data.firedTriggers = [...firedTriggers];
    saves.save(SAVE_KEY, data);
    audio.play('typewriter');
    $('tw-info').textContent = saves.persistent
      ? '已存檔。'
      : '已存檔（此瀏覽器無法永久保存，關閉頁面將遺失）。';
  }

  function doLoad() {
    const data = saves.load(SAVE_KEY);
    if (!data || data.levelId !== LEVEL.id) return false;
    if (data.difficulty && DIFFICULTY[data.difficulty]) difficulty = data.difficulty;
    if (Array.isArray(data.visited)) {
      visited.clear();
      for (const r of data.visited) visited.add(r);
    }
    if (Array.isArray(data.docsRead)) {
      docsRead.clear();
      for (const d of data.docsRead) docsRead.add(d);
    }
    if (Array.isArray(data.npcTalked)) {
      npcTalked.clear();
      for (const n of data.npcTalked) npcTalked.add(n);
    }
    if (Array.isArray(data.firedTriggers)) {
      firedTriggers.clear();
      for (const t of data.firedTriggers) firedTriggers.add(t);
    }
    const restored = applySave(data, { player });
    inventory = restored.inventory;
    arsenal = restored.arsenal;
    gameTime = restored.gameTime;
    takenPickups = restored.takenPickups;
    player.iframes = 0;
    const byId = new Map(restored.enemySnapshots.map((s) => [s.id, s]));
    for (const e of enemies) {
      const s = byId.get(e.id);
      if (!s) continue;
      e.restore(s);
      if (!e.dead) {
        e.setState('idle');
        e.alerted = false;
      }
      renderer.syncEnemy(e.id, e, true);
    }
    for (const [id, p] of pickups) {
      if (takenPickups.has(id)) {
        renderer.removePickup(id);
      } else if (!renderer.pickupMeshes.has(id)) {
        renderer.addPickup(id, ITEMS[p.item].type);
        renderer.placePickup(id, p.x, p.z);
      }
    }
    renderer.setWeaponView(arsenal.current);
    hud.setAmmo(arsenal, inventory);
    updateTreasureHud();
    updateActiveRooms(true);
    return true;
  }

  // === 主更新 ===

  function update(dt) {
    if (mode === 'title' || mode === 'difficulty' || mode === 'help') {
      input.actions(); // 消化輸入緩衝
      input.consumePressed('Escape');
      return;
    }
    if (mode === 'story') {
      const page = STORY.pages[storyPage] || '';
      if (storyChars < page.length) storyChars = Math.min(page.length, storyChars + dt * 42);
      $('story-text').textContent = page.slice(0, Math.floor(storyChars));
      const a = input.actions();
      if (a.interact || a.fire) advanceStory();
      if (input.consumePressed('Escape')) beginPlay(); // 跳過劇情
      return;
    }
    if (mode === 'read') {
      const a = input.actions();
      if (a.interact || a.fire || input.consumePressed('Escape')) closeDocument();
      return;
    }
    if (mode === 'dialog') {
      const a = input.actions();
      if (a.interact || a.fire) advanceDialog();
      if (input.consumePressed('Escape')) closeDialog();
      return;
    }
    if (mode === 'end') {
      input.actions();
      input.consumePressed('Escape');
      return;
    }
    if (mode === 'paused') {
      input.actions();
      input.consumePressed('Escape');
      return;
    }
    if (mode === 'inventory') {
      input.consumeLook();
      input.consumeMouseJust(0);
      if (overlays.inventoryInput(input, inventory, player, audio)) {
        overlays.closeInventory();
        hud.setAmmo(arsenal, inventory);
        setMode('play');
      }
      return;
    }
    if (mode === 'typewriter') {
      input.consumeLook();
      input.consumeMouseJust(0);
      const act = overlays.typewriterInput(input);
      if (act === 'save') doSave();
      else if (act === 'load') {
        if (doLoad()) {
          overlays.closeTypewriter();
          setMode('play');
          hintFlash('讀取完成');
        } else {
          $('tw-info').textContent = '沒有可讀取的存檔。';
        }
      } else if (act === 'close') {
        overlays.closeTypewriter();
        setMode('play');
      }
      return;
    }
    if (mode === 'map') {
      input.consumeLook();
      input.consumeMouseJust(0);
      if (input.consumePressed('KeyM') || input.consumePressed('Tab') || input.consumePressed('Escape')) {
        $('bigmap').style.display = 'none';
        setMode('play');
      }
      return;
    }
    if (mode === 'dead') {
      input.consumeLook();
      const act = overlays.deathInput(input);
      if (act === 'load' && doLoad()) {
        $('death').style.display = 'none';
        setMode('play');
      } else if (act === 'restart') {
        window.location.reload();
      }
      return;
    }

    // === play ===
    gameTime += dt;
    const actions = input.actions();
    if (input.consumePressed('Escape')) {
      setMode('paused');
      return;
    }

    player.look(actions.look[0], actions.look[1]);
    const beforeX = player.x;
    const beforeZ = player.z;
    player.update(dt, actions, world);

    stepDistance += Math.hypot(player.x - beforeX, player.z - beforeZ);
    if (stepDistance > (actions.run ? 1.05 : 0.8)) {
      stepDistance = 0;
      audio.play('step');
    }

    if (actions.weaponSlot !== null) {
      const id = WEAPON_SLOTS[actions.weaponSlot];
      if (id && arsenal.has(id)) {
        arsenal.select(id);
        renderer.setWeaponView(id);
        hud.setAmmo(arsenal, inventory);
      }
    }
    // Q（或觸控「武器」鈕）：循環切換持有的武器
    if (input.consumePressed('KeyQ')) {
      const owned = WEAPON_SLOTS.filter((id) => arsenal.has(id));
      if (owned.length > 1) {
        const next = owned[(owned.indexOf(arsenal.current) + 1) % owned.length];
        arsenal.select(next);
        renderer.setWeaponView(next);
        hud.setAmmo(arsenal, inventory);
      }
    }
    if (actions.reload) {
      const got = arsenal.reload(inventory);
      if (got > 0) {
        audio.play('reload');
        hud.setAmmo(arsenal, inventory);
      }
    }
    if (actions.inventory) {
      overlays.openInventory(inventory);
      setMode('inventory');
      return;
    }
    if (input.consumePressed('KeyM')) {
      hud.drawBigmap(world, player, visited, LEVEL.entities.typewriters);
      $('bigmap').style.display = 'flex';
      setMode('map');
      return;
    }
    // 全自動/噴射武器按住連發，其餘單發
    const wdef = WEAPONS[arsenal.current];
    if (wdef.auto ? actions.fireHeld : actions.fire) tryFire();
    if (wdef.auto) input.consumeMouseJust(0); // 清掉邊緣事件避免殘留

    // 投射物（火箭彈）推進與爆炸
    const events = projectiles.update(dt, { world, enemies, player });
    for (const ev of events) {
      renderer.explosion(ev.x, ev.y, ev.z);
      audio.play('explosion');
      alertNearbyEnemies();
      for (const h of ev.hits) {
        h.enemy.hurt(h.damage, 'body');
        hud.hitmark();
      }
      if (ev.playerDamage > 0 && player.hurt(ev.playerDamage)) {
        hud.damageFlash();
        renderer.shake(0.2);
        audio.play('hurt');
        if (player.hp <= 0) die();
      }
    }

    // 火焰 DoT
    for (const [e, b] of burning) {
      if (e.dead) {
        burning.delete(e);
        continue;
      }
      b.left -= dt;
      b.next -= dt;
      if (b.next <= 0) {
        b.next = 0.5;
        e.hurt(5, 'body');
      }
      if (b.left <= 0) burning.delete(e);
    }

    // 犬類追擊低吼
    growlCooldown -= dt;
    if (growlCooldown <= 0) {
      growlCooldown = 2.4;
      if (enemies.some((e) => e.type === 'dog' && !e.dead && e.state === 'chase')) {
        audio.play('doggrowl');
      }
    }

    // 配樂強度：有警覺中的活敵＝戰鬥層
    const inCombat = enemies.some((e) => !e.dead && e.alerted);
    if (inCombat !== musicOn) {
      musicOn = inCombat;
      audio.setMusicIntensity(inCombat ? 1 : 0);
    }

    // 互動優先序：NPC > 文件 > 拾取 > 打字機 > 門
    const npc = nearestNpc();
    const doc = npc ? null : nearestDocument();
    const pickup = npc || doc ? null : nearestPickup();
    const typewriter = npc || doc || pickup ? null : nearestTypewriter();
    const door = npc || doc || pickup || typewriter ? null : nearestDoor();

    if (actions.interact) {
      if (npc) openDialog(npc);
      else if (doc) openDocument(doc);
      else if (pickup) tryPickup(pickup);
      else if (typewriter) {
        overlays.openTypewriter(saves.load(SAVE_KEY) !== null);
        setMode('typewriter');
      } else if (door) {
        if (door.lock === 'chapterExit') {
          const need = LEVEL.exitNeeds;
          if (!need || inventory.keyItems.includes(need)) chapterEnd();
          else {
            audio.play('locked');
            hintFlash(LEVEL.exitHint || `需要「${world.lockNames[need] ?? need}」才能離開`, 3.5);
          }
        } else if (door.lock && inventory.keyItems.includes(door.lock)) {
          world.doors.get(door.id).lock = null;
          audio.play('reload');
          hintFlash(`使用了「${world.lockNames[door.lock] ?? door.lock}」`, 2.2);
        } else if (door.lock) {
          audio.play('locked');
        } else {
          const next = !door.open;
          world.setDoorOpen(door.id, next);
          renderer.setDoorOpen(door.id, next);
          audio.play('door');
        }
      }
    }

    // 提示
    if (hintOverride) {
      hintOverride.t -= dt;
      hint(hintOverride.text);
      if (hintOverride.t <= 0) hintOverride = null;
    } else if (npc) {
      hint(`按 E 與${npc.name}交談`);
    } else if (doc) {
      hint(`按 E 閱讀「${doc.title}」`);
    } else if (pickup) {
      hint(`按 E 拾取 ${ITEMS[pickup.def.item].name}`);
    } else if (typewriter) {
      hint('按 E 使用打字機');
    } else if (door) {
      if (door.lock === 'chapterExit') hint('按 E 離開廠區');
      else if (door.lock && inventory.keyItems.includes(door.lock)) hint(`按 E 使用「${world.lockNames[door.lock] ?? door.lock}」`);
      else if (door.lock) hint(`上鎖了——需要「${world.lockNames[door.lock] ?? door.lock}」`);
      else hint(door.open ? '按 E 關門' : '按 E 開門');
    } else {
      hint(idleHint());
    }

    // 敵人
    for (const e of enemies) e.update(dt, enemyCtx);
    separateEnemies(enemies);
    for (const e of enemies) {
      renderer.syncEnemy(e.id, e, activeRoomIds.includes(world.roomAt(e.x, e.z)));
    }

    // Boss 擊破 → 自毀協定啟動（緊急解鎖＋倒數）
    if (LEVEL.boss && !bossDone) {
      const boss = enemies.find((e) => e.id === LEVEL.boss);
      if (boss && boss.dead) {
        bossDone = true;
        inventory.keyItems.push('bossdead');
        countdownLeft = LEVEL.countdown || 180;
        renderer.shake(0.22);
        audio.play('explosion');
        audio.setMusicIntensity(1);
        hintFlash('銷毀協定啟動——豎井閘門緊急解鎖，快跑！', 4.5);
        $('countdown').style.display = 'block';
      }
    }
    if (countdownLeft > 0) {
      countdownLeft -= dt;
      const cm = Math.floor(Math.max(0, countdownLeft) / 60);
      const cs = Math.floor(Math.max(0, countdownLeft) % 60);
      $('countdown').textContent = `自毀 ${cm}:${String(cs).padStart(2, '0')}`;
      if (countdownLeft <= 0) {
        player.hp = 0;
        hintFlash('熱熔銷毀系統啟動——', 2);
        die();
        return;
      }
    }

    audio.setHeartbeat(player.healthTier());
    hud.update(dt, player);
    updateActiveRooms();
    // 小地圖每 0.25 秒重繪
    if (++mapDrawTick >= 15) {
      mapDrawTick = 0;
      hud.drawMinimap(world, player, visited, LEVEL.entities.typewriters);
    }
  }

  function render() {
    renderer.updateCamera(player);
    renderer.syncProjectiles(projectiles.list);
    renderer.render();
  }

  const loop = new GameLoop({ update, render });

  const ro = new ResizeObserver(() => {
    renderer.resize(container.clientWidth, container.clientHeight);
  });
  ro.observe(container);
  renderer.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

  applyDifficultyHp();
  hud.setAmmo(arsenal, inventory);
  updateTreasureHud();
  updateActiveRooms(true);
  loop.start();
  $('loading').style.display = 'none';
  // 章末銜接：直接播下一章開場劇情；否則進標題
  if (progress.auto === 'story') {
    if (progress.difficulty && DIFFICULTY[progress.difficulty]) {
      difficulty = progress.difficulty;
      applyDifficultyHp();
    }
    saves.save(PROGRESS_KEY, { chapter: LEVEL.id, difficulty });
    audio.unlock(); // 前一頁的點擊手勢多半已失效，但嘗試無害
    startStory();
  } else {
    setMode('title');
  }

  // 供自動驗證與除錯
  window.__zw = {
    world,
    player,
    audio,
    input,
    loop,
    renderer,
    saves,
    enemies,
    doSave,
    doLoad,
    setMode,
    projectiles,
    visited,
    setDifficulty(d) {
      if (DIFFICULTY[d]) {
        difficulty = d;
        applyDifficultyHp();
      }
    },
    get difficulty() {
      return difficulty;
    },
    get mode() {
      return mode;
    },
    get inventory() {
      return inventory;
    },
    get arsenal() {
      return arsenal;
    },
    get gameTime() {
      return gameTime;
    },
    version: 'phase2',
  };
}

boot();
