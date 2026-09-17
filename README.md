# Record Life

以手機操作為主的個人旅行手帳：行程、航班／住宿／餐廳、購物、外幣記帳與旅伴分帳。新版使用 **React + TypeScript + DuckDB-WASM**，資料保存在自己的瀏覽器；可直接部署到 Vercel，不需要 API 或雲端資料庫。

保留 **DuckDB 與 DIM／DWD／DWS**，不是用 JSON 陣列模擬資料庫。IndexedDB 保存完整 DuckDB 二進位快照；設定頁可匯出 JSON 備份並還原，也可另存 `.duckdb` 分析檔。原 Streamlit／FastAPI 版本保留為選用模式。

## Local 啟動

使用 Node.js 22+ 與 npm。純前端模式不需要 Python。

```bash
npm ci --prefix web
npm --prefix web run build
npm --prefix web run preview -- --port 5173
```

開啟 **http://127.0.0.1:5173/**。首次可建立旅程、載入範例或匯入舊版 JSON。首次載入需下載資料引擎，稍候完成即可；正式版本會快取應用程式，設定頁顯示「離線快取已就緒」後可離線重開及記帳。匯率更新與外部 Google Maps 仍需網路。

開發熱更新：`npm --prefix web run dev`。開發模式不安裝離線快取；離線驗證請用上面的正式建置。也可用 `.venv/bin/python scripts/dev.py` 啟動純前端開發模式。

## 使用流程

- **總覽**：查看旅程進度、可用預算、最近安排，隨時記一筆花費。
- **行程**：按日期安排景點、交通與餐飲；地點直接連到 Google Maps。購物清單可一鍵帶入記帳。
- **預訂**：航班、住宿、餐廳分開查看，保存確認碼與各地當地時間／時區。預訂價格不會重複算成已付支出。
- **預算**：分類／每日花費、搜尋與修改支出、付款人與分攤、結算建議。
- **設定**：日期、總額與分類預算、旅伴、本位幣、匯率、裝置備份與還原。

支援 TWD／USD／EUR／GBP 本位幣，以及 JPY／KRW 支出。每筆支出固定入帳匯率與日期；更新匯率不重算舊帳。更換本位幣會換算預算與入帳額，保留原始交易與幣別變更紀錄。編輯失敗會保留輸入；舊分頁修改發生衝突時，提供重新載入選項。

## 裝置保存與備份

1. 在設定頁選擇「匯出 JSON 備份」，存到自己管理的資料夾。
2. 換裝置或瀏覽器時選「匯入備份」，先查看旅程與筆數，再確認取代。**還原會取代該瀏覽器現有全部旅程**；可在確認視窗先備份。
3. 損壞或不相容的備份會被拒絕；驗證、儲存失敗不改動原資料。
4. 「另存 DuckDB 檔」供 DuckDB／Python 分析，UI 還原使用 JSON。

資料以網站來源（協定、網域、port）區分：`localhost`、`127.0.0.1` 與 Vercel 網址各有自己的資料，不會自動同步。瀏覽器可能清理網站儲存空間；「允許持久保存」可提出保留請求，但仍需定期匯出，避免清除網站資料或無痕模式造成遺失。[MDN 儲存政策](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

本機原生資料庫仍在 `data/record_life.duckdb`。這次另存的舊版 JSON 為 `data/record-life-before-device.json`，可手動選取匯入；不會把私人資料放進前端建置。原冷備份 `data/record_life.pre-v2.duckdb` 也保留。

## 匯率、地圖與資料分層

以台北 D-1 為上限，先向 Frankfurter 歷史 API 取得 USD 基準、包含 TWD 的完整快照，符合日期限制的 open.er-api.com 為備援。假日使用最近可用日並顯示真實日期。無網路時沿用快照；沒有外幣匯率時可先以本位幣記帳。

Google Maps 使用編碼後的地名、城市與選填 Place ID 產生搜尋／路線連結，不需 API key，不估造即時車程。

| 層級 | 顆粒度 |
| --- | --- |
| DIM | 旅程、旅伴、幣別、每日匯率、地點、分類、分類預算 |
| DWD | 支出與分攤、行程、預訂、購物、幣別變更事件 |
| DWS | 旅程／日、旅程／分類、旅程／成員 |

SQL 定義在 `sql/`。業務寫入與 DWS 更新同一交易完成，完整快照成功保存後才通知 UI。跨分頁使用序列化寫入、版本檢查及保存時的版本比較，避免互相覆寫。

## Vercel

專案 Root Directory 設為 **`web`**，開啟 **Include source files outside of the Root Directory in the Build Step**，讓建置可讀取共用 `sql/`；沿用 `web/vercel.json`。[Vercel 設定說明](https://vercel.com/docs/monorepos/monorepo-faq)

不需設定 `VITE_API_URL` 或資料庫密碼；刪除之前 server 模式的環境變數後重新建置。Vercel 只提供靜態程式與 WASM，旅程保存在各使用者裝置。SPA 深層路由與離線快取已配置；本次尚未實際公開部署。

## 驗證與擴充

```bash
npm --prefix web test
cd web
npx playwright install chromium
npm run test:device
```

裝置 E2E 會自己建置、在 `5176` 啟動正式預覽，以獨立 Chromium 資料測試完整 CRUD、離線、還原、舊版遷移、儲存失敗與分頁衝突，不啟動 API。測試資料不寫入使用者瀏覽器。

選用後端回歸：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm --prefix web run test:e2e
```

CI 會執行兩種模式。詳見 [架構決策](ARCHITECTURE.md) 與 [本機驗證紀錄](LOCAL_VALIDATION.md)。目前針對個人資料量，尚無跨裝置背景同步；真實 iOS／Android 裝置仍需額外驗收。

## 選用原生 DuckDB API／Streamlit

需要原生 Python 分析或舊版使用流程時：

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python scripts/dev.py --server
```

此模式前端連 `8000` API，使用 `data/record_life.duckdb`，與瀏覽器裝置資料獨立。遠端 API 可透過 `VITE_STORAGE_MODE=server` 與 `VITE_API_URL=https://你的-api-網域` 選用，需自行配置持久磁碟、HTTPS、`RECORD_LIFE_API_TOKEN` 及 `RECORD_LIFE_ORIGINS`。密碼不可放進 `VITE_*`。API 採單一 process，不能讓多個 worker 共寫檔案。

要啟動原 Streamlit，先停止同檔案的 API，再執行 `.venv/bin/python -m streamlit run app.py --server.address 127.0.0.1`。此路徑需安裝 `requirements.txt`。
