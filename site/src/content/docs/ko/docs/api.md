---
title: API 키
description: 스크립트에서 bearer 키로 sorack api를 호출하는 방법.
---

웹 UI의 모든 동작은 `/api/*`를 거칩니다. 스크립트도 API 키로 같은 API를 호출할 수
있습니다. 동기화 작업, 리컨실러처럼 사람이 브라우저에서 조작하지 않는 도구에는 API 키를
씁니다.

## 키 발급

**설정 → API 키**에서 **새 키**를 선택합니다. 범위를 고르고, 나중에 알아볼 수 있는
이름을 붙인 뒤 값을 복사합니다. sorack은 `sha256(key + AUTH_SECRET)` 값만 저장하므로
키 값은 다시 볼 수 없습니다.

키는 로그인한 세션에서만 만들 수 있습니다. 키로 다른 키를 만들거나 폐기할 수는 없습니다.

## 키 사용하기

```bash
curl -H "Authorization: Bearer $SORACK_API_KEY" \
     https://sorack.example.com/api/inventory
```

## 범위

| 범위 | 허용 |
|---|---|
| `read` | `GET`, `HEAD`, `OPTIONS` |
| `write` | 모든 API 동작 |

범위는 라우트 목록이 아니라 HTTP 메서드로 확인하므로 새 라우트에도 자동으로 적용됩니다.

`POST /api/nodes/:id/probe/test`는 저장된 데이터를 바꾸지 않지만 `write` 범위가
필요합니다. 호출한 쪽이 준 주소로 연결을 열기 때문입니다.

## 오류

```
401  {"error":"unauthorized"}
403  {"error":"this API key is read-only","scope":"read"}
```

`401`은 키가 없거나, 형식이 틀렸거나, 폐기됐거나, 키를 만든 뒤 `SORACK_AUTH_SECRET` 값이
바뀌었다는 뜻입니다([설정](/ko/docs/configuration/#인증) 참고). 새 키를 만듭니다. `403`은
키는 유효하지만 범위가 요청을 허용하지 않는다는 뜻입니다. 범위를 바꾸거나 다른 키를
씁니다. `403`은 다시 시도해도 결과가 같으므로 재시도하지 않습니다.

## 요청이 sorack에 닿는지 확인하기

요청이 성공할 때마다 키의 마지막 사용 시각이 갱신되며, 설정 화면의 키 옆에 표시됩니다.
방금 설정한 키가 여전히 *사용 이력 없음*으로 표시되면 요청이 sorack에 닿지 않는 것입니다.
흔한 원인은 sorack 앞의 인증 프록시가 로그인 페이지를 상태 코드 `200`으로 돌려주는
경우이며, 대부분의 클라이언트는 이를 성공으로 처리합니다.

## 노드에 소프트웨어 붙이기

호스트나 VM에서 실행되는 소프트웨어는 별도의 노드가 아닙니다. 실행되는 노드의
`meta.software`(소프트웨어 id 목록)와 `meta.softwareProbes`(소프트웨어별 프로브)에
저장됩니다. 두 값 모두 그 노드에 `PATCH` 요청으로 설정합니다.

```bash
curl -X PATCH .../api/nodes/k8s-master -H 'content-type: application/json' -d '{
  "meta": {
    "software": ["containerd", "kubelet", "cnpg"],
    "softwareProbes": { "cnpg": { "type": "tcp", "host": "10.0.0.10", "port": 5432 } }
  }
}'
```

`PATCH`는 `meta`를 병합하므로 보내지 않은 키는 유지됩니다. 스크립트에서 주의할 예외가
두 가지 있습니다.

- `meta.software`는 배열이며 통째로 교체됩니다.
- `meta.software` 값을 보내면, 새 목록에 없는 소프트웨어의 프로브를 지웁니다. UI에서
  소프트웨어 선택을 해제하면 그 프로브와 수집된 메트릭이 함께 지워지는 것과 같습니다.

그래서 소프트웨어마다 `PATCH`를 한 번씩 보내면 누적되지 않습니다. 예를 들어
`{"software":["containerd"],…}`를 보낸 뒤 `{"software":["kubelet"],…}`를 보내면 오류 없이
`kubelet`만 남습니다. 한 노드의 소프트웨어 전체 목록을 `PATCH` 한 번에 보냅니다.

`meta.observed.*` 값은 보낼 필요가 없습니다. 수집기가 관리하며, sorack은 쓰기 요청마다
저장된 값을 유지합니다.

## 참고

- 키는 만료되지 않습니다. 더 쓰지 않을 키는 폐기합니다. 폐기하기 전에 마지막 사용 시각을
  확인합니다.
- 검증 오류는 `400`을 돌려주며 필드 이름을 알려 줍니다. `409`는 중복을 뜻합니다. 노드는
  id, 엣지는 `(source, target, type)` 조합이 중복된 경우입니다.
- 이 기능의 이름이 "API tokens"였을 때 만든 키는 `sorack_pat_`로 시작합니다. 새 키는
  `sorack_key_`로 시작하며, 둘 다 사용할 수 있습니다.
