import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "../.venv/bin/python ../scripts/e2e_api.py",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        "VITE_STORAGE_MODE=server npm run build && API_PROXY_URL=http://127.0.0.1:8001 npm run preview -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
