import { test, expect, login } from "./fixtures.js";

// The flow a first-time operator hits, on both viewports.
//
// v0.1.4 shipped with the empty canvas offering nothing but a right-click,
// which does not exist on a phone: the product was unusable from its own
// first screen on the device its operator actually uses. CI was green. This
// test is the thing that would have said otherwise.
//
// ‼ The wipe below is not tidiness, it is the point. The first version of
// this file asked "is the map empty?" and skipped if it was not — which meant
// the desktop project ran first, created a node, and the mobile project
// skipped. The run reported "11 passed, 1 skipped" and the single test that
// justifies this whole suite had not executed on the viewport it exists for.
// A conditional skip is a green result that means "did not look".
test.describe("first node", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // page.request shares the browser's cookies, so this is the session
    // acting on its own data — no key needed.
    const res = await page.request.get("/api/nodes");
    expect(res.ok(), "could not read nodes to reset the map").toBeTruthy();
    for (const node of await res.json()) {
      const del = await page.request.delete(`/api/nodes/${encodeURIComponent(node.id)}`);
      expect(del.ok(), `could not delete node ${node.id}`).toBeTruthy();
    }
    await page.goto("/");
  });

  test("empty map offers a way in, the way in works, and it persists", async ({ page }) => {
    await expect(page.getByTestId("map-empty")).toBeVisible();

    const cta = page.getByTestId("map-empty-cta");
    await expect(cta).toBeVisible();
    // On the mobile project this goes through the touch path, which is the
    // one that was broken.
    await cta.click();

    // openCreate() names the first node "new". Assert the node is on the
    // canvas, not merely that the empty state went away — those are different
    // claims and only one of them is "it worked".
    const node = page.locator('.react-flow__node[data-id="new"]');
    await expect(node).toBeVisible();
    await expect(page.getByTestId("map-empty")).toBeHidden();

    // It was written, not just drawn.
    await page.reload();
    await expect(page.locator('.react-flow__node[data-id="new"]')).toBeVisible();
  });
});
