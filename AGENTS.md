# 地牢尋寶：沉默王陵 — 開發與審核規範

> 本檔與 `CLAUDE.md` 內容同步（後者給 Claude Code、本檔給 Codex 等其他代理）。修改任一檔請同步另一檔。
> 本遊戲以「3D 遊戲模板」（github.com/sancola1219-collab/game3d-template）為底製作，
> 引擎的深度參考實作見殭屍世界 repo 的 `docs/HANDOVER.md`（NPC 對話、Boss、倒數、多章節的實例都在那）。

## 這個專案是什麼

《地牢尋寶：沉默王陵》——第一人稱地牢探索尋寶遊戲（繁體中文）。主角江無涯為還債闖入無名古王的墓穴，收集殉葬寶藏、對抗墓穴守衛、最終與「不朽王」對決。線上：https://sancola1219-collab.github.io/dungeon-treasure/

- **兩章**：`js/levels/dungeon1.js`（上層墓道→青銅鑰匙→封門廳）、`js/levels/dungeon2.js`（下層寶庫→不朽王 Boss「king」→塌陷倒數→地表裂口）。在 `main.js` 的 `CHAPTERS` 註冊。
- **尋寶系統**：道具 `type:'treasure'`（金幣袋/血紅寶石/黃金神像/沉默王冠，各有 `value`），不佔物品欄格，由 `treasureStats()` 計收集率與價值，計入通關評價（見 main.js）。
- **主題化**：武器/道具已改名為地牢風（開山刀/左輪/獵槍/獵象槍…），機制不變；`stone` 石磚貼圖、火把暖色光照；敵人沿用八種 AI 原型但情境改為墓穴守衛。

## 引擎底座（不要動架構，只加內容）

純前端、零建置，ES modules 直接跑，唯一外部依賴是 import map 的 `three@0.170.0`（jsdelivr）。加關卡＝在 `js/levels/` 新增資料檔並在 `CHAPTERS` 註冊。

已內建並經實戰驗證：固定時步迴圈（60Hz）、第一人稱視角與碰撞、資料驅動關卡（房間/門/鎖/道具/文件/觸發器/NPC）、九種武器框架（近戰/單發/連發/噴射/投射物）、八種敵人 AI 原型（zombie/dog/hunter/lurker/spider/creeper/bloater/prime）、合成音效與程序配樂、恐怖風光影後處理、打字機存檔、小地圖、難度系統、多章節推進、手機觸控、標題/劇情/章末流程。

## 鐵律（違反會壞掉的架構約定——審核時逐條檢查）

1. **邏輯與渲染徹底分離**：遊戲狀態只在 `GameLoop` 固定時步（60Hz）的 update 內改變；rAF 只負責渲染。動畫是純裝飾，任何遊戲狀態不得依賴動畫回呼或 rAF 時序（開發機瀏覽器常整個隱藏，rAF 會完全停擺）。
2. **邏輯模組不碰瀏覽器**：`js/game/*`、`js/engine/loop.js`、`js/engine/save.js` 不得 import three、不得碰 DOM/window。DOM 事件接線集中在各類的 `attach()` 與 `js/main.js`。這是單元測試能在 node 跑的前提。
3. **關卡＝資料**：內容全部寫在 `js/levels/*.js`，幾何/碰撞/實體由資料生成。加內容改資料檔，不要在渲染層硬寫。
4. **觸控＝合成輸入**：虛擬搖桿走 `input.setTouchMove()` 類比通道（推滿>0.85＝奔跑）、虛擬按鈕一律合成 `onKeyDown/onMouseDown` 既有事件——不得為觸控另寫遊戲邏輯分支。
5. **隨機用 `mulberry32(seed)`**（渲染特效除外）；座標 x 向東、z 向南、y 向上；yaw=0 面向 −z，`rotation.order='YXZ'`。
6. **燈光是物理單位**：本作火把（decay=0）值 24、環境光 0x4a4238 強度 1.5、房燈 20~40；個位數≈全黑。改光後用 preview_eval `gl.readPixels` 取樣驗證（面牆中心 ~160/255、近牆 <235 不爆白、暗部 <10），不要憑截圖。

