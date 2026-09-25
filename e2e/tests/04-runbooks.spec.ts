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

  // ‼ The list is the only way to choose a runbook, and on a phone it and a
  // runbook cannot both be on screen. Until now the toolbar button jumped
  // straight to the first runbook with the list hidden, the sidebar toggle
  // was desktop-only, and the one setShowTree(true) in the code runs after
  // deleting the runbook you are looking at. So a phone could open exactly
  // one runbook — the first — and reach no other. Fourteen of the fifteen on
  // the live instance were invisible.
  //
  // Two runbooks, because one cannot show the difference: the bug is not
  // "cannot open a runbook", it is "cannot open a second one".
  test("a second runbook is reachable", async ({ page }) => {
    for (const title of ["Alpha check", "Bravo check"]) {
      const r = await page.request.post("/api/runbooks", {
        data: { title, markdown: `# ${title}\n\n- [ ] step\n` },
      });
      expect(r.status()).toBe(201);
    }
    const [first, second] = (await (await page.request.get("/api/runbooks")).json())
      .map((r: any) => r.id).sort();
    expect(second, "two runbooks, because one cannot show the difference").toBeTruthy();

    // Reload: these were created through the API, outside the app, so the
    // client's cached list has not heard about them. Without this the page
    // still believes there are none and the assertions below would fail on a
    // stale view rather than on the thing under test.
    await page.goto("/");
    await page.getByTestId("topbar-runbooks").click();

    // Both are listed. Desktop lands on a runbook with the list beside it,
    // mobile lands on the list; either way the list is what you choose from.
    await expect(page.getByTestId(`runbook-item-${first}`)).toBeVisible();
    await expect(page.getByTestId(`runbook-item-${second}`)).toBeVisible();

    await page.getByTestId(`runbook-item-${second}`).click();
    await expect(page).toHaveURL(new RegExp(`/runbooks/${second}$`));

    // The two viewports navigate differently on purpose, so assert the model
    // each is supposed to have rather than sniffing which one we got. An
    // earlier version checked "is the list visible?" right after the click
    // and raced React: it read the list as still there, skipped the back tap,
    // and then timed out clicking something hidden.
    if (test.info().project.name === "desktop") {
      // Two panes: choosing a runbook never takes the list away.
      await expect(page.getByTestId(`runbook-item-${first}`)).toBeVisible();
    } else {
      // Master-detail: the runbook covers the list, and the back arrow is the
      // only way back to it — the sidebar toggle is desktop-only and the sole
      // setShowTree(true) in the code runs after deleting the runbook you are
      // looking at.
      await expect(page.getByTestId(`runbook-item-${first}`)).toBeHidden();
      await page.getByTestId("runbook-back").click();
      await expect(page.getByTestId(`runbook-item-${first}`)).toBeVisible();
    }

    await page.getByTestId(`runbook-item-${first}`).click();
    await expect(page).toHaveURL(new RegExp(`/runbooks/${first}$`));
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
