// 渲染層：純視覺。遊戲狀態一律在 World/Player/Enemy，這裡只反映狀態。
// 血粒子、槍口光衰減、拾取物旋轉屬純裝飾，在 render() 內推進不影響邏輯。
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { getTexture } from './textures.js';
import {
  buildWeaponModel,
  buildZombieMesh,
  buildDogMesh,
  buildTypewriterMesh,
  buildPickupMesh,
  buildSurvivorMesh,
  buildHunterMesh,
  buildLurkerMesh,
  buildSpiderMesh,
  buildCreeperMesh,
  buildBloaterMesh,
  buildPrimeMesh,
} from './meshes.js';

const ENEMY_BUILDERS = {
  zombie: buildZombieMesh,
  dog: buildDogMesh,
  hunter: buildHunterMesh,
  lurker: buildLurkerMesh,
  spider: buildSpiderMesh,
  creeper: buildCreeperMesh,
  bloater: buildBloaterMesh,
  prime: buildPrimeMesh,
};

// 外部模型的目標高度與動畫片段偏好（依實際資產的片段名）
const EXT_HEIGHT = { zombie: 1.75, dog: 0.66 }; // dog 實測補償：探測姿勢低頭、遊戲姿勢抬頭
const CLIP_PREFS = {
  zombie: {
    move: ['Walk'],
    idle: ['Idle'],
    attack: ['Punch', 'Idle_Attack'],
    stagger: ['HitReact'],
    death: ['Death'],
  },
  dog: {
    move: ['Gallop', 'Walk'],
    idle: ['Idle'],
    attack: ['Attack'],
    stagger: ['Idle_HitReact_Left', 'HitReact'],
    death: ['Death'],
  },
};

function findClip(animations, names) {
  for (const want of names) {
    const hit = animations.find((c) => c.name === want || c.name.endsWith('|' + want));
    if (hit) return hit;
  }
  return null;
}

