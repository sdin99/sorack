# UI copy

Three rules. They came out of one string being rewritten twice, and they are
here so the next person does not have to rediscover them.

### 1. One string answers one question

The API-key panel used to open with this:

> Send as `Authorization: Bearer <token>`. Read tokens may only GET; write
> tokens may change anything the API exposes. Tokens do not expire — revoke
> them here.

Three answers in one paragraph — how to send it, what the scopes mean, whether
it expires. Someone who wanted one of the three had to read all three. Each
answer now sits where its question is asked: the scope hint under the scope
field, the expiry note in the list you revoke from.

### 2. The screen says what to do; the protocol goes in the docs

`Authorization: Bearer` is reference material. When it lives in a label it
rots there, out of sight of whoever updates the real documentation. Put the
mechanism in `site/src/content/docs/`, and leave the screen the thing a person
does next.

The exception is a value they are about to copy. Showing the literal header is
not documentation, it is the value — so that stays.

### 3. Write it to be scanned

Nobody reads a settings screen; they look for one thing. `label: value` beats
a sentence, and a fragment beats a clause.

```
no    만료되지 않으니 여기서 취소하십시오.
yes   만료 없음 · 취소하면 즉시 끊깁니다
```

`—` and parentheses are fine — `브랜치 없음 — 먼저 commit 필요` packs a state
and an action into one line, which is exactly what a label should do. The
problem was never the punctuation.

## What "too AI" turned out to mean

A complete, balanced sentence that covers every case reads as machine-written
even when every word is correct. People writing UI copy leave things out and
put the rest where it is needed. If a string is grammatically perfect prose,
that is the signal to check it against rule 1.

## Practical notes

- `ko` and `en` must carry the same key set. A key present in one and missing
  from the other silently falls back to the `defaultValue` in the component,
  which means one language quietly shows the other's text.
- `defaultValue` in the component is the English string. Keep it in sync with
  `en/common.json`; it is what renders if a key goes missing.
- Vocabulary: our own credentials are **API keys**. A GitHub personal access
  token is a **token**, because that is GitHub's word for it and someone
  looking for an "API key" in GitHub's settings will not find one.
