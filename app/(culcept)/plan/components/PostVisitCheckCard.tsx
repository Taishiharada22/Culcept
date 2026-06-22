"use client";

/**
 * app/(culcept)/plan/components/PostVisitCheckCard.tsx
 *   — 評価OS / Stage 0-B: post-visit 答え合わせの控えめ 1-tap UI（dogfood・local shadow only）
 *
 * ★flag OFF / production / not-elicit-and-no-mirror では **null を返す（DOM 不変）**。
 * ★星評価なし / SNS・投稿・共有・いいねなし / ranking 反映なし / DB なし。
 * ★「レビュー」でなく「次回の提案を間違えないための答え合わせ」として出す。
 *   1-tap 回答（任意で理由 chip 事前選択）→ redaction を通して localStorage shadow 保存 → 観測の鏡。
 * ★critical path 厳守: ここは Fit-Arc / Aneura-star を **描画しない**（答え合わせのみ）。
 */
import * as React from "react";
import {
  isPostVisitCheckEnabled,
  buildPostVisitObservation,
  type PostVisitResponse,
  type ReasonChipKey,
  type DwellSignal,
} from "@/lib/plan/postVisit/postVisitObservation";
import type { PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { shouldElicit, buildPostVisitPrompt, type ElicitContext } from "@/lib/plan/postVisit/postVisitElicitation";
import {
  recordPostVisitObservation,
  recordPostVisitSkip,
  loadPostVisitObservations,
  lastSkipAt,
  lastElicitAtForPlace,
} from "@/lib/plan/postVisit/postVisitStore";
import { buildObservationMirror, type MirrorReflection } from "@/lib/plan/postVisit/postVisitMirror";
import { opaquePlaceKey } from "@/lib/plan/candidateLens/candidateLensPreferenceStore";

export interface PostVisitCheckCardProps {
  /** 場所の記述子（名前+エリア等）。★内部で hash 化され原文は保存されない。 */
  readonly placeDescriptor: string;
  readonly lens?: PurposeLens;
  // trigger/suppress signals（呼び出し側が derived 値で渡す・生データは渡さない）
  readonly isLensProposed?: boolean;
  readonly isFirstVisit?: boolean;
  readonly isImportantPlan?: boolean;
  readonly isDiscoveryDomain?: boolean;
  readonly dwellSignal?: DwellSignal | null;
  readonly isSensitive?: boolean;
  readonly isHomeOrWork?: boolean;
  readonly isHabitual?: boolean;
  readonly isHighFatigue?: boolean;
}

type Phase = "hidden" | "prompt" | "answered";

export function PostVisitCheckCard(props: PostVisitCheckCardProps) {
  const lens: PurposeLens = props.lens ?? "generic";
  const [phase, setPhase] = React.useState<Phase>("hidden");
  const [trigger, setTrigger] = React.useState<ReturnType<typeof shouldElicit>["trigger"]>(null);
  const [chips, setChips] = React.useState<ReasonChipKey[]>([]);
  const [mirror, setMirror] = React.useState<MirrorReflection | null>(null);

  // mount 後に hydrate（client-only＝SSR mismatch 回避）。flag OFF は hidden のまま＝DOM 不変。
  React.useEffect(() => {
    if (!isPostVisitCheckEnabled()) return; // flag OFF/production → hidden（何も描画しない）
    const placeKey = opaquePlaceKey(props.placeDescriptor) ?? "p_unknown";
    const ctx: ElicitContext = {
      isLensProposed: !!props.isLensProposed,
      isFirstVisit: !!props.isFirstVisit,
      isImportantPlan: !!props.isImportantPlan,
      isDiscoveryDomain: !!props.isDiscoveryDomain,
      dwellSignal: props.dwellSignal ?? null,
      isSensitive: !!props.isSensitive,
      isHomeOrWork: !!props.isHomeOrWork,
      isHabitual: !!props.isHabitual,
      isHighFatigue: !!props.isHighFatigue,
      lastSkippedAt: lastSkipAt(placeKey),
      lastSimilarElicitAt: lastElicitAtForPlace(placeKey),
      now: Date.now(),
    };
    const d = shouldElicit(ctx);
    setMirror(buildObservationMirror(loadPostVisitObservations())); // 既存観測の鏡（薄ければ null）
    if (d.elicit && d.trigger) {
      setTrigger(d.trigger);
      setPhase("prompt");
    } else {
      setPhase("answered"); // 聞かない＝prompt は出さず、鏡があれば表示／無ければ null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleChip = (c: ReasonChipKey) =>
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const answer = (response: PostVisitResponse) => {
    if (!trigger) return;
    recordPostVisitObservation(
      buildPostVisitObservation({
        placeDescriptor: props.placeDescriptor, // ← hash 化され原文は残らない
        lens,
        trigger,
        response,
        reasonChips: chips,
        dwellSignal: props.dwellSignal ?? null,
        at: Date.now(),
      }),
    );
    setMirror(buildObservationMirror(loadPostVisitObservations()));
    setPhase("answered");
  };

  const skip = () => {
    recordPostVisitSkip(opaquePlaceKey(props.placeDescriptor) ?? "p_unknown", Date.now()); // ★skip 後は suppress が効く
    setMirror(buildObservationMirror(loadPostVisitObservations()));
    setPhase("answered");
  };

  if (phase === "hidden") return null; // ★flag OFF / 未 hydrate → 何も出さない（DOM 不変）

  if (phase === "prompt" && trigger) {
    const prompt = buildPostVisitPrompt(trigger, lens);
    return (
      <div data-testid="postvisit-card" className="mt-3 rounded-2xl bg-purple-50/60 p-3 ring-1 ring-purple-100">
        <p className="text-[12.5px] font-semibold text-purple-900">{prompt.question}</p>
        <p className="mt-0.5 text-[10.5px] text-purple-500/80">{prompt.framingNote}</p>
        {/* 任意: 理由 chip（事前選択・複数可・star でない） */}
        <div className="mt-2 flex flex-wrap gap-1">
          {prompt.reasonChips.slice(0, 6).map((c) => {
            const on = chips.includes(c.key);
            return (
              <button key={c.key} type="button" data-testid={`postvisit-chip-${c.key}`} onClick={() => toggleChip(c.key)}
                className={`rounded-full px-2 py-0.5 text-[10.5px] transition ${on ? "bg-purple-200 text-purple-900 ring-1 ring-purple-300" : "bg-white text-slate-500 ring-1 ring-black/5 hover:bg-slate-50"}`}>
                {c.label}
              </button>
            );
          })}
        </div>
        {/* 1-tap 回答（これがコミット） */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {prompt.responses.map((r) => (
            <button key={r.key} type="button" data-testid={`postvisit-answer-${r.key}`} onClick={() => answer(r.key)}
              className="rounded-xl bg-white py-2 text-[12px] font-medium text-purple-800 ring-1 ring-purple-200 transition hover:bg-purple-50 active:scale-[0.99]">
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-center">
          <button type="button" data-testid="postvisit-skip" onClick={skip} className="rounded-md px-3 py-1 text-[11px] text-slate-400 underline transition hover:text-slate-600">
            今は答えない
          </button>
        </div>
      </div>
    );
  }

  // answered / 聞かない: ack（回答時のみ）＋ 観測の鏡（あれば）。両方なければ null。
  const answeredThisSession = trigger != null;
  if (!answeredThisSession && !mirror) return null;
  return (
    <div data-testid="postvisit-done" className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-black/5">
      {answeredThisSession && <p className="text-[11.5px] text-slate-500">次の提案に覚えておきました。</p>}
      {mirror && (
        <p data-testid="postvisit-mirror" className="mt-1 text-[11.5px] leading-relaxed text-purple-800">
          🪞 {mirror.text}
        </p>
      )}
    </div>
  );
}