export class Renderer {
  constructor(container) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      throw new Error('WEBGL_UNSUPPORTED');
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // 電影感色調映射
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020306);
    this.scene.fog = new THREE.FogExp2(0x03040a, 0.115);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera); // 讓視角武器模型（相機子物件）可被渲染

    // 光強單位是物理量（燭光），數值要比直覺大得多——
    // 以下數值經像素取樣調校：光圈中心約 100/255、暗部個位數，勿憑感覺改
    this.scene.add(new THREE.AmbientLight(0x4a4238, 1.5));

    // 手電筒：decay=0 零距離衰減——光圈內亮度恆定（電影式而非物理式）。
    // 物理衰減會讓近身敵人吃到十幾倍光強直接爆白（v2.5.2 的雪人 bug），
    // 遠處變暗交給霧與聚光角度衰減即可
    this._flash = new THREE.SpotLight(0xffc080, 24, 20, 0.62, 0.65, 0);
    this._flash.position.set(0.12, -0.08, 0);
    this._flashTarget = new THREE.Object3D();
    this._flashTarget.position.set(0, -0.1, -6);
    this.camera.add(this._flash, this._flashTarget);
    this._flash.target = this._flashTarget;

    // 貼身微光：同樣零衰減、低強度，只求光圈外隱約可辨
    this._fill = new THREE.PointLight(0xffb070, 0.4, 5, 0);
    this.camera.add(this._fill);

    this.roomGroups = new Map();
    this.doorPivots = new Map();
    this.enemyMeshes = new Map();
    this.pickupMeshes = new Map();
    this._bloodBursts = [];
    this._flickers = [];
    this._flames = []; // 火焰/爆炸粒子（純裝飾）
    this._explosions = []; // 爆炸光衰減
    this._vmSwing = 0;
    this._shake = 0;
    this._bobPhase = 0;
    this._lastCam = null;

    // 槍口閃光
    this._muzzle = new THREE.PointLight(0xffcc88, 0, 7, 2);
    this.scene.add(this._muzzle);

    this._buildViewmodels();
  }

  // 受擊/爆炸震動（純裝飾，render 內衰減）
  shake(strength = 0.06) {
    this._shake = Math.max(this._shake, strength);
  }

  buildLevel(world) {
    for (const room of world.rooms.values()) {
      const group = new THREE.Group();
      const floorMat = new THREE.MeshLambertMaterial({ map: getTexture(room.floor || 'wood') });
      const wallMat = new THREE.MeshLambertMaterial({ map: getTexture(room.walls || 'wallpaper') });
      const ceilMat = new THREE.MeshLambertMaterial({ map: getTexture('plaster'), color: 0x777470 });

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(room.x + room.w / 2, 0, room.z + room.d / 2);
      group.add(floor);

      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(room.x + room.w / 2, room.h, room.z + room.d / 2);
      group.add(ceil);

      for (const [x1, z1, x2, z2] of world.wallSegments(room.id)) {
        group.add(makeWall(x1, z1, x2, z2, 0, room.h, wallMat));
      }
      for (const d of world.doorsOfRoom(room.id)) {
        if (d.height < room.h) {
          const s = world.doorSegment(d.id);
          group.add(makeWall(s[0], s[1], s[2], s[3], d.height, room.h - d.height, wallMat));
        }
      }

      if (room.light) {
        const L = room.light;
        const light = new THREE.PointLight(L.color ?? 0xffd9a0, L.intensity ?? 6, 18, 1.6);
        light.position.set(L.x, L.y ?? room.h - 0.4, L.z);
        group.add(light);
        if (L.flicker) this._flickers.push({ light, base: light.intensity, t: 0 });
      }

      this.scene.add(group);
      this.roomGroups.set(room.id, group);
    }

    // 場景道具（吃房間剔除；碰撞由 World 依 solid 值處理）
    for (const p of world.data.props || []) {
      const mesh = makeProp(p);
      if (!mesh) continue;
      (this.roomGroups.get(p.room) || this.scene).add(mesh);
    }

    const doorMat = new THREE.MeshLambertMaterial({ map: getTexture('wood'), color: 0x9a7a55 });
    for (const d of world.doors.values()) {
      const s = world.doorSegment(d.id);
      const pivot = new THREE.Group();
      pivot.position.set(s[0], 0, s[1]);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(d.width, d.height, 0.06), doorMat);
      if (d.axis === 'x') {
        panel.position.set(d.width / 2, d.height / 2, 0);
      } else {
        panel.rotation.y = Math.PI / 2;
        panel.position.set(0, d.height / 2, d.width / 2);
      }
      pivot.add(panel);
      this.scene.add(pivot);
      this.doorPivots.set(d.id, pivot);
    }
  }

  setDoorOpen(doorId, open) {
    const pivot = this.doorPivots.get(doorId);
    if (pivot) pivot.rotation.y = open ? -Math.PI * 0.47 : 0;
  }

  setActiveRooms(ids) {
    for (const [id, g] of this.roomGroups) g.visible = ids.includes(id);
  }

  // === 敵人 ===

  addEnemy(id, type) {
    const group =
      this._extModels && this._extModels.get(type)
        ? this._makeExternalEnemy(type)
        : (ENEMY_BUILDERS[type] || buildZombieMesh)();
    this.scene.add(group);
    this.enemyMeshes.set(id, group);
  }

  // 外部 .glb 模型熱替換（models.js 找到檔案時呼叫；武器與敵人一併換）
  setExternalModels(models) {
    this._extModels = models;
    for (const [id, g] of Object.entries(this._vms)) {
      const model = models.get(id);
      if (!model) continue;
      g.clear();
      g.add(normalizeStatic(model.scene.clone(), 0.5));
    }
    for (const [id, old] of [...this.enemyMeshes]) {
      const kind = old.userData.kind;
      if (!models.get(kind)) continue;
      const fresh = this._makeExternalEnemy(kind);
      fresh.position.copy(old.position);
      fresh.rotation.copy(old.rotation);
      this.scene.remove(old);
      this.scene.add(fresh);
      this.enemyMeshes.set(id, fresh);
    }
  }

  // 骨架複製＋尺寸正規化＋動畫接線
  _makeExternalEnemy(kind) {
    const def = this._extModels.get(kind);
    const inst = cloneSkeleton(def.scene);
    inst.rotation.y = Math.PI; // 素材慣例面向 +Z，遊戲慣例 -Z
    inst.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // 骨架動畫包圍盒不可靠，避免誤剔除
        if (o.material && !Array.isArray(o.material)) {
          // PBR 材質在本作昏暗光照下反應過暗，統一轉 Lambert（也更省手機效能）
          o.material = new THREE.MeshLambertMaterial({
            map: o.material.map || null,
            color: o.material.color ? o.material.color.clone() : 0xffffff,
            vertexColors: !!o.material.vertexColors,
          });
        }
      }
    });
    const g = new THREE.Group();
    g.add(inst);
    this._applyProbeNorm(inst, kind, def.animations);
    g.userData.kind = kind;
    g.userData.parts = null;

    // 犬類恐怖化：壓暗毛色＋黑暗中發亮的紅眼＋外掛血腥件
    if (kind === 'dog') {
      inst.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) o.material.color.multiplyScalar(0.5);
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2211 });
      for (const ex of [-0.05, 0.05]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), eyeMat);
        eye.position.set(ex, 0.5, -0.42); // 依 0.66m 正規化體型估計的頭部位置
        g.add(eye);
      }
      const gore = new THREE.MeshLambertMaterial({ color: 0x4a0d0d });
      const rib = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), gore);
      rib.scale.set(0.5, 1.2, 1.6);
      rib.position.set(0.11, 0.35, 0.05); // 側腹撕裂
      g.add(rib);
      const spine = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gore);
      spine.scale.set(0.8, 0.4, 2.6);
      spine.position.set(0, 0.52, 0.1); // 脊背血痕
      g.add(spine);
    }

    if (def.animations.length) {
      const mixer = new THREE.AnimationMixer(inst);
      const prefs = CLIP_PREFS[kind] || {};
      const actions = {};
      for (const key of Object.keys(prefs)) {
        const clip = findClip(def.animations, prefs[key]);
        if (clip) actions[key] = mixer.clipAction(clip);
      }
      if (actions.death) {
        actions.death.setLoop(THREE.LoopOnce);
        actions.death.clampWhenFinished = true;
      }
      g.userData.mixer = mixer;
      g.userData.actions = actions;
      g.userData.animKey = null;
    }
    return g;
  }

  // 剪影探測正規化：骨架模型的包圍盒數學不可信（bind 矩陣補償會騙人），
  // 唯一可靠的是「實際渲染出來多大」。把模型單獨放進純黑探測場景渲染一幀，
  // 掃描像素得出真實身高與腳底高度，換算縮放與貼地偏移。每種模型只探測一次。
  _applyProbeNorm(inst, kind, animations) {
    if (!this._probeCache) this._probeCache = {};
    if (!this._probeCache[kind]) {
      this._probeCache[kind] = this._probeMeasure(inst, EXT_HEIGHT[kind] || 1.6, animations, kind);
    }
    const n = this._probeCache[kind];
    inst.scale.setScalar(n.scale);
    inst.position.y = n.yOff;
  }

  _probeMeasure(inst, targetHeight, animations, kind) {
    const fallback = { scale: 1, yOff: 0 }; // 量不到就信任資產原始尺度
    const W = this.renderer.domElement.width;
    const H = this.renderer.domElement.height;
    if (W < 64 || H < 64) return fallback;

    const probeScene = new THREE.Scene();
    probeScene.background = new THREE.Color(0x000000);
    probeScene.add(new THREE.AmbientLight(0xffffff, 3));
    const cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 60);
    cam.position.set(0, 1.6, 5);

    const prevParent = inst.parent;
    const prevScale = inst.scale.x;
    const prevY = inst.position.y;
    probeScene.add(inst);
    inst.position.set(0, 0, 0);
    inst.scale.setScalar(1);

    // 以「待機動畫姿勢」量測——遊戲裡顯示的就是這個姿勢，
    // 綁定姿勢（T-pose/微蹲差異）會導致身高與腳底判斷失準
    if (animations && animations.length) {
      const prefs = (CLIP_PREFS[kind] && CLIP_PREFS[kind].idle) || [];
      const clip = findClip(animations, prefs) || animations[0];
      const probeMixer = new THREE.AnimationMixer(inst);
      probeMixer.clipAction(clip).play();
      probeMixer.update(0.4);
    }

    const gl = this.renderer.getContext();
    const halfTan = Math.tan((70 * Math.PI) / 360);
    const toWorldY = (py) => 1.6 + ((py - H / 2) / H) * 2 * 5 * halfTan;
    const measure = () => {
      this.renderer.clear();
      this.renderer.render(probeScene, cam);
      let first = -1;
      let last = -1;
      // 掃三欄，容忍模型稍微偏離中線
      for (const dx of [-40, 0, 40]) {
        const col = new Uint8Array(4 * H);
        gl.readPixels(Math.floor(W / 2) + dx, 0, 1, H, gl.RGBA, gl.UNSIGNED_BYTE, col);
        for (let i = 0; i < H; i++) {
          const v = (col[i * 4] + col[i * 4 + 1] + col[i * 4 + 2]) / 3;
          if (v > 10) {
            if (first < 0 || i < first) first = first < 0 ? i : Math.min(first, i);
            last = Math.max(last, i);
          }
        }
      }
      if (first < 0) return null;
      return { h: toWorldY(last) - toWorldY(first), feet: toWorldY(first) };
    };

    let result = fallback;
    const m1 = measure();
    if (m1 && m1.h > 0.02) {
      const scale = targetHeight / m1.h;
      inst.scale.setScalar(scale);
      const m2 = measure();
      result = { scale, yOff: m2 ? -m2.feet : 0 };
    }

    probeScene.remove(inst);
    inst.scale.setScalar(prevScale);
    inst.position.y = prevY;
    if (prevParent) prevParent.add(inst);
    return result;
  }

  _setEnemyAnim(g, key) {
    const a = g.userData.actions;
    if (!a || g.userData.animKey === key) return;
    const next = a[key] || a.idle;
    if (!next) return;
    const prev = g.userData.animKey ? a[g.userData.animKey] : null;
    if (prev && prev !== next) prev.fadeOut(0.18);
    next.reset().fadeIn(0.18).play();
    g.userData.animKey = key;
  }

  syncEnemy(id, e, visible = true) {
    const g = this.enemyMeshes.get(id);
    if (!g) return;
    g.visible = visible;
    g.position.x = e.x;
    g.position.z = e.z;
    g.rotation.y = e.yaw;
    g.userData.dead = e.dead;
    g.userData.moving = !e.dead && (e.state === 'chase' || e.state === 'lunge');

    if (g.userData.mixer) {
      // 外部骨架模型：狀態驅動動畫片段，倒地由 Death 動畫呈現
      let key;
      if (e.dead) key = 'death';
      else if (e.state === 'stagger') key = 'stagger';
      else if (e.state === 'windup' || e.state === 'attack' || e.state === 'lunge') key = 'attack';
      else if (g.userData.moving) key = 'move';
      else key = 'idle';
      this._setEnemyAnim(g, key);
      g.position.y = 0;
      g.rotation.x = 0;
      return;
    }

    if (e.dead) {
      g.rotation.x = -Math.PI / 2;
      g.position.y = 0.22;
      g.scale.setScalar(1);
    } else {
      g.position.y = e.yOffset || 0; // 潛伏者貼天花板等狀態位移
      g.rotation.x = e.state === 'stagger' ? 0.18 : e.state === 'windup' ? -0.12 : 0;
      // 脹屍鼓脹（依狀態時間決定，非動畫回呼）
      if (e.type === 'bloater' && e.state === 'swell') {
        g.scale.setScalar(1 + Math.min(0.5, e.stateTime * 0.45));
      } else if (g.scale.x !== 1) {
        g.scale.setScalar(1);
      }
    }
  }

  // === 拾取物與打字機 ===

  addPickup(id, itemType) {
    const mesh = buildPickupMesh(itemType);
    this.scene.add(mesh);
    this.pickupMeshes.set(id, mesh);
  }

  placePickup(id, x, z) {
    const m = this.pickupMeshes.get(id);
    if (m) {
      m.position.x = x;
      m.position.z = z;
    }
  }

  setPickupVisible(id, visible) {
    const m = this.pickupMeshes.get(id);
    if (m) m.visible = visible;
  }

  removePickup(id) {
    const m = this.pickupMeshes.get(id);
    if (m) {
      this.scene.remove(m);
      this.pickupMeshes.delete(id);
    }
  }

  addNpc(x, z, yaw = 0) {
    const g = buildSurvivorMesh();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    this.scene.add(g);
  }

  addTypewriter(x, z) {
    const g = buildTypewriterMesh();
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  // === 戰鬥特效（純裝飾） ===

  muzzleFlash() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this._muzzle.position.copy(this.camera.position).addScaledVector(dir, 0.5);
    this._muzzle.intensity = 26;
  }

  bloodBurst(x, y, z) {
    const n = 14;
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      vel.push([
        (Math.random() - 0.5) * 2.4,
        Math.random() * 2 + 0.5,
        (Math.random() - 0.5) * 2.4,
      ]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x8a1010, size: 0.06 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this._bloodBursts.push({ points, vel, life: 0.45 });
  }

  // === 視角武器模型 ===
  // 獨立渲染通道：自己的場景與燈光——不受世界光影響（不會被手電筒
  // 近距爆白），且清深度後再畫，槍永遠不會插進牆裡。

  _buildViewmodels() {
    this._vms = {
      knife: buildWeaponModel('knife'),
      katana: buildWeaponModel('katana'),
      handgun: buildWeaponModel('handgun'),
      shotgun: buildWeaponModel('shotgun'),
      magnum: buildWeaponModel('magnum'),
      smg: buildWeaponModel('smg'),
      flamethrower: buildWeaponModel('flamethrower'),
      rocket: buildWeaponModel('rocket'),
    };
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.vmScene.add(new THREE.AmbientLight(0x9a9aa8, 1.5));
    const key = new THREE.DirectionalLight(0xfff0d2, 2.8);
    key.position.set(0.6, 1, 0.4);
    this.vmScene.add(key);
    this._vmMuzzle = new THREE.PointLight(0xffcc88, 0, 2.5, 1.6);
    this._vmMuzzle.position.set(0.2, -0.1, -0.7);
    this.vmScene.add(this._vmMuzzle);

    this._vmRoot = new THREE.Group();
    this._vmRoot.position.set(0.24, -0.2, -0.45);
    for (const g of Object.values(this._vms)) {
      g.visible = false;
      this._vmRoot.add(g);
    }
    this.vmScene.add(this._vmRoot);
    this._vmKick = 0;
    this.renderer.autoClear = false;
  }

  setWeaponView(id) {
    for (const [k, g] of Object.entries(this._vms)) g.visible = k === id;
  }

  kickViewmodel(strength = 0.06) {
    this._vmKick = strength;
  }

  // 揮刀動作（武士刀/小刀）：右上→左下弧線，render 內衰減，純裝飾
  swingViewmodel() {
    this._vmSwing = 1;
  }

  // 火焰噴流粒子（每個噴射 tick 呼叫一次）
  flameJet() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    for (let i = 0; i < 12; i++) {
      const t = 0.45 + Math.random() * 0.5;
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 + Math.random() * 0.14, 6, 5),
        new THREE.MeshBasicMaterial({
          color: [0xffe08a, 0xffaa33, 0xff6611, 0xff3300][Math.floor(Math.random() * 4)],
          transparent: true,
          opacity: 0.95,
          fog: false, // 火焰自發光，不吃霧
        })
      );
      p.position.copy(this.camera.position)
        .addScaledVector(dir, 0.6 + Math.random() * 0.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.18 + (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.25));
      this.scene.add(p);
      this._flames.push({
        mesh: p,
        vel: dir.clone().multiplyScalar(7.5 + Math.random() * 3.5)
          .add(new THREE.Vector3((Math.random() - 0.5) * 2.2, 0.7 + Math.random() * 1.2, (Math.random() - 0.5) * 2.2)),
        life: t,
      });
    }
    this._muzzle.position.copy(this.camera.position).addScaledVector(dir, 1.4);
    this._muzzle.intensity = 30;
  }

  // 火箭彈可見彈體與尾焰（每 render 依邏輯清單同步；純裝飾）
  syncProjectiles(list) {
    if (!this._projMeshes) this._projMeshes = new Map();
    for (const p of list) {
      let vis = this._projMeshes.get(p);
      if (!vis) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8),
          new THREE.MeshLambertMaterial({ color: 0x4a4e42 })
        );
        body.rotation.x = Math.PI / 2;
        g.add(body);
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.05, 0.12, 8),
          new THREE.MeshLambertMaterial({ color: 0x8a2a1a })
        );
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.23;
        g.add(tip);
        const exhaust = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 6, 5),
          new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.95, fog: false })
        );
        exhaust.position.z = 0.26;
        g.add(exhaust);
        const light = new THREE.PointLight(0xffaa55, 30, 8, 1.4);
        g.add(light);
        this.scene.add(g);
        vis = g;
        this._projMeshes.set(p, g);
      }
      vis.position.set(p.x, p.y, p.z);
      vis.rotation.y = Math.atan2(-p.dirX, -p.dirZ);
      // 煙尾
      if (Math.random() < 0.7) {
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 5, 4),
          new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.4 })
        );
        smoke.position.set(p.x, p.y, p.z);
        this.scene.add(smoke);
        this._flames.push({
          mesh: smoke,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.5, (Math.random() - 0.5) * 0.5),
          life: 0.5 + Math.random() * 0.3,
        });
      }
    }
    // 已爆炸/消失的清掉
    for (const [p, g] of this._projMeshes) {
      if (!list.includes(p)) {
        this.scene.remove(g);
        this._projMeshes.delete(p);
      }
    }
  }

  // 爆炸：閃光＋火球＋煙塵粒子＋震動
  explosion(x, y, z) {
    const light = new THREE.PointLight(0xffaa55, 300, 12, 1.2);
    light.position.set(x, Math.max(0.5, y), z);
    this.scene.add(light);
    this._explosions.push({ light, life: 0.4 });
    for (let i = 0; i < 22; i++) {
      const fire = i < 12;
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(fire ? 0.12 + Math.random() * 0.16 : 0.2 + Math.random() * 0.25, 6, 5),
        new THREE.MeshBasicMaterial({
          color: fire ? [0xffcc55, 0xff7722, 0xdd3311][i % 3] : 0x222222,
          transparent: true,
          opacity: fire ? 0.9 : 0.5,
        })
      );
      p.position.set(x, Math.max(0.3, y), z);
      this.scene.add(p);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 4 + (fire ? 1 : 2);
      this._flames.push({
        mesh: p,
        vel: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), up, Math.sin(a) * (2 + Math.random() * 3)),
        life: fire ? 0.35 + Math.random() * 0.2 : 0.7 + Math.random() * 0.4,
      });
    }
    this.shake(0.16);
  }

  updateCamera(player) {
    // 視覺平滑：邏輯 60Hz、螢幕可能 60/90/120Hz——直接取邏輯位置會有
    // 週期性微步進（走路抖動）。相機位置在渲染側做指數平滑（純裝飾，
    // 不回寫遊戲狀態；收斂 ~45ms，體感無延遲）
    const now = performance.now();
    const fdt = Math.min(0.05, (now - (this._lastFrameT || now)) / 1000);
    this._lastFrameT = now;
    if (!this._smooth) this._smooth = { x: player.x, z: player.z };
    const k = 1 - Math.exp(-fdt * 24);
    this._smooth.x += (player.x - this._smooth.x) * k;
    this._smooth.z += (player.z - this._smooth.z) * k;

    const moved = this._lastCam
      ? Math.hypot(this._smooth.x - this._lastCam[0], this._smooth.z - this._lastCam[1])
      : 0;
    this._lastCam = [this._smooth.x, this._smooth.z];
    if (moved > 0.0005) this._bobPhase += Math.min(moved, 0.12) * 22;
    const bob = Math.sin(this._bobPhase) * 0.014;
    let sx = 0;
    let sy = 0;
    if (this._shake > 0.001) {
      sx = (Math.random() - 0.5) * this._shake;
      sy = (Math.random() - 0.5) * this._shake;
    }
    this.camera.position.set(this._smooth.x + sx, player.eyeHeight + bob + sy, this._smooth.z);
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;
    this.camera.rotation.z = Math.sin(this._bobPhase * 0.5) * 0.003;
  }

  resize(w, h) {
    if (w <= 0 || h <= 0) return; // 容器初始尺寸可能為 0（既有課題）
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  render() {
    // 純裝飾動畫（以固定 1/60 近似推進；停擺只影響視覺不影響邏輯）
    const dt = 1 / 60;
    if (this._muzzle.intensity > 0.5) this._muzzle.intensity *= 0.62;
    else this._muzzle.intensity = 0;
    if (this._vmMuzzle.intensity > 0.3) this._vmMuzzle.intensity *= 0.62;
    else this._vmMuzzle.intensity = 0;
    this._vmKick *= 0.8;
    this._vmRoot.position.z = -0.45 + this._vmKick;
    this._vmRoot.position.y = -0.2 + Math.sin(this._bobPhase) * 0.007; // 武器隨步伐微晃
    // 揮刀弧線：右上抬起 → 斜劈到左下
    if (this._vmSwing > 0.01) {
      this._vmSwing *= 0.86;
      const s = 1 - this._vmSwing; // 0→1 揮出
      this._vmRoot.rotation.z = -0.9 + s * 1.6;
      this._vmRoot.rotation.x = 0.35 - s * 0.7;
      this._vmRoot.position.x = 0.24 + Math.sin(s * Math.PI) * 0.12;
    } else if (this._vmRoot.rotation.z !== 0) {
      this._vmRoot.rotation.z = 0;
      this._vmRoot.rotation.x = 0;
      this._vmRoot.position.x = 0.24;
      this._vmSwing = 0;
    }
    // 火焰/爆炸粒子
    for (let i = this._flames.length - 1; i >= 0; i--) {
      const f = this._flames[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this._flames.splice(i, 1);
        continue;
      }
      f.mesh.position.addScaledVector(f.vel, dt);
      f.vel.y += 1.5 * dt; // 火焰上飄
      f.mesh.material.opacity *= 0.94;
      f.mesh.scale.multiplyScalar(1.03);
    }
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const e = this._explosions[i];
      e.life -= dt;
      e.light.intensity *= 0.82;
      if (e.life <= 0) {
        this.scene.remove(e.light);
        this._explosions.splice(i, 1);
      }
    }
    this._shake *= 0.86;
    for (const m of this.pickupMeshes.values()) (m.userData.spin || m).rotation.y += 0.02;

    // 日光燈忽明忽暗
    for (const f of this._flickers) {
      f.t -= dt;
      if (f.t <= 0) {
        f.t = 0.06 + Math.random() * 0.18;
        f.light.intensity = f.base * (Math.random() < 0.1 ? 0.12 : 0.7 + Math.random() * 0.45);
      }
    }

    // 外部骨架模型：推進動畫混合器
    for (const g of this.enemyMeshes.values()) {
      if (g.visible && g.userData.mixer) g.userData.mixer.update(dt);
    }

    // 敵人四肢擺動（僅視覺；moving/dead 旗標由 syncEnemy 設定）
    for (const g of this.enemyMeshes.values()) {
      const parts = g.userData.parts;
      if (!g.visible || !parts || g.userData.dead) continue;
      if (g.userData.moving) g.userData.phase += dt * (g.userData.kind === 'dog' ? 15 : 5.2);
      const s = Math.sin(g.userData.phase);
      if (g.userData.kind === 'dog') {
        parts.legFL.rotation.x = s * 0.85;
        parts.legBR.rotation.x = s * 0.85;
        parts.legFR.rotation.x = -s * 0.85;
        parts.legBL.rotation.x = -s * 0.85;
      } else {
        parts.legL.rotation.x = s * 0.5;
        parts.legR.rotation.x = -s * 0.5;
        parts.armF.rotation.x = 0.15 + s * 0.1;
        parts.armD.rotation.z = 0.12 + s * 0.16;
        parts.torso.rotation.x = 0.3 + Math.sin(g.userData.phase * 0.5) * 0.05;
      }
    }
    for (let i = this._bloodBursts.length - 1; i >= 0; i--) {
      const b = this._bloodBursts[i];
      b.life -= dt;
      const arr = b.points.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j][1] -= 6 * dt;
        arr.array[j * 3] += b.vel[j][0] * dt;
        arr.array[j * 3 + 1] = Math.max(0.02, arr.array[j * 3 + 1] + b.vel[j][1] * dt);
        arr.array[j * 3 + 2] += b.vel[j][2] * dt;
      }
      arr.needsUpdate = true;
      if (b.life <= 0) {
        this.scene.remove(b.points);
        this._bloodBursts.splice(i, 1);
      }
    }
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
  }
}

