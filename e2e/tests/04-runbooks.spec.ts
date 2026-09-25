import { test, expect, login } from "./fixtures.js";

// A fresh install has no runbooks, and that is the state this covers.
//
// The toolbar button used to read `if (firstId) navigate(...)` with no else,
// and /runbooks redirected to / when the list was empty. So on any
// installation without runbooks the button did nothing — no screen, no
// message, no error. The list's empty state ("No runbooks yet") had been
// written, styled and translated the whole time and was unreachable by
// either route.
//
// ‼ Only reproducible on an empty database. The dev instance had two runbooks
// and looked fine; production had none. A suite that seeds fixtures before
// running would not see this — which is why these tests run against a fresh
// database and create what they need.
test.describe("runbooks", () => {
  test("the toolbar button reaches the runbook screen on a fresh install", async ({ page }) => {
    await login(page);

    // Precondition, asserted rather than assumed: this only tests what it
    // claims to on an instance with no runbooks.
    const existing = await (await page.request.get("/api/runbooks")).json();
    expect(Array.isArray(existing) ? existing.length : 0,
      "this test describes the empty-install case").toBe(0);

    await page.getByTestId("topbar-runbooks").click();

    await expect(page).toHaveURL(/\/runbooks$/);
    await expect(page.getByTestId("runbooks-empty")).toBeVisible();
  });

  test("/runbooks typed directly does not bounce back to the map", async ({ page }) => {
    await login(page);
    await page.goto("/runbooks");
    await expect(page).toHaveURL(/\/runbooks$/);
    await expect(page.getByTestId("runbooks-empty")).toBeVisible();
  });
});
