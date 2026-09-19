# Record Life repository review

審查日期：2026-09-18。範圍包含 React／TypeScript 主介面、DuckDB-WASM／IndexedDB、Python API／Streamlit、SQL、測試、CI 與部署設定。

本文件記錄 2026-09-18 的審查基準；後續實作與驗收狀態見 [IMPLEMENTATION.md](IMPLEMENTATION.md)。審查當下未修改應用程式邏輯。效能項目是依讀寫路徑分析的風險，並非已完成的大量資料壓測結果。

## 整體判斷

現有程式已具備可使用的個人版基礎：畫面按功能分開、資料層有明確責任、保存失敗不假裝成功、一般跨分頁編輯有衝突保護，還有真正執行的端到端測試。建議保留這些設計，採取漸進改善。

目前尚不能認定「手機直式 UX 已完善」或「可以低成本持續擴充」。主要原因是小字與長表單、過度集中的編輯器、讀寫整份資料的成本，以及 TypeScript／Python 業務規則已出現差異。

| 面向 | 判斷 | 主要依據 |
| --- | --- | --- |
| 手機基本排版 | 已有基礎 | 底部導覽、bottom sheet、窄螢幕規則與溢出測試 |
| 手機日常操作 | 仍需改善 | 9–12px 關鍵資訊、長表單、首頁內容排序、日期狀態不保留 |
| 程式可解釋性 | 局部良好，核心元件偏複雜 | domain／persistence 分層清楚，但 Editor 集中六種工作流程且使用 any |
| 功能擴充 | 中等 | 頁面有邊界，新增功能仍牽動表單、路由分派及兩份服務契約 |
| 資料量擴充 | 限於目前個人版定位 | 完整快照讀寫、整趟 Bundle、未分頁支出清單 |
| 多人／多裝置擴充 | 尚未具備 | 本機保存；選用 API 為單程序、共用資料庫，沒有帳號隔離及同步模型 |

## 驗證證據與限制

本次重新執行，全部通過：

| 指令 | 結果 |
| --- | --- |
| `npm --prefix web test` | 7 passed |
| `npm --prefix web run check` | TypeScript 通過 |
| `.venv/bin/python -m pytest -q` | 36 passed；2 個套件棄用警告 |
| `npm --prefix web run test:device` | 6 passed，包含 CRUD、離線、備份還原、衝突及儲存失敗 |
| `npm --prefix web run test:e2e` | 3 passed，包含手機表單、窄螢幕、鍵盤及 axe |
| `npm --prefix web run build` | 通過；測試後已重新建置回預設裝置模式 |

另外以記憶體 DuckDB 及 Node 執行邊界案例，未使用個人資料庫。已重現「只改名稱使支出重新估值」、Python／TypeScript DST 與捨入差異、不等比例分攤被改成平均，以及還原時 revision 重用的 SQL 機制。

已人工查看本次測試產生的 [390px 首頁截圖](artifacts/v2-mobile-home.png)、[記帳表單截圖](artifacts/v2-mobile-record.png)、[裝置設定截圖](artifacts/device-mobile-settings.png)。檔名的 v2 是既有測試命名，本次執行已重新產生。這些是 full-page 截圖，固定導覽出現在原始 viewport 底部，不應把它在長截圖中的位置誤判為頁面中段的排版錯誤。

Browser 互動工具本次沒有可用連線；上述畫面與瀏覽器結果來自 repo 現有 Playwright 測試。測試使用 Chromium，手機檢查主要是改 viewport；沒有驗證實際 iOS／Android 軟鍵盤、Safari、系統放大文字、低記憶體裝置或慢速網路。沒有做正式部署驗證。

## 優先修正的行為問題

### F1／P1：只修改支出名稱，也會改動已入帳金額

位置：`web/src/lib/device/services.ts:262`、`core/services.py:119`、`web/src/features/Editor.tsx:221`。

修改支出與新增支出共用 `saveExpense`／`save_expense`。即使 amount、currency 完全相同，仍取得最新匯率，作廢舊紀錄並重新入帳。這不是單純更新匯率就改舊帳，而是編輯任意欄位時觸發重新估值。

實際重現：原本 JPY 1,500，以 USD/TWD=32、USD/JPY=150 入帳 NT$320；新增下一日 JPY=160 的匯率後，只把 Lunch 改成 Lunch renamed，金額變成 NT$300。Python 服務已直接重現，裝置版程式有相同流程。

