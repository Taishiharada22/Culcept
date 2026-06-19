/**
 * lib/plan/candidateLens/candidateLensUi.ts
 *   — Purpose-Adaptive Candidate Lens / Phase 2: UI 用 view-model + flag（pure helper）
 *
 * ★Phase 1 の pure resolver を消費して 3 画面 UI 用の view-model を作る。flag default OFF / dev-only。
 * ★CEO 補正(2026-06-15): 未確認(D)は主比較表に「—」で並べず除外し名前だけ補助表示・写真は外部 API なしゆえ出さない・
 *   evidenceType を UI に活かす・B は「約/目安」（distanceMeters=haversine 直線ゆえ）。捏造しない。
 */
import {
  buildPlaceAttributes,
  ATTRIBUTE_LABEL,
  type CandidateInput,
  type AttributeKey,
  type PlaceAttribute,
  type PlaceAttributeContext,
} from "@/lib/plan/candidateLens/placeAttributeModel";
import { classifyPurposeLens, type PurposeLens } from "@/lib/plan/candidateLens/purposeLens";
import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";
import {
  buildLensComparison,
  recommendationBasisPhrase,
  type ComparisonRow,
} from "@/lib/plan/candidateLens/candidateLensResolver";
import { applyPreferenceToAxes, type UserPlacePreference } from "@/lib/plan/candidateLens/userPlacePreference";

/**
 * ★候補レンズ UI flag（lens ①②③ 全体のマスター）。
 *   ★2026-06-19 CEO「まず lens 単体を dogfood 確認」で **true（dev/dogfood ON）**。
 *   production は `NODE_ENV !== "production"` で **hard block 維持**（本番公開は別 GO）。flag OFF 時のみ既存 `<ul>` に戻る。
 */
