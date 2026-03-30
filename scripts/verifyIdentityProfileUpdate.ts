import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { refreshIdentityProfile } from "@/lib/identity/profileUpdate";

dotenv.config({ path: ".env.local" });

type IdentityProfileClient = NonNullable<
  Parameters<typeof refreshIdentityProfile>[0]["client"]
>;

function requireEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

async function resolveUserId(client: IdentityProfileClient) {
  const explicit = (process.env.IDENTITY_PROFILE_TEST_USER_ID ?? "").trim();
  if (explicit) return explicit;

  const profileResult = await client
    .from("stargazer_profiles")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profileRow = (profileResult.data ?? null) as { user_id?: string } | null;
  if (profileRow?.user_id) {
    return profileRow.user_id;
  }

  const orbiterResult = await client
    .from("orbiter_memory_summaries")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orbiterRow = (orbiterResult.data ?? null) as { user_id?: string } | null;
  if (orbiterRow?.user_id) {
    return orbiterRow.user_id;
  }

  throw new Error("no_candidate_user_found");
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as IdentityProfileClient;

  const userId = await resolveUserId(client);
  const sessionId = `identity-verify:${Date.now()}`;

  const result = await refreshIdentityProfile({
    client,
    userId,
    trigger: "verify_script",
    sessionId,
  });

  let teacherPresent = false;
  if (result.aiRunId) {
    const { data } = await client
      .from("teacher_outputs")
      .select("ai_run_id, source_ai_run_id")
      .or(`ai_run_id.eq.${result.aiRunId},source_ai_run_id.eq.${result.aiRunId}`)
      .limit(1);
    teacherPresent = (data?.length ?? 0) > 0;
  }

  console.log(
    JSON.stringify(
      {
        userId,
        ok: result.ok,
        stored: result.stored,
        aiRunId: result.aiRunId,
        snapshotId: result.snapshot?.id ?? null,
        snapshotVersion: result.snapshot?.version ?? null,
        teacherPresent,
        profileText: result.snapshot?.profileText ?? null,
        sourceSummary: result.sourceSummary,
        reason: result.reason ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
