#!/usr/bin/env python3
"""Does the Korean docs copy still match the English it was translated from?

Two copies of the same prose diverge. Nothing in Starlight prevents it, and
worse, nothing *shows* it: a page with no `ko/` file at all is served at the
Korean URL with `lang="ko"` on English text and no notice of any kind. Measured
on the built output before any translation existed — `/ko/docs/concepts/`
returned the full English page, and the only Korean strings on it were the nav
chrome. An untranslated page presents as a translated one.

So this checks two separate things, because they fail separately:

  1. every English page has a Korean counterpart   → catches the silent fallback
  2. the counterpart was written against the       → catches the stale copy
     English file as it is now

For (2) a page passes if the two files were last touched by the same commit
(they were updated together), or if the Korean file's `sourceCommit` names the
English file's current last commit (someone re-checked the translation without
needing to change it).

‼ What this does NOT do: verify that the Korean text says what the English text
says. `sourceCommit` can be bumped without touching a word of the translation.
It does not make the translation correct — it makes the *claim* explicit and
dateable, where today there is no claim at all and a divergence produces no
symptom. Read it as "somebody says they checked against this version", not as
"the translation is current".
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN_DIR = ROOT / "site/src/content/docs/docs"
KO_DIR = ROOT / "site/src/content/docs/ko/docs"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(ROOT), *args],
        capture_output=True, text=True, check=True,
    ).stdout


def dirty_paths() -> list[str]:
    """Paths with uncommitted changes, from `git status --porcelain`.

    ‼ Do not .strip() the whole output before splitting it. The status column
    is two characters and the first is a space for an unstaged change, so
    stripping eats the leading space of the *first line only* — and then
    `line[3:]` takes one character too many from exactly one path per run.
    That is what this function looked like at first, and the failure was
    invisible in the worst direction: one file silently stopped being
    recognised as dirty, so it got judged against the committed version of
    text that had already changed.

    An untracked directory is reported as the directory (`…/ko/`), not as the
    files under it, so entries ending in `/` are prefixes.
    """
    out = []
    for line in git("status", "--porcelain", "--", "site/src/content/docs").splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        # A rename is "old -> new"; the new path is the one on disk.
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        out.append(path.strip().strip('"'))
    return out


def is_dirty(rel: str, dirty: list[str]) -> bool:
    return any(rel == d or (d.endswith("/") and rel.startswith(d)) for d in dirty)


def last_commit(path: Path) -> str:
    return git("log", "-1", "--format=%H", "--", str(path.relative_to(ROOT))).strip()


def source_commit(path: Path) -> str | None:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    m = re.search(r"^sourceCommit:\s*([0-9a-f]{7,40})\s*$", text[3:end], re.M)
    return m.group(1) if m else None


def main() -> int:
    if not EN_DIR.is_dir():
        print(f"✗ {EN_DIR.relative_to(ROOT)} is not a directory — this check is "
              f"looking in the wrong place, which is not the same as finding no drift")
        return 2

    # ‼ On a shallow clone every file's "last commit" is the single commit that
    # is there, so en_last == ko_last for every page and the check passes
    # unconditionally. That is the worst possible failure for a check: green,
    # fast, and meaningless. `actions/checkout` is depth 1 by default, so this
    # is the normal state in CI unless someone remembers fetch-depth: 0.
    if git("rev-parse", "--is-shallow-repository").strip() == "true":
        print("✗ shallow clone — every file appears to have the same last commit, "
              "so this check would pass on anything. Fetch full history "
              "(actions/checkout with fetch-depth: 0).")
        return 2

    en_pages = sorted(EN_DIR.glob("*.md"))
    if not en_pages:
        print(f"✗ found 0 English pages under {EN_DIR.relative_to(ROOT)} — "
              f"the enumeration is broken, not the docs")
        return 2

    # A file changed but not committed makes `git log` describe the previous
    # version. Judging on that would be judging the wrong text, so say so
    # rather than returning a pass nobody should trust.
    dirty = dirty_paths()

    failures: list[str] = []
    stale_pending: list[str] = []
    checked = 0

    for en in en_pages:
        ko = KO_DIR / en.name
        rel_en = str(en.relative_to(ROOT))
        rel_ko = str(ko.relative_to(ROOT))

        if not ko.exists():
            failures.append(
                f"{en.name}: no Korean page. It will still be served at "
                f"/ko/docs/{en.stem}/ — as English, marked lang=\"ko\", with no notice")
            continue

        if is_dirty(rel_en, dirty) or is_dirty(rel_ko, dirty):
            stale_pending.append(f"{en.name}: uncommitted, cannot judge from history")
            continue

        en_last = last_commit(en)
        ko_last = last_commit(ko)
        if not en_last or not ko_last:
            stale_pending.append(f"{en.name}: not committed yet, cannot judge from history")
            continue

        checked += 1
        if ko_last == en_last:
            continue
        declared = source_commit(ko)
        if declared and en_last.startswith(declared):
            continue

        # Suggest the full hash, not an abbreviation. A prefix is what someone
        # pastes into a file that outlives the repo size it was short enough
        # for, and `startswith` would then match the wrong commit.
        if declared:
            failures.append(
                f"{en.name}: the English page moved to {en_last[:9]}, the translation "
                f"declares {declared}. Re-check it, then set "
                f"`sourceCommit: {en_last}`.")
        else:
            failures.append(
                f"{en.name}: the English page was last changed by {en_last[:9]}, the "
                f"translation by {ko_last[:9]}, and it declares no sourceCommit. "
                f"Once you have checked it, add `sourceCommit: {en_last}`.")

    orphans = sorted(p.name for p in KO_DIR.glob("*.md")
                     if not (EN_DIR / p.name).exists()) if KO_DIR.is_dir() else []
    for name in orphans:
        failures.append(f"ko/{name}: no English page — it is unreachable and unchecked")

    if failures:
        print(f"docs-translations: {len(failures)} problem(s)\n")
        for f in failures:
            print(f"  ✗ {f}")
        return 1

    if stale_pending:
        print(f"docs-translations: could not judge {len(stale_pending)} page(s) "
              f"({checked} checked)\n")
        for s in stale_pending:
            print(f"  ? {s}")
        print("\nThis is not a pass. Commit the docs and run it again.")
        return 3

    print(f"docs-translations: {checked} page(s) in sync")
    return 0


if __name__ == "__main__":
    sys.exit(main())
