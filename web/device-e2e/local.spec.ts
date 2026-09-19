import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";
async function rates(context: BrowserContext) {
  await context.route("https://api.frankfurter.dev/v2/rates?**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({
      json: Object.entries({
        TWD: 32,
        JPY: 150,
        EUR: 0.85,
        GBP: 0.75,
        KRW: 1350,
      }).map(([quote, rate]) => ({ base: "USD", quote, rate, date })),
    });
  });
}
async function create(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "建立第一趟旅程", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "建立第一趟旅程", exact: true })
    .click();
  await page.getByLabel("旅程名稱", { exact: true }).fill("裝置上的京都旅行");
  await page.getByLabel("出發日期", { exact: true }).fill("2026-10-01");
  await page.getByLabel("結束日期", { exact: true }).fill("2026-10-07");
  await page.getByLabel("旅伴名字").fill("我,小安");
  await page.getByRole("button", { name: "建立旅程", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "裝置上的京都旅行", exact: true }),
  ).toBeVisible();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "儲存紀錄", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function expense(page: Page, title = "裝置午餐", cost = "1500") {
  await page.getByRole("button", { name: "+ Record", exact: true }).click();
  await page.getByLabel("支出金額", { exact: true }).fill(cost);
  await page.getByLabel("花費名稱", { exact: true }).fill(title);
  await save(page);
}

test("無 API 的完整 CRUD、DuckDB 匯出、JSON 還原與損壞備份保護", async ({
  page,
  context,
}) => {
  await rates(context);
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api")) apiRequests.push(r.url());
  });
  await create(page);
  await expense(page);
  await page.goto("/plan");
  await page.getByRole("button", { name: "新增行程", exact: true }).click();
  await page.getByLabel("行程名稱", { exact: true }).fill("清水寺");
  await page.getByLabel("地點名稱", { exact: true }).fill("清水寺");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "清水寺", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "購物清單" }).click();
  await page.getByRole("button", { name: "新增物品", exact: true }).click();
  await page.getByLabel("物品名稱", { exact: true }).fill("抹茶");
  await page.getByLabel("預計價格", { exact: true }).fill("3000");
  await save(page);
  await page
    .getByRole("button", { name: "記帳", exact: true })
    .filter({ visible: true })
    .click();
  await save(page);
  await expect(page.getByText("已記帳", { exact: true })).toBeVisible();
  await page.goto("/bookings");
  await page.getByRole("button", { name: "新增預訂", exact: true }).click();
  await page.getByLabel("預訂名稱", { exact: true }).fill("跨時區航班");
  await page.getByLabel("開始時間", { exact: true }).fill("2026-10-01T23:00");
  await page.getByLabel("結束時間", { exact: true }).fill("2026-10-01T20:00");
  await page
    .getByRole("combobox", { name: "結束地時區", exact: true })
    .selectOption("America/Los_Angeles");
  await save(page);
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "匯出 JSON 備份", exact: true })
    .click();
  const downloaded = await download;
  const json = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(json.tables.dwd_expense).toHaveLength(2);
  expect(json.tables.dim_trip[0].home_currency).toBe("TWD");
  const binaryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "另存 DuckDB 檔", exact: true })
    .click();
  const binary = await binaryDownload;
  expect(binary.suggestedFilename()).toMatch(/\.duckdb$/);
  await binary.saveAs("../artifacts/device-export.duckdb");
  await expense(page, "還原前多出的支出");
  await page.getByLabel("選擇 JSON 備份檔").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await expect(page.getByRole("dialog")).toContainText("2 筆有效支出");
  await page
    .getByRole("button", { name: "確認取代並還原", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/budget");
  await expect(page.getByText("共 2 筆支出")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /還原前多出的支出/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /裝置午餐/ }).click();
  await page.getByLabel("支出金額", { exact: true }).fill("1600");
  await save(page);
  await page.reload();
  await expect(page.getByRole("button", { name: /裝置午餐/ })).toContainText(
    "¥1,600",
  );
  await page.goto("/settings");
  const damaged = structuredClone(json);
  damaged.tables.dwd_expense[0].booked_home_amount = -1;
  await page.getByLabel("選擇 JSON 備份檔").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(damaged)),
  });
  await expect(page.getByRole("status")).toContainText("無法讀取這份備份");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/budget");
  await expect(page.getByText("共 2 筆支出")).toBeVisible();
  await page.getByRole("button", { name: /抹茶/ }).click();
  await page.getByRole("button", { name: "刪除紀錄", exact: true }).click();
  await page.getByRole("button", { name: "確認刪除", exact: true }).click();
  await expect(page.getByText("共 1 筆支出")).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("關閉分頁後保存、正式版離線重載及離線記帳", async ({ page, context }) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.close();
  const offline = await context.newPage();
  await context.setOffline(true);
  await offline.goto("/budget");
  await expect(offline.getByText("共 1 筆支出")).toBeVisible();
  await expense(offline, "離線早餐", "900");
  await offline.reload();
  await expect(offline.getByText("共 2 筆支出")).toBeVisible();
  await offline.setViewportSize({ width: 390, height: 844 });
  await offline.goto("/settings");
  await expect(
    offline.getByRole("heading", { name: "資料留在這部裝置" }),
  ).toBeVisible();
  await offline.screenshot({
    path: "../artifacts/device-mobile-settings.png",
    fullPage: true,
  });
  const result = await new AxeBuilder({ page: offline })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("兩個分頁同時編輯不覆蓋，新增紀錄不遺失", async ({ page, context }) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/budget");
  const other = await context.newPage();
  await other.goto("/budget");
  await page.getByRole("button", { name: /裝置午餐/ }).click();
  await other.getByRole("button", { name: /裝置午餐/ }).click();
  await page.getByLabel("花費名稱", { exact: true }).fill("第一頁更新");
  await other.getByLabel("花費名稱", { exact: true }).fill("第二頁舊修改");
  await save(page);
  await other.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("資料已在其他頁面更新");
  await other
    .getByRole("button", { name: "捨棄變更並載入最新資料", exact: true })
    .click();
  await expect(other.getByRole("button", { name: /第一頁更新/ })).toBeVisible();
  await Promise.all([
    expense(page, "第一頁新增"),
    expense(other, "第二頁新增"),
  ]);
  await page.reload();
  await expect(page.getByText("共 3 筆支出")).toBeVisible();
});

