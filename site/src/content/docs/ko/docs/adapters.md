---
title: 프로브와 어댑터
description: 내장 프로브 어댑터와 설정 방법, 어댑터를 직접 만드는 방법.
---

프로브는 UI에서 노드의 축마다 하나씩 붙입니다. 각 프로브는 **어댑터**를 사용합니다.
어댑터는 한 종류의 대상을 확인하는 작은 모듈입니다.

## 내장 어댑터

| 어댑터    | 확인하는 것                               | 자격 증명                  |
| --------- | ----------------------------------------- | -------------------------- |
| `tcp`     | 호스트와 포트로 TCP 연결                  | 없음                       |
| `http`    | HTTP(S) 요청의 상태 코드와 지연 시간      | 없음                       |
| `k8s`     | 클러스터 안에서 본 쿠버네티스 리소스      | 클러스터 내 ServiceAccount |
| `proxmox` | Proxmox VE 노드와 게스트 상태             | API 토큰                   |
| `system`  | `node_exporter` 메트릭(`:9100/metrics`)   | 없음                       |

어댑터에 필요한 환경이 설정되지 않았으면 오류 대신 `unknown`을 돌려줍니다.

## 설정

### Proxmox VE

전용 사용자를 만든 뒤, Proxmox의 **Datacenter → Permissions → API Tokens**에서 그
사용자의 API 토큰을 만듭니다.

```bash
SORACK_PROXMOX_USER=sorack@pve!tokenid
SORACK_PROXMOX_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SORACK_PROXMOX_INSECURE=true   # PVE가 자체 서명 인증서를 쓸 때만
```

:::danger[`root@pam` 토큰을 쓰지 말고 Privilege Separation을 켜 두십시오]
sorack은 Proxmox에서 읽기만 합니다. 사용자에게 `/` 경로의 `PVEAuditor` 역할만 주고
다른 권한은 주지 않습니다.

자기 ACL 항목이 없는 토큰이라고 해서 안전한 것은 아닙니다. Privilege Separation이
켜져 있으면(`privsep=1`, 기본값) 그런 토큰에는 권한이 없습니다. 꺼져 있으면 토큰이
사용자의 권한을 모두 가지며, `root@pam`이라면 클러스터 전체 권한입니다. 두 경우 모두
ACL 항목이 없게 보이므로 권한 목록만으로는 구분할 수 없습니다.

sorack 인스턴스마다 토큰을 따로 씁니다. 그래야 개발용 토큰이 유출되어도 운영 환경에
접근할 수 없습니다.
:::

### node_exporter (system 프로브)

