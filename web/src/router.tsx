import { useEffect, useState } from "react";

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.replace(/^#/, "") || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = `#${path}`;
}

export function parseRoute(route: string): { path: string; params: Record<string, string> } {
  const [pathPart, queryPart] = route.split("?");
  const segments = (pathPart ?? "/").split("/").filter(Boolean);
  const params: Record<string, string> = {};
  if (segments[0] === "meetings" && segments[1]) params.id = segments[1];
  if (segments[0] === "agenda-items" && segments[1]) params.id = segments[1];
  if (segments[0] === "findings" && segments[1]) params.id = segments[1];
  if (segments[0] === "audit" && segments[1] === "engagements" && segments[2]) params.id = segments[2];
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      const [k, v] = pair.split("=");
      if (k && v !== undefined) params[k] = decodeURIComponent(v);
    }
  }
  return { path: `/${segments.join("/")}`, params };
}
