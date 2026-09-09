import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config";

/** Basis-URL für Auth-Redirects – auf localhost immer http:// aus .env.local, nie https. */
export function authRedirectBase(request?: NextRequest): string {
  const site = SITE_URL.replace(/\/$/, "");
  if (site.includes("localhost") || site.includes("127.0.0.1")) return site;

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedHost) return `${forwardedProto === "http" ? "http" : "https"}://${forwardedHost}`;
    return request.nextUrl.origin;
  }

  return site;
}

export function authCallbackUrl(request?: NextRequest): string {
  return `${authRedirectBase(request)}/auth/callback`;
}

export function authConfirmUrl(type: string, request?: NextRequest): string {
  return `${authRedirectBase(request)}/auth/confirm?type=${encodeURIComponent(type)}`;
}
