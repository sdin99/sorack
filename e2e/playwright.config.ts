import { defineConfig, devices } from "@playwright/test";

// Point at a running sorack. There is deliberately no `webServer` block: the
// app needs a Postgres and a migration pass, and hiding that behind a config
// key makes the first failure ("connection refused") say nothing about which
// of the two is missing. CI starts them explicitly and so does the README.
const baseURL = process.env.SORACK_E2E_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./tests",
  // Serial. These flows share one database and one admin account; the
  // empty-map test in particular asserts on a *global* empty state, so a
  // parallel worker creating a node would make it fail for the wrong reason.
  workers: 1,
  fullyParallel: false,
  // Fail the run if a test is left focused or skipped on CI.
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The reason this file exists. Two of the three UI faults found by hand
    // in v0.1.4 were reachable only on a touch viewport: a context menu is
    // the only way to do something, and there is no right-click. A desktop
    // run cannot see that class of bug at all.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
