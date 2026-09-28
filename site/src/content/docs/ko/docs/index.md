---
title: 빠른 시작
description: sorack 을 로컬에서 몇 분 안에 띄우거나, 자신의 클러스터에 직접 호스팅합니다.
---

sorack 은 평범한 웹 애플리케이션입니다 — **React (Vite)** 프론트엔드, **Hono
(Node)** API, 그리고 **PostgreSQL**. Node 앱과 Postgres 를 띄우는 방식이면 무엇이든
그대로 쓸 수 있습니다. 저장소에 쿠버네티스 매니페스트가 들어 있지만 그것은 *하나의*
선택지이고 필수 조건이 아닙니다.

## 로컬에서 먼저 보기

가장 빠른 방법입니다. **Node 22**, **pnpm**, 그리고 **PostgreSQL** 인스턴스가
필요합니다 — 어떤 것이든 됩니다. Docker 로 띄우는 예:

```bash
docker run -d --name sorack-pg \
  -e POSTGRES_USER=sorack -e POSTGRES_PASSWORD=sorack -e POSTGRES_DB=sorack \
  -p 5432:5432 postgres:17
```

그다음 클론하고, API 가 그 Postgres 를 보게 한 뒤, 개발 서버 두 개를 띄웁니다:

```bash
git clone https://github.com/sdin99/sorack && cd sorack
pnpm install

export POSTGRES_HOST=localhost POSTGRES_DB=sorack \
       POSTGRES_USERNAME=sorack POSTGRES_PASSWORD=sorack \
       SORACK_COOKIE_SECURE=false   # 로컬에서 평문 http 로 서비스할 때

pnpm dev   # web → http://localhost:5173 · api → :3001
```

마이그레이션은 API 가 부팅할 때 자동으로 실행됩니다. <http://localhost:5173> 을
열어 보십시오 — 초기 관리자 비밀번호는 API 로그에 **한 번만** 출력됩니다(또는
`SORACK_ADMIN_PASSWORD` 로 직접 지정할 수 있습니다). 전체 환경변수 목록은
[설정](/ko/docs/configuration/)에 있습니다.

:::note
sorack 은 설정을 `process.env` 에서 그대로 읽습니다. 그러니 주입 방식은 자유롭게
고르십시오 — 위처럼 셸 `export`, `node --env-file`, `.env` 로더, 또는 쿠버네티스
Secret.
:::

## 직접 호스팅

지속적으로 운영하려면 **배포된 이미지**를 쓰면 됩니다 —
`ghcr.io/sdin99/sorack`, 하나의 컨테이너가 API 와 웹 번들을 단일 포트로
서비스합니다 — 그리고 오버레이가 가리킬 Kustomize base 가 함께 제공됩니다.
[쿠버네티스에 배포하기](/ko/docs/kubernetes/)를 보십시오. sorack 은 결국 Node +
Postgres 앱이므로, 직접 이미지를 빌드하거나 아무 프로세스 매니저 아래에서
돌려도 똑같이 동작합니다.

## 다음으로

토폴로지 화면을 열어 첫 노드를 만들어 보십시오 — 인프라 타입을 고르고, 소프트웨어를
붙이고, 축마다 프로브를 추가하면 StatusLine 이 보고를 시작합니다. 이 모델은
[개념](/ko/docs/concepts/)에서 설명합니다.
