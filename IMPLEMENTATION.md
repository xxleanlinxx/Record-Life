# 審查建議實作與驗證

更新：2026-09-19（Asia/Taipei）。對應 [CODE_REVIEW.md](CODE_REVIEW.md)。以下為工作目錄的實作，尚未推送或部署到公開網站。

## 介面

依使用者提供的「釜山五日遊旅遊指引.html」調整 **React 與 Streamlit 兩個版本**：奶油色背景、陶土橘主色、襯線標題、彩色每日卡片、圓角資訊區塊。沿用實際旅程、景點、預訂與記帳資料；未將參考檔的釜山行程或大型內嵌資產加入產品。

- Home／Plan／＋ Record／Bookings／Budget 移至上方。React 使用單一、可固定的導覽元件；Streamlit 使用 `streamlit-option-menu`，保留原生頁面路由。
- 首頁每日卡片可直接進入對應日期；長旅程先顯示六天。行程可切換卡片與時間軸。
- React 手機表單改為單欄，預訂時間分組，次要資訊收合；dialog 使用可捲動內容與固定操作區，因應較矮視窗。
- React 保留頁面日期、搜尋、分類與捲動位置，切換旅程時重置；日期列自動顯示選取項。
- 手機主要控制項至少 44px；改善小字、長確認碼、大金額及安全區。配色保留比參考檔更高的文字對比。
- 旅途中首頁先呈現當天安排。首頁「最近記下」依新增序號排序，補登較早日期仍可看見；預算列表維持付款日期排序。

## 正確性與維護性

| 審查項目 | 已實作 |
| --- | --- |
| F1 | 僅修改名稱等非金額欄位時，保留原入帳值、匯率日期及相同成員的分攤比例；另提供明確的平均分攤選項。Python／裝置版均修正。 |
| F2 | 裝置 revision 加入 database epoch；還原建立新 epoch，阻擋還原前表單，即使 trip revision 數字相同。 |
| F3／A4 | Python 與 TypeScript 共用 JSON 測試案例，DST 不存在／模糊時間均拒絕，金額統一 decimal half-up 捨入。 |
| U5 | HTTP 非 JSON 錯誤改為可理解訊息；欄位錯誤能標示並聚焦；刪除亦走相同衝突復原流程。 |
| A1／A2 | Editor 分成六種具體型別表單與 EditorShell，抽出 Settings、AppShell、TripDays；CSS 分檔，Streamlit 樣式也獨立。 |
| A3 | IndexedDB metadata 與 bytes 分開讀取並原子保存；非財務修改僅增加 revision；首頁只取最近 20 筆及分攤；預算支出 SQL 搜尋與每頁 50 筆。 |
| A4 | 提供 typed API facade，兩種儲存 adapter 使用相同 Zod input contracts；表單不再用 any 字典。 |
| A5 | browser schema v1 → v2 migration 在複本進行，保存成功才切換；較新 schema 拒絕開啟。IndexedDB 同時升至 v2。 |
| A6 | 匯出前檢查 50 MB／50,000 列限制，支援單趟旅程匯出、匯入階段提示、重用 prepared statements 與已驗證預覽快照。還原前的安全備份仍匯出所有旅程。 |

保留 SQL 交易、durable 保存後才顯示成功、失敗回滾、submission UUID 去重、跨分頁鎖與 generation CAS。沒有更換前端框架或資料庫。

## 效能基準

2026-09-19，本機 Chromium、未限制 CPU、兩位旅伴，每個規模執行 20 次新增。匯入包含預覽與確認安裝；儲存時間從按下儲存到 dialog 關閉，包含資料重查與 UI 更新。重新開頁保留 HTTP／service-worker 資產快取，故不是首次下載 WASM 的時間。

| 原有支出筆數 | 匯入 | 重新開頁 | 儲存 p50 | 儲存 p95 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 2,493 ms | 942 ms | 150 ms | 397 ms |
| 1,000 | 3,618 ms | 939 ms | 147 ms | 401 ms |
| 5,000 | 6,303 ms | 943 ms | 386 ms | 416 ms |
| 10,000 | 10,116 ms | 951 ms | 390 ms | 412 ms |

重跑：`npm --prefix web run benchmark:device`。原始結果寫入 `artifacts/browser-performance.json`，僅使用測試資料。

這是目前版本的基準，沒有宣稱相較舊版的加速倍數。`performance.memory` 在本次瀏覽器僅回傳粗略值，不包含 DuckDB Worker，因此不能用來證明記憶體峰值。仍需不同旅伴數、各 SQL／快照階段分解，以及低記憶體手機的量測；目前沒有足夠證據要求改用 OPFS 或增量保存。

## 線上儲存

使用者網址為 `https://record-life-xxleanlinxx.streamlit.app/`。本 repo 的 Streamlit 會寫入伺服器本機 `data/record_life.duckdb`，沒有外部持久儲存。Community Cloud 官方明確表示本機檔案不保證保留：[官方說明](https://docs.streamlit.io/develop/concepts/connections/connecting-to-data)。因此不能將現有部署視為永久雲端保存；本次無法由公開頁面讀取工具取得實際執行狀態，也未確認使用者資料消失的時間點。

新增 `Dockerfile.streamlit`／`compose.streamlit.yaml`，供自有主機掛載具名持久 volume，並以 `RECORD_LIFE_DB` 指向該磁碟。Compose 設定已驗證；本機 Docker daemon 未啟動，尚未執行容器建置／重啟驗收。現有 Python 檔案關閉重開保存測試持續通過。

這不會替現有 Community Cloud 網址加上持久磁碟，也沒有搬移或覆寫線上資料。若保留 Community Cloud，還需要選擇並整合外部持久資料庫／儲存。React 的 IndexedDB 仍為各瀏覽器裝置保存，不會跨裝置同步。

## 驗收範圍與限制

本機最終驗證：Python **48 passed**、Vitest **17 passed**、React 裝置 E2E **12 passed／1 skipped**、HTTP E2E **3 passed**、Streamlit E2E **1 passed**。裝置套件跳過的手動效能測試已另行執行通過，結果見上表。正式前端建置與 `git diff --check` 通過。Python 測試僅有第三方套件的棄用提示。

實際手機截圖（本機產物，不納入 Git）：[React 首頁](artifacts/journal-react-home.png)、[React 每日行程](artifacts/journal-react-day.png)、[Streamlit 首頁](artifacts/streamlit-top-option-menu.png)、[Streamlit 每日行程](artifacts/journal-streamlit-day.png)。截圖已人工檢視。

- Python：領域、Streamlit AppTest、API、共用契約及分頁測試。
- Vitest：領域、匯率、共用捨入／DST 契約。
- React 裝置 E2E：CRUD、離線重開、保存失敗、跨頁衝突、備份還原、weighted splits、還原 epoch、v1 migration 失敗保留原始 SHA-256、SQL 分頁及手機導覽。
- HTTP 模式 E2E：CRUD、HTML／JSON 連線錯誤、窄螢幕、無障礙與焦點、編輯衝突。
- Streamlit 瀏覽器 E2E：上方 option menu 五頁切換、記帳、重新整理、日期卡片跳轉。
- 手機尺寸為 Chromium 320／360／390／430px 模擬；仍未驗收實體 iOS／Android、Safari、真實鍵盤與系統文字放大。
- A4 的完整回傳值 runtime schema、所有跨語言規則 parity，及 CSS 全面 mobile-first 整理尚未完成；本次先落實高風險領域規則與清楚模組界線。
