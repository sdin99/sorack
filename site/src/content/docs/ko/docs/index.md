---
title: 빠른 시작
description: sorack을 로컬에서 몇 분 안에 실행하거나 자신의 클러스터에 직접 호스팅합니다.
---

sorack은 React(Vite) 프론트엔드, Hono(Node) API, PostgreSQL 데이터베이스로 이루어진
웹 애플리케이션입니다. Node 앱과 Postgres를 실행할 수 있는 곳이면 어디서든 실행할 수
있습니다. 저장소에 쿠버네티스 매니페스트가 들어 있지만 쿠버네티스가 필수는 아닙니다.

## 로컬에서 먼저 보기

Node 22, pnpm, PostgreSQL 인스턴스가 필요합니다. PostgreSQL은 어떤 것이든 됩니다.
Docker로 실행하는 예는 다음과 같습니다.

```bash
docker run -d --name sorack-pg \
  -e POSTGRES_USER=sorack -e POSTGRES_PASSWORD=sorack -e POSTGRES_DB=sorack \
  -p 5432:5432 postgres:17
```

저장소를 클론하고, API가 그 데이터베이스를 쓰도록 설정한 뒤 개발 서버를 시작합니다.

```bash
git clone https://github.com/sdin99/sorack && cd sorack
pnpm install

export POSTGRES_HOST=localhost POSTGRES_DB=sorack \
       POSTGRES_USERNAME=sorack POSTGRES_PASSWORD=sorack \
       SORACK_COOKIE_SECURE=false   # 로컬에서 평문 http로 접속할 때

pnpm dev   # web → http://localhost:5173 · api → :3001
```

API가 시작할 때 데이터베이스 마이그레이션을 실행합니다. <http://localhost:5173>을
엽니다. 초기 관리자 비밀번호는 API 로그에 한 번 출력됩니다. 비밀번호를 직접 정하려면
`SORACK_ADMIN_PASSWORD` 값을 설정합니다. 전체 환경변수 목록은
[설정](/ko/docs/configuration/)에 있습니다.

:::note
sorack은 설정을 `process.env`에서 읽습니다. 위처럼 셸 `export`를 쓰거나
`node --env-file`, `.env` 로더, 쿠버네티스 Secret으로 설정할 수 있습니다.
:::

## 직접 호스팅

계속 운영하려면 배포된 이미지 `ghcr.io/sdin99/sorack`을 사용합니다. 컨테이너 하나가
API와 웹 UI를 한 포트로 제공합니다. 쿠버네티스용 Kustomize base도 들어 있습니다.
[쿠버네티스에 배포하기](/ko/docs/kubernetes/)를 참고하십시오. 직접 이미지를
빌드하거나 원하는 프로세스 매니저로 실행해도 됩니다.

## 다음으로

토폴로지 화면을 열고 첫 노드를 만듭니다. 인프라 타입을 고르고, 소프트웨어를 붙이고,
축마다 프로브를 추가하면 StatusLine이 상태를 보고하기 시작합니다. 이 모델은
[개념](/ko/docs/concepts/)에서 설명합니다.