export const PLACE_CANDIDATE_LENS_UI_ENABLED = true;
export function isCandidateLensUiEnabled(): boolean {
  return PLACE_CANDIDATE_LENS_UI_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** ★E-b: ③ 行順 explanation note の UI flag（default OFF・dev-only・production hard block）。OFF で ③ は完全不変。 */
export const PLACE_CANDIDATE_LENS_EXPLANATION_ENABLED = false;
export function isCandidateLensExplanationEnabled(): boolean {
  return PLACE_CANDIDATE_LENS_EXPLANATION_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/** 候補（placeId 付き・UI key 用）。 */
export interface LensCandidate extends CandidateInput {
  readonly placeId: string;
}

/** ① card / ② detail 用の単一候補 view（pure・実値のみ・捏造しない）。 */
export interface LensCandidateView {
  readonly placeId: string;
  readonly name: string;
  readonly address: string | null;
  readonly category: string | null;
  readonly lens: PurposeLens;
  /** 相性バッジ（観測由来 reason がある時のみ・無ければ null）。 */
  readonly affinityBadge: string | null;
  /** 「なぜここを選ぶ？」hedged・実値のみ（無ければ null）。 */
  readonly whyLine: string | null;
  /** ① card の主役チップ（実値のある軸のみ・徒歩/予定接続/余白…）。 */
  readonly primaryChips: ReadonlyArray<{ readonly key: AttributeKey; readonly label: string; readonly value: string }>;
  /** 内部保持: 属性束（② や ③ で使う）。 */
  readonly attrs: Record<AttributeKey, PlaceAttribute>;
}

/** lens ごとに ① card の主役チップに出す軸（実値があるものだけ採用）。徒歩＋種別を基本に、gap があれば予定接続/余白も。 */
const CARD_CHIP_KEYS: Record<PurposeLens, readonly AttributeKey[]> = {
  meeting_prep: ["walk_estimate", "schedule_fit", "margin_impact", "category"],
  focus_work: ["walk_estimate", "category"],
  conversation: ["walk_estimate", "margin_impact", "category"],
  errand: ["walk_estimate", "schedule_fit", "category"],
  generic: ["walk_estimate", "category"],
};

/** purpose lens を予定から導く（title→activityKey→lens）。 */
export function purposeLensFromSchedule(title: string): PurposeLens {
  return classifyPurposeLens({ activityKey: classifyActivityIconKey(title), title });
}

/** 住所を 1 行省略表示用に短縮（① card 用・pure）。空白前まで＋長すぎれば maxLen で「…」。全文は ② で出す。 */
export function shortAddress(address: string | null, maxLen = 18): string | null {
  if (!address) return null;
  const head = address.split(/[\s　]/)[0] ?? address; // 全角/半角空白前
  return head.length > maxLen ? `${head.slice(0, maxLen)}…` : head;
}

/** 住所を ② 用に最大 2 行へ整理（pure・ベタ長文を避ける）。 */
export function splitAddressLines(address: string | null): readonly string[] {
  if (!address) return [];
  const parts = address.split(/[\s　]+/).filter(Boolean);
  if (parts.length <= 1) return [address];
  return [parts[0]!, parts.slice(1).join(" ")];
}

/** 目的レンズ → ② のチェックリスト先頭に出す目的由来の理由（UI コピー・捏造でない）。 */
const LENS_WHY_BULLET: Record<PurposeLens, string> = {
  meeting_prep: "会議前に落ち着いて準備しやすい場所です",
  focus_work: "集中して作業を進めやすい場所です",
  conversation: "ゆっくり会話しやすい場所です",
  errand: "ついでに立ち寄りやすい場所です",
  generic: "予定に向かいやすい場所です",
};

/**
 * ② 「なぜここをおすすめ？」のチェックリスト項目（pure・★honest のみ・捏造しない）。
 *   理想画像は ✓ 付きリスト形式。値を持つ honest シグナル（徒歩=計算 / 相性=観測 / 目的レンズ=UI コピー）だけを並べる。
 *   静か/Wi-Fi/電源 等の未確認は**含めない**（捏造回避）。最低 1 項目（目的レンズ）は必ず返す。
 */
export function buildWhyBullets(view: LensCandidateView, lens: PurposeLens): readonly string[] {
  const bullets: string[] = [];
  bullets.push(LENS_WHY_BULLET[lens]); // 目的由来（常に 1 つ）
  const walk = view.attrs.walk_estimate.value; // 例: 約5分（目安）
  if (walk) bullets.push(`徒歩${walk}で移動の負担が少なめです`);
  if (view.affinityBadge) bullets.push("普段から訪れている傾向があり、迷いにくい場所です");
  return bullets;
}

/** 「なぜここを選ぶ？」を実値のみで hedged に組む（pure・捏造しない・無ければ null）。 */
function whyChooseLine(attrs: Record<AttributeKey, PlaceAttribute>, lens: PurposeLens, hasAffinity: boolean): string | null {
  const walk = attrs.walk_estimate.value; // 例: 約7分（目安）
  const lensFrame: Record<PurposeLens, string> = {
    meeting_prep: "会議前に余白を持ちやすそうです",
    focus_work: "立ち寄りやすい場所です",
    conversation: "会って話す前後に動きやすそうです",
    errand: "ついでに寄りやすい場所です",
    generic: "向かいやすい場所です",
  };
  const affixAffinity = hasAffinity ? "（よく行く場所です）" : "";
  if (walk) return `徒歩${walk}で、${lensFrame[lens]}${affixAffinity}`;
  if (hasAffinity) return `よく行く場所です。${lensFrame[lens]}`;
  return null;
}

export interface LensViewContext extends PlaceAttributeContext {
  /** 候補の観測 reason（Place Affinity 由来・per candidate）。 */
  readonly affinityReason?: string | null;
}

/** 候補 → view（pure）。affinity は ctx.affinityReason 由来のみ（捏造しない）。 */
export function buildLensCandidateView(candidate: LensCandidate, lens: PurposeLens, ctx: LensViewContext = {}): LensCandidateView {
  const attrs = buildPlaceAttributes(candidate, ctx);
  const hasAffinity = !!(ctx.affinityReason && ctx.affinityReason.trim().length > 0);
  const chips = CARD_CHIP_KEYS[lens]
    .map((key) => ({ key, label: ATTRIBUTE_LABEL[key], value: attrs[key].value }))
    .filter((c): c is { key: AttributeKey; label: string; value: string } => c.value != null);
  return {
    placeId: candidate.placeId,
    name: candidate.name,
    address: attrs.address.value,
    category: attrs.category.value,
    lens,
    affinityBadge: hasAffinity ? "相性" : null,
    whyLine: whyChooseLine(attrs, lens, hasAffinity),
    primaryChips: chips,
    attrs,
  };
}

/**
 * ③ 行順の説明 payload（E-a・pure）。
 *   ★preference 適用で **canonical と実表示順が変わった時だけ** 非 null。それ以外（preference なし/insufficient/順序不変）は null。
 *   ★行順の説明だけ（推薦/winner/highlight は不変・ここでは扱わない）。leadAxes は **applied preference 由来**（捏造でない）。
 */
export interface ComparisonExplanation {
  readonly reordered: true;
  /** 前方へ寄せた軸（1〜2・表示文言の元）。 */
  readonly leadAxes: readonly AttributeKey[];
  /** copy 選択用の主軸識別子（= leadAxes[0]）。UI はこれ/leadAxes から register A の行為説明を組む。 */
  readonly copyKey: AttributeKey;
}

/** ③ 比較 view。主表は確認済み(値あり)行のみ・未確認は名前だけ補助に。 */
export interface LensComparisonView {
  readonly lens: PurposeLens;
  /** 主比較表に出す行（両側 null は除外＝「—」を並べない）。 */
  readonly mainRows: readonly ComparisonRow[];
  /** この目的で関わるが未確認の項目名（補助の小さな注記用・値は出さない）。 */
  readonly unconfirmedLabels: readonly string[];
  /** 推薦サマリー（どちら側・根拠句）。甲乙つけがたければ null。 */
  readonly recommendation: { readonly side: "left" | "right"; readonly basisPhrase: string } | null;
  /** ★E-a: 行順が personalized で canonical と変わった時だけ非 null（説明 note 用）。それ以外は null。 */
  readonly explanation: ComparisonExplanation | null;
}

/** 軸 → 行為説明用の名詞（register A・★人格断定/追跡語を含まない）。UI が 1 行 note に使う。 */
const EXPLANATION_AXIS_NOUN: Partial<Record<AttributeKey, string>> = {
  walk_estimate: "徒歩の近さ",
  margin_impact: "予定の余白",
  schedule_fit: "予定とのつながり",
  affinity_reason: "なじみのある場所",
  social_fit: "会話のしやすさ",
  category: "場所の種類",
  address: "場所",
};

/** lead 軸 → 名詞（無ければ ATTRIBUTE_LABEL fallback）。 */
export function explanationAxisNoun(key: AttributeKey): string {
  return EXPLANATION_AXIS_NOUN[key] ?? ATTRIBUTE_LABEL[key];
}

/**
 * ★E-a copy helper（register A・行為説明のみ・pure）。
 *   「最近の選び方をもとに、〈軸〉を上に並べています。」— 人格断定（あなたは〜な人）/追跡語（よく見る・履歴）を**含まない**。
 */
export function buildExplanationCopy(leadAxes: readonly AttributeKey[]): string {
  const noun = leadAxes.length > 0 ? explanationAxisNoun(leadAxes[0]!) : "選びやすさ";
  return `最近の選び方をもとに、${noun}を上に並べています。`;
}

/**
 * 左右 view → 比較 view（pure・未確認は主表から除外し名前だけ拾う・捏造しない）。
 *
 * ★P3-c: **推薦/winner/highlight と「表示行順」を分離**する。
 *   - recommendation・各行の isBest（優位ハイライトの意味）は **canonical 軸順（preference なし）で固定**＝
 *     preference をいくら持っていても判定は誰でも同じ（ranking/推薦を裏で変えない）。
 *   - `preference`（gate 済を受け取る前提）は **表示する mainRows の並び順だけ** に反映する
 *     （行の追加/削除・値・isBest・recommendation は一切変えない）。preference なし → canonical 表示順。
 */
export function buildLensComparisonView(
  lens: PurposeLens,
  left: LensCandidateView,
  right: LensCandidateView,
  preference?: UserPlacePreference,
): LensComparisonView {
  // ★canonical（preference を渡さない）で全軸・推薦を計算。recommendation/isBest はここに固定（preference 不依存）。
  const canonical = buildLensComparison({ lens, leftAttrs: left.attrs, rightAttrs: right.attrs, showUnconfirmed: true });
  const canonicalMain = canonical.rows.filter((r) => !r.unconfirmed);
  const canonicalKeys = canonicalMain.map((r) => r.key);

  // ★preference は「表示行順だけ」反映: 既定軸にある軸を前方へ寄せ、行をその順で並べ替える（isBest/値/推薦は不変）。
  //   さらに E-a: **canonical と順序が変わった時だけ** explanation payload を生成（leadAxes は applied preference 由来）。
  let mainRows: readonly ComparisonRow[] = canonicalMain;
  let explanation: ComparisonExplanation | null = null;
  if (preference) {
    const ordered = applyPreferenceToAxes(canonicalKeys, lens, preference);
    if (!sameOrder(canonicalKeys, ordered)) {
      const byKey = new Map(canonicalMain.map((r) => [r.key, r] as const));
      mainRows = ordered.map((k) => byKey.get(k)).filter((r): r is ComparisonRow => r != null);
      // leadAxes = 適用 preference の軸のうち、比較表に実在する軸（前方化した軸）。先頭 1〜2。
      const prefAxes = preference.perLens?.[lens] ?? preference.prioritizedAttributes ?? [];
      const leadAxes = prefAxes.filter((k) => canonicalKeys.includes(k)).slice(0, 2);
      if (leadAxes.length > 0) {
        explanation = { reordered: true, leadAxes, copyKey: leadAxes[0]! };
      }
    }
  }

  // ★補助注記は「本当に未確認(C弱推定/D未確認)」のみ。文脈不足で未計算の B(computed・例: gap 無しの予定接続/余白)は静かに drop。
  const unconfirmedLabels = canonical.rows.filter((r) => r.unconfirmed && r.evidenceType !== "computed").map((r) => r.label);
  const phrase = recommendationBasisPhrase(canonical);
  return {
    lens,
    mainRows,
    unconfirmedLabels,
    recommendation: canonical.recommendation && phrase ? { side: canonical.recommendation.side, basisPhrase: phrase } : null,
    explanation,
  };
}

/** 行順が同一か（pure・E-a の explanation 発火判定）。 */
function sameOrder(a: readonly AttributeKey[], b: readonly AttributeKey[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
