import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, login } from "./fixtures.js";

// Adopting a directory that already has runbooks into a git remote.
//
// Run against a real git server (git-http-backend), not a stub: isomorphic-git
// only speaks HTTP, and the interesting behaviour here — what a merge of two
// unrelated histories does, and what it refuses — is the library's, not ours.
// A fake would be asserting my own understanding back at me.
//
// ‼ Serial, and the order carries meaning: the refusal case has to run while
// the runbook directory is still not a repository, and the test after it
// proves the refusal left it that way. Each test asserts that state rather
// than trusting the order, so a reordering fails loudly instead of quietly
// testing something else.
test.describe.serial("git adopt", () => {
  let server: ChildProcess;
  let root: string;
  let origin: string;

  // A bare repo seeded with the given files, served over HTTP.
  const seed = (name: string, files: Record<string, string>) => {
    const bare = join(root, `${name}.git`);
    // -b main: a bare repo defaults HEAD to refs/heads/master, and fetching
    // `main` from it dies with "Could not find HEAD" — the advertised HEAD
    // points at a branch that does not exist.
    execFileSync("git", ["init", "--bare", "-q", "-b", "main", bare]);
    const work = mkdtempSync(join(tmpdir(), "seed-"));
    execFileSync("git", ["init", "-q", "-b", "main", work]);
    for (const [f, content] of Object.entries(files)) {
      execFileSync("bash", ["-c", `cat > ${JSON.stringify(join(work, f))}`], { input: content });
    }
    execFileSync("git", ["-C", work, "add", "-A"]);
    execFileSync("git", ["-C", work, "-c", "user.email=e2e@x", "-c", "user.name=e2e", "commit", "-qm", "seed"]);
    execFileSync("git", ["-C", work, "push", "-q", bare, "main"]);
    rmSync(work, { recursive: true, force: true });
    return bare;
  };

  const filesOnRemote = (name: string) =>
    execFileSync("git", ["-C", join(root, `${name}.git`), "ls-tree", "--name-only", "main"])
      .toString().trim().split("\n").filter(Boolean).sort();

  test.beforeAll(async () => {
    // Adoption is one-way: it turns the server's runbook directory into a
    // repository and there is no un-adopt. So the spec resets that directory
    // to the state it describes, when it is allowed to — CI points
    // SORACK_E2E_RUNBOOKS_DIR at the same path it gave the server.
    //
    // Without it the spec still runs, but only against an instance whose
    // runbook directory is not yet a repository. A rerun on the same instance
    // then fails on its own precondition, which is the correct outcome: it
    // cannot test adoption on something already adopted, and saying so beats
    // passing vacuously.
    const serverDir = process.env.SORACK_E2E_RUNBOOKS_DIR;
    if (serverDir) rmSync(join(serverDir, ".git"), { recursive: true, force: true });

    root = mkdtempSync(join(tmpdir(), "e2e-git-"));
    server = spawn("node", [new URL("../support/git-server.mjs", import.meta.url).pathname, root, "0"]);
    const port: number = await new Promise((resolve, reject) => {
      server.stdout!.on("data", (d) => {
        const m = /PORT=(\d+)/.exec(String(d));
        if (m) resolve(Number(m[1]));
      });
      server.on("exit", (c) => reject(new Error(`git server exited: ${c}`)));
      setTimeout(() => reject(new Error("git server did not start")), 10_000);
    });
    origin = `http://127.0.0.1:${port}`;
  });

  test.afterAll(async ({ request }) => {
    // Leave git switched off behind us. Adopting is not reversible from here
    // — the .git it creates lives in the server's runbook directory — but the
    // configuration is, and that is what the other specs care about.
    await request.patch("/api/git/config", { data: { enabled: false } }).catch(() => {});
    server?.kill();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const configure = async (page: any, repo: string) => {
    const res = await page.request.patch("/api/git/config", {
      data: { enabled: true, remote: `${origin}/${repo}.git`, branch: "main", username: "e2e", token: "e2e" },
    });
    expect(res.ok(), "could not set git config").toBeTruthy();
  };

  test("refuses when the remote has a file of the same name, and leaves nothing behind", async ({ page }) => {
    await login(page);
    // The local side: one runbook whose file lands as welcome.md.
    for (const rb of await (await page.request.get("/api/runbooks")).json()) {
      await page.request.delete(`/api/runbooks/${encodeURIComponent(rb.id)}`);
    }
    const made = await page.request.post("/api/runbooks", {
      data: { title: "Welcome", summary: "local", markdown: "# MY welcome\n" },
    });
    expect(made.status()).toBe(201);

    const before = await (await page.request.get("/api/git/status")).json();
    expect(before.repo, "the directory must not be a repository yet").toBe(false);

    seed("collide", { "welcome.md": "# THEIR welcome\n" });
    await configure(page, "collide");

    // 200 with ok:false — the convention for known failures across
    // /api/git/*, so the conflict list survives to the UI.
    const res = await page.request.post("/api/git/adopt");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.conflicts).toEqual(["welcome.md"]);

    // The point of the refusal: all of it, or none of it.
    const after = await (await page.request.get("/api/git/status")).json();
    expect(after.repo, "a refused adopt must not leave a repository behind").toBe(false);
    expect(filesOnRemote("collide"), "and must not have pushed").toEqual(["welcome.md"]);
  });

  test("merges unrelated histories when no filenames collide", async ({ page }) => {
    await login(page);
    const status = await (await page.request.get("/api/git/status")).json();
    expect(status.repo, "still not a repository, from the refusal above").toBe(false);

    seed("merge", { "from-remote.md": "# From the remote\n" });
    await configure(page, "merge");

    const res = await page.request.post("/api/git/adopt");
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.merged, "the remote had commits, so this is a merge").toBe(true);

    // Both sides are on the remote now.
    expect(filesOnRemote("merge")).toEqual(["from-remote.md", "welcome.md"]);

    // And the working tree agrees with HEAD — merge alone does not write the
    // files, so this is the assertion that the checkout after it happened.
    const now = await (await page.request.get("/api/git/status")).json();
    expect(now.repo).toBe(true);
    expect(now.dirty, "a stale working tree would show up here").toBe(0);
  });

  test("refuses to adopt something that is already a repository", async ({ page }) => {
    await login(page);
    const res = await page.request.post("/api/git/adopt");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain("already a git repository");
  });
});
