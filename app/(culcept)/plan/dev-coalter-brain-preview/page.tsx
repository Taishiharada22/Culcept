/**
 * /plan/dev-coalter-brain-preview — C4 CoAlter Brain Preview **read-only dev preview**
 *   （**fixture 会話のみ・DB/Supabase 非接触・保存なし・runCoAlterPipeline 非呼出・本番 /plan 非接触**）
 *
 * 目的: 「CoAlter が New session の会話に反応する」骨格を fixture で目視確認する。
 *   fixture New-session messages → `buildCoAlterBrainPreview`（Legacy 脳の DB 非依存決定論コア再利用）の
 *   bounded preview（theme / stalemate 有無 / constraint band / 中立 text）を read-only 表示。
 *
 * 厳守:
 *   - flag `PLAN_COALTER_BRAIN_PREVIEW`（server default OFF）→ OFF なら Disabled。
 *   - **fixture 入力のみ**（DB/Supabase/fetch/insert/送信なし）・**保存しない**・**read-only**・action button なし。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
import { buildCoAlterBrainPreview, type CoAlterBrainPreviewResult } from "@/lib/coalter/preview/brainPreviewCore";
import type { NewSessionMessageLike } from "@/lib/coalter/preview/newSessionTurnAdapter";

export const dynamic = "force-dynamic";

const m = (id: string, userId: string | null, body: string, createdAt: string): NewSessionMessageLike => ({
  id,
  author: userId ? { kind: "participant", userId } : { kind: "coalter" },
  kind: "chat",
  body,
  createdAt,
});

const TRAVEL_FIXTURE: NewSessionMessageLike[] = [
  m("t1", "P1", "来月、二人で温泉旅行に行きたいな。1泊2日くらいで。", "2026-07-01T10:00:00Z"),
  m("t2", "P2", "いいね。あんまり移動が長いのは疲れるから近場がいいな。", "2026-07-01T10:02:00Z"),
  m("t3", "P1", "予算は一人3万円くらいで考えてる。", "2026-07-01T10:03:00Z"),
];
const FOOD_FIXTURE: NewSessionMessageLike[] = [
  m("f1", "P1", "今週末どこかご飯食べに行かない？", "2026-07-02T12:00:00Z"),
  m("f2", "P2", "行きたい！イタリアンか和食がいいな。", "2026-07-02T12:01:00Z"),
];
const SOLO_FIXTURE: NewSessionMessageLike[] = [
  m("s1", "P1", "週末ひとりで美術館に行こうかな。", "2026-07-03T09:00:00Z"),
];
const EMPTY_FIXTURE: NewSessionMessageLike[] = [];

const CASES: { label: string; messages: NewSessionMessageLike[] }[] = [
  { label: "旅行の会話（2人）", messages: TRAVEL_FIXTURE },
  { label: "食事の会話（2人）", messages: FOOD_FIXTURE },
  { label: "ひとりの会話（solo）", messages: SOLO_FIXTURE },
  { label: "空（participant chat なし）", messages: EMPTY_FIXTURE },
];

function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-6 text-gray-600" data-testid="coalter-brain-preview-disabled">
      <h1 className="text-lg font-bold">CoAlter Brain Preview（read-only・dev）</h1>
      <p className="mt-2 text-[12px] text-gray-500">PLAN_COALTER_BRAIN_PREVIEW=OFF（表示しません）。</p>
    </div>
  );
}

function renderResult(r: CoAlterBrainPreviewResult): string {
  if (r.status !== "preview") return "（preview なし: participant chat 不足）";
  const p = r.preview;
  return `theme=${p.theme} / stalemate=${p.hasStalemate} / constraint=${p.constraintReadiness} / turns=${p.turnsAnalyzed}`;
}

export default function DevCoAlterBrainPreviewPage() {
  if (!PLAN_FLAGS.coalterBrainPreview) return <Disabled />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" data-testid="coalter-brain-preview">
      <h1 className="text-lg font-bold text-gray-900">CoAlter Brain Preview（read-only・dev・fixture）</h1>
      <p className="mt-1 text-[12px] text-gray-500">
        fixture の New-session 会話に対し、Legacy 脳の決定論コア（analyzeConversation）が返す preview を表示（DB/保存/LLM なし）。
      </p>
      <div className="mt-4 space-y-3">
        {CASES.map((c) => {
          const result = buildCoAlterBrainPreview(c.messages);
          return (
            <div key={c.label} className="rounded-lg border border-gray-200 bg-white/60 p-3" data-testid="coalter-brain-preview-row">
              <p className="text-[13px] font-bold text-gray-900" data-testid="case-label">{c.label}</p>
              <p className="mt-1 text-[11px] text-gray-500" data-testid="case-meta">{renderResult(result)}</p>
              {result.status === "preview" && (
                <p className="mt-1 text-[12px] text-gray-800" data-testid="case-preview-text">CoAlter: {result.preview.previewText}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
