// lib/stargazer/dreamJournal.ts
// 夢日記 & 象徴解釈エンジン
// 心理学的根拠: ユング (1964) 「人間と象徴」、ヒルの夢解釈モデル

import type { TraitAxisKey } from "./traitAxes";
import { safeLSSet } from "@/lib/safeLocalStorage";

const STORAGE_KEY = "stargazer_dream_journal_v1";

export interface DreamEntry {
  id: string;
  date: string;
  /** 夢の内容（自由記述） */
  content: string;
  /** 夢の中の感情 */
  emotion: "positive" | "negative" | "mixed" | "neutral";
  /** 夢の鮮明さ (1-5) */
  vividness: 1 | 2 | 3 | 4 | 5;
  /** 検出されたシンボル */
  symbols: DreamSymbol[];
  /** 夢全体の解釈 */
  interpretation?: string;
}

export interface DreamSymbol {
  /** シンボルのキーワード */
  keyword: string;
  /** ユング的元型カテゴリ */
  archetype: JungianArchetype;
  /** このユーザーにとっての意味 */
  personalMeaning: string;
  /** 関連する軸 */
  relatedAxes: TraitAxisKey[];
}

export type JungianArchetype =
  | "shadow"        // 影 — 抑圧された側面
  | "anima_animus"  // アニマ/アニムス — 内なる異性性
  | "self"          // 自己 — 全体性・統合
  | "persona"       // ペルソナ — 社会的仮面
  | "mother"        // 母 — 養育・安全
  | "father"        // 父 — 権威・構造
  | "child"         // 子供 — 純粋性・可能性
  | "trickster"     // トリックスター — 混乱・変容
  | "hero"          // 英雄 — 挑戦・克服
  | "wise_old";     // 老賢者 — 知恵・導き

export const ARCHETYPE_LABELS: Record<JungianArchetype, { label: string; description: string }> = {
  shadow: {
    label: "影",
    description: "あなたが意識から追いやった側面。夢の中の敵や追いかけてくるものは、しばしば影を表す。",
  },
  anima_animus: {
    label: "アニマ/アニムス",
    description: "内なる異性性。創造性や直観の源。夢の中の異性の人物として現れることが多い。",
  },
  self: {
    label: "自己",
    description: "全体性と統合の象徴。曼荼羅、宝石、中心にある何かとして現れる。",
  },
  persona: {
    label: "ペルソナ",
    description: "社会に見せている仮面。服、マスク、鏡として現れることがある。",
  },
  mother: {
    label: "母",
    description: "養育と安全。家、水、大地として現れる。窒息させる母か、抱きしめる母か。",
  },
  father: {
    label: "父",
    description: "権威と構造。山、塔、法律として現れる。",
  },
  child: {
    label: "子供",
    description: "純粋性と可能性。新しい始まり。夢の中の子供は、あなたの中の未発達な可能性。",
  },
  trickster: {
    label: "トリックスター",
    description: "混乱と変容の使者。予想外の出来事や道化は、固定観念を揺さぶる。",
  },
  hero: {
    label: "英雄",
    description: "困難に立ち向かう自分。冒険、戦い、旅は自己実現への道のり。",
  },
  wise_old: {
    label: "老賢者",
    description: "内なる知恵。導く存在、教師、光として現れる。",
  },
};

// Common dream symbols → archetype mapping
const SYMBOL_MAP: Array<{
  keywords: string[];
  archetype: JungianArchetype;
  meaning: string;
  axes: TraitAxisKey[];
}> = [
  {
    keywords: ["追いかけ", "追われ", "逃げ", "逃走"],
    archetype: "shadow",
    meaning: "向き合うことを避けている自分の側面がある",
    axes: ["stress_isolation_vs_social", "cautious_vs_bold"],
  },
  {
    keywords: ["落ち", "落下", "墜落", "崩壊"],
    archetype: "shadow",
    meaning: "コントロールを失う恐怖、地盤の不安定さ",
    axes: ["control_tendency", "emotional_regulation"],
  },
  {
    keywords: ["水", "海", "川", "泳ぐ", "溺れ"],
    archetype: "mother",
    meaning: "感情の深さ、無意識との接触。溺れるなら感情に圧倒されている",
    axes: ["emotional_variability", "emotional_regulation"],
  },
  {
    keywords: ["飛ぶ", "空", "浮く", "翼"],
    archetype: "hero",
    meaning: "自由への渇望、制約からの解放",
    axes: ["independence_vs_harmony", "change_embrace_vs_resist"],
  },
  {
    keywords: ["試験", "テスト", "遅刻", "忘れ"],
    archetype: "persona",
    meaning: "社会的評価への不安、「十分でない」という恐れ",
    axes: ["perfectionist_vs_pragmatic", "public_private_gap"],
  },
  {
    keywords: ["鏡", "写真", "映像", "自分"],
    archetype: "self",
    meaning: "自己認識の瞬間。鏡に映る姿が異なるなら、自己像のギャップ",
    axes: ["public_private_gap", "shame_vs_guilt"],
  },
  {
    keywords: ["家", "部屋", "扉", "窓"],
    archetype: "self",
    meaning: "自分の心の構造。未知の部屋は未探索の自己領域",
    axes: ["boundary_awareness", "introvert_vs_extrovert"],
  },
  {
    keywords: ["動物", "犬", "猫", "蛇", "鳥"],
    archetype: "shadow",
    meaning: "本能的な衝動。動物の種類が抑圧された特質を示す",
    axes: ["analytical_vs_intuitive", "cautious_vs_bold"],
  },
  {
    keywords: ["死", "葬式", "終わり"],
    archetype: "trickster",
    meaning: "変容と再生。古い自分の死は新しい自分の誕生を意味する",
    axes: ["change_embrace_vs_resist", "growth_mindset"],
  },
  {
    keywords: ["赤ちゃん", "子供", "小さい"],
    archetype: "child",
    meaning: "新しい可能性、脆弱性、未発達な才能",
    axes: ["reassurance_need", "intimacy_pace"],
  },
  {
    keywords: ["道", "旅", "迷子", "地図"],
    archetype: "hero",
    meaning: "人生の方向性。迷子なら目的を見失っている状態",
    axes: ["plan_vs_spontaneous", "locus_of_control"],
  },
  {
    keywords: ["光", "太陽", "星", "輝き"],
    archetype: "wise_old",
    meaning: "意識の拡大、洞察、導き",
    axes: ["analytical_vs_intuitive", "growth_mindset"],
  },
];

/**
 * 夢のテキストからシンボルを検出する
 */
export function detectSymbols(content: string): DreamSymbol[] {
  const symbols: DreamSymbol[] = [];
  const seen = new Set<string>();

  for (const entry of SYMBOL_MAP) {
    for (const kw of entry.keywords) {
      if (content.includes(kw) && !seen.has(entry.archetype + entry.meaning)) {
        seen.add(entry.archetype + entry.meaning);
        symbols.push({
          keyword: kw,
          archetype: entry.archetype,
          personalMeaning: entry.meaning,
          relatedAxes: entry.axes,
        });
        break; // One match per symbol group
      }
    }
  }

  return symbols;
}

export function loadDreams(): DreamEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveDream(entry: DreamEntry): void {
  const dreams = loadDreams();
  dreams.unshift(entry); // Newest first
  if (dreams.length > 100) dreams.pop();
  safeLSSet(STORAGE_KEY, JSON.stringify(dreams));
}

export function removeDream(id: string): void {
  const dreams = loadDreams().filter((d) => d.id !== id);
  safeLSSet(STORAGE_KEY, JSON.stringify(dreams));
}
