import { NextRequest, NextResponse } from "next/server";

const PUBLIC_HOST = "anonky.xyz";
const WWW_HOST = "www.anonky.xyz";
const APP_HOST = "app.anonky.xyz";

function getHostname(request: NextRequest) {
  return (request.headers.get("host") || "").split(":")[0].toLowerCase();
}

function redirectTo(request: NextRequest, hostname: string, pathname: string) {
  const url = request.nextUrl.clone();
  url.hostname = hostname;
  url.pathname = pathname;
  return NextResponse.redirect(url, 308);
}

function normalizeAppPath(pathname: string) {
  if (pathname === "/app" || pathname === "/app/") {
    return "/";
  }

  if (pathname === "/app/graph") {
    return "/graph";
  }

  if (pathname.startsWith("/app/companies/")) {
    return pathname.replace(/^\/app\/companies/, "/companies");
  }

  if (pathname.startsWith("/app/")) {
    return pathname.replace(/^\/app/, "") || "/";
  }

  return pathname;
}

function isAppRoute(pathname: string) {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/graph" ||
    pathname === "/companies" ||
    pathname.startsWith("/companies/")
  );
}

export function middleware(request: NextRequest) {
  const hostname = getHostname(request);
  const { pathname } = request.nextUrl;

  if (hostname === APP_HOST) {
    const normalizedPath = normalizeAppPath(pathname);
    if (normalizedPath !== pathname) {
      return redirectTo(request, APP_HOST, normalizedPath);
    }

    return NextResponse.next();
  }

  if (hostname === PUBLIC_HOST || hostname === WWW_HOST) {
    if (isAppRoute(pathname)) {
      return redirectTo(request, APP_HOST, normalizeAppPath(pathname));
    }

    if (hostname === WWW_HOST) {
      return redirectTo(request, PUBLIC_HOST, pathname);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|health|docs|openapi\\.json|_next/static|_next/image|favicon.ico).*)",
  ],
};
