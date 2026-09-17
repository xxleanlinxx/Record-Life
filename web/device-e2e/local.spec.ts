import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
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
  await page.getByRole("button", { name: "記一筆花費", exact: true }).click();
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
  await page.getByRole("button", { name: "記一筆花費", exact: true }).click();
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
  await page
    .getByLabel("選擇 JSON 備份檔")
    .setInputFiles({
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
