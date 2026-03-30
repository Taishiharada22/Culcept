import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Deprecated: use /api/cron/stargazer-verify instead.
 * This route redirects for backward compatibility.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const verifyUrl = new URL("/api/cron/stargazer-verify", url.origin);
  // Forward query params
  url.searchParams.forEach((v, k) => verifyUrl.searchParams.set(k, v));

  return NextResponse.redirect(verifyUrl.toString(), 307);
}
