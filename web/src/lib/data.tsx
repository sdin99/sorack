// Shared status enum. The rest of the legacy mock fixtures that used to
// live here have been removed — live data flows through SorackData
// (api-backed) instead.
export const STATUS = { OK: "ok", WARN: "warn", ERR: "err" } as const;
