import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_STAFF_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
});