test("裝置儲存失敗保留舊帳與輸入，重試只新增一次", async ({
  page,
  context,
}) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/budget");
  await page.getByRole("button", { name: "+ Record", exact: true }).click();
  await page.getByLabel("花費名稱", { exact: true }).fill("容量不足後重試");
  await page.getByLabel("支出金額", { exact: true }).fill("777");
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<typeof original>
    ) {
      if (args[1] === "readwrite") {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException("Simulated full device", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("這次變更未保存");
  await expect(page.getByLabel("花費名稱", { exact: true })).toHaveValue(
    "容量不足後重試",
  );
  const other = await context.newPage();
  await other.goto("/budget");
  await expect(other.getByText("共 1 筆支出")).toBeVisible();
  await other.close();
  await save(page);
  await page.reload();
  await expect(page.getByText("共 2 筆支出")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /容量不足後重試/ }),
  ).toHaveCount(1);
});

test("原生 DuckDB 舊版 JSON 匯入後保留帳本與分層資料", async ({
  page,
  context,
}) => {
  await rates(context);
  const path =
    process.env.LEGACY_BACKUP_PATH ??
    fileURLToPath(new URL("./fixtures/legacy-demo.json", import.meta.url));
  const original = JSON.parse(await readFile(path, "utf8"));
  await page.goto("/");
  await page.getByLabel("選擇 JSON 備份檔").setInputFiles(path);
  await expect(page.getByRole("dialog")).toContainText("確認還原備份");
  await page
    .getByRole("button", { name: "確認取代並還原", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const count = original.tables.dwd_expense.filter(
    (e: { is_deleted: boolean }) => !e.is_deleted,
  ).length;
  await page.goto("/budget");
  await expect(page.getByText(`共 ${count} 筆支出`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`共 ${count} 筆支出`)).toBeVisible();
  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "匯出 JSON 備份", exact: true })
    .click();
  const json = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  for (const table of [
    "dim_trip",
    "dim_member",
    "dwd_expense",
    "dwd_expense_split",
    "dwd_itinerary_item",
    "dwd_booking",
    "dwd_shopping_item",
  ])
    expect(json.tables[table]).toHaveLength(original.tables[table].length);
  for (const e of original.tables.dwd_expense) {
    const actual = json.tables.dwd_expense.find(
      (r: { expense_id: number }) => r.expense_id === e.expense_id,
    );
    expect(actual.booked_home_amount).toBeCloseTo(e.booked_home_amount, 6);
    expect(actual.fx_rate_date).toBe(e.fx_rate_date);
  }
  const binaryDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "另存 DuckDB 檔", exact: true })
    .click();
  await (
    await binaryDownload
  ).saveAs("../artifacts/device-legacy-import.duckdb");
});

