/**
 * applySelectionResponse — selection endpoint canonical response → client setters
 *
 * CEO 2026-04-26 root-cause fix（client-side missing wiring）:
 *
 *   selection endpoint (`/api/stargazer/alter/selection`) は accepted=true 時に
 *   server canonical な morningSession を返す:
 *     {
 *       dialogState, persistedEvents, phase, plan,
 *       pendingClarify,           ← ★ scope 4-B' で transport へ置換される
 *       rawInputs, parsedIntent, sufficiency, personalizeHints,
 *       planStateV2, pipelineVersion, ...
 *     }
 *
 *   旧 client 実装 (useAlterChat.ts L578-594) は dialogState / persistedEvents /
 *   phase / plan の **4 fields のみ** propagate しており、pendingClarify を含む
 *   7 fields が落ちていた。これにより:
 *
 *     [Turn 2 selection 受理]
 *       server: pendingClarify={slot:"transport"} を返却 ✓
 *       client: setMorningPendingClarify が呼ばれない → 旧 state 残存
 *     [Turn 3「電車で移動する」入力]
 *       client: 古い pendingClarify (where or null) を server に送信
 *       server: canBind=false (or wrong slot) → Branch A skip
 *             → Branch B (LLM 再 comprehension) が「電車で移動する」を
 *               新規発話として「カフェ + 電車」風に解釈
 *             → mergeIntoPrior で「09:00のカフェはどのあたり？」 clarify 再発
 *             → events.transport も bind されず travel item 出ない
 *
 *   この helper は server canonical state を漏れなく client setter に流し込む
 *   pure 関数。chat response handler (useAlterChat.ts L457-) と同等の field set を
 *   selection 経路でも honour する。
 *
 *   テスタビリティのため React 非依存に保つ（vitest node env で直 import 可）。
 */

import type {
  MorningPhase,
  MorningPlan,
  ParsedDayIntent,
  PendingClarify,
  SufficiencyResult,
} from "@/lib/alter-morning/types";
import type { Event as ComprehensionEvent } from "@/lib/alter-morning/comprehension/eventSchema";
import type { DialogState } from "@/lib/alter-morning/dialog/types";

/**
 * selection 経由で更新する client side state setter 一式。
 * useAlterChat 内 useState の setter を struct で渡す。
 */
export interface SelectionResponseSetters {
  setMorningDialogState: (s: DialogState | null) => void;
  setMorningPersistedEvents: (e: ComprehensionEvent[] | null) => void;
  setMorningPhase: (p: MorningPhase) => void;
  setMorningPlan: (p: MorningPlan | null) => void;
  setMorningPendingClarify: (p: PendingClarify | null) => void;
  setMorningRawInputs: (r: string[]) => void;
  setMorningParsedIntent: (p: ParsedDayIntent | null) => void;
  setMorningSufficiency: (s: SufficiencyResult | null) => void;
  setMorningPersonalizeHints: (h: string[]) => void;
  // planStateV2 は any で round-trip（型は server 側で確定）
  setMorningPlanStateV2: (p: unknown) => void;
  setMorningPipelineVersion: (v: "v2" | null) => void;
}

/**
 * selection endpoint の `data.morningSession` を client 側 setter 群に流す。
 *
 * field 省略 (undefined) と null リセットを区別:
 *   - undefined → setter 呼ばない（既存 state 維持）
 *   - null     → setter に null を渡してリセット
 *
 * これは chat response handler の挙動と同じ意味論。
 */
export function applySelectionMorningSession(
  next: Record<string, unknown>,
  setters: SelectionResponseSetters,
): void {
  if (next.dialogState !== undefined) {
    setters.setMorningDialogState(
      (next.dialogState as DialogState | null) ?? null,
    );
  }
  if (next.persistedEvents !== undefined) {
    setters.setMorningPersistedEvents(
      (next.persistedEvents as ComprehensionEvent[] | null) ?? null,
    );
  }
  if (next.phase) {
    setters.setMorningPhase(next.phase as MorningPhase);
  }
  if (next.plan !== undefined) {
    setters.setMorningPlan((next.plan as MorningPlan | null) ?? null);
  }

  // ── CEO 2026-04-26 fix: pendingClarify propagation ──
  //   この一行の不在が真因。selection で transport pendingClarify が server から
  //   返っても client が無視していたため、次 turn の chat で stale pendingClarify が
  //   送られて canBind=false → Branch B fresh comprehension → where clarify 再発。
  if (next.pendingClarify !== undefined) {
    setters.setMorningPendingClarify(
      (next.pendingClarify as PendingClarify | null) ?? null,
    );
  }

  // ── chat response handler と同等の canonical state propagation ──
  //   selection 経由でも server canonical state を完全反映する。
  if (next.rawInputs !== undefined) {
    setters.setMorningRawInputs((next.rawInputs as string[]) ?? []);
  }
  if (next.parsedIntent !== undefined) {
    setters.setMorningParsedIntent(
      (next.parsedIntent as ParsedDayIntent | null) ?? null,
    );
  }
  if (next.sufficiency !== undefined) {
    setters.setMorningSufficiency(
      (next.sufficiency as SufficiencyResult | null) ?? null,
    );
  }
  if (next.personalizeHints !== undefined) {
    setters.setMorningPersonalizeHints(
      (next.personalizeHints as string[]) ?? [],
    );
  }
  if (next.planStateV2 !== undefined) {
    setters.setMorningPlanStateV2(next.planStateV2);
  }
  if (next.pipelineVersion !== undefined) {
    setters.setMorningPipelineVersion(
      next.pipelineVersion === "v2" ? "v2" : null,
    );
  }
}
