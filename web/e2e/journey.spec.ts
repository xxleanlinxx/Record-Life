import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function createTrip(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "新增旅程", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("旅程名稱", { exact: true }).fill(name);
  await modal.getByLabel("出發日期", { exact: true }).fill("2026-10-01");
  await modal.getByLabel("結束日期", { exact: true }).fill("2026-10-07");
  await modal.getByLabel("旅伴名字").fill("我,小安");
  await modal.getByRole("button", { name: "建立旅程", exact: true }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "儲存紀錄", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
    path: location.pathname,
  }));
  expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.width,
  );
}

test("完整旅程：建立、景點、地圖、預訂、購物轉記帳、修改、刪除、重新載入", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createTrip(page, "京都秋日 E2E");
  await page
    .getByRole("navigation", { name: "主要導覽", exact: true })
    .getByRole("link", { name: "行程", exact: true })
    .click();
  await page.getByRole("button", { name: "新增行程", exact: true }).click();
  await page.getByLabel("行程名稱", { exact: true }).fill("清水寺散步");
  await page.getByLabel("地點名稱", { exact: true }).fill("清水寺");
  await page.getByLabel("城市或地址", { exact: true }).fill("京都");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "清水寺散步", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "清水寺", exact: true }),
  ).toHaveAttribute("href", /google\.com\/maps\/search/);
  await page.getByRole("button", { name: "購物清單" }).click();
  await page.getByRole("button", { name: "新增物品", exact: true }).click();
  await page.getByLabel("物品名稱", { exact: true }).fill("宇治抹茶");
  await page.getByLabel("預計價格", { exact: true }).fill("1500");
  await save(page);
  await page
    .getByRole("button", { name: "記帳", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByLabel("花費名稱", { exact: true })).toHaveValue(
    "宇治抹茶",
  );
  await expect(page.locator(".conversion-preview")).toContainText("約 NT$320");
  await save(page);
  await expect(page.getByText("已記帳", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "主要導覽", exact: true })
    .getByRole("link", { name: "預算", exact: true })
    .click();
  await expect(page.getByText("共 1 筆支出")).toBeVisible();
  await page.getByRole("button", { name: /宇治抹茶/ }).click();
  await page.getByLabel("支出金額", { exact: true }).fill("3000");
  await save(page);
  await expect(page.getByText("共 1 筆支出")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /宇治抹茶/ })).toContainText(
    "NT$640",
  );
  await page
    .getByRole("navigation", { name: "主要導覽", exact: true })
    .getByRole("link", { name: "預訂", exact: true })
    .click();
  await page.getByRole("button", { name: "新增預訂", exact: true }).click();
  await page.getByLabel("預訂名稱", { exact: true }).fill("台北飛洛杉磯");
  await page.getByLabel("開始時間", { exact: true }).fill("2026-10-01T23:00");
  await page.getByLabel("結束時間", { exact: true }).fill("2026-10-01T20:00");
  await page
    .getByRole("combobox", { name: "結束地時區", exact: true })
    .selectOption("America/Los_Angeles");
  await page.getByLabel("預訂代碼", { exact: true }).fill("TRAVEL42");
  await save(page);
  await expect(
    page.getByRole("heading", { name: "台北飛洛杉磯", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../artifacts/v2-desktop-bookings.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation", { name: "主要導覽", exact: true })
    .getByRole("link", { name: "預算", exact: true })
    .click();
  await page.getByRole("button", { name: /宇治抹茶/ }).click();
  await page.getByRole("button", { name: "刪除紀錄", exact: true }).click();
  await page.getByRole("button", { name: "確認刪除", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("共 0 筆支出")).toBeVisible();
  expect(errors).toEqual([]);
});

test("手機：表單錯誤保留、捨棄提醒、窄螢幕、鍵盤焦點與無障礙", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createTrip(page, "手機旅行 E2E");
  await page
    .getByRole("navigation", { name: "手機導覽", exact: true })
    .getByRole("button", { name: "記帳", exact: true })
    .click();
  await page.getByLabel("支出金額", { exact: true }).fill("900");
  await page.getByLabel("花費名稱", { exact: true }).fill("咖啡與早餐");
  await page.screenshot({
    path: "../artifacts/v2-mobile-record.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "保留未完成的內容？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "繼續編輯", exact: true }).click();
  await expect(page.getByLabel("花費名稱", { exact: true })).toHaveValue(
    "咖啡與早餐",
  );
  await page.route("**/api/trips/*/expenses", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "測試連線中斷，請重試" }),
    }),
  );
  await page.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("連線中斷");
  await expect(page.getByLabel("花費名稱", { exact: true })).toHaveValue(
    "咖啡與早餐",
  );
  await page.unroute("**/api/trips/*/expenses");
  await save(page);
  await noOverflow(page);
  await page.screenshot({
    path: "../artifacts/v2-mobile-home.png",
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/plan", "/bookings", "/budget", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await noOverflow(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/record");
  await expect(page.getByRole("dialog")).toBeVisible();
  const modalAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    modalAxe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("dialog")
        .evaluate((d) => d.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("設定、匯出與跨頁修改衝突：舊表單不能覆蓋新資料", async ({ page }) => {
  await createTrip(page, "設定與衝突 E2E");
  const tid = await page.locator("#trip-selector").inputValue();
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
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出所有旅程", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^record-life-.*\.json$/);
  expect(await download.failure()).toBeNull();
  await page.getByRole("button", { name: "記一筆花費", exact: true }).click();
  await page.getByLabel("支出金額", { exact: true }).fill("1500");
  await page.getByLabel("花費名稱", { exact: true }).fill("保留原始午餐");
  await save(page);
  await page.goto("/budget");
  await page.getByRole("button", { name: /保留原始午餐/ }).click();
  await page.getByLabel("花費名稱", { exact: true }).fill("舊頁面不應覆蓋");
  const response = await page.request.post(`/api/trips/${tid}/members`, {
    data: { name: "另一頁加入的旅伴" },
  });
  expect(response.ok()).toBe(true);
  await page.getByRole("button", { name: "儲存紀錄", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("資料已在其他頁面更新");
  await expect(page.getByLabel("花費名稱", { exact: true })).toHaveValue(
    "舊頁面不應覆蓋",
  );
  await page
    .getByRole("button", { name: "捨棄變更並載入最新資料", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /保留原始午餐/ }),
  ).toBeVisible();
  const track = page.locator(".category-budget .progress").first();
  const trackBox = await track.boundingBox(),
    fillBox = await track.locator("span").boundingBox();
  expect(Math.abs(trackBox!.x - fillBox!.x)).toBeLessThan(1);
  await page.locator("main").focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/v2-desktop-budget.png",
    fullPage: true,
  });
  for (const path of ["/", "/plan", "/bookings", "/budget", "/settings"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        path,
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
});
