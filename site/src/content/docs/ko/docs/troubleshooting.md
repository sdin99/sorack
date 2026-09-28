---
title: 문제 해결
description: sorack 을 운영하며 흔히 만나는 문제와 해결 방법.
---

이 페이지의 명령은 **이미지 설치**를 전제합니다 —
[쿠버네티스에 배포하기](/ko/docs/kubernetes/)의 컨테이너 하나, 이름은 `sorack`, api 와
웹 번들을 한 포트로 서비스합니다. 이 페이지의 어떤 명령도 `-c <컨테이너>` 를 쓰지
않습니다.

`deploy/dev` 로 돌리고 있다면 그것은 개발 환경이고 설치가 아닙니다. 그쪽 고유의 문제는
[이 페이지 맨 아래](#sorack-자체를-개발할-때)에 있습니다.

## 파드가 Ready 가 되지 않는다

`kubectl describe pod` 이 원인을 알려 줍니다. 가장 자주 만나는 둘은 **sorack 이 아니라
오버레이 쪽**에 있습니다.

| `kubectl get pods` 표시 | 원인 |
| --- | --- |
| `CreateContainerConfigError` | `sorack-db` Secret 이 없습니다. `POSTGRES_USERNAME` 과 `POSTGRES_PASSWORD` 가 여기 있고 기본값을 둘 수 없는 값이라 필수이며, 그래서 admission 단계에서 실패하고 **메시지가 없는 시크릿 이름을 알려 줍니다.** (`sorack-app` 은 실제로 선택 사항이고, 그것이 없어서 나는 오류가 아닙니다.) |
| `Pending`, 이벤트 `pod has unbound immediate PersistentVolumeClaims` | 런북 PVC 에 스토리지 클래스가 없습니다. base 는 의도적으로 지정하지 않으니 오버레이가 지정해야 합니다. |
| `ImagePullBackOff` | 이미지 핀이 해석되지 않습니다. digest 로 고정했다면 해당 버전의 GHCR 패키지 페이지와 대조하십시오 — **유효했던 digest 도 아무 태그가 가리키지 않게 되면 GC 됩니다.** |

Running 인데 계속 Ready 가 안 되는 것은 다른 문제입니다. readiness 프로브가
`/api/health` 를 보므로 로그를 확인하십시오. 대개 Postgres 입니다 — api 는 최대 60초간
마이그레이션을 재시도하며 매 시도를 `[migrate] postgres not reachable` 로 남깁니다.

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

마이그레이션은 api 부팅 때 자동으로 실행됩니다. 따라서 이 오류는 한 번도 실행되지 않았다는
뜻이 아니라 **마이그레이션 단계가 실패했다**는 뜻입니다 — api 로그에서 원인을 확인하십시오
(대개 데이터베이스에 닿지 못한 경우입니다). 손으로 실행하려면:

```bash
kubectl exec -n sorack deploy/sorack -- node dist/db/migrate.js
```

마이그레이션 실행기는 api 가 시작할 때 호출하는 것과 **같은 모듈의 두 번째 진입점**이고,
`.sql` 파일을 자기 파일 위치 기준으로 찾습니다. 그래서 이미지에 별도 도구 없이 컴파일된
산출물만으로 동작합니다. 멱등이므로 이미 적용된 마이그레이션은 건너뜁니다.

## 초기 관리자 비밀번호는 어디 있나?

`SORACK_ADMIN_PASSWORD` 를 설정하지 않았다면 api 가 첫 부팅 때 하나를 생성하고 한 번
로그에 남깁니다:

```bash
kubectl logs -n sorack deploy/sorack | grep -A5 "Initial admin"
```

:::caution
"한 번" 은 말 그대로입니다. 이 줄은 **사용자 행이 실제로 생성될 때만** 출력되므로 파드를
재시작해도 다시 나오지 않습니다 — 사용자 행이 있으면 부트스트랩은 아무것도 하지 않습니다.
그 파드의 로그가 **유일한 사본**입니다.
:::

## 관리자 비밀번호를 잃어버렸다

재설정 흐름은 없습니다. 관리자 행을 지우고 재시작하십시오. 부트스트랩이 사용자가 없는 것을
보고 새 비밀번호를 생성합니다.

```bash
kubectl exec -n sorack sorack-postgres-0 -- sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d sorack -c "delete from auth.users;"'
kubectl rollout restart deploy/sorack -n sorack
```

‼ 이것은 관리자만이 아니라 **모든 사용자 행을 지우고** 그들의 세션을 무효화합니다. 운영자
한 명인 설치에서는 그게 목적이지만, 그 외의 경우에는 해당 행 하나만 수정하십시오.

## 파드를 재시작했더니 전원이 로그아웃됐다

`SORACK_AUTH_SECRET` 이 설정되지 않아 api 가 부팅마다 무작위 값을 생성하고, 예전 세션
토큰이 더 이상 검증되지 않는 것입니다. `sorack-app` Secret 에 설정하십시오:

```bash
openssl rand -base64 48
# 출력을 sorack-app 의 SORACK_AUTH_SECRET 으로 추가한 뒤:
kubectl rollout restart deploy/sorack -n sorack
```

## sorack 자체를 개발할 때

아래는 `deploy/dev` 에만 해당합니다 —
[sorack 자체를 개발할 때](/ko/docs/kubernetes/#sorack-자체를-개발할-때)에서 설명한 hostPath
환경입니다. 노드의 체크아웃을 마운트해 그 안에서 `pnpm dev` 를 돌리므로 **컨테이너 이름이
`dev`**, 코드는 `/workspace`, 그리고 단일 포트 번들이 아니라 5173 에서 Vite 를 서비스합니다.
이쪽을 향한 명령에는 `-c dev` 가 필요합니다:

```bash
kubectl logs -n sorack deploy/sorack -c dev
kubectl exec -n sorack deploy/sorack -c dev -- sh -lc \
  'export PATH=/workspace/.pnpm-home:$PATH; cd /workspace/api && pnpm db:migrate'
```

### 파드가 `ContainerCreating` 에서 오래 머문다

첫 부팅에서 의존성을 설치하고 Vite 와 tsx 를 함께 띄웁니다. 몇 분 정도는 정상이며, 그
뒤로는 코드 수정이 핫 리로드됩니다. **이미지 설치는 이 과정을 거치지 않습니다** —
`deploy/base` 파드가 늦게 뜬다면 [위쪽](#파드가-ready-가-되지-않는다)을 보십시오.

### `pnpm install` 이 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 로 중단된다

`hostPath` 로 마운트하기 전에 호스트에서 `pnpm install` 을 실행해서, 파드가 **libc 가
다른** `node_modules` 를 보고 있는 것입니다. 배포 매니페스트는
`--config.confirmModulesPurge=false` 를 넘기므로 최신 체크아웃은 이 프롬프트를
건너뜁니다. 예전 사본을 쓰고 있다면 최신 `deploy/dev/deployment.yaml` 을 받아 오십시오.

:::caution
그 프롬프트가 **파드가 쓰고 있는 `node_modules` 를 지우는 것과 사용자 사이에 놓인 유일한
장치**입니다. 체크아웃을 실행 중인 파드와 공유하고 있다면, 여기서 yes 를 누르거나 —
파드가 아니라 호스트에서 저 플래그를 넘기면 — 다음 설치가 끝날 때까지 파드가 깨집니다.
:::
