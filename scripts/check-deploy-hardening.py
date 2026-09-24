#!/usr/bin/env python3
"""Assert that the rendered deploy/base keeps its hardening properties.

This exists because a claim in a README rots silently. `deploy/base/README.md`
says the workload is compatible with Kubernetes' `restricted` Pod Security
Standard; without a gate, the first person to add a volume or drop a field
makes that sentence false and nothing notices. We watched exactly that happen
elsewhere: a manifest comment named a "follow this one" example that had
itself drifted out of policy, so everyone who followed it inherited the drift.

WHAT THIS IS NOT: a Pod Security Standard implementation. It checks the
specific fields that `restricted` rejected this workload for, plus the host
escapes we never want. Passing here means "the known regressions are absent",
not "the API server would admit this". The authoritative check is a
server-side dry-run against a namespace labelled `enforce=restricted`.

Usage:  kubectl kustomize deploy/base | python3 scripts/check-deploy-hardening.py
"""

import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: pip install pyyaml")

# Volume types `restricted` forbids. hostPath is the one that actually bit us
# (the dev pod mounts the source tree); the rest are here so a future edit
# cannot quietly introduce a host escape.
FORBIDDEN_VOLUMES = {
    "hostPath", "gcePersistentDisk", "awsElasticBlockStore", "gitRepo",
    "nfs", "iscsi", "glusterfs", "rbd", "flexVolume", "cinder",
    "cephfs", "flocker", "fc", "azureFile", "vsphereVolume", "quobyte",
    "azureDisk", "portworxVolume", "scaleIO", "storageos",
}


def check_pod_spec(kind: str, name: str, spec: dict) -> list[str]:
    errs: list[str] = []
    where = f"{kind}/{name}"

    pod_sc = spec.get("securityContext") or {}
    if pod_sc.get("runAsNonRoot") is not True:
        errs.append(f"{where}: pod securityContext.runAsNonRoot must be true")
    if (pod_sc.get("seccompProfile") or {}).get("type") not in ("RuntimeDefault", "Localhost"):
        errs.append(f"{where}: pod securityContext.seccompProfile.type must be RuntimeDefault")
    # runAsNonRoot alone is not enough. The kubelet verifies it against the
    # image's USER and cannot resolve a name, so an image built with
    # `USER node` is rejected with "non-numeric user, cannot verify user is
    # non-root" — CreateContainerConfigError, before anything runs. This
    # manifest passed every other check here while being unstartable.
    if pod_sc.get("runAsNonRoot") is True and not isinstance(pod_sc.get("runAsUser"), int):
        errs.append(f"{where}: runAsNonRoot requires a numeric runAsUser "
                    f"(the kubelet cannot resolve a username)")

    for field in ("hostNetwork", "hostPID", "hostIPC"):
        if spec.get(field):
            errs.append(f"{where}: {field} must not be set")

    for vol in spec.get("volumes") or []:
        for key in vol:
            if key in FORBIDDEN_VOLUMES:
                errs.append(f"{where}: volume {vol.get('name')!r} uses forbidden type {key!r}")

    containers = (spec.get("containers") or []) + (spec.get("initContainers") or [])
    if not containers:
        errs.append(f"{where}: no containers found — check the parser, not the manifest")

    for c in containers:
        cn = f"{where}/{c.get('name')}"
        sc = c.get("securityContext") or {}
        if sc.get("allowPrivilegeEscalation") is not False:
            errs.append(f"{cn}: allowPrivilegeEscalation must be false")
        if sc.get("privileged"):
            errs.append(f"{cn}: privileged must not be true")
        if (sc.get("capabilities") or {}).get("drop") != ["ALL"]:
            errs.append(f"{cn}: capabilities.drop must be exactly ['ALL']")
        if sc.get("readOnlyRootFilesystem") is not True:
            errs.append(f"{cn}: readOnlyRootFilesystem must be true")

        image = c.get("image", "")
        # A base must never carry a resolvable mutable tag — an overlay or CI
        # pins the real one. REPLACE_ME is the deliberate placeholder.
        if image.endswith(":latest"):
            errs.append(f"{cn}: image must not use the :latest tag [POLICY 3.1]")

        res = c.get("resources") or {}
        if not res.get("requests") or not res.get("limits"):
            errs.append(f"{cn}: resources.requests and resources.limits are required")

    return errs


def main() -> int:
    docs = [d for d in yaml.safe_load_all(sys.stdin) if d]
    if not docs:
        print("no documents on stdin — did kustomize render anything?", file=sys.stderr)
        return 2

    errors: list[str] = []
    checked = 0
    for doc in docs:
        kind = doc.get("kind")
        name = (doc.get("metadata") or {}).get("name", "?")
        if kind in ("Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"):
            spec = ((doc.get("spec") or {}).get("template") or {}).get("spec") or {}
        elif kind == "CronJob":
            # CronJob pod specs are two levels deeper, and are the thing most
            # often missed: between runs there is no pod to inspect, so a
            # survey of running workloads reports the namespace as clean.
            spec = ((((doc.get("spec") or {}).get("jobTemplate") or {}).get("spec") or {})
                    .get("template") or {}).get("spec") or {}
        elif kind == "Pod":
            spec = doc.get("spec") or {}
        else:
            continue
        checked += 1
        errors.extend(check_pod_spec(kind, name, spec))

    if checked == 0:
        # Silence here would mean "nothing wrong" when it really means
        # "nothing looked at" — the failure mode this whole script is about.
        print("no workloads found to check — refusing to report success", file=sys.stderr)
        return 2

    if errors:
        print(f"deploy hardening: {len(errors)} problem(s) across {checked} workload(s)\n",
              file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        return 1

    print(f"deploy hardening: {checked} workload(s) OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
