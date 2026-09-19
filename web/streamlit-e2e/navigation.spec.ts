import { test, expect } from "@playwright/test";
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
    page.getByText("Manage this trip", { exact: true }),
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