test("分類預算回滾、本位幣換算與歷史匯率固定", async ({ page, context }) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/settings");
  await page.getByLabel("新增旅伴", { exact: true }).fill("小明");
  await page.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.locator(".member-list")).toContainText("小明");
  await page
    .getByRole("button", { name: "編輯旅程與預算", exact: true })
    .click();
  await page.getByLabel("總預算（TWD）", { exact: true }).fill("1000");
  await page.getByText("分配分類預算（選填）", { exact: true }).click();
  await page.getByLabel("餐飲", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("分類預算加總超過總預算");
  await page.getByLabel("總預算（TWD）", { exact: true }).fill("3000");
  await save(page);
  await page.getByRole("button", { name: "更換本位幣", exact: true }).click();
  await page
    .getByRole("combobox", { name: "新的本位幣", exact: true })
    .selectOption("USD");
  await expect(page.getByRole("dialog")).toContainText("US$93.75");
  await save(page);
  await expect(page.locator(".settings-card").first()).toContainText(
    "US$93.75",
  );
  // A provider revising the same date must not rewrite an existing immutable snapshot.
  await context.unroute("https://api.frankfurter.dev/v2/rates?**");
  await context.route("https://api.frankfurter.dev/v2/rates?**", (route) =>
    route.fulfill({
      json: Object.entries({
        TWD: 64,
        JPY: 300,
        EUR: 0.85,
        GBP: 0.75,
        KRW: 1350,
      }).map(([quote, rate]) => ({
        base: "USD",
        quote,
        rate,
        date: new URL(route.request().url()).searchParams.get("date"),
      })),
    }),
  );
  await page.getByRole("button", { name: "更新匯率", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "匯出 JSON 備份", exact: true })
    .click();
  const json = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  const e = json.tables.dwd_expense[0];
  expect(e.amount).toBe(1500);
  expect(e.currency).toBe("JPY");
  expect(e.booked_home_currency).toBe("USD");
  expect(e.booked_home_amount).toBeCloseTo(10, 6);
  expect(e.fx_home_currency).toBe("TWD");
  expect(e.applied_fx_rate).toBeCloseTo(32 / 150, 10);
  expect(json.tables.dwd_currency_change).toHaveLength(1);
  expect(
    json.tables.dim_fx_rate.find(
      (r: { quote_ccy: string }) => r.quote_ccy === "JPY",
    ).rate,
  ).toBe(150);
  await page.getByLabel("選擇 JSON 備份檔").setInputFiles({
    name: "rebased.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await page
    .getByRole("button", { name: "確認取代並還原", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/budget");
  await expect(page.getByText("共 1 筆支出")).toBeVisible();
});

async function exportJSON(page: Page) {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "匯出 JSON 備份", exact: true })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}
async function restoreJSON(page: Page, json: unknown) {
  await page.getByLabel("選擇 JSON 備份檔").setInputFiles({
    name: "regression.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  await page
    .getByRole("button", { name: "確認取代並還原", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}

test("還原相同旅程與 revision 後，舊表單仍必須拒絕覆寫", async ({
  page,
  context,
}) => {
  await rates(context);
  await create(page);
  await page.goto("/settings");
  const json = await exportJSON(page);
  const other = await context.newPage();
  await other.goto("/settings");
  await other
    .getByRole("button", { name: "編輯旅程與預算", exact: true })
    .click();
  await other.getByLabel("旅程名稱", { exact: true }).fill("過期表單");
  json.tables.dim_trip[0].name = "還原後的新名稱";
  await restoreJSON(page, json);
  await other.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("資料已在其他頁面更新");
  await expect(other.getByLabel("旅程名稱", { exact: true })).toHaveValue(
    "過期表單",
  );
  await other
    .getByRole("button", { name: "捨棄變更並載入最新資料", exact: true })
    .click();
  await expect(other.locator("#trip-selector option:checked")).toHaveText(
    "還原後的新名稱",
  );
});

test("只改名稱保留原始入帳與不等比例分攤，改金額才重估", async ({
  page,
  context,
}) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/settings");
  const json = await exportJSON(page);
  const original = json.tables.dwd_expense[0];
  original.applied_fx_rate = 0.1;
  original.booked_home_amount = 150;
  json.tables.dwd_expense_split[0].share = 0.75;
  json.tables.dwd_expense_split[1].share = 0.25;
  await restoreJSON(page, json);
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await page.getByRole("button", { name: /裝置午餐/ }).click();
  await expect(page.getByRole("dialog")).toContainText("75%");
  await page.getByLabel("花費名稱", { exact: true }).fill("只修改名稱");
  await save(page);
  await page.goto("/settings");
  const renamed = await exportJSON(page);
  const active = renamed.tables.dwd_expense.find(
    (row: { is_deleted: boolean }) => !row.is_deleted,
  );
  expect(active.applied_fx_rate).toBeCloseTo(original.applied_fx_rate, 12);
  expect(active.booked_home_amount).toBe(original.booked_home_amount);
  expect(active.fx_rate_date).toBe(original.fx_rate_date);
  expect(
    renamed.tables.dwd_expense_split
      .filter(
        (row: { expense_id: number }) => row.expense_id === active.expense_id,
      )
      .map((row: { share: number }) => row.share)
      .sort(),
  ).toEqual([0.25, 0.75]);
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await page.getByRole("button", { name: /只修改名稱/ }).click();
  await page.getByLabel("支出金額", { exact: true }).fill("3000");
  await page.getByLabel("改為平均分攤", { exact: true }).check();
  await save(page);
  await expect(page.getByRole("button", { name: /只修改名稱/ })).toContainText(
    "NT$640",
  );
  await page.goto("/settings");
  const updated = await exportJSON(page);
  const updatedId = updated.tables.dwd_expense.find(
    (row: { is_deleted: boolean }) => !row.is_deleted,
  ).expense_id;
  expect(
    updated.tables.dwd_expense_split
      .filter((row: { expense_id: number }) => row.expense_id === updatedId)
      .map((row: { share: number }) => row.share),
  ).toEqual([0.5, 0.5]);
});

test("頂端 option menu：窄螢幕、返回日期與篩選、捲動固定及記帳", async ({
  page,
  context,
}) => {
  await rates(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  const menu = page.getByRole("navigation", { name: "主要導覽", exact: true });
  await expect(menu.locator(":scope > *")).toHaveText([
    "Home",
    "Plan",
    "Record",
    "Bookings",
    "Budget",
  ]);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await menu.locator(":scope > *").evaluateAll((items) =>
      items.map((item) => {
        const r = item.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    expect(
      await menu.evaluate(
        (e) =>
          e.getBoundingClientRect().bottom <=
          document.querySelector("main")!.getBoundingClientRect().top,
      ),
    ).toBe(true);
  }
  await menu.getByRole("link", { name: "Plan", exact: true }).click();
  await page.locator(".day-rail button").nth(4).click();
  await expect(page.locator(".day-rail button").nth(4)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const selectedDay = await page
    .locator(".day-rail button")
    .nth(4)
    .textContent();
  await menu.getByRole("link", { name: "Budget", exact: true }).click();
  await page.getByLabel("搜尋支出", { exact: true }).fill("保留搜尋");
  await page.getByLabel("篩選支出分類", { exact: true }).selectOption("Food");
  await menu.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.locator(".day-rail button[aria-pressed=true]")).toHaveText(
    selectedDay!,
  );
  await menu.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByLabel("搜尋支出", { exact: true })).toHaveValue(
    "保留搜尋",
  );
  await expect(page.getByLabel("篩選支出分類", { exact: true })).toHaveValue(
    "Food",
  );
  await page.evaluate(() => window.scrollTo(0, 500));
  expect((await menu.boundingBox())!.y).toBe(0);
  await menu.getByRole("button", { name: "+ Record", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 430 });
  const footer = await page.locator(".sheet-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(430);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu.getByRole("link", { name: "Home", exact: true }).click();
  await page.screenshot({
    path: "../artifacts/top-option-menu-mobile.png",
    fullPage: true,
  });
});

test("支出分頁只顯示 50 筆，較舊紀錄可編輯且保留分攤", async ({
  page,
  context,
}) => {
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/settings");
  const json = await exportJSON(page);
  const original = json.tables.dwd_expense[0],
    shares = json.tables.dwd_expense_split;
  json.tables.dwd_expense = Array.from({ length: 55 }, (_, i) => ({
    ...original,
    expense_id: 100 + i,
    title: `分頁測試 ${String(i).padStart(3, "0")}`,
    submission_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  }));
  json.tables.dwd_expense_split = json.tables.dwd_expense.flatMap(
    (entry: { expense_id: number }) =>
      shares.map((share: object) => ({
        ...share,
        expense_id: entry.expense_id,
      })),
  );
  await restoreJSON(page, json);
  await page.getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.getByText("共 55 筆支出", { exact: true })).toBeVisible();
  await expect(page.locator(".expense-row")).toHaveCount(50);
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  await expect(page.locator(".expense-row")).toHaveCount(5);
  await page.getByRole("button", { name: /分頁測試 000/ }).click();
  await expect(
    page.getByRole("dialog").getByRole("checkbox", { checked: true }),
  ).toHaveCount(2);
  await page.getByLabel("花費名稱", { exact: true }).fill("第二頁已修改");
  await save(page);
  await page.getByLabel("搜尋支出", { exact: true }).fill("第二頁已修改");
  await expect(page.locator(".expense-row")).toHaveCount(1);
  await expect(page.locator(".expense-row")).toContainText("第二頁已修改");
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".expense-row")).toHaveCount(4);
});

test("v1 快照升級失敗保留原始位元組，重試後可持續使用", async ({
  page,
  context,
}) => {
  await rates(context);
  const directory = await mkdtemp(join(tmpdir(), "record-life-migration-"));
  let bytes: Buffer;
  try {
    const target = join(directory, "v1.duckdb");
    execFileSync(
      fileURLToPath(new URL("../../.venv/bin/python", import.meta.url)),
      [
        fileURLToPath(
          new URL("../../scripts/test_browser_snapshot.py", import.meta.url),
        ),
        target,
      ],
    );
    bytes = await readFile(target);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    Object.defineProperty(window, "failSnapshotWrites", {
      value: true,
      writable: true,
    });
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.name === "snapshots" &&
        key === "current" &&
        Reflect.get(window, "failSnapshotWrites")
      )
        throw new DOMException("test quota", "QuotaExceededError");
      return original.call(this, value, key);
    };
  });
  await page.route("**/migration-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Isolated fixture</title>",
    }),
  );
  await page.goto("/migration-fixture");
  await page.evaluate(async (base64) => {
    Reflect.set(window, "failSnapshotWrites", false);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("record-life-device-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("snapshots");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(
          {
            bytes: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
            generation: "fixture-v1",
            savedAt: "2026-09-01T00:00:00Z",
          },
          "current",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
  }, bytes!.toString("base64"));
  await page.goto("/");
  await expect(
    page.getByText("暫時無法開啟手帳", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    () =>
      new Promise<{ generation: string; hash: string }>((resolve, reject) => {
        const request = indexedDB.open("record-life-device-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("snapshots", "readonly"),
            r = tx.objectStore("snapshots").get("current");
          tx.oncomplete = async () => {
            db.close();
            const digest = await crypto.subtle.digest(
              "SHA-256",
              r.result.bytes,
            );
            resolve({
              generation: r.result.generation,
              hash: Array.from(new Uint8Array(digest), (b) =>
                b.toString(16).padStart(2, "0"),
              ).join(""),
            });
          };
        };
      }),
  );
  expect(stored.generation).toBe("fixture-v1");
  expect(stored.hash).toBe(createHash("sha256").update(bytes!).digest("hex"));
  await page.evaluate(() => Reflect.set(window, "failSnapshotWrites", false));
  await page.getByRole("button", { name: "重新連線", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kyoto & Osaka", exact: true }),
  ).toBeVisible();
  await expense(page, "升級後寫入", "100");
  await page.reload();
  await expect(page.getByRole("button", { name: /升級後寫入/ })).toBeVisible();
});

test("大量資料基準（手動執行）", async ({ page, context }) => {
  test.skip(
    process.env.RECORD_LIFE_BENCHMARK !== "1",
    "Set RECORD_LIFE_BENCHMARK=1 to measure isolated browser fixtures.",
  );
  test.setTimeout(360000);
  await rates(context);
  await create(page);
  await expense(page);
  await page.goto("/settings");
  const base = await exportJSON(page);
  const original = base.tables.dwd_expense[0],
    shares = base.tables.dwd_expense_split;
  const report: object[] = [];
  for (const count of [100, 1000, 5000, 10000]) {
    const fixture = structuredClone(base);
    fixture.tables.dwd_expense = Array.from({ length: count }, (_, i) => ({
      ...original,
      expense_id: 100 + i,
      title: `基準 ${i}`,
      submission_id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    fixture.tables.dwd_expense_split = fixture.tables.dwd_expense.flatMap(
      (entry: { expense_id: number }) =>
        shares.map((share: object) => ({
          ...share,
          expense_id: entry.expense_id,
        })),
    );
    await page.goto("/settings");
    const importStart = performance.now();
    await restoreJSON(page, fixture);
    const importMs = performance.now() - importStart;
    const coldStart = performance.now();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "你的旅程，你的步調。", exact: true }),
    ).toBeVisible();
    const coldMs = performance.now() - coldStart;
    const saves: number[] = [];
    for (let i = 0; i < 20; i++) {
      await page.getByRole("button", { name: "+ Record", exact: true }).click();
      await page.getByLabel("支出金額", { exact: true }).fill("1");
      await page.getByLabel("花費名稱", { exact: true }).fill(`基準新增 ${i}`);
      const started = performance.now();
      await save(page);
      saves.push(performance.now() - started);
    }
    saves.sort((a, b) => a - b);
    const storage = await page.evaluate(async () => {
      const estimate = await navigator.storage.estimate();
      return {
        originUsageBytes: estimate.usage,
        jsHeapBytes: Reflect.get(performance, "memory")?.usedJSHeapSize ?? null,
      };
    });
    const row = {
      expenses: count,
      members: 2,
      importMs: Math.round(importMs),
      coldMs: Math.round(coldMs),
      saveP50Ms: Math.round(saves[9]),
      saveP95Ms: Math.round(saves[18]),
      samples: saves.length,
      ...storage,
    };
    report.push(row);
    console.log("Browser benchmark", JSON.stringify(row));
  }
  const { writeFile, mkdir } = await import("node:fs/promises");
  const target = new URL("../../artifacts/", import.meta.url);
  await mkdir(target, { recursive: true });
  await writeFile(
    new URL("browser-performance.json", target),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        note: "Chromium desktop, no CPU throttle, two members, UI end-to-end durations. Origin usage includes offline assets; JS heap excludes DuckDB Worker memory. Cold reload retains HTTP/service-worker caches.",
        results: report,
      },
      null,
      2,
    ),
  );
});

