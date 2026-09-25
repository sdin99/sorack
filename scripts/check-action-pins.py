#!/usr/bin/env python3
"""Resolve every pinned action SHA against GitHub, and check its version comment.

POLICY 5.1 requires actions to be pinned to a 40-character commit SHA, and the
existing grep in ci.yml enforces exactly that: the *shape*. A SHA that is well
formed and does not exist passes it. So does one that exists but is nowhere
near the version its trailing comment claims.

Both happened. Adding the e2e workflow, two pins were transcribed from a
truncated terminal listing and the missing tails were filled in from memory;
the prefixes matched, the shape was right, the pinning check was green, and
the workflow failed at dispatch with "unable to find version". The version
comments were wrong too, by two major releases.

That failure is loud, which is why this script is about the second half: a
comment saying `# v4.3.0` next to v6.1.0's commit is documentation that reads
as verified and is not. Nothing but the API can tell.

  ‼ Annotated tags. `git/ref/tags/<v>` returns the *tag object* for those, not
    the commit, and comparing that to the pin makes every annotated tag look
    like a mismatch. This script dereferences; the first version of it did not
    and reported a correct pin as wrong.

Needs GITHUB_TOKEN (the default workflow token is enough — public metadata).

Usage:  python3 scripts/check-action-pins.py [.github/workflows/*.yml]
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.github.com"
PIN = re.compile(r"uses:\s+([\w.-]+/[\w.-]+)@([0-9a-f]{40})\s*#\s*(\S+)")

# A comment must name an exact release. `# v4` is a floating tag: it moves
# with every release in that major line, so resolving it and comparing to the
# pin marks correct pins as wrong the moment upstream ships v4.3.2.
#
# Rejecting the loose form rather than relaxing the comparison for it, because
# the looser check would pass `# v4` beside a commit that was never in v4 at
# all — and because `# v4` is the same thing POLICY 3.2 objects to in image
# tags: a reference that looks fixed and is not. The pin is the fixed part;
# the comment is for the human, and "v4" does not tell them which v4.
EXACT_VERSION = re.compile(r"^v?\d+\.\d+\.\d+")


def api(path: str) -> dict | None:
    req = urllib.request.Request(f"{API}{path}", headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "sorack-action-pin-check",
        **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}
           if os.environ.get("GITHUB_TOKEN") else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # 404 and 422 both mean "no such object". GitHub returns 422 for a
        # well-formed SHA that is not in the repository, which is exactly the
        # case this script was written for.
        if e.code in (404, 422):
            return None
        # ‼ Everything else must be loud. A rate limit or an expired token
        # returns 403, and swallowing it here would turn "could not check"
        # into "checked, fine" — which is the failure this whole file is
        # about, reproduced inside the checker.
        raise SystemExit(
            f"cannot verify pins: GitHub returned {e.code} for {path}. "
            "This is not a pass."
        )


def resolve_tag(repo: str, tag: str) -> str | None:
    ref = api(f"/repos/{repo}/git/ref/tags/{tag}")
    if not ref:
        return None
    obj = ref["object"]
    if obj["type"] == "commit":
        return obj["sha"]
    # Annotated tag: one more hop to the commit it wraps.
    inner = api(f"/repos/{repo}/git/tags/{obj['sha']}")
    return inner["object"]["sha"] if inner else None


def main(paths: list[str]) -> int:
    files = [Path(p) for p in paths] or sorted(Path(".github/workflows").glob("*.y*ml"))
    seen, errors = 0, []

    for f in files:
        for repo, sha, ver in PIN.findall(f.read_text()):
            seen += 1
            where = f"{f.name}: {repo}@{sha[:12]}… # {ver}"
            if not api(f"/repos/{repo}/commits/{sha}"):
                errors.append(f"{where} — that commit does not exist in {repo}")
                continue
            if not EXACT_VERSION.match(ver):
                errors.append(
                    f"{where} — `{ver}` is a floating tag, not a release. It "
                    "points somewhere else after the next release in that "
                    "line, so it cannot say which commit this is. Use the "
                    "exact version (vX.Y.Z).")
                continue
            tagged = resolve_tag(repo, ver)
            if tagged is None:
                errors.append(f"{where} — {repo} has no tag {ver}")
            elif tagged != sha:
                errors.append(
                    f"{where} — {ver} is {tagged[:12]}…, not this commit. "
                    "The pin may be fine; the comment is wrong, and a wrong "
                    "comment is what people read instead of the SHA.")
            else:
                print(f"  ok  {where}")

    if seen == 0:
        # Same rule as the other gates here: nothing examined is not a pass.
        print("no pinned actions found — refusing to report success", file=sys.stderr)
        return 2
    if errors:
        print(f"\naction pins: {len(errors)} problem(s) of {seen} checked\n", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        return 1
    print(f"action pins: {seen} pin(s) resolve and match their version comment")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