建議明確分開「修改描述／分類／付款人／分攤」與「變更交易金額／幣別」。前者保留原入帳金額、匯率日期及相關紀錄；後者才依明確規則換算，並讓使用者看到變化。仍可保留作廢舊紀錄、建立新版本的歷史追蹤設計。

同一流程還有延伸問題：備份驗證接受有效的不等比例 share，但 Editor 只保留 member_id，儲存服務再一律寫入 `1 / split.length`。75%／25% 的紀錄只改名稱後會變 50%／50%。目前 UI 只提供平均分攤，不代表匯入資料可以被靜默改寫；應保留既有比例，或明示轉為平均分攤。

驗收：更新匯率後，只改名稱／分類不能改變 amount_home 或原匯率；匯入不等比例分攤後，只改名稱也不能改變 share。

### F2／P1：備份還原會重設 revision，存在舊表單誤通過衝突檢查的情境

位置：`web/src/lib/device/schema.ts:22`、`web/src/lib/device/backup.ts:72`、`web/src/lib/device/store.ts:226`、`web/src/lib/device/services.ts:31`、`web/src/features/Editor.tsx:134`。

備份不包含 `app_trip_revision`；匯入時新建該表，再對每個旅程執行 refresh，revision 從 1 開始。Editor 保存開啟時的 revision，修改時只比較這個數字。

具體情境：A 分頁在 revision=1 時開啟旅程設定；B 分頁還原含相同 trip_id、不同內容的備份，revision 仍為 1。A 再儲存舊表單，revision 比較可能通過。revision 大於 1 時通常先產生衝突，但還原後版本再增長至相同值仍會碰撞。

目前 generation 比較保護的是快照寫入競爭。`current()` 會先載入還原後的 generation，因此它不能代表「這個表單是否建立於還原之前」。本次以 SQL 重現 revision 1 → 還原後 1 的機制；完整跨分頁 UI 情境尚未新增測試。

建議給資料庫加入還原時才更換的 epoch，編輯版本由 epoch＋trip revision 組成。避免把每次一般寫入都變動的 generation 直接當表單版本，造成不相干的新增也被拒絕。

驗收：還原前開啟的表單，還原後必須拒絕覆寫；原本允許的兩分頁同時新增仍要成功。

### F3／P1：Python 可建立裝置版無法接受的 DST 預訂

位置：`core/services.py:170`、`web/src/lib/device/services.ts:335`、`web/src/lib/device/backup.ts:132`。

Python 用 `replace(tzinfo=ZoneInfo(...))` 附加時區；裝置版用 Temporal 的 `disambiguation: "reject"`。兩者對夏令時間不存在／重複的當地時間採不同政策。

實際重現：`2026-03-08 02:30 America/New_York` 的預訂，Python 可成功寫入，裝置端 Temporal 拒絕。這筆資料也可能讓 Python 匯出的整份 JSON 在裝置端還原時遭到拒絕。

建議兩端採相同政策，並共用測試 fixtures：一般跨時區航班、春季不存在時間、秋季重複時間。若要支援模糊時刻，契約需明確保存 offset 或 disambiguation 選項。

## 手機直式 UI／UX

### U1／P2：為了縮小畫面，縮小了使用者需要閱讀的資訊

位置：`web/src/styles.css:1996`、`:2057`、`:2107`、`:2277`。

手機支出名稱／金額為 12px，付款人／日期／原幣為 9px；行程時間 10px；表單標籤 11px、提示 9px。購物勾選按鈕縮為 36×36px，部分 icon button 寬度降為 36px。

建議以產品規格統一：主要資訊約 15–16px、必要次要資訊約 13–14px，主要觸控區至少 44×44px；這是本次建議的設計目標，不把所有小於 44px 的元素直接判成無障礙規範違規。優先減少重複裝飾與資訊密度，保留重要資訊的閱讀尺寸。

驗收涵蓋實際大小的手機畫面與放大文字，不只檢查頁面 scrollWidth。

### U2／P2：常見手機寬度仍把複雜表單排成兩欄

位置：`web/src/styles.css:1514`、`:2234`、`:2341`；`web/src/features/Editor.tsx:522`。

`.form-grid` 直到 360px 以下才改單欄。因此 375／390／430px 的手機預訂表單，datetime-local、時區、預訂名稱仍各佔約半欄。日期時間是長內容，縮窄後難以核對；原生控制在 Safari 的實際呈現仍需實測。

