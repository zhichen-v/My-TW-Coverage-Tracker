import type { Route } from "next";

const PUBLIC_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_PUBLIC_ORIGIN);
const APP_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN);

function normalizeOrigin(origin?: string) {
  return origin?.replace(/\/+$/, "") || "";
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function appendQuery(path: string, queryString?: string) {
  const query = queryString?.replace(/^\?/, "");
  if (!query) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

export function getPublicHref(path = "/") {
  const normalizedPath = normalizePath(path);
  return (PUBLIC_ORIGIN ? `${PUBLIC_ORIGIN}${normalizedPath}` : normalizedPath) as Route;
}

export function getAppHref(path = "/", queryString?: string) {
  const normalizedPath = normalizePath(path);
  const productionPath = appendQuery(normalizedPath, queryString);

  if (APP_ORIGIN) {
    return `${APP_ORIGIN}${productionPath}` as Route;
  }

  const localPath = normalizedPath === "/" ? "/app" : `/app${normalizedPath}`;
  return appendQuery(localPath, queryString) as Route;
}

export function getAppHistoryPath(queryString?: string) {
  return appendQuery(APP_ORIGIN ? "/" : "/app", queryString);
}

export function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}
