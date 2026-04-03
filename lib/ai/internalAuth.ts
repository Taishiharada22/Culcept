import "server-only";

export type InternalAuthResult =
  | { ok: true; source: string }
  | { ok: false; reason: string; source?: undefined };

function getSecrets(): string[] {
  const secrets: string[] = [];

  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  if (cronSecret) secrets.push(cronSecret);

  const internalApiKey = (process.env.AI_INTERNAL_API_KEY ?? "").trim();
  if (internalApiKey) secrets.push(internalApiKey);

  return secrets;
}

export function authorizeInternalRequest(request: Request): InternalAuthResult {
  const secrets = getSecrets();

  if (secrets.length === 0) {
    return { ok: false, reason: "internal_auth_not_configured" };
  }

  // Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && secrets.includes(token)) {
      return { ok: true, source: "authorization_bearer" };
    }
  }

  // x-internal-token header
  const internalToken = (request.headers.get("x-internal-token") ?? "").trim();
  if (internalToken && secrets.includes(internalToken)) {
    return { ok: true, source: "x_internal_token" };
  }

  // x-cron-secret header
  const cronSecretHeader = (request.headers.get("x-cron-secret") ?? "").trim();
  if (cronSecretHeader && secrets.includes(cronSecretHeader)) {
    return { ok: true, source: "x_cron_secret" };
  }

  // x-vercel-cron header (Vercel cron uses CRON_SECRET automatically)
  const vercelCron = (request.headers.get("x-vercel-cron") ?? "").trim();
  if (vercelCron && secrets.includes(vercelCron)) {
    return { ok: true, source: "x_vercel_cron" };
  }

  return { ok: false, reason: "unauthorized" };
}
