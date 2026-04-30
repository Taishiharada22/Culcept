/**
 * 状態 × モード 優先順位マトリクス mock data
 *
 * 正本: UI spec §4「状態 × モード 優先順位マトリクス」§4.3.1-§4.3.9
 *
 * 規約 (layout plan §4.4):
 *   - UI spec §4.3 のコピー、編集しない（preview 視覚化のみ）
 *   - 27 セル × 6 属性 = 162 cell を網羅
 *   - Daily / Travel は通常モード（基線）を base、override / 追加のみ記載
 */

export type StateKey =
  | "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";

export type ModeKey = "normal" | "daily" | "travel";

export type Density = "single-line" | "compact-card" | "expanded-card";

export interface CellAttrs {
  /** 1. 表示面 */
  display: string;
  /** 2. 許可 action */
  allowedActions: string;
  /** 3. 禁止 action */
  forbiddenActions: string;
  /** 4. 発話トーン */
  toneCategory: string;
  /** 5. 昇格／降格 */
  promotion: string;
  /** 6. UI 密度 */
  density: Density;
  /** Daily / Travel における override / 追加注記 (override 列のみ使用) */
  overrideNote?: string;
}

export interface MatrixCell {
  state: StateKey;
  mode: ModeKey;
  /** 通常モードからの差分。null = 完全同値（= 通常） */
  cell: CellAttrs;
}

const STATE_TITLES: Record<StateKey, string> = {
  S0: "S0 — 見守り中（Dormant）",
  S1: "S1 — 介入気配（Notice）",
  S2: "S2 — 入口発話（Entry）【状態優先の代表点】",
  S3: "S3 — 返答待ち（Waiting）",
  S4: "S4 — 理解更新中（Updating）",
  S5: "S5 — 橋渡し中（Bridging）【通常モード本番・状態優先の代表点】",
  S6: "S6 — 提案可能（Proposal Ready）",
  S7: "S7 — 提案表示（Proposal）",
  S8: "S8 — クールダウン（Retreat）",
};

/**
 * 27 セルの mock data。UI spec §4.3 から要約抜粋。
 * Daily / Travel は通常モードと差分がある場合のみ overrideNote を入れる。
 */
const NORMAL: Record<StateKey, CellAttrs> = {
  S0: {
    display: "常設要素のみ（シンボル／ステータス／モード切替／入力導線）",
    allowedActions: "モード切替 tap のみ",
    forbiddenActions: "発話、チップ受付、緊急介入視覚層の発動",
    toneCategory: "N/A（発話なし）",
    promotion: "→ S1（signal 検出時）",
    density: "single-line",
  },
  S1: {
    display: "常設 + 小さな status chip（「少し整理できそう」等、1 個）",
    allowedActions: "status chip tap（入口承認）、モード切替 tap",
    forbiddenActions: "発話、連投、複数 status chip 同時表示",
    toneCategory: "calm（chip 文言のトーン）",
    promotion: "→ S2（consent 成立）／→ S8（無反応撤退）",
    density: "compact-card",
  },
  S2: {
    display: "常設 + 発話本文カード（compact）+ 応答チップ（最大 2）",
    allowedActions: "応答チップ tap、閉じる導線 tap、モード切替 tap",
    forbiddenActions: "提案発話（S7 まで禁止）、連投、A 以外の混在",
    toneCategory: "calm（通常）／urgent（状態優先切替時）",
    promotion: "→ S3 / → S8（閉じる）／状態優先切替時 urgent 継続",
    density: "compact-card",
  },
  S3: {
    display: "常設 + 発話本文カード（S2 残像、薄表示）+ 応答チップ（継続）",
    allowedActions: "応答チップ tap → S4、閉じる導線 tap、モード切替 tap",
    forbiddenActions: "新規発話、別パターン呼び出し、新規 chip 追加",
    toneCategory: "neutral（発話なし）",
    promotion: "→ S4（応答取得時、片方だけ可）／→ S8（明示退出）",
    density: "compact-card",
  },
  S4: {
    display: "常設（ステータス=「理解更新中」）+ 発話本文カード薄（ほぼ消える）",
    allowedActions: "モード切替 tap のみ",
    forbiddenActions: "発話、チップ受付、緊急介入視覚層の発動（派手さ抑制）",
    toneCategory: "N/A（発話なし）",
    promotion: "→ S5（更新完了時）",
    density: "single-line",
  },
  S5: {
    display:
      "常設 + 発話本文カード（expanded）+ 応答チップ（最大 3）+ 片側フォーカス導線（D 時）+ 閉じる導線",
    allowedActions:
      "応答チップ tap、片側フォーカス tap（D）、閉じる導線 tap、モード切替 tap",
    forbiddenActions: "2 パターン同時発話、提案（S7 まで）、連投",
    toneCategory: "calm（通常）／urgent（状態優先切替時）",
    promotion: "→ S6（整理完了）／→ S8（閉じる）／状態優先切替時 自動昇格可",
    density: "expanded-card",
  },
  S6: {
    display:
      "常設 + 発話本文カード（S5 残像、薄表示）+ 提案導線 3 ボタン（聞く／整理／ここまで）",
    allowedActions: "提案導線 tap（3 択）、モード切替 tap",
    forbiddenActions: "発話、新規応答チップ追加、提案導線以外の chip 追加",
    toneCategory: "neutral（発話なし、導線ラベルのみ）",
    promotion: "→ S7（聞く）／→ S5（整理）／→ S8（ここまで）",
    density: "compact-card",
  },
  S7: {
    display: "常設 + 発話本文カード（expanded、提案 1 件）+ 承認チップ 1 個 + 閉じる導線",
    allowedActions: "承認 tap、閉じる導線 tap、「チャットに共有」tap（明示 handoff）",
    forbiddenActions: "複数提案同時表示（F-1/F-2 同時禁止）、追加発話、新規 chip",
    toneCategory: "neutral（提案本文のトーン）",
    promotion: "→ S8（承認/不承認どちらも退出）",
    density: "expanded-card",
  },
  S8: {
    display: "常設のみ（退出メッセージ 1 行表示後、single-line へ）",
    allowedActions: "モード切替 tap、新規セッション待機",
    forbiddenActions: "発話（退出メッセージ以外）、新規チップ、即時 S0 → S1 再起動（5 分禁止）",
    toneCategory: "retreat",
    promotion: "→ S0（5 分後自動）",
    density: "single-line",
  },
};

