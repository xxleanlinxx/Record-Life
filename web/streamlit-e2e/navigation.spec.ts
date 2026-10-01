import { test, expect } from "@playwright/test";

test("Streamlit 編輯入口直接開表單，取消、儲存與切換旅程都有明確結果", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const main = page.getByTestId("stMain");
  await main.getByRole("link", { name: "Edit current trip" }).click();
  await expect(page).toHaveURL(/edit-trip$/);
  await expect(page.getByLabel("Trip name", { exact: true })).toHaveValue(
    "Kyoto & Osaka",
  );
  // The form is immediately visible, including when there are no expenses to edit.
  await expect(
    main.getByRole("heading", { name: "Edit trip", exact: true }),
  ).toBeInViewport();
  await page.getByLabel("Trip name", { exact: true }).fill("Discard this edit");
  await main.getByRole("link", { name: "Back to Home" }).click();
  await expect(
    main.getByRole("heading", { name: "Kyoto & Osaka", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Edit current trip" }).click();
  await expect(page.getByLabel("Trip name", { exact: true })).toHaveValue(
    "Kyoto & Osaka",
  );
  await page.getByLabel("Trip name", { exact: true }).fill("Kyoto updated");
  await main.getByRole("button", { name: "Save trip", exact: true }).click();
  await expect(main.getByText("Trip updated.", { exact: true })).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Kyoto updated", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    main.getByRole("heading", { name: "Kyoto updated", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Edit current trip" }).click();
  await page.getByLabel("Trip name", { exact: true }).fill("Kyoto & Osaka");
  await main.getByRole("button", { name: "Save trip", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "Kyoto & Osaka", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: /^(Expand sidebar|keyboard_double_arrow_right)$/,
    })
    .click();
  await page
    .getByTestId("stSidebar")
    .getByRole("link", { name: "Edit current trip" })
    .click();
  await expect(page).toHaveURL(/edit-trip$/);
  await expect(page.getByLabel("Trip name", { exact: true })).toHaveValue(
    "Kyoto & Osaka",
  );
  // Native page links retain the mobile sidebar; dismiss it before editing.
  await page
    .getByRole("button", {
      name: /^(Collapse sidebar|keyboard_double_arrow_left)$/,
    })
    .click();
  await expect(page.getByTestId("stSidebar")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByLabel("Trip name", { exact: true }).click();
  await expect(page.getByLabel("Trip name", { exact: true })).toBeFocused();
});

test("Streamlit 空資料有建立引導，新增與編輯旅程不需要先有記帳資料", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:8504/edit-trip");
  const main = page.getByTestId("stMain");
  await expect(main.getByText(/No trips yet/)).toBeVisible();
  await expect(
    main.getByRole("button", { name: "Save trip", exact: true }),
  ).toHaveCount(0);
  await main.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(
    main.getByText("Trip name is required.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Trip name", { exact: true }).fill("First empty trip");
  await main.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "First empty trip", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Edit current trip" }).click();
  await expect(page.getByLabel("Trip name", { exact: true })).toHaveValue(
    "First empty trip",
  );
  await main.getByRole("link", { name: "Back to Home" }).click();
  await main.getByRole("link", { name: "Create new trip" }).click();
  await expect(page).toHaveURL(/new-trip$/);
  await expect(page.getByLabel("Trip name", { exact: true })).toBeEmpty();
  await page.getByLabel("Trip name", { exact: true }).fill("Second empty trip");
  await main.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "Second empty trip", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "Edit current trip" }).click();
  await expect(page.getByLabel("Trip name", { exact: true })).toHaveValue(
    "Second empty trip",
  );
});

test("Streamlit 頂端 option menu 可切換、返回與重新整理", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const iframe = page.locator(
    'iframe[title="streamlit_option_menu.option_menu"]',
  );
  const menu = iframe.contentFrame();
  await expect(menu.getByText("Home", { exact: true })).toBeVisible();
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await menu.locator(".nav-link").evaluateAll((items) =>
      items.map((item) => {
        const b = item.getBoundingClientRect();
        return { y: b.y, width: b.width, height: b.height };
      }),
    );
    expect(bounds).toHaveLength(5);
    expect(new Set(bounds.map((b) => b.y)).size).toBe(1);
    for (const b of bounds) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await menu.getByText("Plan", { exact: true }).click();
  await expect(page.getByText("Add activity", { exact: true })).toBeVisible();
  await menu.getByText("+ Record", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save expense", exact: true }),
  ).toBeVisible();
  await page.getByLabel("What", { exact: true }).fill("Streamlit saved entry");
  await page.getByLabel("Amount", { exact: true }).fill("1500");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByText(/Saved.*Budget updated/)).toBeVisible();
  await menu.getByText("Bookings", { exact: true }).click();
  await expect(page.getByText("Add booking", { exact: true })).toBeVisible();
  await menu.getByText("Budget", { exact: true }).click();
  await expect(page.getByText("Budget view", { exact: true })).toBeVisible();
  await menu.getByText("Home", { exact: true }).click();
  await expect(menu.locator(".nav-link.active")).toHaveText(/Home/);
  await expect(
    page.getByTestId("stMain").getByRole("link", { name: "Edit current trip" }),
  ).toBeVisible();
  await page.reload();
  await expect(menu.locator(".nav-link.active")).toHaveText(/Home/);
  await page.screenshot({
    path: "../artifacts/streamlit-top-option-menu.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open Day 2 →", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Day", exact: true }),
  ).toHaveValue("Day 2");
  await expect(page.locator(".tr-day-title")).toHaveText("Day 02");
  await page.getByText("Cards", { exact: true }).click();
  await expect(page.locator(".tr-card").first()).toBeVisible();
  await page.screenshot({
    path: "../artifacts/journal-streamlit-day.png",
    fullPage: true,
  });
});
