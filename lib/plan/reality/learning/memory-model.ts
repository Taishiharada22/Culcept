/**
 * Reality Control OS — R1-1 Memory Model（4 種 + Correction の **pure 型モデル**・no-DB・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1 記憶基盤）/ 監査: 既存 source 棚卸し（R1-0）
 *
 * 役割: 「その人専用の秘書」の記憶を **5 種**（Episodic/Semantic/Procedural/Preference/Correction）に分類し、
 *   全 kind 共通の **非断定・provenance 付き・raw を持たない** `MemoryItem` 正規形を定義する pure 基盤。
 *   後続 R1-2〜R1-7 の reader/synthesis がこの型に揃える。**新規データ収集はしない**（既存 PRM 等を read）。
 *
 * 厳守（哲学・過断定防止の継承）:
 *   - **断定しない**: certainty は構造的に ≤tentative（high を作らない）。observation は「〜傾向が見えている」型。
 *   - **trait-not-personality**: 「怠惰」等の人格語を持たない（文脈束縛 observation のみ）。
 *   - **provenance**: どの PRM 由来か（source）を保持（監査・debug 用・raw でない）。
 *   - **境界**: 正本は PRM（M1/M2/M3）。他軸（移動/会話）は将来 synthesis で合流させる前提で、本型は直接それらを抱えない。
 */

/** 秘書の記憶 5 種。 */
export type MemoryKind =
  | "episodic" // 過去の具体的な出来事（予定・行動・修正の事実）
  | "semantic" // 一般傾向（「午前のカフェ作業が成功しやすい」）
  | "procedural" // うまくいった手順（採用された修復・選択）
  | "preference" // 何を大事にするか（価値・回復傾向）
  | "correction"; // AI 提案をユーザーが直した記録（最強 signal）

/** 確からしさ（**high なし**＝断定しない・PRM 原則）。 */
export type MemoryCertainty = "low" | "tentative";

/** どの PRM 由来か（provenance・raw でない）。 */
export type MemorySource = "prm_learning_event" | "prm_review_decision" | "prm_model_entry";

/** 観測が紐づく文脈（PRM band/durationBucket 等・なければ null）。 */
export interface MemoryContext {
  readonly dimension: string | null;
  readonly value: string | null;
}

/** ユーザーの訂正状態（correction の中身・null=未訂正）。 */
export type MemoryCorrection = "rejected" | "direction_adjusted" | "context_refined" | null;

/** 行動の寄り（**semantic/preference/procedural のみ持つ**・episodic/correction は null）。synthesis の net leaning 計算に使う。 */
export type MemoryLeaning = "toward_adopting" | "toward_declining" | "toward_deferring";

/** tendency_direction → 寄り（null=非該当）。adapter 共通。 */
export function leaningFromDirection(direction: string): MemoryLeaning | null {
  switch (direction) {
    case "adoption":
      return "toward_adopting";
    case "non_adoption":
      return "toward_declining";
    case "deferral":
      return "toward_deferring";
    default:
      return null;
  }
}

/**
 * 全 kind 共通の記憶正規形（**非断定・provenance 付き・raw なし**）。
 *   UI/Alter は表示前に presenter（非断定 copy）を通す。observation は内部表現で断定 UI ではない。
 */
export interface MemoryItem {
  readonly kind: MemoryKind;
  /** 観測の内部表現（非断定・trait 語なし）。例: 「夜の予定では見送りやすい傾向」。 */
  readonly observation: string;
  readonly context: MemoryContext;
  readonly evidenceCount: number;
  readonly counterCount: number;
  /** ≤tentative（high にしない）。 */
  readonly certainty: MemoryCertainty;
  /** 本人が確認したか（confirm signal）。 */
  readonly userConfirmed: boolean;
  /** 本人の訂正（最強 signal・null=未訂正）。 */
  readonly userCorrection: MemoryCorrection;
  /** 行動の寄り（semantic/preference/procedural のみ・他 null）。synthesis が net leaning を集約する。 */
  readonly leaning: MemoryLeaning | null;
  /** 出来事の発生時刻（**episodic のみ**・他 kind は null）。recency 並べ替えは下流（synthesis）が nowMs で行う。 */
  readonly occurredAtISO: string | null;
  readonly source: MemorySource;
}

/** 各 kind が「何を捉え」「どの PRM 由来で」「検索でどう使うか」（監査・設計の単一参照）。 */
export interface MemoryKindSpec {
  readonly kind: MemoryKind;
  readonly captures: string;
  readonly sources: readonly MemorySource[];
  readonly retrievalUse: string;
}

