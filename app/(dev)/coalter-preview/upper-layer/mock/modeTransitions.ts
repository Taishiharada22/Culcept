/**
 * モード切替 / 昇格 / 降格 / 拒否の状態遷移 mock (L1-g)
 *
 * 正本: UI spec §6 全体 (モード切替と昇格／降格 UI)
 *       §6.2 切替 3 形態 / §6.6 拒否 3 分類 / §6.7 再介入条件サマリ
 *       Core UX v1.1 §2.3 通常モード本体性 / §11.1 裁判官にならない
 *
 * 本 mock は preview 用。実機 logic は Stage 2 modeReducer (L2-h) で実装。
 *
 * §6.8 非判定性 (UI 禁止):
 *   - 警告色 (赤・オレンジ) 禁止
 *   - 叱責的アイコン (⚠️ / ❌ / 😟 / 🚫) 禁止
 *   - 拒否カウンタ累積表示禁止
 *   - 「また」系再接触演出禁止
 *   - cooldown カウントダウン禁止
 */

// ─────────────────────────────────────────────
// §6.2 モード切替 3 形態
// ─────────────────────────────────────────────

export type ModeKind = "normal" | "daily" | "travel";

export interface ModeTransitionForm {
  /** 切替形態 (§6.2) */
  kind: "manual" | "auto_escalation" | "natural_exit";
  /** 表示ラベル */
  label: string;
  /** 発生元 */
  origin: "user_tap" | "internal_judgment" | "plan_complete";
  /** 発動タイミング */
  trigger: string;
  /** 承認 (§6.2 表) */
  needsApproval: boolean;
}

export const MODE_TRANSITION_FORMS: ReadonlyArray<ModeTransitionForm> = [
  {
    kind: "manual",
    label: "手動切替",
    origin: "user_tap",
    trigger: "モード切替 chip tap",
    needsApproval: false,
  },
  {
    kind: "auto_escalation",
    label: "自動昇格",
    origin: "internal_judgment",
    trigger: "S5 状態優先切替 + 長期構造化必要判定",
    needsApproval: true, // §6.6.1 拒否可
  },
  {
    kind: "natural_exit",
    label: "自然退出",
    origin: "plan_complete",
    trigger: "Daily 1 日プラン / Travel Plan Brief 出力完了",
    needsApproval: false,
  },
];

// ─────────────────────────────────────────────
// §6.6 拒否 3 分類
// ─────────────────────────────────────────────

export type RejectionKind =
  | "mode_escalation"     // §6.6.1 モード昇格の拒否
  | "individual_proposal" // §6.6.2 個別提案の拒否
  | "intervention_retreat"; // §6.6.3 介入そのものの後退要求

export interface RejectionFlowMock {
  kind: RejectionKind;
  title: string;
  /** §6.6.1-3 の発動条件 */
  trigger: string;
  /** UI 表現 */
  uiHint: string;
  /** 介入感度への影響 */
  sensitivityImpact: string;
  /** §6.7 再介入条件 */
  cooldown: {
    sameSession: string;
    nextSession: string;
    explicitCall: string;
  };
}

export const REJECTION_FLOWS: ReadonlyArray<RejectionFlowMock> = [
  {
    kind: "mode_escalation",
    title: "モード昇格の拒否",
    trigger: "自動昇格直後にユーザーが元モードに戻す (§6.6.1)",
    uiHint: "モード切替 chip で元モード tap または『通常に戻す』補助 chip",
    sensitivityImpact: "自動昇格閾値ロジックを厳格化方向に調整 (将来の学習)",
    cooldown: {
      sameSession: "自動昇格再試行禁止 (当該セッション終了まで)",
      nextSession: "通常通り閾値判定で判断",
      explicitCall: "モード切替 tap は常時可",
    },
  },
  {
    kind: "individual_proposal",
    title: "個別提案の拒否",
    trigger: "S7 で承認せず閉じる導線 tap or 時間経過で S8 退出 (§6.6.2)",
    uiHint: "S7 の閉じる導線 tap、または承認なしの S8 遷移",
    sensitivityImpact: "提案を共有メモリに『提示済・未採択』として記録、同内容を短期再提示しない",
    cooldown: {
      sameSession: "同内容は抑制、別 signal trigger は可",
      nextSession: "通常通り",
      explicitCall: "可",
    },
  },
  {
    kind: "intervention_retreat",
    title: "介入そのものの後退要求",
    trigger:
      "ユーザーの明示的な後退要求 (例: 『今日は声をかけないで』『しばらく見ていて』、§6.6.3)",
    uiHint:
      "CoAlter が即座に S8 退出、retreat トーンで明示、cooldown 期間中は single-line 維持",
    sensitivityImpact:
      "最も大きい。永続的に記録 (共有メモリ surface)、signal 検出閾値を厳格化",
    cooldown: {
      sameSession: "S0 → S1 自動遷移を完全停止 (指定期間)",
      nextSession: "指定期間経過後、通常の signal 検出フローに復帰",
      explicitCall: "期間中も可 (モード切替 tap / @coalter 相当)",
    },
  },
];

// ─────────────────────────────────────────────
// §6.5 通常モード復帰 2 経路
// ─────────────────────────────────────────────

export interface ReturnPath {
  kind: "natural" | "manual";
  label: string;
  trigger: string;
  contextInheritance: string;
}

export const RETURN_PATHS: ReadonlyArray<ReturnPath> = [
  {
    kind: "natural",
    label: "自然退出 (自動)",
    trigger: "Daily 1 日プラン / Travel Plan Brief 出力完了 (§6.5.1)",
    contextInheritance: "プラン結果が共有メモリ surface に格納 (v1.1 §10.3)",
  },
  {
    kind: "manual",
    label: "手動復帰 (ユーザー操作)",
    trigger: "モード切替 chip で [通常] tap (§6.5.2)",
    contextInheritance: "未完成プランは共有メモリ surface に中間状態として格納",
  },
];
