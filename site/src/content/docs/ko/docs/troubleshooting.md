---
title: 문제 해결
description: sorack 을 운영하며 흔히 만나는 문제와 해결 방법.
sourceCommit: 409450194582310c26da1410369ddcf8b3e1ecf0
---

## 로그인은 성공하는데 다음 요청이 401

로그인 폼을 제출하면 `POST /api/auth/login → 200` 이 보이고, 곧바로
`GET /api/auth/me → 401` 이 뜹니다.

**원인:** 앱에 평문 HTTP 로 접근하고 있습니다(예: `kubectl port-forward`). 세션 쿠키는
`Secure` 로 설정되므로 브라우저가 HTTPS 가 아닌 origin 에서는 쿠키를 버립니다.

**해결** (하나 고르십시오):

- HTTPS 를 앞에 두십시오(`examples/ingress.yaml` 을 복사해 호스트명과 TLS 설정).
- 로컬 테스트용이라면 `sorack-app` Secret 에 `SORACK_COOKIE_SECURE: "false"` 를
  설정하고 재시작하십시오:

```bash
kubectl patch secret sorack-app -n sorack --type=merge \
  -p '{"stringData":{"SORACK_COOKIE_SECURE":"false"}}'
kubectl rollout restart deploy/sorack -n sorack
```

## `relation "auth.users" does not exist`

마이그레이션은 api 부팅 때 자동으로 실행됩니다. 이 오류는 마이그레이션 단계가 실패하고
있다는 뜻이므로, api 로그에서 근본 원인을 확인하십시오(대개 DB 연결 문제입니다). 수동으로
실행하려면:

```bash
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

## 초기 관리자 비밀번호는 어디 있나?

`SORACK_ADMIN_PASSWORD` 를 설정하지 않았다면 api 가 첫 부팅 때 하나를 생성하고 한 번
로그에 남깁니다:

```bash
kubectl logs -n sorack -l app=sorack -c dev | grep -A5 "Initial admin"
```

잃어버렸다면 관리자 행을 지우고 재시작하십시오 — 새 비밀번호가 생성됩니다:

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

## 파드를 재시작했더니 전원이 로그아웃됐다

`SORACK_AUTH_SECRET` 이 설정되지 않아 api 가 부팅마다 무작위 값을 생성하고, 예전 세션
토큰이 더 이상 검증되지 않는 것입니다. `sorack-app` Secret 에 설정하십시오:

```bash
openssl rand -base64 48
# 출력을 sorack-app 의 SORACK_AUTH_SECRET 으로 추가한 뒤:
kubectl rollout restart deploy/sorack -n sorack
```

## 파드가 `ContainerCreating` 에서 오래 머문다

첫 부팅에서 의존성을 설치하고 Vite 와 tsx 를 함께 띄웁니다. 몇 분 정도는 정상이며, 그
뒤로는 코드 수정이 핫 리로드됩니다.

## `pnpm install` 이 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 로 중단된다

`hostPath` 로 마운트하기 전에 호스트에서 `pnpm install` 을 실행해서, 파드가 **libc 가
다른** `node_modules` 를 보고 있는 것입니다. 배포 매니페스트는
`--config.confirmModulesPurge=false` 를 넘기므로 최신 체크아웃은 이 프롬프트를
건너뜁니다. 예전 사본을 쓰고 있다면 최신 `deploy/dev/deployment.yaml` 을 받아 오십시오.