預訂表單同時攤開十多個欄位。起訖時間與時區應成組顯示，住宿可共用一個時區；代碼、平台、金額、備註可按必要性分組或漸進展開。金額＋幣別、短日期＋短選項可保留有意義的雙欄，不需要全站一律單欄。

sheet 高度以 `90dvh/94dvh - 固定像素` 計算。標題換行、文字放大或鍵盤打開時，需要重新確認內容捲動與保存按鈕可見；目前測試沒有軟鍵盤證據。建議用可伸縮的 header／body／footer 結構減少固定高度扣除。

### U3／P2：首頁首屏與「旅行當下」的任務優先序不一致

位置：`web/src/styles.css:1921`、`web/src/features/Overview.tsx:73`。

手機 CSS 將預算區塊排到行程之前。本次 390×844 截圖中，頁首、旅程介紹與完整預算卡佔了大部分首屏，行程內容在下方。旅途中最常需要的下一站、時間與地圖不能立即看到。

建議依旅程狀態安排首頁：行前保留旅程準備與預算；旅行中先顯示今日／下一站與地圖，預算縮成摘要；旅後顯示花費與結算。使用現有 phase 函式即可，無需增加複雜狀態管理。

目前手機以 CSS order 調整視覺順序，但 DOM 仍先行程、後預算。重排時也應讓 DOM／鍵盤／閱讀順序保持一致。

### U4／P2：切頁後找不到剛才的日期與篩選

位置：`web/src/features/Plan.tsx:34`、`:76`、`web/src/features/Budget.tsx:29`、`web/src/App.tsx:55`、`:315`。

Plan 的日期／購物模式、Budget 的搜尋／分類、Bookings 的類型都放在頁面本身的 useState。切頁後元件卸載，返回時重設；App 又把捲動位置歸零。比如正在看 Day 5，去查看預訂再回來，會回到 phase 預設日期。

day rail 也沒有把目前選取日期捲入可視範圍。較長旅程進入 Day 7 以後，內容可能是第 7 天，但日期列最初還顯示前幾天。

建議用 URL search params 保存適合分享／返回的狀態，例如 `/plan?day=5&view=days`，並在初始化／日期變更時讓選取項目進入可視範圍。保存必要的捲動位置；不需為此增加全域狀態套件。

### U5／P2：錯誤處理保住輸入，但仍不夠可操作

位置：`web/src/lib/device/store.ts:198`、`web/src/lib/api.ts:35`、`web/src/components/DeviceVault.tsx:83`、`web/src/features/Editor.tsx:301`。

ZodError 一律變成「請確認必填欄位、日期與金額格式」，長表單無法知道該改哪裡。HTTP 回應直接 `response.json()`，代理伺服器回傳 HTML／空內容時，會顯示低層解析錯誤。匯入 inspect 的 catch 又把大小超限、格式、資料驗證等原因全部隱藏成同一訊息。

另有較具體的不一致：submit 收到 409 會提供「捨棄變更並載入最新資料」；delete 的 catch 只設 error，不設 conflict，因此舊分頁刪除遭拒後沒有同樣的復原入口。

建議錯誤契約包含 code、message、fieldErrors；表單把錯誤放到相關欄位並定位第一個錯誤。匯入使用持續顯示的錯誤區，區分不相容版本／超限／關聯問題；新增、修改、刪除共用衝突復原流程。

### U6／P3：補齊長內容與安全區的邊界

位置：`web/src/styles.css:1052`、`:1095`、`:1116`、`:1788`、`:1827`、`:1833`。

預訂代碼允許 240 字元，顯示容器沒有對應換行／截斷策略；大金額、長航空公司及時區名稱也應測試。這是尚未由現有短資料測試覆蓋的溢出風險，並非本次已實機重現的缺陷。

底部導覽高度包含 safe-area-inset-bottom，但 workspace padding 固定 74px，toast bottom 固定 95px。建議由同一個 CSS 變數計算導覽、內容保留空間與通知位置；目前 footer 留白可能吸收部分高度，不應直接聲稱最後一筆資料一定被遮住。

## Scalability 與程式簡化

### A1／P2：Editor 的共用方式削弱了型別與可解釋性

位置：`web/src/features/Editor.tsx:20`、`:147`、`:213`。

Editor 751 行，同時處理支出、行程、預訂、購物、旅程設定及換本位幣；初始化、欄位呈現、序列化、刪除與衝突分散於多段條件判斷。`Record<string, any>` 與 `change(key: string, value: any)` 使 strict TypeScript 無法約束欄位拼字、數值型別與表單種類。

