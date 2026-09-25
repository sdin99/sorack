#!/usr/bin/env python3
"""Assert that every image reference release.yml publishes is immutable.

Two bugs in .github/workflows/release.yml had the same shape: a comment
described the tags that would be published, metadata-action published a
different set, and nobody found out until the registry was inspected.

  1. `latest` was published despite a comment saying it was not, because
     metadata-action adds it to semver tags by default.
  2. `sha-<commit>` was published by BOTH triggers. A release pushes main and
     a tag, each builds, each claimed the same `sha-` tag. Measured on v0.1.7
     (5f45fc5): sha256:4eb3f96b… at 01:32, sha256:e04584c1… at 01:33, and the
     displaced digest was left untagged — so a pin written by tag name could
     later resolve to something eligible for garbage collection.

The overlay that consumes this image pins a digest, so neither bug broke a
deployment. They broke the promise the tag names make, which is the promise
the README tells other people to rely on.

WHAT THIS IS NOT: proof that the registry is clean. It reads a file, and the
fault above was only visible in the registry — a tag that moved yesterday
still looks fine here today. This gate stops the regression from being
reintroduced; it cannot tell you whether it already happened. For that, list
the package versions and look for a digest whose tags are empty.

Usage:  python3 scripts/check-release-tags.py [workflow.yml]
"""

import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: pip install pyyaml")

DEFAULT_PATH = ".github/workflows/release.yml"

# Inverted on purpose: this lists the tag types that CANNOT collide, and
# everything else must carry an `enable=` gate when the workflow answers to
# both branch and tag pushes.
#
# The first version enumerated the dangerous types instead — ("type=sha",
# "type=raw") — which is the same mistake in miniature as the bug this file
# exists to catch. A hand-written list of what to watch for looks correct
# because the entries in it are correct; it is the absent entry that is the
# defect, and nothing reports an absence. A type added to metadata-action
# later, or simply one I did not think of, would have been skipped silently.
#
# These are safe by construction, not by inspection: each carries its own
# event restriction, so a branch push and a tag push cannot render the same
# string from them.
#   type=semver  needs a semver ref, so it renders only on a tag push
#   type=ref     is explicitly scoped by its own event= parameter
#   type=pep440  same as semver
SELF_SCOPED = ("type=semver", "type=ref", "type=pep440")


def find_meta_steps(doc: dict) -> list[dict]:
    steps = []
    for job in (doc.get("jobs") or {}).values():
        for step in job.get("steps") or []:
            uses = step.get("uses") or ""
            if "docker/metadata-action" in uses:
                steps.append(step)
    return steps


def triggers(doc: dict) -> tuple[bool, bool]:
    # `on` is the YAML 1.1 boolean True once parsed, which is a classic way to
    # read this file and find nothing. Accept both spellings.
    on = doc.get("on", doc.get(True)) or {}
    push = on.get("push") or {}
    return bool(push.get("branches")), bool(push.get("tags"))


def check(path: str) -> int:
    with open(path) as f:
        doc = yaml.safe_load(f)

    errors: list[str] = []
    on_branch, on_tag = triggers(doc)
    steps = find_meta_steps(doc)

    if not steps:
        # No metadata-action means no tags to judge — but it also means this
        # script looked at the wrong file, which is the failure it exists to
        # prevent. Say so instead of exiting 0.
        print(f"{path}: no docker/metadata-action step found — nothing was checked",
              file=sys.stderr)
        return 2

    for step in steps:
        with_ = step.get("with") or {}
        flavor = str(with_.get("flavor") or "")
        tags = str(with_.get("tags") or "")

        if not re.search(r"^\s*latest\s*=\s*false\s*$", flavor, re.M):
            errors.append(
                "flavor must contain `latest=false` — metadata-action adds a "
                "mutable `latest` to semver tags by default")

        for pattern in re.findall(r"type=semver,pattern=\{\{([^}]+)\}\}", tags):
            if pattern.strip() != "version":
                errors.append(
                    f"type=semver,pattern={{{{{pattern}}}}} is mutable — "
                    "{{major}} and {{major}}.{{minor}} are reassigned by the "
                    "next release; only {{version}} is immutable")

        if on_branch and on_tag:
            for line in tags.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith(SELF_SCOPED):
                    continue
                if "enable=" not in line:
                    errors.append(
                        f"`{line}` is not gated and is not one of the types "
                        "that scope themselves by event, but this workflow "
                        "runs on both branch and tag pushes — so a release "
                        "builds twice and both builds claim this tag. Add "
                        "enable=${{ github.ref_type != 'tag' }}, or add the "
                        "type to SELF_SCOPED if it cannot collide.")

    if errors:
        print(f"release tags: {len(errors)} problem(s) in {path}\n", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        return 1

    print(f"release tags: {path} publishes only immutable references "
          f"({len(steps)} metadata step(s) checked)")
    return 0


if __name__ == "__main__":
    sys.exit(check(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH))
