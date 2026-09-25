import { test as base, expect, type Page } from "@playwright/test";

// The admin account the app bootstraps on first boot. CI sets the password;
// locally you pass the same one you started the app with.
export const ADMIN_USER = process.env.SORACK_E2E_USER ?? "admin";
export const ADMIN_PASS = process.env.SORACK_E2E_PASS ?? "e2e-password-not-a-secret";

export async function login(page: Page) {
  await page.goto("/");
  await page.getByTestId("login-username").fill(ADMIN_USER);
  await page.getByTestId("login-password").fill(ADMIN_PASS);
  await page.getByTestId("login-submit").click();
  await expectSignedIn(page);
}

// ‼ Assert a session exists, never that the login form is gone.
//
// `toBeHidden()` passes for an element that has not been rendered yet, so
// immediately after a navigation it is true before the app has decided
// anything — including when the decision is going to be "you are logged out".
// Measured: with SORACK_COOKIE_SECURE left true over plain http, the browser
// drops the cookie and every API call 401s, and an earlier version of this
// helper still reported a successful login.
//
// /api/auth/me is behind requireAuth, so a 200 here is the session being
// accepted by the server, which is the actual claim.
export async function expectSignedIn(page: Page) {
  await expect
    .poll(async () => (await page.request.get("/api/auth/me")).status(), {
      message: "session was not accepted by the server",
    })
    .toBe(200);
}

export const test = base;
export { expect };
