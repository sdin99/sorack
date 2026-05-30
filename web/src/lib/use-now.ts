import { useEffect, useState } from "react";

// A ticking "current time" so relative timestamps ("12s ago") count up live
// instead of freezing at render time. Shared by anything showing an age.
// Cheap: one interval per mounted consumer; pass a coarser interval for
// minute-granularity displays.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
