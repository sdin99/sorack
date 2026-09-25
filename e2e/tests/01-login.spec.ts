import { test, expect, login, expectSignedIn, ADMIN_USER } from "./fixtures.js";

test.describe("login", () => {
  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("login-username").fill(ADMIN_USER);
    await page.getByTestId("login-password").fill("definitely-not-the-password");
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    // And no session was handed out as a side effect.
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
  });

  // This is also the check that the session cookie is actually accepted, which
  // is not the same as the login request succeeding. Over plain http with
  // SORACK_COOKIE_SECURE at its default (true) the browser drops the
  // Set-Cookie: POST /api/auth/login returns 200 and every request after it
  // is 401. Nothing else in CI would notice, and the screen shows no error.
  test("accepts the right password and keeps the session across a reload", async ({ page }) => {
    await login(page);
    await page.reload();
    await expectSignedIn(page);
  });
});
