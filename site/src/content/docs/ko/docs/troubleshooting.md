---
title: 문제 해결
description: sorack을 운영할 때 흔히 생기는 문제와 해결 방법.
---

이 페이지의 명령은 [쿠버네티스에 배포하기](/ko/docs/kubernetes/)에서 설명한 대로
이미지로 설치했다고 가정합니다. 이미지는 `sorack`이라는 컨테이너 하나로 실행되므로 명령에
`-c` 옵션이 필요 없습니다.

개발용 `deploy/dev`를 실행 중이라면 이 페이지 끝의
[sorack 자체를 개발할 때](#sorack-자체를-개발할-때)를 참고하십시오.

## 파드가 Ready가 되지 않는다

`kubectl describe pod`로 원인을 확인합니다. 흔한 원인은 대부분 오버레이에 있습니다.

| `kubectl get pods` 표시 | 원인 |
| --- | --- |
| `CreateContainerConfigError` | `sorack-db` Secret이 없습니다. 이 Secret에는 기본값이 없는 `POSTGRES_USERNAME`과 `POSTGRES_PASSWORD`가 들어 있어서, 없으면 파드가 시작되지 않습니다. 오류 메시지에 없는 Secret 이름이 나옵니다. `sorack-app` Secret은 선택 사항이며 이 오류의 원인이 아닙니다. |
| `Pending`, 이벤트 `pod has unbound immediate PersistentVolumeClaims` | 런북 PVC에 스토리지 클래스가 없습니다. base는 스토리지 클래스를 지정하지 않으므로 오버레이에서 지정합니다. |
| `ImagePullBackOff` | 고정한 이미지를 받을 수 없습니다. digest로 고정했다면 해당 버전의 GHCR 패키지 페이지와 비교합니다. 가리키는 태그가 없는 digest는 레지스트리에서 삭제될 수 있습니다. |

파드가 Running인데 Ready가 되지 않으면 로그를 확인합니다. readiness 프로브는
`/api/health`를 호출합니다. 대개 PostgreSQL에 연결하지 못하는 경우입니다. api는 최대
60초 동안 마이그레이션을 다시 시도하며, 시도할 때마다 `[migrate] postgres not reachable`
메시지를 남깁니다.

## 로그인은 성공하는데 다음 요청이 401

로그인 폼에서 `POST /api/auth/login → 200`이 나온 뒤, 다음 요청에서
`GET /api/auth/me → 401`이 나옵니다.

**원인**: `kubectl port-forward`처럼 평문 HTTP로 접속하고 있습니다. 세션 쿠키에 `Secure`
속성이 있으므로 브라우저가 HTTP로는 쿠키를 보내지 않습니다.

**해결**: 다음 중 하나를 사용합니다.

- sorack을 HTTPS로 제공합니다. `examples/ingress.yaml` 파일을 복사해 호스트명과 TLS를
  설정합니다.
- 로컬 테스트라면 `sorack-app` Secret에 `SORACK_COOKIE_SECURE: "false"`를 설정하고
  재시작합니다.

```bash
kubectl patch secret sorack-app -n sorack --type=merge \
  -p '{"stringData":{"SORACK_COOKIE_SECURE":"false"}}'
kubectl rollout restart deploy/sorack -n sorack
```

## `relation "auth.users" does not exist`

api는 시작할 때 마이그레이션을 실행하므로, 이 오류는 마이그레이션이 실패했다는 뜻입니다.
api 로그에서 원인을 확인합니다. 대개 데이터베이스에 연결하지 못한 경우입니다.
마이그레이션을 직접 실행하려면 다음 명령을 씁니다.

```bash
kubectl exec -n sorack deploy/sorack -- node dist/db/migrate.js
```

api가 시작할 때 실행하는 것과 같은 마이그레이션 코드입니다. 이미 적용된 마이그레이션은
건너뜁니다.

## 초기 관리자 비밀번호는 어디 있나?

`SORACK_ADMIN_PASSWORD` 값을 설정하지 않았다면 api가 첫 시작 때 비밀번호를 생성해 로그에
출력합니다.

```bash
kubectl logs -n sorack deploy/sorack | grep -A5 "Initial admin"
```

비밀번호는 관리자 사용자를 만들 때 한 번만 출력됩니다. 파드를 재시작해도 다시 출력되지
않습니다.

## 관리자 비밀번호를 잃어버렸다

sorack에는 비밀번호 재설정 기능이 없습니다. 사용자 행을 지우고 재시작하면 sorack이 새
비밀번호로 관리자 사용자를 다시 만듭니다.

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

:::caution
이 명령은 관리자뿐 아니라 모든 사용자를 지우고 세션을 끊습니다. 다른 사용자가 있다면
관리자 행만 수정합니다.
:::

## 파드를 재시작했더니 전원이 로그아웃됐다

`SORACK_AUTH_SECRET` 값이 설정되지 않아 api가 시작할 때마다 새 값을 생성합니다. 기존 세션을
쓸 수 없게 되고, API 키도 모두 동작하지 않아 스크립트가 `401`을 받습니다. `sorack-app`
Secret에 값을 설정한 뒤 API 키를 새로 만듭니다.

```bash
openssl rand -base64 48
# 출력을 sorack-app의 SORACK_AUTH_SECRET 값으로 추가한 뒤:
kubectl rollout restart deploy/sorack -n sorack
```

## sorack 자체를 개발할 때

이 절은 [sorack 자체를 개발할 때](/ko/docs/kubernetes/#sorack-자체를-개발할-때)에서 설명한
개발 환경 `deploy/dev`에만 해당합니다. 노드의 체크아웃을 마운트해 `dev`라는 컨테이너에서
`pnpm dev`를 실행하며, 코드는 `/workspace`에 있습니다. Vite를 5173 포트로 제공합니다.
이 환경에 쓰는 명령에는 `-c dev` 옵션이 필요합니다.

```bash
kubectl logs -n sorack deploy/sorack -c dev
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

### 파드가 `ContainerCreating`에서 오래 머문다

개발용 파드는 첫 시작 때 의존성을 설치하고 Vite와 tsx를 시작합니다. 몇 분 걸릴 수
있으며, 그 뒤로는 코드를 바꾸면 자동으로 다시 불러옵니다. 이미지 설치는 이 과정이
없습니다. 이미지로 설치한 파드가 늦게 뜬다면
[파드가 Ready가 되지 않는다](#파드가-ready가-되지-않는다)를 참고하십시오.

### `pnpm install`이 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 오류로 멈춘다

`hostPath`로 체크아웃을 마운트하기 전에 호스트에서 `pnpm install`을 실행해서, 파드가
다른 libc용으로 빌드된 `node_modules`를 보고 있습니다. 현재
`deploy/dev/deployment.yaml` 파일은 `--config.confirmModulesPurge=false` 옵션을 넘겨 이
확인 창을 건너뜁니다. 예전 사본을 쓰고 있다면 파일을 업데이트합니다.

:::caution
체크아웃을 실행 중인 파드와 공유하고 있다면, 이 확인 창에서 진행하거나 호스트에서 그 옵션을
넘기지 않습니다. 둘 다 파드가 쓰는 `node_modules`를 지우며, 다음 설치가 끝날 때까지
파드가 동작하지 않습니다.
:::
