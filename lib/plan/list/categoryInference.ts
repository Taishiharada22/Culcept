/**
 * Phase 3-N List impl sub-phase 8b-5 corrective — CategoryInference pure module
 *
 * 設計原則 (= CEO + GPT 合議 2026-05-24 8b-5 corrective patch):
 *   - **表示のための deterministic fallback** (= 元データを書き換えない)
 *   - inferred category を storage に保存しない (= adapter 内 view layer 専用)
 *   - **LLM 不使用** (= pure keyword matching、 副作用 0)
 *   - **pure module / pure helper** (= LLM / API / DB / network 不使用、 入力 mutate なし)
 *
 * 8b dogfood で判明した問題:
 *   - real anchor data の大半が `locationCategory: undefined` (= 入力 modal で auto-set されない)
 *   - 既存 adapter で全部 'other' に落ちる → tint=white / icon=invisible / alterNote=undefined
 *   - 結果: 8b semantic layer が実画面で発火しない (= unit test green / dogfood FAIL)
 *
 * 解決:
 *   - title / locationText の keyword matching で category 推測
 *   - explicit locationCategory が決定的な値 ('home'/'office'/'school'/'cafe') を持つ場合は優先
 *   - heuristic で hit なし → 'other'
 *
 * 優先順位 (= adapter 側で適用、 本 module は keyword matching 単体):
 *   1. explicit locationCategory ('home'→home / 'office'→work / 'school'→work / 'cafe'→cafe)
 *   2. title keyword fallback (= 本 module の inferCategoryFromText)
 *   3. locationText keyword fallback (= 本 module の inferCategoryFromText 再利用)
 *   4. 'other' fallback
 *
 * keyword first-match 順序 (= 「直接的行動」 優先):
 *   meal → work → cafe → home
 *
 *   理由: 「ランチミーティング」 → meal (= 行動本体)、 「会食打ち合わせ」 → meal (= 行動本体)
 *
 * 設計書:
 *   - decision-log (= 8b-5 corrective patch、 4 段階優先順位)
 *   - lib/plan/list/types.ts (= EventCategory)
 *   - lib/plan/list/adapters/externalAnchorAdapter.ts (= 本 module を 8b-5 で呼出)
 */

import { type EventCategory } from "./types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CATEGORY_KEYWORDS (= 4 category × keyword 配列)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Category 別 keyword mapping (= 「日本人が anchor title / locationText に書きそうな自然な言葉」)
 *
 * - cafe: カフェ系
 * - meal: 食事 / 飲食店系
 * - work: 業務 / 会議系
 * - home: 自宅系
 *
 * 順序は keys order (= JS Object insertion order)、 ただし inferCategoryFromText で
 * 明示的に first-match 順序 (= meal > work > cafe > home) を制御。
 *
 * 'other' は entry なし (= 「判断不能」 を意味する)
 */
const CATEGORY_KEYWORDS: Record<Exclude<EventCategory, 'other'>, ReadonlyArray<string>> = {
  cafe: [
    'カフェ',
    'cafe',
    'Cafe',
    'CAFE',
    'コーヒー',
    'スタバ',
    'スターバックス',
    'ドトール',
    'タリーズ',
    'コメダ',
    '喫茶',
  ],
  meal: [
    '会食',
    'ランチ',
    '夕食',
    '朝食',
    'ディナー',
    '昼食',
    '食事',
    'お店',
    'レストラン',
    '飲み会',
    '居酒屋',
    '食堂',
    'ご飯',
    '昼飯',
    '夕飯',
  ],
  work: [
    '会議',
    'ミーティング',
    '打合せ',
    '打ち合わせ',
    '商談',
    '会社',
    '職場',
    'オフィス',
    'シフト',
    'バイト',
    '出勤',
    '業務',
    '面談',
    'アポ',
    '面接',
    '作業',
    '勤務',
  ],
  home: [
    '自宅',
    '帰宅',
    '在宅',
    '家で',
    'うち',
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// inferCategoryFromText (= 表示用 deterministic 推測)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Text (= title or locationText) から category を推測 (= first match)
 *
 * - first-match 順序: **meal → work → cafe → home** (= 「直接的行動」 優先)
 * - keyword に includes 一致した最初の category を return
 * - どれも hit なし → undefined (= 'other' に落とすかは呼出側判断)
 *
 * 副作用 0、 入力 mutate なし、 deterministic
 */
export function inferCategoryFromText(
  text: string,
): EventCategory | undefined {
  const order: ReadonlyArray<Exclude<EventCategory, 'other'>> = ['meal', 'work', 'cafe', 'home'];
  for (const cat of order) {
    const keywords = CATEGORY_KEYWORDS[cat];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return cat;
      }
    }
  }
  return undefined;
}
