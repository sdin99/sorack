#!/usr/bin/env python3
"""Docs style checks for site/src/content/docs (reference implementation).

Rules come from site/STYLE.md. Each pattern carries two test strings, one it
must match and one it must not, and the script checks them before scanning.
A count of zero means nothing only if the pattern is known to work.

Exit 1 on any violation or any failed self-test.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "site" / "src" / "content" / "docs"

# name: (pattern, flags, languages, must_match, must_not_match)
CHECKS = {
    "emphasis symbol ‼": (
        r"‼", 0, {"en", "ko"},
        "‼ **Discovery never deletes.**", "Discovery does not delete nodes.",
    ),
    "page history": (
        r"\b(?:This|The) (?:page|guide|doc) (?:used to|previously)\b|이 (?:페이지|문서)는 전에",
        re.I, {"en", "ko"},
        "This page used to lead with the dev pod", "The pod used a volume",
    ),
    "space before Korean particle after code": (
        # The lookahead allows end of string. A version without `$` passed its
        # own sample only because the sample had a trailing character.
        # Autolinks (`<http://…>`) are the same case: a code-like token that
        # the particle should attach to.
        r"(?:`[^`\n]+`|<[^<>\n]+>)[ \t]+(?:을|를|이|가|은|는|에|의|로|으로|와|과|도|만)(?=[\s.,)]|$)",
        re.M, {"ko"},
        "`meta.discovered.goneAt` 을", "`meta.discovered.goneAt`을",
    ),
    "space before Korean particle after a Latin word": (
        # Same rule as the one above, for words not in backticks: `sorack 은`,
        # `UI 를`, `HTTP 로`. The first version of this checker only covered
        # inline code and missed 99 of these; all 99 were real particles.
        r"(?<![`\w])[A-Za-z][A-Za-z0-9_.\-]* (?:을|를|이|가|은|는|에|의|로|으로|와|과|도|만)(?=[\s.,)]|$)",
        re.M, {"ko"},
        "sorack 은 평범한", "sorack은 평범한",
    ),
    "em dash in Korean prose": (
        r"—", 0, {"ko"},
        "클러스터 좌표입니다 — 그래서", "클러스터 좌표입니다(예: x). 그래서",
    ),
    "version number in running text": (
        r"\bv\d+\.\d+(?:\.\d+)?\b", 0, {"en", "ko"},
        "That has not been true since v0.1.0", "Use the API version shown below",
    ),
}

# Reported, not failed. Bold spans often wrap a line in these files, so the
# pattern crosses newlines; a single-line pattern undercounted by 18 in Korean.
BOLD = (r"\*\*.+?\*\*", re.S, "a **term\nthat wraps** here", "a *single* star")


def selftest() -> bool:
    ok = True
    sample = "---\ntitle: x\nsourceCommit: y\n---\n```\na\n```\n| `A` | — | b |\nx — y\n"
    body = prose(sample, keep_inline_code=False)
    dash_lines = [body.count("\n", 0, m.start()) + 1 for m in re.finditer("—", body)]
    if dash_lines != [9] or "sourceCommit" in body or "title: x" not in body:
        ok = False
        print(f"self-test failed: prose() (dash lines {dash_lines}, expected [9]: "
              f"table cell exempt, line numbers preserved, title kept, config dropped)")
    for name, (rx, fl, _, yes, no) in CHECKS.items():
        m_yes, m_no = bool(re.search(rx, yes, fl)), bool(re.search(rx, no, fl))
        if not m_yes or m_no:
            ok = False
            print(f"self-test failed: {name} (must match: {m_yes}, must not match: {m_no})")
    rx, fl, yes, no = BOLD
    if not re.search(rx, yes, fl) or re.search(rx, no, fl):
        ok = False
        print("self-test failed: bold")
    return ok


def _blank(m: re.Match) -> str:
    # Keep the newlines so reported line numbers match the file. Removing the
    # frontmatter and code blocks outright shifted every later line: a dash on
    # line 133 was reported at 108.
    return "\n" * m.group(0).count("\n")


def prose(text: str, keep_inline_code: bool) -> str:
    # Frontmatter: `title` and `description` are prose a reader sees (the
    # page heading, search results). Everything else in it is configuration.
    text = re.sub(r"\A---\n.*?\n---\n",
                  lambda m: "\n".join(l if re.match(r"(title|description):", l) else ""
                                      for l in m.group(0).split("\n")),
                  text, flags=re.S)
    text = re.sub(r"```.*?```", _blank, text, flags=re.S)         # fenced code
    # A table cell holding only a dash means "no value". It is a table
    # convention, not punctuation in a sentence.
    text = re.sub(r"(?<=\|)[ \t]*—[ \t]*(?=\|)", " ", text)
    if not keep_inline_code:
        text = re.sub(r"`[^`\n]*`", "``", text)
    return text


def main() -> int:
    if not selftest():
        print("Self-test failed. Counts below would not mean anything.")
        return 1

    pages = {
        "en": sorted((ROOT / "docs").glob("*.md*")),
        "ko": sorted((ROOT / "ko" / "docs").glob("*.md*")),
    }
    scanned = sum(len(v) for v in pages.values())
    if scanned == 0:
        print(f"No pages found under {ROOT}. Nothing was checked.")
        return 1

    failed = 0
    for lang, files in pages.items():
        for f in files:
            raw = f.read_text(encoding="utf-8")
            for name, (rx, fl, langs, _, _) in CHECKS.items():
                if lang not in langs:
                    continue
                keep = name.startswith("space before")   # code is the subject here
                body = prose(raw, keep_inline_code=keep)
                for m in re.finditer(rx, body, fl):
                    line = body.count("\n", 0, m.start()) + 1
                    snippet = body[m.start():m.start() + 50].replace("\n", " ")
                    print(f"{f.relative_to(ROOT)}:{line}: {name}: {snippet}")
                    failed += 1

    print(f"\n{scanned} pages checked, {len(CHECKS)} rules, {failed} violations.")

    print("\nBold per page (reported, not enforced):")
    rx, fl, _, _ = BOLD
    for lang, files in pages.items():
        for f in files:
            n = len(re.findall(rx, prose(f.read_text(encoding="utf-8"), True), fl))
            print(f"  {str(f.relative_to(ROOT)):32} {n}")

    print("\nNot checked here (needs review): whether a reason is needed, whether an")
    print("anecdote became a plain statement, whether Korean reads naturally.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
