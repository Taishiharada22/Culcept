import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildIdentityPrimaryRegistryDraft,
  IDENTITY_PRIMARY_MODEL_KEY,
} from "@/lib/identity/studentModelRegistry";

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
    (process.env.IDENTITY_PRIMARY_MODEL_VERSION ?? "").trim() ||
    `primary-${new Date().toISOString().slice(0, 10)}`;
  const provider = ((process.env.IDENTITY_PRIMARY_PROVIDER ?? "").trim() ||
    "gemini") as "gemini";
  if (provider !== "gemini") {
    throw new Error("IDENTITY_PRIMARY_PROVIDER must be gemini");
  }
  const providerModel =
    (process.env.IDENTITY_PRIMARY_PROVIDER_MODEL ?? "").trim() ||
    (process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash").trim();

  const row = buildIdentityPrimaryRegistryDraft({
    modelVersion,
    provider,
    providerModel,
    trafficRole: "champion",
    trafficWeight: 100,
    promotionStatus: "promoted",
    notes: "Champion bootstrap row for identity profile-update primary rollout",
  });

  const { data: existing } = await supabase
    .from("model_registry")
    .select("id")
    .eq("model_key", IDENTITY_PRIMARY_MODEL_KEY)
    .eq("model_version", modelVersion)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("model_registry")
      .update(row)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Failed to update champion model row: ${error.message}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "updated",
          id: existing.id,
          modelKey: IDENTITY_PRIMARY_MODEL_KEY,
          modelVersion,
          provider,
          providerModel,
        },
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
    throw new Error(`Failed to insert champion model row: ${error.message}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "inserted",
        id: data.id,
        modelKey: IDENTITY_PRIMARY_MODEL_KEY,
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