## 開新遊戲三步

1. 複製本資料夾、改 `index.html` 標題與 `package.json` name、`git init`。
2. 照 `js/levels/dungeon1.js` 的 schema 寫關卡（欄位註解見殭屍世界 HANDOVER），在 `main.js` 的 `CHAPTERS` 註冊、`LEVEL` 預設值換掉。
3. 每個關卡**必寫驗證測試**（抄 `tests/dungeon1.test.js`）：實體都在房間內、鑰匙在可達區、鎖鏈 BFS 無死鎖（含 `bossdead` 由 Boss 授予的特例）——這套測試擋掉過真死鎖。

擴充速查：
- **新敵種**：繼承 `js/game/enemies/base.js` 實作 `think(dt,ctx)`＋`hitSpheres()`；`meshes.js` 加建模函式；renderer `ENEMY_BUILDERS` 與 main `ENEMY_TYPES` 各加一行；寫狀態機測試（fake ctx）。
- **新武器**：`weapons.js` 的 `WEAPONS` 加定義（melee/auto/spray/projectile 旗標）＋`items.js` 加彈藥與 `xxx_weapon` 拾取項＋`meshes.buildWeaponModel` 加分支＋main `WEAPON_SLOTS`。
- **謎題**：優先用「文件 grantsKey → 門 lock」既有機制。
- **外部素材**：`assets/textures/*.jpg` 與 `assets/models/*.glb` 丟檔即熱替換（缺檔自動退回程序生成；glb 尺寸由剪影探測自動校正）。

## 審核清單（每次 commit 前；接手代理必須逐項執行）

- [ ] `node --test` 全綠（新關卡有驗證測試、新邏輯有單元測試）
- [ ] 鐵律 1/2 抽查：新增的 game/engine 邏輯檔沒有 three/DOM import；狀態變更都在 update 內
- [ ] 關卡改動：鎖鏈可達性測試涵蓋（鑰匙拿得到、無死鎖）
- [ ] 視覺改動：readPixels 取樣通過（近牆 <235 不爆白）
- [ ] 發佈前：bump `index.html` 的 `?v=` 與 `#buildtag`（GitHub Pages CDN 快取 10 分鐘，使用者靠版本徽章判斷）
- [ ] 名稱與素材全原創或 CC0（來源記入 assets/*/CREDITS.md），不得使用任何註冊商標詞彙

## 已知陷阱（付過學費，別再踩）

- **開發機瀏覽器常隱藏**：rAF 停、計時器節流、截圖逾時、載入時視窗尺寸全 0——防護已內建（loop 啟動時即依 `document.hidden` 選驅動器、ResizeObserver、resize 拒 0），不要拆。自動驗證用 `window.__zw`：`loop.stop()` 後以 `loop.tick(t)` 同步驅動；**合成 tick 步長用 0.02**（大基準時間下 +1/60 因浮點會得到 0 次更新）、每段測試前 `input.clearTransient()`。
- **Pointer Lock**：Esc 後 ~1.25s 冷卻期內重新上鎖必失敗；錯誤連續 3 次才降級拖曳模式；`requestPointerLock()` 的 Promise 要 catch；暫停中按的 Esc 要 consume 掉再恢復。
- **骨架 .glb 的包圍盒數學不可信**（inverse bind 矩陣會騙人）——外部模型尺寸校正一律走 renderer 內建的剪影探測，別用 Box3。
- **觸控偵測要雙條件**（media query＋maxTouchPoints），單靠 media query 會在部分手機失效。
- UI 面板全鍵盤導航（pointer lock 下沒有游標）；觸控按鈕列用 `.touch-only` class。

## 工作流程

- 測試：`node --test`（全綠才 commit）；本地執行：`npx http-server -p 8125 .`（或 `.claude/launch.json` 的 preview）
- 發佈：GitHub Pages（main 分支根目錄）。PAT 在 Windows 認證管理員；PowerShell 5.1 讀憑證用 cmd 重導向，不要用 PS 管線餵 secret
- commit：每完成一個任務就 commit，繁中訊息
