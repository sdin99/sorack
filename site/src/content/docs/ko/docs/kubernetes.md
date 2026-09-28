---
title: 쿠버네티스에 배포하기
description: 포함된 매니페스트로 쿠버네티스 클러스터에 sorack 을 직접 호스팅합니다.
sourceCommit: 2b108413f99d96b48bb5c1c0781bf90552d4b116
---

배포된 이미지로 설치합니다. `deploy/base` 는 오버레이가 가리킬 Kustomize base 입니다.
네임스페이스, 이미지 digest, 스토리지 클래스, 호스트명처럼 **현장마다 다른 것은 base
에서 의도적으로 빠져 있습니다.** 그래서 오버레이 없이 적용하면 조용히 추측하는 대신
요란하게 실패합니다.

:::caution
이 페이지는 전에 `deploy/dev` 의 **개발용 파드**를 앞세우고 있었습니다. 그것은 클러스터
노드의 체크아웃을 `hostPath` 로 마운트하며, 이미지 기반 설치는 "로드맵에 있다" 고 적혀
있었습니다. v0.1.0 이후로 그건 사실이 아니며, 개발용 파드는 애초에 설치 경로가 아니었습니다.
노드에 소스가 있어야 하고, `hostPath` 는 이 프로젝트 자신의 경화 검사가 거부하는 볼륨
타입 중 하나입니다. 그것은 개발 환경이고, 이제 이 페이지 맨 아래에 개발 환경으로
기록되어 있습니다.
:::

## 준비물

- 기본 `StorageClass` 가 있는 쿠버네티스 클러스터.
- Kustomize 가 포함된 `kubectl`(1.14 이후 내장).
- 선택: Ingress 로 HTTPS 를 쓰려면 ingress 컨트롤러 + cert-manager. 아니면
  `kubectl port-forward` 로도 충분합니다.

## 1. Secret 만들기

DB 설정과 앱 설정이 서로 독립적으로 교체될 수 있도록 Secret 을 둘로 나눕니다:

| Secret       | 원본                       | 사용하는 쪽                |
| ------------ | -------------------------- | -------------------------- |
| `sorack-db`  | `examples/secret-db.yaml`  | postgres statefulset + api |
| `sorack-app` | `examples/secret-app.yaml` | api 만                     |

```bash
kubectl apply -f deploy/dev/namespace.yaml

# 복사해서 실제 값을 채웁니다 (채운 사본은 커밋하지 마십시오)
cp examples/secret-db.yaml  /tmp/sorack-db.yaml
cp examples/secret-app.yaml /tmp/sorack-app.yaml
$EDITOR /tmp/sorack-db.yaml /tmp/sorack-app.yaml
kubectl apply -f /tmp/sorack-db.yaml
kubectl apply -f /tmp/sorack-app.yaml
```

## 2. 오버레이 작성

base 에는 네임스페이스도, 이미지 고정도, 스토리지 클래스도, 호스트명도 없습니다.
이미지를 왜 태그가 아니라 digest 로 고정하는지까지 설명한 전체 주석 템플릿은
[`deploy/base/README.md`](https://github.com/sdin99/sorack/blob/main/deploy/base/README.md)
에 있습니다. 형태는 이렇습니다:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: sorack
resources:
  # 릴리스 태그를 쓰고, 브랜치는 절대 쓰지 마십시오. 브랜치 ref 는 남이 push 하면
  # 내 오버레이가 말없이 다른 것을 렌더한다는 뜻입니다.
  - github.com/sdin99/sorack//deploy/base?ref=v0.1.8
images:
  # 태그가 아니라 digest. `newTag: sha-abc1234` 는 똑같이 구체적으로 보이지만
  # 그렇지 않습니다 — 태그는 움직일 수 있는 포인터이고, 이 프로젝트에서도 릴리스
  # 1분 안에 태그가 두 digest 사이를 옮겨 간 적이 있습니다.
  - name: ghcr.io/sdin99/sorack
    digest: sha256:...   # 해당 버전의 GHCR 패키지 페이지에서
patches:
  - target: { kind: Deployment, name: sorack }
    patch: |
      apiVersion: apps/v1
      kind: Deployment
      metadata: { name: sorack }
      spec:
        template:
          spec:
            containers:
              - name: sorack
                env:
                  - name: POSTGRES_HOST
                    value: sorack-postgres.sorack.svc.cluster.local
                  - name: POSTGRES_DB
                    value: sorack
  - target: { kind: PersistentVolumeClaim, name: sorack-runbooks }
    patch: |
      - op: add
        path: /spec/storageClassName
        value: <your-storage-class>
```

## 3. 적용

```bash
kubectl apply -f deploy/postgres/
kubectl apply -k path/to/your/overlay
```

마이그레이션은 api 가 부팅할 때 자동으로 실행됩니다 — 별도의 마이그레이션 단계는
없습니다.

## 4. UI 열기

이미지 하나가 api 와 웹 번들을 같은 포트로 서비스합니다.

```bash
kubectl port-forward -n sorack svc/sorack 8080:80
# 그다음 http://localhost:8080 을 엽니다
```

:::tip
세션 쿠키에 `Secure` 가 붙어 있으므로 평문 HTTP(port-forward)에서는 로그인이 유지되지
않습니다. HTTPS 를 앞에 두거나, 로컬 테스트라면 `sorack-app` Secret 에
`SORACK_COOKIE_SECURE: "false"` 를 설정하십시오.
:::

`SORACK_ADMIN_PASSWORD` 를 고정하지 않았다면 초기 관리자 비밀번호가 첫 부팅 때 api
로그에 한 번 출력됩니다:

```bash
kubectl logs -n sorack deploy/sorack | grep -i password
```

## sorack 자체를 개발할 때

`deploy/dev` 는 다른 것이고 설치 경로가 아닙니다. 클러스터 노드의 체크아웃을
`hostPath` 로 마운트하고 그 안에서 `pnpm dev` 를 돌리므로 노드에서 수정한 코드가 파드에
바로 반영됩니다 — sorack 을 **고칠 때** 유용하고, sorack 을 **운영하기에는**
부적절합니다:

- 파드가 떨어지는 노드에 소스가 있어야 하고,
- `hostPath` 는 이 프로젝트 자신의 경화 검사가 거부하는 볼륨 타입이라,
  `pod-security.kubernetes.io/enforce=restricted` 가 걸린 네임스페이스는 이것을
  받아들이지 않습니다.
- 단일 포트 번들 대신 5173 에서 Vite 를 서비스하므로 포트와 컨테이너 이름이 위의 모든
  것과 다릅니다.

자기 체크아웃을 가리키게 하고 적용하십시오:

```yaml
volumes:
  - name: src
    hostPath:
      path: /home/youruser/projects/sorack
      type: Directory
```

```bash
kubectl apply -f deploy/postgres/
kubectl apply -f deploy/dev/
kubectl port-forward -n sorack svc/sorack 5173:80
```

컨테이너 이름이 `dev` 이므로 로그를 볼 때 `-c dev` 가 필요합니다.