test("旅遊指引卡片、時間軸及長預訂內容在手機可閱讀", async ({
  page,
  context,
}) => {
  await rates(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "先看看京都旅行範例", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kyoto & Osaka", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "關閉通知", exact: true }).click();
  await page.screenshot({
    path: "../artifacts/journal-react-home.png",
    fullPage: true,
  });
  await page.locator(".trip-day").nth(1).click();
  await expect(page.locator(".day-rail button").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const count = await page.locator(".activity-card").count();
  expect(count).toBeGreaterThan(0);
  await page.getByRole("button", { name: "卡片總覽", exact: true }).click();
  await expect(page.locator(".activity-grid .activity-card")).toHaveCount(
    count,
  );
  await page.screenshot({
    path: "../artifacts/journal-react-day.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Bookings", exact: true }).click();
  await page.getByRole("button", { name: "新增預訂", exact: true }).click();
  await page
    .getByLabel("預訂名稱", { exact: true })
    .fill("跨城市旅行的預訂名稱".repeat(12));
  await page
    .getByLabel("預訂代碼", { exact: true })
    .fill("ABCDEFGH".repeat(30));
  await page.getByText("平台、金額與備註（選填）", { exact: true }).click();
  await page
    .getByLabel("預訂金額（選填）", { exact: true })
    .fill("999999999999");
  await save(page);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
});
