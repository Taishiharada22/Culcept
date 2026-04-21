/**
 * Where Vague Sub-Kind Classifier — W3-PR-8 Strict Confirmation
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §2.6
 *
 * `whereSharpness="vague"` の slot を以下の 3 sub-kind に分類する pure function。
 *   - anchor:         「甲府駅周辺」「近場」「〇〇市」— 文言そのものが位置情報
 *   - category_chain: 「スタバ」「カフェ」「図書館」— カテゴリ/チェーン
 *   - undecided:      「決めてない」「まだ」「たぶん」— 場所の実体なし
 *
 * 設計原則:
 *   - **LLM 呼び出し禁止**、deterministic only
 *   - 保守的に倒す（迷ったら undecided）。漏れは backlog で補足
 *   - PR-8 段階では固定語彙 + 語尾パターンで十分（PR-9 の search gate が category_chain を拾う）
 */

import type { WhereSlot } from "../comprehension/eventSchema";
import type { WhereVagueSubKind } from "../types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 語彙集合（CEO 明示 2026-04-22）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 未決意表明語彙（単独 or 前後空白）。
 * 部分一致させない（「決めてないカフェ」は undecided にならない）。
 *
 * 設計書 §2.5 / §2.6 CEO 明示:
 *   保守的に（誤爆より漏れを許容）、漏れは backlog で追加。
 */
const UNDECIDED_VOCAB: ReadonlySet<string> = new Set([
  "決めてない",
  "まだ",
  "未定",
  "どこでもいい",
  "どこでも",
  "わからない",
  "たぶん",
  "どこか",
]);

/**
 * anchor 語尾パターン（エリア指定を示す接尾辞）。
 * これらで終わる place_ref は anchor sub-kind とみなす。
 */
const ANCHOR_SUFFIXES: readonly string[] = [
  "周辺",
  "近く",
  "エリア",
  "市",
  "区",
];

/**
 * カテゴリ / 既知チェーン語彙。
 * placeType="generic_place" のときにここに一致すれば category_chain とみなす。
 *
 * 保守的に: 固有名詞（支店名）は含めず、generic label + 主要チェーンのみ。
 */
const CATEGORY_CHAIN_VOCAB: ReadonlySet<string> = new Set([
  // カテゴリ語
  "カフェ",
  "レストラン",
  "図書館",
  "喫茶店",
  "オフィス",
  "コンビニ",
  "ファミレス",
  "居酒屋",
  "バー",
  // 既知チェーン（支店未指定で使われる）
  "スタバ",
  "スターバックス",
  "マック",
  "マクドナルド",
  "ドトール",
  "ミスド",
  "サイゼ",
  "サイゼリヤ",
  "吉野家",
  "すき家",
  "松屋",
  "タリーズ",
  "ブルーボトル",
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * place_ref が undecided 語彙に一致するか。
 * 前後空白を trim して完全一致で判定。
 */
function isUndecidedToken(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return UNDECIDED_VOCAB.has(s);
}

/**
 * place_ref が anchor 語尾パターンで終わるか。
 */
function endsWithAnchorSuffix(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return ANCHOR_SUFFIXES.some((suf) => s.endsWith(suf));
}

/**
 * place_ref が category / chain 語彙に一致するか（完全一致）。
 */
function isCategoryChainToken(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  return CATEGORY_CHAIN_VOCAB.has(s);
}

/**
 * WhereSlot（vague 前提）を sub-kind に分類する。
 *
 * 判定優先順（設計書 §2.6 準拠）:
 *   1. place_ref が undecided 語彙と完全一致 → "undecided"
 *   2. place_ref が anchor 語尾で終わる（「周辺」「近く」「エリア」「市」「区」） → "anchor"
 *   3. placeType === "chain_brand" → "category_chain"
 *   4. placeType === "generic_place" かつ category 語彙一致 → "category_chain"
 *   5. その他（LLM が拾ったが意味不明 / 未分類） → "undecided"（保守的）
 *
 * 非 vague slot に対してはコール側で呼ばれない想定だが、フェイルセーフで undecided を返す。
 *
 * LLM / 外部リソース非依存。pure function。
 */
export function classifyWhereVague(where: WhereSlot): WhereVagueSubKind {
  const raw = where.place_ref ?? "";
  const trimmed = raw.trim();

  // 空文字は上位（sharpness=missing）で弾かれる想定。念のため保守的に undecided。
  if (!trimmed) return "undecided";

  // 1. 未決意表明語彙
  if (isUndecidedToken(trimmed)) return "undecided";

  // 2. anchor 語尾（placeType が何でも優先）
  if (endsWithAnchorSuffix(trimmed)) return "anchor";

  // 3. chain_brand は支店未確定なので category_chain
  if (where.placeType === "chain_brand") return "category_chain";

  // 4. generic_place + category/chain 語彙
  if (where.placeType === "generic_place" && isCategoryChainToken(trimmed)) {
    return "category_chain";
  }

  // 5. その他（意味不明）は保守的に undecided
  return "undecided";
}
