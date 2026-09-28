---
title: 설정
description: sorack api의 환경변수.
---

sorack은 설정을 환경변수에서 읽습니다. 쿠버네티스 Secret, `docker -e`, 로컬 `.env`
파일로 설정할 수 있습니다. 전체 목록은
[`api/.env.example`](https://github.com/sdin99/sorack/blob/main/api/.env.example) 파일에
있으며, 자주 쓰는 항목은 아래와 같습니다.

## Postgres (필수)

| 변수                | 기본값      | 비고                        |
| ------------------- | ----------- | --------------------------- |
| `POSTGRES_HOST`     | `localhost` |                             |
| `POSTGRES_PORT`     | `5432`      |                             |
| `POSTGRES_DB`       | `sorack`    |                             |
| `POSTGRES_USERNAME` | `sorack`    |                             |
| `POSTGRES_PASSWORD` | —           | 필수                        |

## 인증

| 변수                     | 기본값 | 비고                                                                |
| ------------------------ | ------ | ------------------------------------------------------------------- |
| `SORACK_AUTH_SECRET`     | 무작위 | 세션 토큰을 해시할 때 쓰는 비밀값입니다. 반드시 설정합니다. 설정하지 않으면 시작할 때마다 새 값이 생성되어 모든 세션이 끊깁니다. `openssl rand -base64 48`로 생성합니다. |
| `SORACK_ADMIN_USERNAME`  | `admin` | 초기 관리자 사용자                                                 |
| `SORACK_ADMIN_PASSWORD`  | 무작위 | 설정하지 않으면 첫 시작 때 생성되어 로그에 한 번 출력됩니다.        |
| `SORACK_COOKIE_SECURE`   | `true` | 로컬에서 평문 HTTP로 접속할 때만 `false`로 설정합니다.              |
| `SORACK_ALLOWED_ORIGINS` | —      | 쉼표로 구분한 CORS 허용 목록. 웹 UI를 api와 다른 origin에서 제공할 때만 필요합니다. |

## 헬스 수집기

| 변수                         | 기본값  | 비고                                        |
| ---------------------------- | ------- | ------------------------------------------- |
| `SORACK_HEALTH_ENABLED`      | `true`  | `false`로 설정하면 수집기를 끕니다.         |
| `SORACK_HEALTH_INTERVAL_MS`  | `30000` | 확인 주기(개발용 매니페스트는 5000)         |
| `SORACK_HEALTH_TIMEOUT_MS`   | `5000`  | 프로브별 타임아웃. 프로브마다 바꿀 수 있습니다. |

## 런북 및 기타

| 변수                   | 기본값  | 비고                                             |
| ---------------------- | ------- | ------------------------------------------------ |
| `SORACK_RUNBOOKS_DIR`  | —       | 런북 `.md` 파일을 두는 디렉터리                   |
| `PORT`                 | `3001`  | API 포트                                         |

## 런북 git 동기화

git 동기화는 선택 사항입니다. 쓰지 않으면 `SORACK_RUNBOOKS_DIR` 디렉터리의 파일이 원본이고
데이터베이스는 그 캐시입니다. git 원격 저장소는 이 디렉터리 위에 선택적으로 더하는
기능입니다.

| 변수                       | 기본값   | 비고                                               |
| -------------------------- | -------- | -------------------------------------------------- |
| `SORACK_GIT_ENABLED`       | —        | 환경변수로 git을 설정할 때 필수입니다. 아래를 참고하십시오. |
| `SORACK_GIT_REMOTE`        | —        | clone과 push에 쓰는 URL                            |
| `SORACK_GIT_BRANCH`        | `main`   |                                                    |
| `SORACK_GIT_USERNAME`      | —        | GitHub이라면 비어 있지 않은 아무 값. 인증은 토큰이 합니다. |
| `SORACK_GIT_TOKEN`         | —        | 저장소 쓰기 권한이 있는 개인 액세스 토큰            |
| `SORACK_GIT_AUTHOR_NAME`   | `sorack` | 커밋 author                                        |
| `SORACK_GIT_AUTHOR_EMAIL`  | —        |                                                    |

:::caution[환경변수로 git을 설정할 때는 `SORACK_GIT_ENABLED=true`를 설정하십시오]
git 동기화는 설정 화면이 데이터베이스에 저장하는 값으로 켜집니다. 환경변수만으로
설정하면 그 값이 없으므로 git 동기화가 꺼진 채로 남습니다.

`SORACK_GIT_REMOTE`와 `SORACK_GIT_TOKEN`만 설정하면 동기화하지 않으며,
`/api/git/pull`은 `412 not configured`를 돌려줍니다.
:::

환경변수는 설정 화면에서 저장한 값보다 우선하며, 필드마다 따로 적용됩니다. 설정 화면은
환경변수로 정해진 필드를 비활성화하고 각 값이 어디서 왔는지 표시합니다. UI에서 먼저
설정한 필드를 나중에 환경변수로 설정하면 환경변수 값이 쓰입니다.

`SORACK_GIT_TOKEN_KEY`는 설정 화면에서 저장해 데이터베이스에 보관하는 토큰을 암호화합니다.
환경변수로만 git을 설정한다면 필요하지 않습니다. 설정한다면 base64로 인코딩한 정확히
32바이트 값이어야 하며(`openssl rand -base64 32`), 그렇지 않으면 api가 시작하지 않습니다.

### 런북이 이미 있는데 지금 원격을 붙이고 싶다면

런북 디렉터리에 파일이 있고, 원격 저장소가 설정되어 있고, 디렉터리가 아직 git 저장소가
아니면 **설정 → 런북**에 **원격에 올리기** 버튼이 표시됩니다. 이
버튼은 기존 파일을 커밋해 push합니다. 원격에 이미 커밋이 있으면 두 이력을 병합합니다.
양쪽에 같은 이름의 파일이 있으면 아무것도 바꾸지 않고 멈추며 충돌한 파일 목록을
보여 줍니다.

Proxmox 같은 선택적 어댑터의 자격 증명은 [프로브와 어댑터](/ko/docs/adapters/)에서
설명합니다.
