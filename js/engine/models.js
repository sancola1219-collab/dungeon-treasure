// 外部 .glb 模型熱插拔：assets/models/ 有檔就載入替換程序模型，缺檔零成本跳過。
// 回傳 Map<name, { scene, animations }>；骨架複製與動畫接線由 renderer 處理。
const MANIFEST = ['zombie', 'dog', 'knife', 'handgun', 'shotgun', 'magnum'];

export async function loadExternalModels() {
  const found = [];
  await Promise.all(
    MANIFEST.map(async (name) => {
      try {
        const res = await fetch(`assets/models/${name}.glb`, { method: 'HEAD' });
        if (res.ok) found.push(name);
      } catch {
        // 離線或伺服器不支援 HEAD：當作無檔
      }
    })
  );
  if (!found.length) return null;

  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const models = new Map();
  await Promise.all(
    found.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
        models.set(name, { scene: gltf.scene, animations: gltf.animations || [] });
      } catch {
        // 壞檔跳過，保留程序模型
      }
    })
  );
  return models.size ? models : null;
}
