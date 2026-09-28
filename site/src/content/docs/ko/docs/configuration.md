---
title: 설정
description: sorack api 의 환경변수.
sourceCommit: 2163694f8a8c7c734ed34d74220538353b3b443e
---

sorack 은 모든 것을 `process.env` 에서 읽습니다. 그러니 배포 방식에 맞게 설정을 주입
하십시오 — 쿠버네티스 Secret, `docker -e`, 또는 로컬 `.env`. 전체 목록은
[`api/.env.example`](https://github.com/sdin99/sorack/blob/main/api/.env.example)
에 있고, 주요 항목은 아래와 같습니다.

## Postgres (필수)

| 변수                | 기본값      | 비고                        |
| ------------------- | ----------- | --------------------------- |
| `POSTGRES_HOST`     | `localhost` |                             |
| `POSTGRES_PORT`     | `5432`      |                             |
| `POSTGRES_DB`       | `sorack`    |                             |
| `POSTGRES_USERNAME` | `sorack`    |                             |
| `POSTGRES_PASSWORD` | —           | 필수                        |

## 인증

| 변수                     | 기본값   | 비고                                                                |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| `SORACK_AUTH_SECRET`     | 무작위   | 세션 토큰 pepper. **반드시 설정하십시오** — 안 하면 재시작마다 세션이 초기화됩니다. `openssl rand -base64 48` 로 생성. |
| `SORACK_ADMIN_USERNAME`  | `admin`  | 초기 관리자.                                                        |
| `SORACK_ADMIN_PASSWORD`  | 무작위   | 지정하지 않으면 첫 부팅 때 생성되어 로그에 한 번 출력됩니다.        |
| `SORACK_COOKIE_SECURE`   | `true`   | 로컬에서 평문 HTTP 로 서비스할 때만 `false` 로.                     |
| `SORACK_ALLOWED_ORIGINS` | —        | 쉼표로 구분한 CORS 허용 목록. 웹 UI 가 api 와 다른 origin 에 있을 때만 필요합니다. |

## 헬스 수집기

| 변수                         | 기본값  | 비고                                        |
| ---------------------------- | ------- | ------------------------------------------- |
| `SORACK_HEALTH_ENABLED`      | `true`  | `false` 로 두면 폴러를 끕니다.              |
| `SORACK_HEALTH_INTERVAL_MS`  | `30000` | 사이클 주기(개발용 매니페스트는 5000).      |
| `SORACK_HEALTH_TIMEOUT_MS`   | `5000`  | 프로브별 타임아웃(프로브가 덮어쓸 수 있음). |

## 런북 및 기타

| 변수                   | 기본값  | 비고                                             |
| ---------------------- | ------- | ------------------------------------------------ |
| `SORACK_RUNBOOKS_DIR`  | —       | 런북 `.md` 파일 디렉터리(파일 백엔드).           |
| `PORT`                 | `3001`  | API 포트.                                        |

## 런북 git 동기화

선택 사항입니다. 런북은 git 이 전혀 없어도 동작합니다 — `SORACK_RUNBOOKS_DIR` 안의
파일이 진실의 원천이고 데이터베이스는 그것의 캐시입니다. 원격은 그 디렉터리 위에 얹는
한 겹이지, 디렉터리를 가지기 위한 조건이 아닙니다.

| 변수                       | 기본값   | 비고                                               |
| -------------------------- | -------- | -------------------------------------------------- |
| `SORACK_GIT_ENABLED`       | —        | **환경변수로 git 을 설정한다면 필수.** 아래를 보십시오. |
| `SORACK_GIT_REMOTE`        | —        | clone/push URL.                                    |
| `SORACK_GIT_BRANCH`        | `main`   |                                                    |
| `SORACK_GIT_USERNAME`      | —        | GitHub 이라면 비어 있지 않은 아무 값. 인증은 토큰이 합니다. |
| `SORACK_GIT_TOKEN`         | —        | 개인 액세스 토큰. 해당 저장소에 쓰기 범위.          |
| `SORACK_GIT_AUTHOR_NAME`   | `sorack` | 커밋 author.                                       |
| `SORACK_GIT_AUTHOR_EMAIL`  | —        |                                                    |

:::caution[환경변수로 설정할 때 `SORACK_GIT_ENABLED` 는 선택 사항이 아니다]
저장 모드는 토글이고, 그 토글은 설정 화면이 쓰는 **데이터베이스 행**에 있습니다. 행이
없으면 — 전부 환경변수로 설정한 배포에서는 그게 정상 상태입니다 — `false` 로 읽히고,
다른 것을 무엇을 설정하든 git 은 꺼진 상태로 남습니다.

`SORACK_GIT_REMOTE` 와 `SORACK_GIT_TOKEN` 만 설정하고 끝내면 **설정된 것처럼 보이지만
아무것도 하지 않는** 인스턴스가 됩니다. `/api/git/pull` 은 `412 not configured` 로
답하고, 왜 그런지는 아무도 알려주지 않습니다.
:::

환경변수는 저장된 행을 **필드 단위로** 이깁니다. 설정 화면은 환경변수가 고정한 필드를
회색으로 표시합니다. UI 에서 먼저 넣고 나중에 환경변수로 넣은 필드는 환경변수 값이
되므로 화면을 확인하십시오 — 그 화면은 git 이 **실제로 쓰는 값**을 보여주고, 각 값이
어디서 왔는지 표시합니다.

`SORACK_GIT_TOKEN_KEY` 는 별개입니다. 이것은 설정 화면이 *데이터베이스에 저장한* 토큰을
암호화합니다. 환경변수로 설정한 배포는 아무것도 복호화하지 않으므로 이 값이 필요하지
않습니다. 설정한다면 정확히 base64 32바이트여야 하고(`openssl rand -base64 32`),
아니면 api 가 시작을 거부합니다.

### 런북이 이미 있는데 지금 원격을 붙이고 싶다면

설정 → 런북 화면에, 디렉터리에 파일이 있고 원격이 설정되어 있으며 아직 저장소가
아닐 때 **원격으로 편입(Adopt into remote)** 버튼이 나타납니다. 있는 것을 커밋하고
푸시합니다. 원격에 이미 커밋이 있으면 둘을 병합합니다. 양쪽에 같은 이름의 파일이 있으면
**아무것도 쓰지 않은 채** 거부하고 그 파일 이름을 알려 줍니다.

선택적인 어댑터 자격 증명(Proxmox 등)은 [프로브와 어댑터](/ko/docs/adapters/)에서
다룹니다.
