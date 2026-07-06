// 戰鬥示範場：軍械室（拾取＋打字機）→ 走廊 → 競技場（殭屍群＋犬）。
// 純資料模組（測試夾具兼遊戲關卡）。
export const ARENA = {
  id: 'arena',
  name: '戰鬥示範場',
  spawn: { x: 2, z: 2.5, yaw: -Math.PI / 2 }, // 面向 +x
  lockNames: {},
  rooms: [
    {
      id: 'armory',
      x: 0, z: 0, w: 6, d: 5, h: 3,
      floor: 'tile', walls: 'plaster',
      light: { x: 3, y: 2.6, z: 2.5, color: 0xffdca0, intensity: 40 },
    },
    {
      id: 'corridor',
      x: 6, z: 1.5, w: 6, d: 2, h: 2.6,
      floor: 'carpet', walls: 'wallpaper',
      light: { x: 9, y: 2.2, z: 2.5, color: 0xc09060, intensity: 22, flicker: true },
    },
    {
      id: 'arena',
      x: 12, z: 0, w: 9, d: 8, h: 3.4,
      floor: 'wood', walls: 'wallpaper',
      light: { x: 16.5, y: 3, z: 4, color: 0x7788bb, intensity: 30, flicker: true },
    },
  ],
  props: [
    // 軍械室：置物架與物資
    { room: 'armory', type: 'shelf', x: 0.35, z: 2.5, rot: Math.PI / 2, solid: 0.28 },
    { room: 'armory', type: 'crate', x: 5.4, z: 0.7, solid: 0.4 },
    { room: 'armory', type: 'crate', x: 5.3, z: 4.4, solid: 0.4 },
    { room: 'armory', type: 'table', x: 3, z: 4.4, solid: 0.5 },
    { room: 'armory', type: 'papers', x: 3.2, z: 3.2 },
    // 走廊：翻倒的椅子、散落文件、血跡
    { room: 'corridor', type: 'chair_fallen', x: 7.2, z: 1.95, rot: 1.1 },
    { room: 'corridor', type: 'papers', x: 9.5, z: 2.6 },
    { room: 'corridor', type: 'blood', x: 10.4, z: 2.3 },
    { room: 'corridor', type: 'pipe', x: 9, z: 1.75, len: 5.6, y: 2.45 },
    // 競技場：慘案現場
    { room: 'arena', type: 'table', x: 16.5, z: 6.8, rot: 0.4, solid: 0.5 },
    { room: 'arena', type: 'chair_fallen', x: 15.3, z: 6.2, rot: 2.4 },
    { room: 'arena', type: 'bodybag', x: 13.2, z: 1.2, rot: 0.3 },
    { room: 'arena', type: 'blood', x: 13.4, z: 1.7 },
    { room: 'arena', type: 'blood', x: 17.8, z: 3.4 },
    { room: 'arena', type: 'barrel', x: 20.3, z: 7.2, solid: 0.35 },
    { room: 'arena', type: 'barrel', x: 19.6, z: 7.4, solid: 0.35 },
    { room: 'arena', type: 'shelf', x: 20.65, z: 4, rot: -Math.PI / 2, solid: 0.28 },
    { room: 'arena', type: 'papers', x: 18.5, z: 5.5 },
  ],
  doors: [
    { id: 'd-armory-corridor', from: 'armory', to: 'corridor', axis: 'z', at: [6, 2.5], width: 1.2, height: 2.2, lock: null },
    { id: 'd-corridor-arena', from: 'corridor', to: 'arena', axis: 'z', at: [12, 2.5], width: 1.2, height: 2.2, lock: null },
  ],
  entities: {
    pickups: [
      { id: 'p-hgammo', item: 'handgun_ammo', count: 15, x: 4.5, z: 1 },
      { id: 'p-herb-g1', item: 'green_herb', count: 1, x: 1, z: 4 },
      { id: 'p-shotgun', item: 'shotgun_weapon', count: 1, x: 4.8, z: 4.2 },
      { id: 'p-herb-r', item: 'red_herb', count: 1, x: 8, z: 2 },
      { id: 'p-shells', item: 'shotgun_shells', count: 7, x: 10.5, z: 3 },
      { id: 'p-herb-g2', item: 'green_herb', count: 1, x: 20, z: 7 },
      { id: 'p-smg', item: 'smg_weapon', count: 1, x: 7, z: 2 },
      { id: 'p-smgammo', item: 'smg_ammo', count: 30, x: 7.8, z: 3 },
      { id: 'p-flamer', item: 'flamethrower_weapon', count: 1, x: 18.5, z: 1.2 },
      { id: 'p-fuel', item: 'fuel', count: 50, x: 19.3, z: 1.5 },
      { id: 'p-rocket', item: 'rocket_weapon', count: 1, x: 13, z: 7.2 },
    ],
    enemies: [
      { id: 'z-corridor', type: 'zombie', x: 10.5, z: 2.2 },
      { id: 'z-arena-1', type: 'zombie', x: 15, z: 2 },
      { id: 'z-arena-2', type: 'zombie', x: 18, z: 5.5 },
      { id: 'z-arena-3', type: 'zombie', x: 14, z: 6.5 },
      { id: 'dog-arena', type: 'dog', x: 19.5, z: 1.5 },
    ],
    typewriters: [{ id: 'tw-armory', x: 0.7, z: 0.7 }],
  },
  // 開局配置
  start: { weapons: [{ id: 'handgun', rounds: 15 }], items: [] },
};
