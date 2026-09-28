#!/usr/bin/env python3
"""Do the docs' internal links and heading anchors actually resolve?

Run against the built site, not the markdown. Anchors are generated from
heading text by Astro's slugger, and reimplementing that rule here would put a
second copy of it in the repo — the failure this whole file exists to catch, in
the checker itself. The built HTML already carries the real ids.

This matters more than it would on most sites: the docs deploy on push, so a
`]( /docs/... )` that goes nowhere is live before anyone reads it. And the
Korean pages make it easy to get wrong — their anchors are Korean text, so a
link copied from the English page looks right and resolves to nothing.

Usage: check-docs-links.py [site/dist]
"""

import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site/src/content/docs"
HEADING = re.compile(r'<h[2-6][^>]*\bid="([^"]+)"')
# Markdown inline links to a site-absolute path: ](/docs/...)
LINK = re.compile(r"\]\((/[^)\s]*)\)")


def page_url(index_html: Path, dist: Path) -> str:
    rel = index_html.parent.relative_to(dist).as_posix()
    return "/" if rel == "." else f"/{rel}/"


def main(argv: list[str]) -> int:
    dist = Path(argv[1]) if len(argv) > 1 else ROOT / "site/dist"
    if not dist.is_dir():
        print(f"✗ {dist} is not a directory — build the site first "
              f"(cd site && pnpm build). Not finding pages is not the same as "
              f"finding no broken links.")
        return 2

    anchors: dict[str, set[str]] = {}
    for f in dist.rglob("index.html"):
        text = f.read_text(encoding="utf-8")
        anchors[page_url(f, dist)] = {urllib.parse.unquote(i) for i in HEADING.findall(text)}

    if not anchors:
        print(f"✗ found 0 pages under {dist} — the enumeration is broken")
        return 2

    sources = sorted(SRC.rglob("*.md"))
    if not sources:
        print(f"✗ found 0 markdown sources under {SRC} — the enumeration is broken")
        return 2

    problems: list[str] = []
    links = 0
    for md in sources:
        rel = md.relative_to(ROOT)
        for m in LINK.finditer(md.read_text(encoding="utf-8")):
            target = m.group(1)
            page, _, frag = target.partition("#")
            if not page.endswith("/"):
                page += "/"
            links += 1
            if page not in anchors:
                problems.append(f"{rel}: {target} — no such page in the build")
                continue
            if frag and urllib.parse.unquote(frag) not in anchors[page]:
                problems.append(f"{rel}: {target} — page exists, no such heading")

    if problems:
        print(f"docs-links: {len(problems)} broken of {links} internal link(s)\n")
        for p in problems:
            print(f"  ✗ {p}")
        return 1

    print(f"docs-links: {links} internal link(s) resolve across {len(anchors)} page(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