자격 증명이 필요 없습니다. 호스트에
[node_exporter](https://github.com/prometheus/node_exporter)를 설치하면 system
프로브가 `:9100/metrics`를 읽습니다.

### 쿠버네티스

어댑터는 클러스터 내 ServiceAccount를 사용하므로 설정할 환경변수가 없습니다. RBAC은
`deploy/base/rbac.yaml` 파일에 있으며, Secret을 제외한 리소스에 대한 읽기 전용 `get`,
`list` 권한입니다.

프로브는 설정에 따라 세 가지 중 하나를 확인합니다.

```jsonc
{ "type": "k8s", "namespace": "alpha" }                         // 네임스페이스
{ "type": "k8s", "namespace": "alpha", "service": "gateway" }    // Service 하나
{ "type": "k8s", "namespace": "alpha", "cronjob": "db-backup" }  // CronJob 하나
```

**네임스페이스**: `namespace` 값만 있거나 아무 값도 없으면(노드 이름을 사용) 네임스페이스를
보고합니다. Pod, Deployment, StatefulSet의 준비 상태와 Service, Ingress 개수, 길이가
제한된 워크로드 목록을 보여 줍니다. 아무것도 찾지 못하면 `ok`가 아니라 `unknown`을
보고합니다. 빈 네임스페이스는 건강한 네임스페이스와 다르고, 프로브가 리소스를 읽지 못했을
수도 있기 때문입니다.

**Service**: `service` 값이 있으면 `svc_type`, `clusterIP`, `ports`, `selector`,
`endpoints` 값을 채우고, 준비된 엔드포인트가 있으면 `ok`를 보고합니다.

Service에 `ownerReferences` 값이 있으면, 즉 오퍼레이터 같은 다른 리소스가 만든 Service라면,
엔드포인트가 없을 때 `unknown`을 보고하고 소유자를 알려 줍니다. 인스턴스를 몇 개 둘지는
소유자가 정하기 때문입니다. 예를 들어 인스턴스가 하나인 데이터베이스에는 읽기 복제본이
없으므로 읽기 전용 Service에 엔드포인트가 없는 것이 정상입니다. 0으로 스케일된
Deployment를 준비된 상태로 보는 것과 같은 규칙입니다.

**CronJob**: `cronjob` 값이 있으면 `schedule`, `suspend`, `lastScheduleTime`,
`lastSuccessfulTime`, `lastStatus` 값을 채우고, 마지막 실행 결과만으로 판정합니다.
CronJob이 늦었다고는 보고하지 않습니다. 늦었는지 판단하려면 스케줄에 맞는 기준이
필요한데, 고정된 기준은 주간 작업이나 시간 단위 작업 중 한쪽에는 맞지 않습니다.
타임스탬프를 보여 주므로 직접 판단할 수 있습니다.

쿠버네티스는 이력 한도를 넘은 완료된 Job을 지웁니다(기본값: 성공 3개, 실패 1개). 그래서
실행 사이에는 확인할 Job이 남아 있지 않은 경우가 많습니다. 이때 sorack은 CronJob 자체의
status를 사용합니다. `lastSuccessfulTime` 값이 `lastScheduleTime` 값과 같거나 그
이후라면 가장 최근 실행이 성공한 것이므로 `ok`를 보고합니다.

실행이 마지막 성공 이후에 시작됐고 그 Job이 지워졌다면, 실패했는지, 아직 실행 중인지,
정리된 것인지 구분할 수 없습니다. 이때 프로브는 `unknown`을 보고하고 메시지에 그 이유를
적습니다.

### 자동 탐지

자동 탐지는 기본적으로 꺼져 있습니다. 네임스페이스 프로브에 `discover: true`를 넣으면
네임스페이스의 Service와 CronJob마다 노드를 만듭니다.

```jsonc
{ "type": "k8s", "namespace": "apps", "discover": true }
```

프로브가 단독으로 확인할 수 있는 종류만 노드로 만듭니다. Deployment에는 프로브 모드가
없으므로 네임스페이스 집계에만 나타납니다. `ownerReferences` 값이 있는 Service도 위에서
설명한 이유로 건너뜁니다. 이런 Service는 네임스페이스 보고에서 그것을 만든 리소스별로
묶여 표시됩니다.

탐지된 노드에는 해당 객체를 확인하는 프로브가 이미 설정되어 있습니다.

탐지된 노드의 id는 클러스터 좌표입니다(예: `apps/cronjob/nightly-backup`). 그래서 다음
확인 때 새 노드를 만들지 않고 같은 노드를 찾습니다. 기존 노드에 그 객체를 확인하는 프로브가
이미 있으면 노드를 새로 만들지 않습니다. 노드 이름은 클러스터의 이름과 다를 수 있으므로
sorack은 이름이 아니라 프로브로 노드를 맞춥니다.

자동 탐지는 노드를 지우지 않습니다. 탐지된 객체가 사라지면 sorack은 그 노드에
`meta.discovered.goneAt` 값을 기록하고 노드는 그대로 둡니다. 노드는 직접 지웁니다.

sorack은 삭제된 객체와 읽지 못한 객체를 구분할 수 없습니다. 예를 들어 RBAC이 접근을
거부하거나 API 서버를 쓸 수 없는 경우입니다. 없어졌다고 지우면 일시적인 장애 중에 노드가
지워집니다.

- 객체가 다시 나타나면 sorack이 `goneAt` 값을 지웁니다.
- 어떤 종류를 아예 읽지 못하면 그 종류의 노드에는 표시하지 않습니다.

## 어댑터 만들기

새 소스를 추가하려면 `api/src/health/adapters/` 아래에 파일 하나를 추가하고 한 번
등록합니다. 어댑터는 노드의 프로브 설정을 받아 상태와 선택적 메트릭을 돌려주는 프로브
함수를 export합니다. 등록하면 UI에서 그 프로브 타입을 고를 수 있습니다.

:::tip
설정되지 않은 어댑터는 `unknown`을 돌려주므로, 새 어댑터를 배포한 뒤 노드 하나씩 켜 나갈
수 있습니다.
:::
