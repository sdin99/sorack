import { test, expect, login } from "./fixtures.js";

// Issue a read key through the UI, then use it as a caller would.
//
// The two consumers of this API are scripts, and the thing they need from it
// is not that a request succeeds but that a *failure* is legible: 401 means
// the key is wrong and needs reissuing, 403 means the key is right and is not
// allowed to do this. A client that retries on both loops forever on the
// second. Nothing but an end-to-end run checks that the two actually differ.
test.describe("API keys", () => {
  test("a read key can GET, cannot write, and says which", async ({ page, playwright }) => {
    await login(page);
    // The route is part of the contract too — it moved from /settings/tokens
    // in v0.1.8 and the nav entry is the only other way here.
    await page.goto("/settings/api-keys");

    const name = `e2e-${Date.now()}`;
    await page.getByTestId("apikey-name").fill(name);
    await page.getByTestId("apikey-scope").selectOption("read");
    await page.getByTestId("apikey-create").click();

    const key = (await page.getByTestId("apikey-value").innerText()).trim();
    expect(key).toMatch(/^sorack_key_/);

    // A fresh context: no cookies, so this is the key and nothing else. With
    // the session cookie along for the ride every one of these would pass
    // regardless of the key, and the test would assert nothing.
    const api = await playwright.request.newContext({
      baseURL: new URL(page.url()).origin,
      extraHTTPHeaders: { authorization: `Bearer ${key}` },
    });

    const read = await api.get("/api/nodes");
    expect(read.status(), "a read key must be able to GET").toBe(200);

    const write = await api.post("/api/nodes", {
      data: { id: "e2e-should-not-exist", type: "host", name: "nope" },
    });
    expect(write.status(), "a read key must not be able to write").toBe(403);
    const body = await write.json();
    // The scope is echoed so a caller can tell this apart from a bad key
    // without parsing prose. Assert the field, not the sentence — the
    // sentence is copy and copy changes.
    expect(body.scope).toBe("read");

    await api.dispose();
  });

  test("a malformed key is 401, not 403", async ({ page, playwright }) => {
    // The distinction only has value if both sides of it are real.
    await login(page);
    const origin = new URL(page.url()).origin;
    const api = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { authorization: "Bearer sorack_key_definitely-not-valid" },
    });
    const r = await api.get("/api/nodes");
    expect(r.status()).toBe(401);
    await api.dispose();
  });
});