新增一種欄位或修改現有契約，需要同時記住 initial、JSX、submit 中的資料轉換，容易出現只改一半的問題。檔案長度是症狀，責任交錯及失去型別才是核心。

建議按領域拆成 ExpenseForm、ActivityForm、BookingForm、ShoppingForm、TripForm、CurrencyForm。共用 EditorShell 處理 modal／dirty／busy／error／delete confirmation，各表單使用明確的 input model 與 schema，並在送出邊界轉換字串數字。

只抽出重複且穩定的 CurrencySelect、PlaceFields 等元件。保留各表單可直接閱讀的 JSX；不需要建立動態表單 DSL、通用 entity framework 或大量自訂 hooks。

### A2／P2：App 與全域 CSS 集中太多責任

位置：`web/src/App.tsx:34`、`:390`、`web/src/styles.css`。

App 546 行，同時負責導覽、旅程選擇、載入／登入／onboarding、匯率更新、寫入通知，以及完整 SettingsPage。styles.css 2,424 行，主要採桌面規則加多層 media override，最後又補上 sheet 修正。

建議先抽 SettingsPage、AppShell、少量資料讀寫 hooks；導覽 metadata 與頁面對應集中管理。CSS 拆成基礎 tokens、layout、共用元件及 feature 樣式，讓手機預設規則靠近元件，桌面再擴展欄數。

保留 React Query、現有 Router 及原生 dialog。此規模不需要新增 Redux、微前端或換整套 CSS framework。Python 多處一行塞入驗證／SQL／回傳，也應格式化與命名改善；減少行數不等於比較簡單。

### A3／P2：資料存取成本隨完整資料庫與旅程一起增長

位置：`web/src/lib/device/store.ts:28`、`:50`、`:70`、`web/src/lib/device/persistence.ts:17`、`web/src/lib/device/schema.ts:33`、`web/src/App.tsx:76`、`web/src/features/Budget.tsx:39`、`:234`。

目前的成本鏈：

1. 每次 localRequest 呼叫 current，先從 IndexedDB 讀出包含完整 bytes 的 snapshot，才比較 generation。即使只是讀取、generation 未改，也會取得整份 payload。
2. 各類寫入，包括行程／預訂／購物，普遍呼叫 refresh 重建該旅程三張 DWS，部分操作其實不改變財務彙總。
3. 保存執行 CHECKPOINT、複製完整 DuckDB、原子保存完整 IndexedDB snapshot。
4. UI invalidate bootstrap 及 trip，重新取得所有支出、splits、行程、預訂、購物及摘要。
5. Budget 在前端搜尋所有支出，並一次 render 所有符合紀錄。

這對目前個人資料量是清楚且可靠的設計，但不能把 DuckDB 的分析效能等同於整個 UI 的擴充能力。所有步驟串行排隊也會放大慢寫入對其他讀取的影響。

改善順序：先記錄讀快照、SQL、DWS、複製／保存、重新查詢各段時間；再把 metadata 與 bytes 分開讀取且維持原子版本檢查，依 mutation 精準更新受影響資料，支出查詢加入分頁／搜尋條件。revision 更新應與財務 DWS 重建分開，避免為了版本號重算所有摘要。

以 100／1,000／5,000／10,000 筆支出及不同旅伴數測量冷啟動、保存 p50／p95、記憶體與匯入時間。只有量測證明整檔保存成為瓶頸後，再評估增量保存或其他持久化方式；先保住現有交易、durability 和衝突保護。

### A4／P2：API 共用外觀，不等於共用型別契約

位置：`web/src/lib/api.ts:7`、`:49`、`web/src/lib/device/store.ts:152`、`web/src/lib/device/contracts.ts`、`api/models.py`、`core/services.py`。

`api.write(path: string, body: unknown, method: string)` 讓呼叫端自己組 URL／payload，裝置版再拆字串分派。Zod 驗證存在，但位於實作內部；Editor 並未取得它的編譯期保護。回傳端 `as T` 也只是宣告，不是執行期驗證。

TypeScript 與 Python 各自實作規則，已重現 DST 差異；金額 1.005 也會在 Python 得到 1.00、TypeScript 得到 1.01。一般 UI 的 step=.01 限制了部分入口，但 API／匯入／未來功能仍需要明確政策。Python TWD 顯示整數、React 可顯示兩位，資料表的 minor_units 也未成為共同依據。

