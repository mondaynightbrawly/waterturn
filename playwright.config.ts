import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testIgnore:
    process.env.FARMOS_BACKEND_TESTS === "1" ? [] : ["**/sync.spec.ts"],
  use: {
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    },
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  reporter: "list",
});
