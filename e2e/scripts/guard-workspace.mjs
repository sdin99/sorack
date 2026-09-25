// Refuse to install e2e as part of the repo workspace.
//
// `pnpm install` run from this directory finds pnpm-workspace.yaml two levels
// up and decides the scope is the whole repo. On a machine where the app runs
// from a container sharing this tree, the repo-root node_modules is built for
// a different libc than the host, and a workspace-scoped install replaces it —
// breaking the running app. `--ignore-workspace` is what keeps this directory
// to itself.
//
// ‼ What this guard does NOT do. When the root node_modules already exists,
// pnpm asks to remove it *before* running any lifecycle script, so this file
// has not executed yet. In a terminal that prompt is the only thing standing
// between a contributor and the outcome above; answering yes skips straight
// past here. The guard catches the other case — a fresh clone, where pnpm
// proceeds silently and installs the entire workspace into e2e.
//
// The real protection is the documented command. See README.md.
if (process.env.npm_config_ignore_workspace !== "true") {
  console.error(
    "\n  e2e installs on its own, not as part of the repo workspace.\n" +
      "\n      pnpm install --ignore-workspace\n" +
      "\n  Without the flag pnpm takes the whole repo as its scope. See e2e/README.md.\n",
  );
  process.exit(1);
}
