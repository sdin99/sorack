// Strings for the landing page (src/components/Landing.astro).
//
// English and Korean share one component, so the only thing that can differ
// between / and /ko/ is this file. Everything here is plain text.
//
// ‼ No markup in these strings. The component's CSS is scoped: Astro tags each
// element it renders with a generated attribute and rewrites the selectors to
// require it. Markup injected with set:html never gets that attribute, so it
// silently loses its styles. The hero's <em> did exactly that, on both pages:
// it went from accent-coloured to the browser's default italic. Where a
// sentence needs an element inside it, split the sentence around it instead.
//
// Korean follows site/STYLE.md. The mock UI inside the page (node names, pills,
// adapter chips, the terminal commands) stays in English on both pages: it
// depicts the app and a shell, not prose.

export const landing = {
  en: {
    lang: "en",
    title: "sorack — homelab control plane",
    description:
      "The control plane for the homelab you actually run. Inventory, topology and per-axis monitoring in one self-hosted, open-source dashboard.",
    docsHref: "/docs/",
    homeAria: "sorack home",
    brandSub: "homelab control plane",
    navFeatures: "Features",
    navDocs: "Docs",
    langSwitchLabel: "한국어",
    langSwitchHref: "/ko/",
    themeLabel: "Toggle theme",
    menuLabel: "Menu",
    heroKicker: "homelab control plane · MIT",
    heroTitlePre: "The control plane for the homelab you ",
    heroTitleEm: "actually run",
    heroTitlePost: ".",
    heroLede:
      "Inventory, topology and monitoring in one self-hosted dashboard. Edit your infrastructure as a live graph — two-axis nodes, typed edges, per-axis probes and linked runbooks.",
    ctaGithub: "View on GitHub",
    ctaDocs: "Read the docs",
    featKicker: "features",
    featTitle: "Everything your homelab is, on one canvas.",
    // Said "Six primitives" over five cards.
    featLede:
      "Primitives that mirror how self-hosted infrastructure actually behaves — no abstractions you have to translate back.",
    topoLabel: "inventory + topology",
    topoTitle: "Edit the graph directly",
    topoBody:
      "Create, rename, reparent and draw typed edges right on the canvas. dagre lays it out for you, every time.",
    axesLabel: "two-axis node model",
    axesTitle: "Infra × software, merged",
    axesBody:
      "Every node is an infra type plus zero or more software attachments. Detail and monitoring slots merge across both axes.",
    monLabel: "per-axis monitoring",
    monTitle: "One probe per axis",
    monBody:
      "Infra reachability and software API checks run side by side. StatusLine picks the primary axis and switches to a pill row.",
    adaptLabel: "built-in adapters",
    adaptTitle: "Probe anything — adding one is a file and a line",
    adaptBody:
      "Ship with tcp, http, k8s (in-cluster), proxmox (PVE API) and system (node_exporter scrape). A new adapter is a single file plus one register call.",
    rbLabel: "runbooks",
    rbTitle: "Markdown, linked to nodes",
    rbBodyPre: "In-app CodeMirror split-view editor, ",
    rbBodyPost: " links, git sync and attachments.",
    showKicker: "in the app",
    showTitle: "The site is just the app, standing still.",
    showLede:
      "Real screens from sorack — your homelab as a live topology graph, and a node's two-axis detail.",
    shotTopoAlt: "sorack topology view — nodes and typed edges with live status",
    shotDetailAlt: "sorack node detail — spec, status and related runbooks",
    qsKicker: "quickstart",
    qsTitle: "Up and running in minutes.",
    qsBody:
      "A React + Hono + Postgres app — run it locally, or self-host on Kubernetes. The full guide is in the docs.",
    qsCta: "Full guide",
    qsComment1: "# need Node 22 + any Postgres instance",
    qsComment2: "# point at your Postgres, then start web + api",
    footTagline: "sorack — homelab control plane",
  },
  ko: {
    lang: "ko",
    title: "sorack — 홈랩 컨트롤 플레인",
    description:
      "실제로 운영하는 홈랩을 위한 컨트롤 플레인입니다. 인벤토리, 토폴로지, 축별 모니터링을 셀프 호스팅 오픈소스 대시보드 하나에서 다룹니다.",
    docsHref: "/ko/docs/",
    homeAria: "sorack 홈",
    brandSub: "홈랩 컨트롤 플레인",
    navFeatures: "기능",
    navDocs: "문서",
    langSwitchLabel: "English",
    langSwitchHref: "/",
    themeLabel: "테마 전환",
    menuLabel: "메뉴",
    heroKicker: "홈랩 컨트롤 플레인 · MIT",
    heroTitlePre: "",
    heroTitleEm: "실제로 운영하는",
    heroTitlePost: " 홈랩을 위한 컨트롤 플레인.",
    heroLede:
      "인벤토리, 토폴로지, 모니터링을 셀프 호스팅 대시보드 하나에서 다룹니다. 2축 노드, 타입이 있는 엣지, 축별 프로브, 연결된 런북으로 인프라를 그래프 그대로 편집합니다.",
    ctaGithub: "GitHub에서 보기",
    ctaDocs: "문서 읽기",
    featKicker: "기능",
    featTitle: "홈랩의 모든 것을 캔버스 하나에.",
    featLede:
      "셀프 호스팅 인프라가 실제로 동작하는 방식을 그대로 옮긴 기본 요소입니다. 다른 개념으로 바꿔 생각할 필요가 없습니다.",
    topoLabel: "인벤토리 + 토폴로지",
    topoTitle: "그래프를 직접 편집",
    topoBody:
      "캔버스에서 바로 노드를 만들고, 이름을 바꾸고, 부모를 옮기고, 타입이 있는 엣지를 그립니다. 배치는 dagre가 자동으로 합니다.",
    axesLabel: "2축 노드 모델",
    axesTitle: "인프라 × 소프트웨어",
    axesBody:
      "모든 노드는 인프라 타입 하나와 0개 이상의 소프트웨어로 이루어집니다. 상세 정보와 모니터링 슬롯은 두 축에서 합쳐집니다.",
    monLabel: "축별 모니터링",
    monTitle: "축마다 프로브 하나",
    monBody:
      "인프라 도달성 확인과 소프트웨어 API 확인이 나란히 실행됩니다. StatusLine이 주 축을 고르고, 버튼 줄로 다른 축을 볼 수 있습니다.",
    adaptLabel: "내장 어댑터",
    adaptTitle: "무엇이든 확인합니다. 어댑터 추가는 파일 하나면 됩니다",
    adaptBody:
      "tcp, http, k8s(클러스터 내), proxmox(PVE API), system(node_exporter)이 기본으로 들어 있습니다. 새 어댑터는 파일 하나와 등록 호출 한 줄이면 됩니다.",
    rbLabel: "런북",
    rbTitle: "노드에 연결된 마크다운",
    rbBodyPre: "앱 안의 CodeMirror 분할 편집기, ",
    rbBodyPost: " 링크, git 동기화, 파일 첨부를 지원합니다.",
    showKicker: "앱 화면",
    showTitle: "사이트에 보이는 화면이 곧 앱입니다.",
    showLede:
      "sorack의 실제 화면입니다. 홈랩을 토폴로지 그래프로 보는 화면과 노드의 2축 상세 화면입니다.",
    shotTopoAlt: "sorack 토폴로지 화면: 노드와 타입이 있는 엣지, 실시간 상태",
    shotDetailAlt: "sorack 노드 상세 화면: 사양, 상태, 관련 런북",
    qsKicker: "빠른 시작",
    qsTitle: "몇 분이면 실행할 수 있습니다.",
    qsBody:
      "React, Hono, Postgres로 만든 앱입니다. 로컬에서 실행하거나 쿠버네티스에 직접 호스팅할 수 있습니다. 자세한 안내는 문서에 있습니다.",
    qsCta: "전체 안내",
    qsComment1: "# Node 22와 PostgreSQL 인스턴스가 필요합니다",
    qsComment2: "# Postgres 접속 정보를 설정하고 web과 api를 시작합니다",
    footTagline: "sorack — 홈랩 컨트롤 플레인",
  },
} as const;

export type Lang = keyof typeof landing;

// Fail the build, not the page: a key present in one language and missing in
// the other would otherwise render as an empty element on one page only, which
// looks like a layout choice. Checked on every build because the site build
// does not run the TypeScript checker.
// Word order differs: Korean puts the emphasised phrase first, so the part
// before it is empty. Every other key must have text.
const OPTIONAL_EMPTY = new Set(["heroTitlePre", "heroTitlePost"]);

export function strings(lang: Lang) {
  const want = Object.keys(landing.en).sort().join(",");
  for (const l of Object.keys(landing) as Lang[]) {
    const have = Object.keys(landing[l]).sort().join(",");
    if (have !== want) {
      const missing = Object.keys(landing.en).filter((k) => !(k in landing[l]));
      const extra = Object.keys(landing[l]).filter((k) => !(k in landing.en));
      throw new Error(`landing strings: "${l}" is missing [${missing}] and has extra [${extra}]`);
    }
    for (const [k, v] of Object.entries(landing[l])) {
      if (typeof v !== "string" || (v.trim() === "" && !OPTIONAL_EMPTY.has(k))) {
        throw new Error(`landing strings: "${l}.${k}" is empty`);
      }
    }
  }
  return landing[lang];
}
