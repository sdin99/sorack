# Documentation style

This guide covers the pages under `site/src/content/docs/`, in English and Korean.
It applies to new pages and to edits of existing ones.

The target is ordinary product documentation: a reader arrives with a task,
finds the step, and leaves. Kubernetes and Starlight documentation are good
references for tone.

## Voice

Write for the reader who is doing the task now.

- Use present tense. Describe what sorack does, not what it used to do.
- Put the action first. Explanation follows only if the reader needs it.
- Address the reader directly in English ("you"). In Korean, see [Korean](#korean).
- One paragraph, one idea.

## Documentation is not a commit message

Most of the problems in the current pages come from one source: they were
written in the same voice as commit messages, design notes, and incident
reports. That voice is right in those places. In product docs it makes the
page hard to follow.

| Belongs in commit messages, ADRs, changelogs | Belongs in docs |
|---|---|
| What the page used to say | What is true now |
| The incident that led to a rule | The rule |
| Measurements from one cluster | Behavior the reader can rely on |
| Why the author chose this wording | Nothing about the wording |

Do not write:

- **History of the page.** "This page used to lead with…", "이 페이지는 전에…".
  If the reader needs to know something changed, link to the changelog.
- **Anecdotes as evidence.** "One bad afternoon would erase your map",
  "40 discoverable Services became 28 on the cluster this was measured against".
  State the behavior. Put the story in the ADR or changelog.
- **Commentary on the text itself.** "The wording is deliberate", "the separation
  is the point", "which is worse than it sounds".
- **Rhetorical contrast.** "X is not Y, it is Z" used for emphasis. Use it only
  when the reader would otherwise confuse X and Y.

## How much "why"

A rule gets one sentence. Add one or two sentences of reason only when the
reader would otherwise work against the rule or be surprised by it. Longer
reasoning goes to an ADR, and the page links to it.

### Example

Before:

> ‼ **Discovery never deletes.** When an object is gone it sets
> `meta.discovered.goneAt` and leaves the node for you to remove. A probe
> refused by RBAC, or pointed at an API server having a bad minute, sees what a
> probe of an emptied namespace sees — if that could delete nodes, one bad
> afternoon would erase your map and report success. A node that reappears
> clears its own mark, and a sweep that could not read a kind never marks that
> kind at all.

After:

> Discovery does not delete nodes. When a discovered object disappears, sorack
> sets `meta.discovered.goneAt` on its node and leaves the node in place. You
> remove it.
>
> sorack cannot tell a deleted object from one it failed to read, for example
> when RBAC denies access or the API server is unavailable. Deleting on absence
> would remove nodes during a temporary outage.
>
> - If the object comes back, sorack clears `goneAt`.
> - If sorack cannot read a kind at all, it does not mark nodes of that kind.

The facts are unchanged. The `‼`, the bold sentence, and the anecdote are gone.
The reason stays because a reader who sees stale nodes will ask why.

## Asides

Starlight asides (`:::note`, `:::tip`, `:::caution`, `:::danger`) interrupt the
page. Use them sparingly.

| Aside | Use for |
|---|---|
| `:::danger` | Data loss or a security exposure that cannot be undone |
| `:::caution` | An action that is hard to reverse, or a common mistake with real cost |
| `:::note` | Information that would break the flow of the main text |
| `:::tip` | An optional shortcut |

Aim for no more than two `caution` or `danger` asides per page. If a page needs
more, the procedure itself probably needs to change.

Do not use an aside to explain the history of the page.

### Example

Before:

> :::caution
> This page used to lead with the **dev pod** under `deploy/dev`, which mounts a
> checkout from the cluster node via `hostPath` and says an image-based install
> "is on the roadmap". That has not been true since v0.1.0, and the dev pod was
> never an install path: […] It is a development setup and is now documented as
> one, at the bottom of this page.
> :::

After:

> :::note
> `deploy/dev` is a development setup and is not used for installation. It mounts
> source from the node through `hostPath`. See [Development setup](#development-setup).
> :::

It is a `note`, not a `caution`: reading it does not prevent data loss.

## Bold

Use bold for:

- A term on first use, where the page defines it.
- UI labels the reader will click ("Select **Save**").

Do not bold whole sentences or clauses for emphasis. One bold phrase per
paragraph is a reasonable ceiling. If everything is bold, nothing is.

## Punctuation

- **`‼`** and other emphasis symbols: do not use.
- **Em dash (—)**: use sparingly in English. A comma, parentheses, a colon, or a
  new sentence usually reads better. In Korean prose, avoid it; see below.
- **Version numbers in running text** ("since v0.1.12"): avoid. A reader on the
  current version does not need them. Put them in the changelog.

## Korean

한국어 페이지에만 해당하는 규칙입니다.

### 문체

- **합니다체**로 씁니다.
- 절차는 **평서형**으로 씁니다. "Secret을 만듭니다", "자세한 내용은 [개발 환경](#)에 있습니다."
- 명령형은 되도록 쓰지 않습니다. 꼭 필요하면 `~하십시오`를 쓰고, `~하세요`(해요체)는 섞지 않습니다.

### 조사는 붙여 씁니다

`` `type` 은 `` 이 아니라 `` `type`은 ``입니다.

코드 뒤에 조사를 붙이면 을/를·은/는을 코드 이름의 발음에 맞춰야 합니다
(`type` → 타입 → `` `type`은 ``, `meta` → 메타 → `` `meta`는 ``). 고르기 어려우면
코드 뒤에 한국어 명사를 둡니다. 대부분의 경우 이쪽이 더 자연스럽습니다.

| 피할 것 | 쓸 것 |
|---|---|
| `` `meta.discovered.goneAt` 을 설정하고 `` | `` `meta.discovered.goneAt` 값을 기록하고 `` |
| `` `hostPath` 로 마운트 `` | `` `hostPath`로 마운트 `` |
| `` `type` 이 `list` 이면 `` | `` `type` 필드가 `list`이면 `` |

### 줄표(—)

한국어 산문에서는 줄표를 쓰지 않습니다. 영어 원문의 줄표를 그대로 옮긴 경우가 대부분입니다.
쉼표, 괄호, 또는 문장 나누기로 바꿉니다.

| 피할 것 | 쓸 것 |
|---|---|
| 발견된 id 는 클러스터 좌표입니다 — `apps/cronjob/nightly-backup` — 그래서… | 탐지된 노드의 id는 클러스터 좌표입니다(예: `apps/cronjob/nightly-backup`). 그래서… |

### 직역투

영어 동사를 그대로 옮기지 않고, 한국어로 무엇을 뜻하는지 씁니다.

| 영어 | 직역 | 쓸 것 |
|---|---|---|
| lead with | 앞세우다 | 먼저 소개하다, 맨 앞에 두다 |
| fail loudly | 요란하게 실패하다 | 오류를 내고 멈추다 |
| degrade gracefully | 부드럽게 degrade 하다 | 일부 기능 없이 계속 동작하다 |
| hardening check | 경화 검사 | 보안 설정 검사 |

### 용어

이미 쿠버네티스·클라우드 커뮤니티에서 굳은 표기는 따르고, sorack 고유 개념만 옮깁니다.
기능 이름을 한국어 명사 하나로 억지로 옮기기보다, 문장에서 무엇을 하는지 풀어 씁니다.

| 영어 | 한국어 | 비고 |
|---|---|---|
| node | 노드 | |
| probe | 프로브 | |
| overlay | 오버레이 | Kustomize 용어 |
| sync | 동기화 | |
| collector | 수집기 | |
| adapter | 어댑터 | |
| runbook | 런북 | |
| discovery | 자동 탐지 | "발견"은 사건을 뜻해 기능 이름으로 어색합니다. 문장에서는 "탐지된 노드"처럼 씁니다 |
| topology | 토폴로지 | |

이 표는 초안입니다. 용어를 확정하면 이 표를 고치고, 모든 페이지를 한 번에 맞춥니다.

## Checks

Some of these rules can be checked automatically. `scripts/check-docs-style.py`
(or the existing docs job) should fail the build on:

| Check | Rule |
|---|---|
| `‼` in prose | 0 |
| Page-history phrases ("used to", "this page previously", "이 페이지는 전에") | 0 |
| Korean particle after inline code with a space (`` `x` 을 ``) | 0 |
| Em dash in Korean prose | 0 |
| Version numbers in running text (`v0.1.x`) | 0, outside the changelog |

Every pattern needs two test strings: one it must match and one it must not.
Run both before trusting a count of zero. Bold spans often cross a line break in
these files, so match across newlines; a single-line pattern undercounts.

These rules cannot be checked automatically and need review:

- Whether the reason given for a rule is needed at all.
- Whether an anecdote has been turned into a plain statement or just reworded.
- Whether a translated sentence reads as natural Korean.
