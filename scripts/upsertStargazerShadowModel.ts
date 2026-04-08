import "server-only";

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildStargazerStudentRegistryDraft,
  STARGAZER_STUDENT_MODEL_KEY,
} from "@/lib/stargazer/studentModelRegistry";

config({ path: ".env.local" });

const supabaseUrl =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service role env is missing");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  const modelVersion =
    (process.env.STARGAZER_SHADOW_MODEL_VERSION ?? "").trim() ||
    `shadow-${new Date().toISOString().slice(0, 10)}`;
  const provider = ((process.env.STARGAZER_SHADOW_PROVIDER ?? "").trim() ||
    "gemini") as "gemini" | "openai";
  if (provider !== "gemini" && provider !== "openai") {
    throw new Error("STARGAZER_SHADOW_PROVIDER must be gemini or openai");
  }
  const providerModel =
    (process.env.STARGAZER_SHADOW_PROVIDER_MODEL ?? "").trim() ||
    (provider === "openai"
      ? (process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini")
      : (process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash").trim());

  const row = buildStargazerStudentRegistryDraft({
    modelVersion,
    provider,
    providerModel,
    trafficRole: "shadow",
    trafficWeight: 0,
    promotionStatus: "candidate",
    notes: "Shadow bootstrap row for Stargazer student pipeline",
  });

  const { data: existing } = await supabase
    .from("model_registry")
    .select("id")
    .eq("model_key", STARGAZER_STUDENT_MODEL_KEY)
    .eq("model_version", modelVersion)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("model_registry")
      .update(row)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Failed to update shadow model row: ${error.message}`);
    }

    console.log(
      JSON.stringify(
        { ok: true, action: "updated", id: existing.id, modelVersion, provider, providerModel },
        null,
        2,
      ),
    );
    return;
  }

  const { data, error } = await supabase
    .from("model_registry")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert shadow model row: ${error.message}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "inserted",
        id: data.id,
        modelVersion,
        provider,
        providerModel,
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
