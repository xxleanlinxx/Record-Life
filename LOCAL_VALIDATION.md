# 本機驗證與迭代紀錄

最後更新：2026-09-17（Asia/Taipei）。目前主介面為 React／TypeScript，DuckDB-WASM 在裝置端執行，IndexedDB 保存完整資料庫。

**Local 正式版：http://127.0.0.1:5173/**。已停止先前的開發伺服器與原生 API，由 Vite production preview 提供建置產物，不需要 `8000` API。這是本機驗證入口，尚未公開部署 Vercel。

## 完善程度與實作範圍

可完成建立旅程、景點／餐飲行程、航班／住宿／餐廳預訂、購物轉記帳、外幣花費、分攤、分類預算、搜尋修改／刪除、JSON 備份還原、DuckDB 分析匯出。原 DIM／DWD／DWS SQL 保留；每次有效寫入重建旅程彙總。

這是可供個人使用的裝置版本，包含離線操作與多分頁保護。尚無帳號登入、跨裝置背景同步或多人即時協作。使用者瀏覽器需要自行建立旅程或匯入備份；測試沒有自動覆蓋使用者瀏覽器的資料。

## 迭代與修正

| 輪次 | 檢查與結果 |
| --- | --- |
| 原型修復 | 修正 seed、日期型別、NaN 預訂金額、歧義 SQL、零預算、舊帳重新估值、非原子寫入及外鍵限制；原 Streamlit 回歸完成 |
| 介面重構 | React 手機表單、明確導覽、購物帶入記帳、錯誤保留輸入、未保存提醒、revision 衝突提示；保留選用 FastAPI |
| UI 複查 | 修正 320px 溢出、文字對比、分類進度條偏移、dialog Tab 循環與焦點還原、分帳最小幣值尾差；移除外部字型 |
| 裝置架構 | DuckDB-WASM 真實交易、可匯出檔案、IndexedDB 原子保存；修正虛擬檔案路徑可查詢卻無法導出快照的問題，加入無資料模板 |
| 離線驗證 | 找出 SQL JSON 函數會動態下載擴充套件；改讀 Arrow，停用遠端套件自動載入，快取同來源執行資產 |
| 保存與還原 | 儲存失敗不回報成功，丟棄未保存的記憶體狀態；損壞備份不覆蓋資料；預覽後版本改變需重試；跨分頁新增不遺失 |
| 財務與遷移 | 分類預算失敗回滾、更換本位幣、同日匯率不可覆寫、舊版 JSON 與本機實際備份匯入後比對原始帳本 |
| 最後實跑 | 無 API 的正式 Local 版本連真實匯率供應商，取得 2026-09-16 快照；瀏覽器無 page error、無 `/api` 請求；離線 shell 就緒 |

原 context 刻意保留的路線卡片 bleed 不當作錯誤；可滑動區與整頁溢出分開驗證。

## 最終測試結果

| 驗證 | 結果與範圍 |
| --- | --- |
| TypeScript／Vite | 型別檢查、正式建置與離線資產產生成功 |
| Vitest | **7 passed**：日期、缺匯率、Maps 編碼、分帳尾差、D-1 完整性與拒絕錯誤匯率 |
| Python pytest | **36 passed**：原 Streamlit／服務與 API 回歸，包含交易、匯率、權限、去重及資料持久化 |
| 裝置 Playwright | **6 passed**，正式建置、無 API，完整流程如下 |
| 選用 API Playwright | **3 passed**：完整 CRUD、手機／窄螢幕／鍵盤／axe、設定／幣別／匯出／衝突 |
| 本機實際舊備份 | **1 passed**：另指定 `data/record-life-before-device.json`，在隔離瀏覽器測試匯入、重載與導出 |
| 原生檔案互通 | Python DuckDB 可直接讀取瀏覽器匯出的 `.duckdb`；DWS 日總額與有效支出一致，成員 balance 合計為零 |
| 真實匯率 | Chromium 未 mock 的 Frankfurter 請求成功，介面顯示來源及 D-1 `2026-09-16`；另驗證 CORS 與六幣別覆蓋 |

裝置端六條流程：

1. 建立旅程、景點、購物記帳、跨時區航班、修改／重載／刪除、JSON／DuckDB 下載、還原與損壞資料拒絕。
2. 關閉分頁再開、完全離線重載與記帳、390px 設定頁與 axe。
3. 兩個分頁的舊編輯衝突、同時新增皆保留。
4. 模擬 IndexedDB 容量不足，表單保留，另一頁仍讀到完整舊帳；重試只新增一次。
5. 原生舊版 JSON 進入 browser DuckDB，保留表列數、匯率日期及入帳額，彙總重建。
6. 超額分類預算回滾、本位幣 TWD → USD、原始幣別與因子保留、匯率供應商改同日數值不覆寫舊快照、換幣後備份再還原。

一般 E2E 使用 SQL seed 產生的公開測試資料，與本機資料分離。實際備份遷移額外確認 **1 趟旅程、4 位旅伴、10 筆支出、20 個行程、7 筆預訂、5 個購物項目**；沒有改寫原 `data/record_life.duckdb`。二進位輸出也以 native DuckDB 讀回比對。

## 可重現指令與產物

```bash
npm --prefix web test
.venv/bin/python -m pytest -q
npm --prefix web run test:e2e
npm --prefix web run test:device
```

兩組瀏覽器測試都會建置 `web/dist`，請依序執行，不能同時建置到相同目錄。最後跑裝置模式，讓留下的正式建置為預設個人版。

- 裝置流程：`artifacts/device-e2e.log`
- 選用 API 流程：`artifacts/server-e2e.log`
- 實際備份遷移：`artifacts/actual-migration.log`
- 新版桌面預算：`artifacts/v3-desktop-budget.png`
- 新版手機首頁：`artifacts/v3-mobile-home.png`
- 手機備份頁：`artifacts/device-mobile-settings.png`
- 匯出互通檢查：`artifacts/device-export.duckdb`、`artifacts/device-legacy-import.duckdb`

截圖已開啟複查；長截圖中的固定導覽位於拍攝當下的 viewport 底端，實際畫面會隨捲動固定在螢幕下方。`data/`、`artifacts/` 及 Playwright 報告／私有遷移輸出都排除於 git 與前端公開資產之外。

## 驗證界線

- 使用專案 Playwright 的獨立 Chromium；未操作使用者既有瀏覽器分頁。
- 通過手機尺寸、320／768／1440px 響應式與鍵盤／axe 掃描，尚未使用實體 iOS／Android 或 Safari／Firefox 驗收。
- 離線須先完成一次線上載入與 shell 快取。Maps、下載新匯率需要網路；清除網站資料可能移除帳本，備份仍必要。
- 資料引擎初次下載與全檔快照有成本；尚未做大資料量與低記憶體手機壓力測試。JSON 匯入上限為 50 MB／50,000 列。
- Vercel 設定與 CI 已提供，尚未執行公開部署或遠端 CI。只完成本機建置與驗證。
- 上游 Python TestClient／anyio 與本機 Node 26 有 deprecation 提示；測試通過，建議開發／CI 使用 Node 22。