/**
 * Daily / Travel の override / 追加注記。
 * 該当 state で差分がある場合のみ entry を持つ。entry 不在 = 通常モード同値。
 */
const OVERRIDES: {
  [K in StateKey]?: {
    daily?: { overrideNote: string };
    travel?: { overrideNote: string };
  };
} = {
  S2: {
    daily: {
      overrideNote:
        "+ 追加: Daily スコープ告知（「今日の話で入るよ」等、カード冒頭）",
    },
    travel: {
      overrideNote:
        "+ 追加: Travel スコープ告知（「旅行の話で入るよ」等、カード冒頭）",
    },
  },
  S5: {
    daily: {
      overrideNote:
        "+ 追加: Daily 文脈ヒント（「今日のスケジュール見ながら」等の導線ラベル）",
    },
    travel: {
      overrideNote:
        "+ 追加: Travel 文脈ヒント（「複数日で考えると」等）／→ override: 片側フォーカス導線の既定優先度を下げる（計画一貫性を前面化）。関係シグナル（温度差/認識差/片側引っかかり）が明確な時は再許可・前面化",
    },
  },
  S7: {
    daily: {
      overrideNote:
        "→ override: F-2（プラン寄り）を主とする。F-1 は関係ノイズ低時抑制可、高時は補助表示（1 行）",
    },
    travel: {
      overrideNote:
        "→ override: F-2（複数日プラン Brief 形式）を主。F-1 は完全抑制せず副次同伴（補助ヒント/補助 chip/1 行配慮）。承認ゲート厳しめ",
    },
  },
};

/**
 * 27 セル全体を flat 配列で取得する（preview 表 component 用）。
 */
export function getMatrix(): MatrixCell[] {
  const states: StateKey[] = [
    "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
  ];
  const modes: ModeKey[] = ["normal", "daily", "travel"];
  const out: MatrixCell[] = [];
  for (const s of states) {
    for (const m of modes) {
      const base = NORMAL[s];
      if (m === "normal") {
        out.push({ state: s, mode: m, cell: base });
      } else {
        const override = OVERRIDES[s]?.[m];
        out.push({
          state: s,
          mode: m,
          cell: override
            ? { ...base, overrideNote: override.overrideNote }
            : base,
        });
      }
    }
  }
  return out;
}

export function getStateTitle(s: StateKey): string {
  return STATE_TITLES[s];
}

/**
 * UI spec §4.4 状態優先切替の例外 (S2 / S5 のみ発動)。
 */
export const STATE_PRIORITY_EXCEPTION = {
  applicableStates: ["S2", "S5"] as const,
  notes: [
    "強いすれ違い / 攻撃性 / 感情ヒートアップで発動",
    "発話トーン: calm → urgent",
    "UI 密度: 強制 expanded-card",
    "アニメ: pulse 1 回（注意喚起）",
    "chip 数: 最優先の 1-2 個に削減",
    "告知: 事前告知なし可、ただし視覚変化（pulse / トーン / 密度）必須",
    "S5 のみ: 状態優先切替時に通常 → Daily/Travel への自動昇格が起こり得る",
    "閾値以下なら通常通りモード優先で振る舞う（『必ず urgent / 必ず昇格』ではない）",
  ],
};
