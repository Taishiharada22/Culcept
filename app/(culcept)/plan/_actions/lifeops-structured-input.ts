"use server";
/**
 * /plan — A-4-c33 Life Ops Structured Source Input Server Action（**staging gated・deadline first**）
 *
 * 設計: docs/life-ops-source-input-ui-a4-c33-mini-design.md（§3-5）
 *
 * 役割: 「生活まわりを登録」入口（候補 card とは独立・source 0 件でも出る）からの form 送信を受け、
 *   c31 builder（辞書/ISO validation・**occurrence_key 自動生成**）→ duplicate guard（c33 読み口）→ c31 writer で
 *   **deadline source を 1 件 insert**。結果は PRG（`/plan?lifeopsSrc=token`）。
 *
 * 厳守:
 *   - client から読むのは **sourceType / categoryId / menu / dueDateISO の 4 名のみ**
 *     （occurrence_key/confidence/status/user_id/DB id/raw/source_ref/title 系は **formData から読まない**・static lock）。
 *   - gate: ①mainline（mainline∧planRouteLive∧staging∧!prod）②writer gate（master∧LIFEOPS_STRUCTURED_SOURCE_WRITE∧staging∧!prod）。
 *     production は flag ON でも常に gate_off（deny 解除は別 CEO gate）。
 *   - user_id は auth context 注入。c33 は **deadline のみ**（cadence input は別 slice＝他 sourceType は invalid）。
 */

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isLifeOpsMainlineAllowed } from "@/lib/plan/reality/lifeops/lifeops-mainline-gate";
import {
  createLifeOpsStructuredSourceWriter,
  readActiveStructuredRowsForDuplicateGuard,
  type LifeOpsStructuredWriteClient,
  type LifeOpsStructuredGuardReadClient,
} from "@/lib/plan/reality/lifeops/lifeops-structured-writer";
import type { LifeOpsStructuredSourceInput } from "@/lib/plan/reality/lifeops/lifeops-structured-write";
import type { LifeOpsCategoryId } from "@/lib/lifeops/category-model";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

const PLAN_PATH = "/plan";

function exit(token: "ok" | "already_exists" | "invalid" | "gate_off" | "denied"): never {
  redirect(`${PLAN_PATH}?lifeopsSrc=${token}`);
}

/**
 * 登録入口 submit → gated 1-row structured source insert（deadline のみ・PRG）。
 */
export async function submitLifeOpsStructuredSourceAction(formData: FormData): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  // ① mainline gate（production/flag OFF では入口自体が出ないが、偽造 POST もここで遮断）。
  if (!isLifeOpsMainlineAllowed({ mainline: PLAN_FLAGS.lifeopsMainline, planRouteLive: PLAN_FLAGS.planRouteLive, supabaseUrl })) {
    exit("gate_off");
  }
  // ② operator auth（owner-RLS・user_id は auth 注入）。
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) exit("denied");

  // ③ client 生値（**4 名のみ読む**・他 field は存在しても無視される）。
  const sourceTypeRaw = formData.get("sourceType");
  const categoryIdRaw = formData.get("categoryId");
  const menuRaw = formData.get("menu");
  const dueDateRaw = formData.get("dueDateISO");
  if (sourceTypeRaw !== "deadline" || typeof categoryIdRaw !== "string" || typeof dueDateRaw !== "string" || dueDateRaw.length === 0) {
    exit("invalid"); // c33 は deadline のみ（cadence は別 slice）
  }
  const input: LifeOpsStructuredSourceInput = {
    sourceType: "deadline",
    categoryId: categoryIdRaw as LifeOpsCategoryId, // 最終 validation は c31 builder（辞書 roundtrip）
    menu: typeof menuRaw === "string" && menuRaw.length > 0 ? (menuRaw as never) : null,
    dueDateISO: dueDateRaw,
  };

  // ④ duplicate guard 読み口（write gate 配下・OFF/production → query 0）→ ⑤ writer（c31 builder 内蔵・occurrence 自動生成）。
  const env = { master: PLAN_FLAGS.lifeopsRealdataReadonly, write: PLAN_FLAGS.lifeopsStructuredSourceWrite, supabaseUrl };
  const existing = await readActiveStructuredRowsForDuplicateGuard(supabase as unknown as LifeOpsStructuredGuardReadClient, user.id, env);
  const writer = createLifeOpsStructuredSourceWriter(supabase as unknown as LifeOpsStructuredWriteClient, user.id, env);
  const result = await writer.writeSource(input, { existing });

  if (result.written) exit("ok");
  if (result.reason === "already_exists") exit("already_exists");
  if (result.reason === "gate_off") exit("gate_off");
  exit("invalid"); // invalid_category/invalid_iso/missing_due 等は利用者向けには「期限日を確認」へ集約
}
