/**
 * CoAlter Stage 3 Resolve (movie) — Tier 2 Fail Narration (template only, LLM 不使用)
 *
 * 三段式 §2.4 / §4 / §6 B3 / mainstream plan §3.3 元 D-3-c / handover §6 D-2-c /
 * D-2 設計レビュー §4.
 *
 * Tier 2 fail (D-2-b `areaExpansion` で Tier 0/1 全 fail 時) に呼び出され、
 * 2 人理解を根拠に謝る narration + 別作品再起動 signal (altSignal=true) を返す。
 *
 * CoAlter 存在論 §0.5 整合:
 *   - 「2 人理解を根拠に謝る」narration
 *   - 「今日のおふたりは〇〇な空気があったので、〇〇は近隣で見つからず…」と
 *     lens フィールドを引用して謝る (汎用 LLM では出せない CoAlter 独自の納得感)
 *
 * 設計原則 (CEO 採用 L1):
 *   - **template only、LLM 不使用、決定論**: 同 input → 同 output
 *   - pure function、副作用ゼロ
 *   - lens 観測薄時 (新規ペア等) は generic fallback template
 *   - citedLensFields に実際に引用した lens field 名を記録 (G6 同等の verify pattern)
 *
 * 構造 gate B3 担保 (mainstream plan §3.3 / 三段式 §6 M2 Bug-2 接続):
 *   - `state: "tier2_fail"` literal type で固定
 *   - `altSignal: true` literal type で固定 (false の余地を型レベルで排除)
 *   - narration.altSuggestion non-empty (別作品提案 UI 表示の signal)
 *   - narration.apologyForToday non-empty (lens 根拠 narration)
 *
 * 凍結線整合 (handover §4.2):
 *   - import は understanding/types のみ (Step B M0 完了済型)
 *   - 既存 narration 経路 (narrationBuilder / narrationEnricher / stage1Narration)
 *     touch なし
 */

import type { TwoPersonLensToday } from "../understanding/types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public types — B3 構造 gate 担保 (literal type で state / altSignal 固定)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tier 2 fail 時の narration (template only、3 fields):
 *
 *   - `apologyForToday`: lens 由来の謝り narration (2 人理解を根拠)
 *   - `altSuggestion`: 別作品提案文 (UI 「別作品を探す」ボタンのテキスト基)
 *   - `citedLensFields`: 実際に引用した lens field 名一覧 (verify 用、G6 pattern 継承)
 */
export type TierFailNarration = {
  apologyForToday: string;
  altSuggestion: string;
  citedLensFields: readonly string[];
};

/**
 * Tier 2 fail state (B3 構造 gate 担保、literal type で固定):
 *
 *   - `state: "tier2_fail"` (sentinel literal)
 *   - `altSignal: true` (literal、別作品再起動 UI の signal、false の余地排除)
 *   - `message`: UI banner / toast 用短文 ("〇〇 近辺で見つからず")
 *   - `narration`: lens 由来 3 field narration
 *   - `failedTitle`: 失敗した作品タイトル (UI / 別 phase へ propagate)
 *   - `area`: ユーザー指定 area (UI / 別 phase へ propagate)
 */
export type TierFailState = {
  state: "tier2_fail";
  altSignal: true;
  message: string;
  narration: TierFailNarration;
  failedTitle: string;
  area: string;
};

/** buildTierFailNarration の入力。 */
export type TierFailInput = {
  failedTitle: string;
  area: string;
  lens: TwoPersonLensToday;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Template helpers — lens 由来引用 + fallback
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apology narration を組み立てる:
 *
 *   優先順序 (lens 観測の濃さ順):
 *     1. `relationalLens.dominantDynamic` が non-empty → 引用
 *     2. `todayReading.mode` が "maintain" 以外 (default) → 引用
 *     3. fallback: lens 引用なしの generic apology
 *
 *   返り値の citedFields に実際に引用した lens field 名を記録 (G6 verify 用)。
 */
function composeApology(
  lens: TwoPersonLensToday,
  failedTitle: string,
  area: string,
): { apology: string; citedFields: string[] } {
  const citedFields: string[] = [];
  const dynamic = lens.relationalLens.dominantDynamic;
  const mode = lens.todayReading.mode;

  if (dynamic && dynamic.length > 0) {
    citedFields.push("relationalLens.dominantDynamic");
    return {
      apology:
        `今日のおふたりは「${dynamic}」な空気があったので、` +
        `「${failedTitle}」を選びましたが、${area}近辺では上映が弱いようです。` +
        "別の候補を探し直してみます。",
      citedFields,
    };
  }

  if (mode && mode !== "maintain") {
    citedFields.push("todayReading.mode");
    return {
      apology:
        `今日は「${mode}」モードのおふたりに合わせて「${failedTitle}」を選びましたが、` +
        `${area}近辺では見つけられませんでした。` +
        "別の候補を探し直してみます。",
      citedFields,
    };
  }

  // lens 観測薄 (新規ペア等)、generic fallback
  return {
    apology:
      `「${failedTitle}」は${area}近辺で上映が見つけられませんでした。` +
      "おふたりに合う別の候補を探し直してみます。",
    citedFields,
  };
}

/**
 * 別作品提案文 (altSuggestion) を組み立てる。
 *
 *   area を embed して「{area} 周辺の別作品」を促す。template only、決定論。
 */
function composeAltSuggestion(area: string): string {
  return `${area}周辺の別作品から、おふたりに合うものを探し直してみますか?`;
}

/**
 * UI banner / toast 用の短文 message。
 *
 *   narration とは分離 (narration は 2 人理解を根拠とする長文、message は UI 表示用短文)。
 */
function composeMessage(failedTitle: string, area: string): string {
  return `${area}近辺で「${failedTitle}」の上映が見つかりませんでした`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public API — buildTierFailNarration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tier 2 fail 時の state + narration を組み立てる pure function。
 *
 *   - **決定論**: 同 input → 同 output
 *   - **副作用ゼロ** (時間 / random / DB / network 不参照)
 *   - **入力 lens を mutate しない**
 *   - **B3 構造 gate 担保**: state + altSignal が literal type で固定
 *   - **template only**: LLM 不使用、CEO 採用 L1 厳守
 */
export function buildTierFailNarration(input: TierFailInput): TierFailState {
  const { failedTitle, area, lens } = input;
  const { apology, citedFields } = composeApology(lens, failedTitle, area);
  const altSuggestion = composeAltSuggestion(area);
  const message = composeMessage(failedTitle, area);

  return {
    state: "tier2_fail",
    altSignal: true,
    message,
    narration: {
      apologyForToday: apology,
      altSuggestion,
      citedLensFields: [...citedFields],
    },
    failedTitle,
    area,
  };
}