建議提供明確方法，例如 `saveExpense(tripId, input, version)`、`updateBooking(...)`，讓 device／HTTP adapter 實作同一介面，HTTP 字串只留在 adapter。TypeScript input type 可由 schema 推導。

跨語言部分先採共用 JSON fixtures 與契約測試，對比合法／非法輸入、錯誤碼、DST、捨入、分攤、原入帳金額及備份往返。若 Python 僅為歷史相容用途，明確限制新增功能範圍；若持續支援完整產品，就必須把兩端一致性納入 CI。

### A5／P2：schema version 已記錄，但裝置啟動尚無遷移入口

位置：`web/src/lib/device/store.ts:31`、`web/src/lib/device/schema.ts:22`、`web/src/lib/device/backup.ts:14`。

目前只在沒有 snapshot 時 initialize；載入既有 snapshot 後沒有查詢 schema_version、檢查較新版格式，或依版本執行 migration。JSON 也只接受 version=1。這不代表現有 v1 不能使用，而是下一次新增欄位／更動 SQL 時缺少安全的升級流程。

建議在 open 時加入明確版本檢查與序列化 migrations，於複本完成升級、驗證及保存後才切換。維持舊 schema／舊備份 fixtures；搭配 service worker 舊分頁仍可能執行舊程式的情況測試。不能對已存在資料庫直接重新 initialize。

### A6／P2：匯入上限與運行中資料增長沒有共同政策

位置：`web/src/lib/device/backup.ts:37`、`:53`、`web/src/components/DeviceVault.tsx:88`、`web/src/lib/device/store.ts:211`、`:226`。

匯入限制 50 MB／50,000 列，但日常新增與匯出沒有相同上限或預警；列數包含分攤、歷史支出與其他 DIM／DWD，並非 50,000 筆有效花費。可能累積出能匯出、卻無法由本產品還原的備份。

此外，每列 insert 都重新 prepare／query／close；預覽與正式還原各完整匯入一次。在大型備份下，耗時與記憶體需要量測；目前只有「處理中」，沒有階段、進度或可操作的超限整理流程。

建議匯出前檢查可還原性，提供清楚容量／列數資訊與可行的封存或分旅程方案；匯入採批次／重用 prepared statements，顯示驗證、建庫、保存等階段。若重用已驗證的 staging engine，仍須保留確認前後 generation 檢查及取消時釋放資源。

## 應保留的設計

- `engine → persistence → store → services` 已把瀏覽器保存與領域操作分開。
- 寫入使用 SQL 交易；IndexedDB durable 保存完成才回傳成功，失敗會丟棄未保存的記憶體引擎。
- Web Locks／排隊＋generation CAS 保護一般跨分頁保存，不應在效能重構時省略。
- 支出 submission UUID 防重複、修改採保留歷史紀錄、購物與支出關聯同交易更新。
- 備份在隔離引擎驗證、重建 DWS，確認後才取代現有資料。
- Modal 已有 dirty 提醒、焦點恢復、Tab 循環、busy 防關閉；底部導覽讓記帳容易找到。
- E2E 使用獨立資料，實際驗證離線與儲存失敗；這些測試比只驗畫面快照更有價值。

## 建議落地順序與驗收

| 次序 | 工作 | 完成條件 |
| --- | --- | --- |
| 1 | 修正 F1–F3，補契約回歸 | 名稱修改不重估、不改分攤；還原前表單不能覆寫；兩端 DST 規則一致 |
| 2 | 手機資訊層級、字級、預訂表單、日期／篩選保存 | 320／360／390／430px 檢查；長內容；真機鍵盤、放大文字及返回操作 |
| 3 | 按領域拆 Editor，抽 Settings／AppShell，整理 CSS | 各表單具體型別；不再以 any 字典串接領域欄位；原有 E2E 仍通過 |
| 4 | Typed adapter 與跨語言 fixtures | 同一組領域輸入在 device／API 得到相同結果或相同拒絕原因 |
| 5 | schema migrations、備份可還原性、效能量測 | 舊版升級失敗保留原資料；支援範圍內的匯出可重新匯入；留下量測基準 |
| 6 | 按量測結果改善讀取、分頁、彙總與持久化 | 降低實際瓶頸，並維持離線、交易、去重及衝突保護 |

不用先更換 React、DuckDB 或引入更多框架。最有價值的簡化是讓每個模組的責任、資料型別及錯誤邊界更清楚，保留使用者已依賴的保存與復原能力。