/**
 * R1-0 監査に基づく taxonomy（正本＝PRM。procedural は専用ストアが無く M1 accept+correction から合成）。
 */
export const MEMORY_TAXONOMY: Record<MemoryKind, MemoryKindSpec> = {
  episodic: {
    kind: "episodic",
    captures: "過去の具体的な予定・行動・修正の出来事",
    sources: ["prm_learning_event"], // M1（accept/dismiss/later の signal log・band/date 付き）
    retrievalUse: "「前にこの文脈でどうした」を想起",
  },
  semantic: {
    kind: "semantic",
    captures: "文脈束縛の一般傾向",
    sources: ["prm_model_entry"], // M3（review 済 tendency）
    retrievalUse: "「この時間帯では見送りやすい」等を判断に内部参照",
  },
  procedural: {
    kind: "procedural",
    captures: "採用された手順（うまくいった修復・選択）",
    sources: ["prm_learning_event", "prm_review_decision"], // 専用ストアなし→M1 accept(+correction) と M2 approve から合成
    retrievalUse: "「この崩れ方にはこの直し方が効いた」を再利用",
  },
  preference: {
    kind: "preference",
    captures: "何を大事にするか（価値・回復傾向）",
    sources: ["prm_model_entry", "prm_review_decision"], // tendency + 本人 review/correction から
    retrievalUse: "提案の重み付け（休息を削りすぎない等）",
  },
  correction: {
    kind: "correction",
    captures: "AI 提案を本人が直した記録",
    sources: ["prm_review_decision", "prm_model_entry"], // M2 user decision + M3 user_correction/retracted_at
    retrievalUse: "本人の訂正を最優先証拠として反映（directly-observed > inferred）",
  },
};

const CERTAINTY = new Set<MemoryCertainty>(["low", "tentative"]);

/** 任意の certainty を ≤tentative に丸める（high/不正 → tentative・断定を構造的に不可能化）。 */
export function capCertainty(value: unknown): MemoryCertainty {
  return typeof value === "string" && CERTAINTY.has(value as MemoryCertainty) ? (value as MemoryCertainty) : "tentative";
}

/** 断定・trait 語の検出（**内部 observation 健全性チェック**・true=違反あり）。 */
const ASSERTIVE = /あなたは.*です|必ず|絶対|間違いなく|に決まって|すべきだ|しかない/;
const TRAIT = /性格|怠惰|だらしな|人格|無責任/;
export function memoryObservationHasViolation(observation: string): boolean {
  return ASSERTIVE.test(observation) || TRAIT.test(observation);
}

/**
 * context_dimension+value → 人間可読な文脈句（**記憶 adapter 共通**・内部表現）。
 *   UI 表示は presenter（second-self-presenter）が別途担う。ここは記憶層の内部 observation 用。
 */
const MEMORY_CONTEXT_PHRASE: Record<string, Record<string, string>> = {
  band: { morning: "朝の予定", afternoon: "午後の予定", evening: "夜の予定", none: "時間帯の定まらない予定" },
  durationBucket: { short: "短い予定", medium: "中くらいの予定", long: "時間のかかる予定", unknown: "所要不明の予定" },
  confidence: { high: "確信高めの提案", medium: "確信中くらいの提案", low: "確信低めの提案" },
  source: { seed_explicit: "会話から拾った予定", correction: "調整された予定" },
};
export function memoryContextPhrase(dimension: string, value: string): string {
  return MEMORY_CONTEXT_PHRASE[dimension]?.[value] ?? "ある場面";
}

/** 入力を安全な MemoryItem へ正規化（certainty を cap・counts を非負へ・provenance 必須）。 */
export function buildMemoryItem(input: {
  readonly kind: MemoryKind;
  readonly observation: string;
  readonly context?: MemoryContext;
  readonly evidenceCount?: number;
  readonly counterCount?: number;
  readonly certainty?: unknown;
  readonly userConfirmed?: boolean;
  readonly userCorrection?: MemoryCorrection;
  readonly leaning?: MemoryLeaning | null;
  readonly occurredAtISO?: string | null;
  readonly source: MemorySource;
}): MemoryItem {
  return {
    kind: input.kind,
    observation: input.observation,
    context: input.context ?? { dimension: null, value: null },
    evidenceCount: Math.max(0, Math.trunc(input.evidenceCount ?? 0)),
    counterCount: Math.max(0, Math.trunc(input.counterCount ?? 0)),
    certainty: capCertainty(input.certainty),
    userConfirmed: input.userConfirmed ?? false,
    userCorrection: input.userCorrection ?? null,
    leaning: input.leaning ?? null,
    occurredAtISO: input.occurredAtISO ?? null,
    source: input.source,
  };
}
