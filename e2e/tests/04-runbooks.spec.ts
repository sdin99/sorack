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
  // Every test here starts from no runbooks, set rather than hoped for. Two
  // of them assert the empty state and one creates a runbook; without this
  // they would depend on running order, which is how the first version of
  // 02-first-node ended up skipping itself.
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Establish the precondition instead of hoping for it. 05-git-adopt runs
    // before this on the desktop project and leaves git configured; the claim
    // below is about git being OFF, so turn it off rather than depend on the
    // order of the files.
    const off = await page.request.patch("/api/git/config", { data: { enabled: false } });
    expect(off.ok(), "could not disable git sync").toBeTruthy();
    const res = await page.request.get("/api/runbooks");
    expect(res.ok(), "could not list runbooks to reset them").toBeTruthy();
    for (const rb of await res.json()) {
      const del = await page.request.delete(`/api/runbooks/${encodeURIComponent(rb.id)}`);
      expect(del.ok(), `could not delete runbook ${rb.id}`).toBeTruthy();
    }
    await page.goto("/");
  });

  test("the toolbar button reaches the runbook screen on a fresh install", async ({ page }) => {
    await page.getByTestId("topbar-runbooks").click();

    await expect(page).toHaveURL(/\/runbooks$/);
    await expect(page.getByTestId("runbooks-empty")).toBeVisible();
  });

  test("/runbooks typed directly does not bounce back to the map", async ({ page }) => {
    await page.goto("/runbooks");
    await expect(page).toHaveURL(/\/runbooks$/);
    await expect(page.getByTestId("runbooks-empty")).toBeVisible();
  });

  // Runbooks work with no git configured at all. The file on disk is the
  // source of truth and the database is a cache of it; a remote is an
  // optional layer over that directory, not a prerequisite for having one.
  //
  // This run has no SORACK_GIT_* set, so the test is the claim: if a remote
  // ever became required to create or keep a runbook, this fails.
  test("a runbook survives without git configured", async ({ page }) => {
    // `configured`, not `ok` — /api/git/status answers with a snapshot, not a
    // result. Asserting the wrong field compared undefined to false and the
    // test failed for the right reason with the wrong explanation, which is
    // the cheaper half of this mistake to find.
    // `configured`, not `ok` — /api/git/status answers with a snapshot, not a
    // result. Asserting the wrong field compared undefined to false and the
    // test failed for the right reason with the wrong explanation, which is
    // the cheaper half of this mistake to find.
    //
    // Only `configured` is asserted. Whether a .git directory happens to be
    // lying around is not what this claims — the claim is that a runbook does
    // not need a configured remote, and a leftover repository from another
    // spec would make an assertion on `repo` a statement about running order.
    const git = await (await page.request.get("/api/git/status")).json();
    expect(git.configured, "this run is meant to have no git configured").toBe(false);

    const created = await page.request.post("/api/runbooks", {
      data: {
        title: "Reboot check",
        summary: "created with no remote anywhere",
        markdown: "# Reboot check\n\n- [ ] stop consumers\n- [ ] reboot\n",
      },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).id;

    // Reload rather than trusting the client's own copy: this asserts it was
    // written, not that the request returned 201.
    await page.goto("/runbooks");
    await expect(page.getByTestId("runbooks-empty")).toBeHidden();
    const fetched = await page.request.get(`/api/runbooks/${encodeURIComponent(id)}`);
    expect(fetched.ok()).toBeTruthy();
    expect((await fetched.json()).markdown).toContain("stop consumers");
  });
});
