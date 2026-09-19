import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./streamlit-e2e",
  outputDir: "./test-results-streamlit",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8503",
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "../.venv/bin/python ../scripts/e2e_streamlit.py",
    url: "http://127.0.0.1:8503/_stcore/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
