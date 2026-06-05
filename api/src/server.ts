import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { env } from "./lib/env";
import { ensureAdminUser } from "./lib/bootstrap";
import { runMigrations } from "./db/migrate";
import { startCollector, stopCollector } from "./health/collector";
import { initialScan, startWatcher, stopWatcher } from "./runbooks/sync";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { nodesRoutes } from "./routes/nodes";
import { edgesRoutes } from "./routes/edges";
import { runbooksRoutes } from "./routes/runbooks";
import { alertsRoutes } from "./routes/alerts";
import { inventoryRoutes } from "./routes/inventory";
import { eventsRoutes } from "./routes/events";
import { gitRoutes } from "./routes/git";
import { bootstrapClone, startGitBackground, stopGitBackground } from "./git/runtime";

const app = new Hono();

app.use("*", logger());

// Baseline security headers on every response. (CSP/HSTS are added at the
// production static-serving layer / Traefik, not here in dev.)
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
});
// Same-origin in practice (Vite proxy / Traefik). credentials:true so the
// session cookie is allowed. Reflective CORS + credentials is a CSRF
// surface if the deployment ever ends up reachable from arbitrary origins,
// so we only accept:
//   1. requests without an Origin header (same-origin / curl / server-to-server)
//   2. origins explicitly listed in SORACK_ALLOWED_ORIGINS (comma-separated)
// Default = (1) only, which is what a same-origin reverse-proxy setup
// produces. Self-hosters serving on multiple origins set the env.
const allowedOrigins = (process.env.SORACK_ALLOWED_ORIGINS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.use("/api/*", cors({
  credentials: true,
  origin: (o) => {
    if (!o) return o; // no Origin header → same-origin / server-to-server
    return allowedOrigins.includes(o) ? o : null;
  },
}));

// ── public routes ──
app.get("/api/health", (c) => c.json({ status: "ok" }));
app.route("/api/auth", authRoutes); // login/logout public; /me self-guards

// ── auth gate ── ORDER MATTERS: everything mounted below requires a valid
// session. New data routes MUST be added after this line.
app.use("/api/*", requireAuth);

app.route("/api/nodes", nodesRoutes);
app.route("/api/edges", edgesRoutes);
app.route("/api/runbooks", runbooksRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/git", gitRoutes);

const port = env.PORT;

// Apply DB migrations BEFORE anything that reads/writes — ensureAdminUser
// queries auth.users, so without this a fresh DB throws "relation does not
// exist" and the api crash-loops until the operator runs `pnpm db:migrate`
// by hand. Drizzle is idempotent: applied migrations are skipped.
await runMigrations();
// Create the admin user on first boot before accepting traffic.
await ensureAdminUser();
// If a git remote is configured and the runbooks dir is empty, clone it
// before the initial scan so the file watcher / DB sync see the cloned
// content from the first request. Bootstrap is best-effort — a failure
// (network down, bad PAT) is logged and the api still serves whatever is
// already on disk; the user can fix config + retry via /api/git/pull.
await bootstrapClone()
  .then((r) => { if (r.cloned) console.log("[git] cloned remote into RUNBOOKS_DIR"); })
  .catch((e) => console.warn("[git] bootstrap clone failed:", e?.message ?? e));
// Reconcile runbook files ↔ DB before traffic so GET /api/runbooks reflects
// disk state from the first request (skipped silently if the dir is empty).
await initialScan().catch((e) => console.warn("[runbooks] initial scan failed:", e));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on :${info.port}`);
  startCollector(); // begin health polling; no-op if SORACK_HEALTH_ENABLED=false
  startWatcher(); // chokidar — external edits to RUNBOOKS_DIR flow into DB
  startGitBackground(); // 5-min `git fetch` + SSE emit on snapshot change
});

// Graceful shutdown: stop the interval so a tsx-watch restart or a k8s pod
// termination doesn't leave a dangling timer / in-flight sweep.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, async () => {
    stopCollector();
    stopGitBackground();
    await stopWatcher();
    process.exit(0);
  });
}

