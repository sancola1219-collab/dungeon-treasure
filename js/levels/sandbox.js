// 引擎沙盒：兩個房間、一道可開的門、一道上鎖的裝飾門。
// 純資料模組（測試也拿它當夾具），格式定義見階段一計畫。
export const SANDBOX = {
  id: 'sandbox',
  name: '引擎沙盒',
  spawn: { x: 2.5, z: 3, yaw: -Math.PI / 2 }, // 面向 +x，望向書房方向
  lockNames: { moon: '月之鑰' },
  rooms: [
    {
      id: 'hall',
      x: 0, z: 0, w: 8, d: 6, h: 3,
      floor: 'wood', walls: 'wallpaper',
      light: { x: 4, y: 2.6, z: 3, color: 0xffd9a0, intensity: 38 },
    },
    {
      id: 'study',
      x: 8, z: 0, w: 5, d: 6, h: 3,
      floor: 'tile', walls: 'plaster',
      light: { x: 10.5, y: 2.6, z: 3, color: 0x9fc4ff, intensity: 28 },
    },
  ],
  doors: [
    { id: 'd-hall-study', from: 'hall', to: 'study', axis: 'z', at: [8, 3], width: 1.2, height: 2.2, lock: null },
    { id: 'd-locked', from: 'study', to: null, axis: 'x', at: [10.5, 0], width: 1.2, height: 2.2, lock: 'moon' },
  ],
};
