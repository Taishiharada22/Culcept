/**
 * RJ5 — minimalProgress producer / validator（P2-2・pure・LLM consumer seam）
 *
 * taskRealityNode.minimalProgress は v0 で null（「RJ5 で LLM 生成」）。本ファイルは、将来 LLM /
 * fixture から来る candidate を **pure validation** して `acceptedMinimalProgress` に確定する seam。
 * 契約: docs/reality-judgment-patch-rj01.md §9。
 *
 * 最重要不変条件（rj01 §9）: **LLM 出力の直接採用禁止**。Engine validation を通っても、
 *   acceptedMinimalProgress になるのは source=user_confirmed の場合のみ。LLM/fixture candidate は
 *   validated 止まり（confirmationRequired=true）で、確定値として扱わない。
 *
 * 守る不変条件:
 *  - minimalProgress は task 本文の言い換えでなく「次の最小行動」（paraphrase は reject）
 *  - 空 / 巨大すぎ / 根拠なし / 禁止語 / 曖昧 candidate は reject（honest-null + reasonCode）
 *  - attribute は confidence / evidence / source / status を持つ（裸値禁止・RealityAttribute）
 *  - LLM/fixture 由来は heuristic（confidence ≤ 0.35・notActionable）。確定値にしない
 *  - 採用には本人確認が要る場合 confirmationRequired=true で返す
 *
 * 規律: pure・no Date・no IO・no fetch・no env・**LLM 実呼び出しなし**。
 *   PredictionLedger / DB / Supabase / UI / ranking 非接続。taskRealityNode 型は不変更（additive）。
 *
 * 注: 時間整合・canSplit の深い意味検証・分割粒度の精密判定は RJ5 本設計で確定（本 seam は
 *   rj01 §9 が本 patch で不変条件化した「直接採用禁止」+ CEO 指定の基本 validation のみ）。
 */

import { heuristicAttribute, inferredAttribute, type RealityAttribute } from "./realityAttribute";

/** candidate の出所。user_confirmed のみ採用対象（他は validated 止まり） */
export type MinimalProgressSourceKind = "llm" | "fixture" | "heuristic" | "user_confirmed";

/** reject 理由（honest-null の根拠） */
export type MinimalProgressRejectReason =
  | "empty"
  | "too_large"
  | "too_vague"
  | "paraphrase_not_next_action"
  | "no_evidence"
  | "banned_word"
  | "ambiguous";

/** RJ5 診断語彙（rj01 §9） */
export type DecompositionStatus = "none" | "proposed" | "validated" | "accepted";

/** LLM / fixture / 本人 から来る最小前進 candidate（生入力） */
export interface MinimalProgressCandidateInputV0 {
  readonly text: string;
  readonly sourceKind: MinimalProgressSourceKind;
  readonly evidenceRefs: ReadonlyArray<string>;
  /** candidate 側が「曖昧」と自己申告した場合（LLM が複数解釈を含むと示した等） */
  readonly ambiguous?: boolean;
}

export interface ValidatedMinimalProgressV0 {
  readonly text: string;
  readonly sourceKind: MinimalProgressSourceKind;
  /** validation を通ったか */
  readonly passed: boolean;
  /** 通った場合の attribute（裸値禁止）。reject 時は null */
  readonly attribute: RealityAttribute<string> | null;
  readonly rejectReason: MinimalProgressRejectReason | null;
}

export interface TaskDecompositionContextV0 {
  readonly taskText: string;
  /** TaskRealityNode.canSplit の value（不明は null） */
  readonly canSplit: boolean | null;
}

export interface TaskDecompositionResultV0 {
  readonly decompositionStatus: DecompositionStatus;
  /** Engine validation を ≥1 candidate が通ったか（rj01 §9） */
  readonly validatedByEngine: boolean;
  readonly candidates: ReadonlyArray<ValidatedMinimalProgressV0>;
  /** 採用後の最小前進（本人採用後のみ非 null・LLM 直接採用は禁止） */
  readonly acceptedMinimalProgress: RealityAttribute<string> | null;
  /** validated candidate はあるが本人確認待ち */
  readonly confirmationRequired: boolean;
}

