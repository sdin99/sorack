---
title: 쿠버네티스에 배포하기
description: 포함된 매니페스트로 쿠버네티스 클러스터에 sorack을 직접 호스팅합니다.
sourceCommit: 18ef7ad43da332a0485fd1826643168fed6bd750
---

sorack은 배포된 이미지(`ghcr.io/sdin99/sorack`)로 쿠버네티스에서 실행합니다.
`deploy/base`는 Kustomize base입니다. 이 base를 가리키는 오버레이를 작성하고,
네임스페이스, 이미지 digest, 스토리지 클래스, 호스트명처럼 클러스터마다 다른 값을
오버레이에 넣습니다. base에는 이 값들이 없으므로 오버레이 없이 적용하면 값을 추측하지
않고 오류를 냅니다.

:::note
`deploy/dev`는 개발 환경이며 설치 방법이 아닙니다. 노드의 소스 코드를 `hostPath`로
마운트합니다. [sorack 자체를 개발할 때](#sorack-자체를-개발할-때)를 참고하십시오.
:::

## 준비물

- 기본 `StorageClass`가 있는 쿠버네티스 클러스터
- Kustomize가 포함된 `kubectl`(1.14부터 내장)
- 선택: Ingress로 HTTPS를 쓰려면 ingress 컨트롤러와 cert-manager. 쓰지 않으면
  `kubectl port-forward`로 충분합니다.

## 1. Secret 만들기

데이터베이스 설정과 앱 설정을 따로 교체할 수 있도록 Secret을 두 개 사용합니다.

| Secret       | 원본                       | 사용하는 쪽                |
| ------------ | -------------------------- | -------------------------- |
| `sorack-db`  | `examples/secret-db.yaml`  | postgres statefulset, api  |
| `sorack-app` | `examples/secret-app.yaml` | api                        |

```bash
kubectl apply -f deploy/dev/namespace.yaml

# 예제를 복사해 실제 값을 채웁니다. 값을 채운 사본은 커밋하지 않습니다.
cp examples/secret-db.yaml  /tmp/sorack-db.yaml
cp examples/secret-app.yaml /tmp/sorack-app.yaml
$EDITOR /tmp/sorack-db.yaml /tmp/sorack-app.yaml
kubectl apply -f /tmp/sorack-db.yaml
kubectl apply -f /tmp/sorack-app.yaml
```

## 2. 오버레이 작성

base에는 네임스페이스, 이미지 고정, 스토리지 클래스, 호스트명이 없습니다. 주석을 단
전체 템플릿은
[`deploy/base/README.md`](https://github.com/sdin99/sorack/blob/main/deploy/base/README.md)에
있습니다. 최소한의 오버레이는 다음과 같습니다.

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: sorack
resources:
  # 릴리스 태그로 고정합니다. 브랜치 ref는 누군가 push할 때마다 바뀝니다.
  - github.com/sdin99/sorack//deploy/base?ref=v0.1.8
images:
  # digest로 고정합니다. 태그는 다른 이미지로 옮겨질 수 있습니다.
  - name: ghcr.io/sdin99/sorack
    digest: sha256:...   # 해당 버전의 GHCR 패키지 페이지에서 확인
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

api가 시작할 때 데이터베이스 마이그레이션을 실행합니다. 마이그레이션 단계를 따로 실행할
필요는 없습니다.

## 4. UI 열기

이미지 하나가 api와 웹 UI를 같은 포트로 제공합니다.

```bash
kubectl port-forward -n sorack svc/sorack 8080:80
# 그다음 http://localhost:8080을 엽니다
```

세션 쿠키에 `Secure` 속성이 있으므로 port-forward처럼 평문 HTTP로 접속하면 로그인이
유지되지 않습니다. 서비스 앞에 HTTPS를 두거나, 로컬 테스트라면 `sorack-app` Secret에
`SORACK_COOKIE_SECURE: "false"`를 설정합니다.

`SORACK_ADMIN_PASSWORD`를 설정하지 않았다면 api가 관리자 비밀번호를 생성해 첫 시작 때
로그에 한 번 출력합니다.

```bash
kubectl logs -n sorack deploy/sorack | grep -i password
```

## sorack 자체를 개발할 때

`deploy/dev`는 sorack을 개발할 때 씁니다. 노드의 체크아웃을 `hostPath`로 마운트하고
파드 안에서 `pnpm dev`를 실행하므로, 노드에서 수정한 코드가 바로 반영됩니다. sorack을
운영하는 용도로는 쓰지 않습니다.

- 파드가 실행되는 노드에 소스가 있어야 합니다.
- `hostPath` 볼륨을 쓰는데, 이 프로젝트의 보안 설정 검사가 이를 거부합니다.
  `restricted` Pod Security Standard를 적용한 네임스페이스도 이 파드를 받아들이지
  않습니다.
- 단일 포트 이미지와 달리 5173 포트에서 Vite를 제공하므로, 포트와 컨테이너 이름이 위
  단계와 다릅니다.

볼륨이 자신의 체크아웃을 가리키도록 바꾼 뒤 적용합니다.

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

컨테이너 이름이 `dev`이므로 `kubectl logs`에 `-c dev`를 붙여야 합니다.