// 外部模型正規化：縮放到目標尺寸、腳底貼地、水平置中。
// targetMax 用於武器（最長邊），targetHeight 用於角色（身高）。
function normalizeStatic(obj, targetMax = null, targetHeight = null) {
  const bbox = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (size.length() === 0) return obj;
  const s = targetHeight
    ? targetHeight / size.y
    : (targetMax || 0.5) / Math.max(size.x, size.y, size.z);
  obj.scale.multiplyScalar(s);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3();
  b2.getCenter(c);
  if (targetHeight) obj.position.set(-c.x, -b2.min.y, -c.z);
  else obj.position.set(-c.x, -c.y, -c.z);
  return obj;
}

function makeWall(x1, z1, x2, z2, yBase, height, mat) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.12), mat);
  mesh.position.set((x1 + x2) / 2, yBase + height / 2, (z1 + z2) / 2);
  mesh.rotation.y = Math.atan2(z1 - z2, x2 - x1);
  return mesh;
}

// === 場景道具（程序生成，低多邊形） ===

function makeProp(p) {
  const rng = mulberry32Like(p.x * 73 + p.z * 131 + 7);
  const wood = () => new THREE.MeshLambertMaterial({ map: getTexture('wood') });
  const metal = () => new THREE.MeshLambertMaterial({ map: getTexture('metal') });
  const g = new THREE.Group();

  switch (p.type) {
    case 'table': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8), wood());
      top.position.y = 0.72;
      g.add(top);
      for (const [lx, lz] of [[-0.62, -0.32], [0.62, -0.32], [-0.62, 0.32], [0.62, 0.32]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), wood());
        leg.position.set(lx, 0.35, lz);
        g.add(leg);
      }
      break;
    }
    case 'chair_fallen': {
      const c = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), wood());
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.05), wood());
      back.position.set(0, 0.72, 0.2);
      c.add(seat, back);
      for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), wood());
        leg.position.set(lx, 0.22, lz);
        c.add(leg);
      }
      c.rotation.z = Math.PI / 2; // 翻倒
      c.position.y = -0.22;
      g.add(c);
      break;
    }
    case 'shelf': {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.05, 0.06), wood());
      back.position.set(0, 1.02, 0.13);
      g.add(back);
      for (let i = 0; i < 4; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.3), wood());
        plank.position.y = 0.28 + i * 0.55;
        g.add(plank);
        for (let b = 0; b < 4; b++) {
          if (rng() < 0.3) continue;
          const h = 0.2 + rng() * 0.16;
          const bookMat = new THREE.MeshLambertMaterial({
            color: [0x5a2020, 0x2c3c2a, 0x3a3050, 0x584a28][Math.floor(rng() * 4)],
          });
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.12 + rng() * 0.08, h, 0.2), bookMat);
          book.position.set(-0.36 + b * 0.24, 0.28 + i * 0.55 + h / 2 + 0.03, 0);
          book.rotation.z = (rng() - 0.5) * 0.12;
          g.add(book);
        }
      }
      break;
    }
    case 'crate': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), wood());
      box.position.y = 0.325;
      box.rotation.y = (rng() - 0.5) * 0.5;
      g.add(box);
      break;
    }
    case 'barrel': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 10), metal());
      b.position.y = 0.425;
      g.add(b);
      break;
    }
    case 'papers': {
      for (let i = 0; i < 6; i++) {
        const sheet = new THREE.Mesh(
          new THREE.PlaneGeometry(0.22, 0.3),
          new THREE.MeshLambertMaterial({ color: 0xc9c2ae })
        );
        sheet.rotation.x = -Math.PI / 2;
        sheet.rotation.z = rng() * Math.PI * 2;
        sheet.position.set((rng() - 0.5) * 1.4, 0.012 + i * 0.002, (rng() - 0.5) * 1.4);
        g.add(sheet);
      }
      break;
    }
    case 'blood': {
      const stain = new THREE.Mesh(
        new THREE.CircleGeometry(0.35 + rng() * 0.35, 12),
        new THREE.MeshBasicMaterial({ color: 0x3a0505, transparent: true, opacity: 0.85 })
      );
      stain.rotation.x = -Math.PI / 2;
      stain.position.y = 0.011;
      g.add(stain);
      break;
    }
    case 'bodybag': {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.3, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x14161c })
      );
      bag.position.y = 0.15;
      g.add(bag);
      break;
    }
    case 'pipe': {
      const len = p.len ?? 4;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), metal());
      pipe.rotation.z = Math.PI / 2; // 水平沿 x
      pipe.position.y = 0;
      g.add(pipe);
      g.position.y = p.y ?? 2.6;
      break;
    }
    default:
      return null;
  }

  g.position.x = p.x;
  g.position.z = p.z;
  if (p.type !== 'pipe') g.position.y = 0;
  else g.position.y = p.y ?? 2.6;
  g.rotation.y = p.rot ?? 0;
  return g;
}

// 道具擺設用的輕量種子亂數（與 engine/rng 同演算法，避免渲染層反向依賴遊戲種子）
function mulberry32Like(seed) {
  let a = Math.floor(seed) >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
