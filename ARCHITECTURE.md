# Record Life v3：個人裝置優先的架構

## 選擇與取捨

依目前「個人使用、裝置保存、可匯出、保留 DuckDB」需求，主路徑採 **React + TypeScript + DuckDB-WASM + IndexedDB**。Vercel 只需提供靜態前端。旅程不需經過 API，也沒有伺服器資料庫管理成本。

React 適合目前的手機表單、抽屜、局部更新、導覽狀態、鍵盤焦點與錯誤重試。Streamlit 仍適合 Python 分析介面，原版保留，但不再作為主要互動介面。此決定依據產品需求與已完成的本機測試，不表示 Streamlit 無法使用 HTML／CSS。

DuckDB 在 Web Worker 中執行，使用真實 SQL、交易與分層資料表。WASM 與 Worker 都隨網站部署，不依賴外部 CDN。初次引擎檔約 34 MB、gzip 約 7.8 MB，啟動與整檔快照會比小型 IndexedDB CRUD 更重，換取與原生 DuckDB 一致的分析格式與保留分層需求。[DuckDB-WASM 啟動方式](https://duckdb.org/docs/current/clients/wasm/instantiation)

## 模組邊界

| 模組 | 責任 |
| --- | --- |
| `web/src/features/` | 總覽、行程／購物、預訂、預算、表單 |
| `web/src/components/` | 共用控制、dialog、裝置備份操作 |
| `web/src/lib/api.ts` | 相同 UI 契約，切換裝置或選用 HTTP 模式 |
| `web/src/lib/device/engine.ts` | Worker、SQL 參數、Arrow 結果轉換、DuckDB 檔案讀寫 |
| `device/persistence.ts` | IndexedDB 原子快照保存及 generation 比較 |
| `device/store.ts` | 分頁鎖、交易與保存順序、重新載入、UI 契約 |
| `device/services.ts`、`contracts.ts` | 業務驗證、日期／時區、記帳、分攤、幣別轉換 |
| `device/schema.ts`、`sql/` | 共用 DIM／DWD／DWS 定義、版本、彙總重建 |
| `device/fx.ts` | D-1、完整快照、來源驗證與外部請求 |
| `device/backup.ts` | JSON 格式與關聯驗證、隔離匯入、彙總重建 |
| `web/scripts/build-offline.mjs` | 版本化應用程式快取；不快取使用者資料 |
| `api/`、`core/`、`screens/` | 保留原生 Python API 與 Streamlit 選用路徑 |

裝置端和 Python 共用 SQL 與資料格式，但業務服務分別以 TypeScript／Python 實作，並非同一份執行程式。新增規則時需保持契約一致，執行兩種模式的測試。後續若只維護個人版，可將 Python 縮減為分析／遷移工具，避免長期維護兩套互動服務。

## 保存流程與一致性

1. 同一分頁先排隊；支援 Web Locks 時，以同來源的命名鎖串行化多分頁操作。
2. 讀取 IndexedDB 的 generation。如其他分頁已保存新資料，重開最新 DuckDB 快照。
3. DuckDB `BEGIN` → 驗證／寫 DWD／更新 DWS／增加旅程 revision → `COMMIT`。
4. `CHECKPOINT` 取得完整 `.duckdb` 位元組，在單一 IndexedDB readwrite 交易中比較 generation 並取代快照。
5. **IndexedDB 交易完成後**才回傳成功及通知其他分頁重新讀取。

generation 比較也防止不支援 Web Locks 的瀏覽器發生遺失更新；此時一個寫入可能收到衝突，需重試。若步驟 4 因容量或版本衝突失敗，丟棄記憶體引擎，下次重開上一份 durable 快照。若步驟 3 失敗則回滾 SQL。關閉分頁發生在保存前，該操作不保證完成，UI 也不宣告完成。

裝置端修改／刪除檢查 `database epoch:trip revision`；還原建立新 epoch，避免還原後 revision 數字相同而放行舊表單。Python API 仍使用數字 revision，未提供原地還原入口。新增支出使用 submission UUID 防重複。購物轉記帳與關聯同步更新；作廢／修正保留歷史支出。結算將最小幣值尾差按最大餘額分配，應收／應付與轉帳建議使用同一份結果。

瀏覽器裝置保存不是跨裝置同步。origin、瀏覽器 profile 與無痕工作階段各自獨立。持久保存請求由瀏覽器決定，不取代可攜備份。[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)、[儲存空間與清理規則](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 匯入、分析與版本

JSON 備份保留 13 張 DIM／DWD 表及 schema 格式版本 1。匯入先在另一個引擎驗證資料型別、必備欄位、外鍵、旅程範圍、金額、分攤與預訂時間，重建 DWS，再於確認時原子取代快照。預覽保留已驗證的二進位快照，確認時直接安裝，避免重複解析及匯入。確認期間原資料有變動會拒絕還原，要求重新預覽。限制為 50 MB 檔案及總計 50,000 列，避免大型檔案佔滿個人裝置記憶體。

`.duckdb` 匯出是實際資料庫，可用原生 DuckDB 開啟；不是 JSON 改副檔名。JSON 供跨版本／跨裝置還原，DWS 不直接信任外部輸入。JSON 日期使用 ISO 字串，稽核 timestamp 輸出為毫秒精度；二進位匯出保留資料庫原精度。

目前 browser schema 為 2，新增 `app_metadata` 保存 epoch。開啟既有 v1 快照時，先在私人引擎複本中執行版本遷移，成功保存後才啟用；拒絕較新版本。IndexedDB 升至 v2，在同一交易保存 metadata 與完整 bytes，未變動的讀取僅取 metadata；舊版 IndexedDB client 不再能寫入新版 store。JSON 可攜格式維持 v1。預設資料庫模板不含使用者資料。`empty-db.bin` 由 `scripts/generate_browser_template.py` 以 DuckDB storage v1.3 格式建立；正常開發／部署無需 Python 重建。WASM npm 版本固定為 1.32.0。升級 engine 或 schema 時，需先以複本測試舊快照、備份還原及原生工具相容性，再新增明確版本遷移，不能對既有資料重跑初始化。

## 匯率、地點與離線

- 台北 D-1 截止，Frankfurter 歷史快照為優先，open.er-api.com 僅在日期與完整性符合時備援。無法更新就保留原快照並顯示日期。
- 同日已保存快照不被後續來源改值覆寫；支出固定換算因子與匯率日。更換本位幣另存事件，原幣、原金額與原始換算因子保留。
- 航班時間以 IANA 時區轉 UTC 比較；DST 不存在或重複時間要求使用者改用明確時間。
- Maps 使用外部搜尋／路線 URL。只有使用者點選時才將地點交給 Google Maps；更新匯率僅送幣別及日期。
- 正式建置快取所有執行資產。關閉自動安裝／載入 DuckDB 擴充套件，SQL 結果直接讀 Arrow，避免 JSON 擴充套件偷偷產生網路依賴。
- 導覽先取線上版本，離線時回到已快取 shell。保留上一版快取供開著的舊分頁讀資產。開發模式移除本應用的 shell 快取，不刪除 IndexedDB。

## 部署與擴充邊界

Vercel Root Directory 選 `web`，並開啟 **Include source files outside of the Root Directory in the Build Step**，讓建置讀取共用 `sql/`。沿用 `web/vercel.json`，不設定 `VITE_API_URL`；不需要 serverless DB 寫檔。[Vercel monorepo 設定](https://vercel.com/docs/monorepos/monorepo-faq)

本版本定位個人旅行資料量。已加入可重跑的 100／1,000／5,000／10,000 筆 Chromium 基準，結果與限制見 [IMPLEMENTATION.md](IMPLEMENTATION.md)。尚未完成低記憶體實機壓力驗證。每次保存複製整份 DuckDB；資料量成長時，應先量測快照時間與記憶體，再評估 OPFS／增量保存，不能直接假設目前效能適合大型帳本。

日後增加多裝置同步，需另設同步日誌、版本／衝突模型、授權與備份機制；不能把 IndexedDB 快照上傳當作多人合併。選用原生 API 可供可信任的共用資料庫，但仍是單一 process，未實作帳號級租戶隔離。這些都不是目前已完成的功能。

已完成 Chromium 桌面與手機尺寸驗證；尚未以 Safari／Firefox 或實體手機驗收，也尚未公開部署 Vercel。

## 介面與讀取範圍

React 的 AppShell 管理頂端五項導覽；Settings 與六種具體型別表單各自獨立。EditorShell 保留共用的 dirty／busy／刪除／錯誤／衝突處理。輸入契約集中在 `lib/contracts.ts`，typed API 方法在 device／HTTP 兩模式共用；跨語言捨入與 DST fixture 位於 `tests/fixtures/domain.json`。

首頁與頁面概要使用 `?summary=1`，僅取最近 20 筆支出及對應分攤。Budget 的 `/trips/{id}/expenses` 使用 SQL 搜尋、分類與固定每頁 50 筆；編輯時攜帶該查詢的 revision 與分攤。完整旅程 GET 保留供既有 API 使用者相容。行程、預訂與購物等非財務異動只更新 revision；財務異動才重算 DWS。

首頁最近紀錄依單調遞增的 expense_id 排序；補登較早付款日期仍會出現在首頁。預算列表依付款日期排序。修改名稱／分類等非金額欄位保留入帳金額、原匯率及相同成員的分攤比例；明確改成平均分攤或改動成員才重新分配。

Streamlit 同樣使用頂端 option menu、每日卡片與暖色旅遊手帳主題，仍透過既有 Python 服務寫入伺服器資料庫。它不會讀取 React 的 IndexedDB；Streamlit Community Cloud 不提供此本機檔案的持久保證。`compose.streamlit.yaml` 提供自有主機上的持久 volume 設定，並非已完成雲端遷移。
