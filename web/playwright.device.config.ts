import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./device-e2e",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-device", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5176",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run preview -- --port 5176",
    url: "http://127.0.0.1:5176",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