/** 「最小行動」の長さ上限（これを超える candidate は最小前進でない） */
export const MINIMAL_PROGRESS_MAX_LEN = 120;
/** 短すぎ（曖昧）下限 */
export const MINIMAL_PROGRESS_MIN_LEN = 3;
/** LLM/fixture 由来の既定 confidence（heuristic 上限 0.35 内） */
export const MINIMAL_PROGRESS_HEURISTIC_CONFIDENCE = 0.3;
/** 行動でない曖昧語（禁止語 seam・保守的な小集合。RJ5 本設計で拡張） */
export const MINIMAL_PROGRESS_BANNED_WORDS: ReadonlyArray<string> = [
  "頑張る",
  "がんばる",
  "気合",
  "なんとかする",
  "とりあえずやる",
];

/** 言い換え検知用の正規化（空白・句読点除去 + lowercase） */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[。、，．,.!?！？・]/g, "");
}

/** 1 candidate を validation。passed=false の時 rejectReason 必須・attribute=null */
function validateCandidate(
  candidate: MinimalProgressCandidateInputV0,
  ctx: TaskDecompositionContextV0,
): ValidatedMinimalProgressV0 {
  const reject = (rejectReason: MinimalProgressRejectReason): ValidatedMinimalProgressV0 => ({
    text: candidate.text,
    sourceKind: candidate.sourceKind,
    passed: false,
    attribute: null,
    rejectReason,
  });

  const trimmed = candidate.text.trim();
  if (trimmed.length === 0) return reject("empty");
  if (candidate.ambiguous === true) return reject("ambiguous");
  if (trimmed.length > MINIMAL_PROGRESS_MAX_LEN) return reject("too_large");

  const norm = normalize(trimmed);
  if (norm.length < MINIMAL_PROGRESS_MIN_LEN) return reject("too_vague");
  if (norm === normalize(ctx.taskText)) return reject("paraphrase_not_next_action");
  if (MINIMAL_PROGRESS_BANNED_WORDS.some((w) => trimmed.includes(w))) return reject("banned_word");
  if (candidate.evidenceRefs.length === 0) return reject("no_evidence");

  // 通過: source により attribute の status / displayPolicy を分ける
  const attribute: RealityAttribute<string> =
    candidate.sourceKind === "user_confirmed"
      ? inferredAttribute(trimmed, 0.7, candidate.evidenceRefs, {
          status: "confirmed",
          displayPolicy: "visible",
        })
      : heuristicAttribute(trimmed, MINIMAL_PROGRESS_HEURISTIC_CONFIDENCE, candidate.evidenceRefs, {
          displayPolicy: "notActionable",
        });

  return { text: trimmed, sourceKind: candidate.sourceKind, passed: true, attribute, rejectReason: null };
}

/**
 * candidate 群 → validated minimalProgress。LLM 直接採用禁止（user_confirmed のみ accept）。
 * pure・deterministic。
 */
export function produceMinimalProgress(
  candidates: ReadonlyArray<MinimalProgressCandidateInputV0>,
  ctx: TaskDecompositionContextV0,
): TaskDecompositionResultV0 {
  const validated = candidates.map((c) => validateCandidate(c, ctx));
  const passed = validated.filter((v) => v.passed);
  const validatedByEngine = passed.length > 0;

  // 採用は user_confirmed の通過 candidate のみ（LLM/fixture は確定値にしない）
  const accepted = passed.find((v) => v.sourceKind === "user_confirmed") ?? null;
  const acceptedMinimalProgress = accepted?.attribute ?? null;

  let decompositionStatus: DecompositionStatus;
  if (candidates.length === 0) decompositionStatus = "none";
  else if (acceptedMinimalProgress !== null) decompositionStatus = "accepted";
  else if (validatedByEngine) decompositionStatus = "validated";
  else decompositionStatus = "proposed";

  return {
    decompositionStatus,
    validatedByEngine,
    candidates: validated,
    acceptedMinimalProgress,
    confirmationRequired: validatedByEngine && acceptedMinimalProgress === null,
  };
}
