---
title: 노드 타입과 meta
description: 노드가 가질 수 있는 타입 목록과 meta 키를 누가 쓰는지 설명합니다.
---

노드에는 `type` 값과 `meta` 객체가 있습니다. 상세 패널에 어떤 필드를 보여 줄지는
타입이 정합니다. `meta`에는 사용자, 수집기, 그리고 인벤토리를 sorack으로 동기화하는
도구가 쓴 데이터가 들어갑니다. 이 페이지는 두 가지의 레퍼런스이며,
[`/api/nodes`](/ko/docs/api/)를 호출하는 도구를 만들 때 특히 유용합니다.

## 타입 목록

`type`은 아래 값 중 하나여야 합니다. 그 밖의 값을 보내면 API가 400 오류로 거부하며,
오류 메시지에 허용되는 타입 목록이 들어 있습니다.

| `type` | 용도 | 기본 프로브 |
| --- | --- | --- |
| `host` | 물리 장비 또는 베어메탈 머신 | `system` |
| `vm` | 하이퍼바이저 위의 가상 머신 | `system` |
| `container` | LXC 같은 OS 수준 컨테이너 | `system` |
| `router` | LAN과 인터넷 사이의 게이트웨이 | `tcp` |
| `k8s_cluster` | 쿠버네티스 클러스터 | `k8s` |
| `k8s_namespace` | 워크로드를 묶는 네임스페이스 | `k8s` |
| `k8s_service` | Pod를 노출하는 Service | `k8s` |
| `k8s_pvc` | PersistentVolumeClaim | `k8s` |
| `k8s_cronjob` | 예약 배치 작업 | `k8s` |
| `external_service` | 의존하지만 직접 운영하지 않는 서비스 | `http` |
| `hosted_app` | 직접 배포하고 관리하지만 다른 업체의 플랫폼에서 실행되는 앱 | `http` |
| `share` | 네트워크 파일 공유(NFS, SMB) | `tcp` |

짧은 형태 네 가지도 받습니다. `ct`(`container`), `ns`(`k8s_namespace`),
`pvc`(`k8s_pvc`), `svc`(`k8s_service`)입니다. 별도의 타입이 아니며, 상세 패널과
타입 선택기는 이 값을 원래 타입으로 다룹니다.

### 비슷한 타입 고르기

**`external_service`와 `hosted_app`**: 실행 위치가 아니라 직접 바꿀 수 있는지로
고릅니다. 직접 배포하고 패치하는 함수는 다른 업체가 실행하더라도 `hosted_app`입니다.
그 업체의 플랫폼 자체는 `external_service`입니다. 외부 서비스에 `host` 타입을 쓰지
않습니다. `ip`, `os`, `kernel`, `uptime` 필드가 항상 비어 있게 됩니다.

**`k8s_service`와 `k8s_cronjob`**: CronJob에는 클러스터 IP, 포트, selector,
엔드포인트가 없으므로 Service 필드가 맞지 않습니다. CronJob 타입은 `schedule`,
`lastScheduleTime`, `lastSuccessfulTime`, `lastStatus`, `suspend` 값을 보여 줍니다.
sorack은 이 값을 [보고만 하고 판정하지 않습니다](/ko/docs/adapters/#쿠버네티스).

## `meta`

`meta`는 자유 형식 객체입니다. 키는 누가 쓰는지에 따라 세 무리로 나뉘며, 무리마다
쓰는 주체는 하나여야 합니다.

| 무리 | 쓰는 주체 | 예시 키 |
| --- | --- | --- |
| 사용자 필드 | 사용자(UI 또는 API) | `role`, `ip`, `provider`, `software` |
| 관측값 | 수집기(확인할 때마다) | `observed.*` 아래 전부 |
| 동기화 주석 | 인벤토리를 sorack으로 동기화하는 도구 | `syncedBy`, `probeSkipped`, `adr` |

`POST`와 `PATCH`에 모두 다음 두 규칙이 적용됩니다.

- `null` 값을 보내면 그 키를 지웁니다. sorack은 `null`을 저장하지 않습니다.
- `observed` 값은 무시합니다. 관측값은 수집기만 씁니다.

`PATCH`는 `meta`를 교체하지 않고 병합하므로 바꿀 키만 보내면 됩니다. 병합 깊이는
키마다 다릅니다.

| 키 | `PATCH` 시 |
| --- | --- |
| `manual`, `softwareProbes` | 한 단계 더 깊이 병합합니다. 다른 항목은 유지됩니다. |
| `observed` | 무시합니다. 저장된 값을 유지합니다. |
| 그 밖의 키 | 통째로 교체합니다. |

예를 들어 `{"meta":{"manual":{"ip":"10.0.0.2"}}}`는 `ip` 값만 바꾸고 다른 manual
필드는 그대로 둡니다. `{"meta":{"adr":[…]}}`는 배열 전체를 교체합니다.

`POST`와 `PATCH`는 모두 저장된 필드와 함께 sorack이 계산한 `monitored` 불리언을
돌려줍니다.

### 동기화가 쓰는 키

다른 원천을 기준으로 노드를 관리하는 도구가 UI에서 자신을 설명할 수 있도록 세 가지
키가 있습니다. 모두 선택 사항이며, 평범한 `meta` 키이므로 직접 설정해도 됩니다.

**`syncedBy`**: 노드를 쓴 도구의 이름입니다.

```jsonc
{ "meta": { "syncedBy": "inventory-sync" } }
```

상세 패널은 도구가 쓴 값 옆에 *inventory-sync에서 옴*을 표시하고, 여기서 고친 값이
도구의 다음 실행에서 바뀔 수 있다는 툴팁을 보여 줍니다. 필드는 계속 편집할 수 있습니다.

**`probeSkipped`**: 노드에 프로브가 없는 이유입니다.

```jsonc
{ "meta": { "probeSkipped": "앞단이 인증 프록시라 200은 프록시의 응답" } }
```

노드가 [**모니터링 안 됨**](/ko/docs/concepts/#모니터링-안-됨과-unknown)인 이유는 아직
프로브를 설정하지 않았거나, 프로브가 틀린 답을 내기 때문입니다. `probeSkipped` 값은
두 번째 경우를 기록합니다. 이 값은 *모니터링 안 됨* 라벨 옆에만 표시되므로 모니터링되는
노드에는 나타나지 않습니다.

**`adr`**: 노드가 왜 있는지 설명하는 결정 기록 배열입니다.

```jsonc
{
  "meta": {
    "adr": [
      { "id": "ADR-014", "title": "앱마다 네임스페이스 하나", "url": "https://…" }
    ]
  }
}
```

`id` 값은 필수입니다. `title` 값이 없으면 `id` 값을 대신 보여 줍니다. `url` 값은
`http://` 또는 `https://`로 시작할 때만 링크로 표시됩니다.

sorack은 링크만 저장하고 결정 내용 자체는 저장하지 않습니다. 결정 기록은 그것을 작성하고
검토하는 저장소에 둡니다.

배열이 비어 있으면 상세 패널에 "관련 결정" 구역이 표시되지 않습니다.

:::note
sorack은 모르는 키도 저장하고 그대로 돌려주므로 `meta`에 자신의 데이터를 넣어 둘 수
있습니다. 키 이름을 잘못 써도 오류가 나지 않으니, 처음 쓴 뒤에는 상세 패널을
확인하십시오.
:::
