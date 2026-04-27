/**
 * 緊急介入 critical signal 投入 mock (L1-i)
 *
 * 正本: UI spec §8.5 緊急介入視覚層 / §8.6 memory surface と urgent layer の優先順位
 *       runtime contract §1.5 critical signal
 *       Core UX v1.1 §8.4 (強いすれ違い / 攻撃性 / 感情ヒートアップ)
 *
 * 本 mock は preview 用 critical signal の発火 trigger 集合。
 * 実機 logic (signal 検出、閾値判定) は Stage 2 / 3 で実装。
 *
 * §8.5.5 §6.8 非判定性継承: 警告色 / 叱責アイコン / カウンタ / カウントダウン
 * いずれも UI 上で表示しない。
 */

export type UrgentForm = "overlay_banner" | "dominant_card" | "inline_cue";

export type CriticalCategory =
  | "rupture_detected"        // 関係の rupture 検出 (HDM Wall 4 系シグナル)
  | "dignity_violation"       // 尊厳抵触 (相互の人格・存在を損なう発話)
  | "safety_concern"          // 安全に関わる急変
  | "heat_escalation"         // 感情ヒートアップ (v1.1 §8.4)
  | "asymmetric_overload";    // 片側の過負荷 (主導権偏り、疲労蓄積)

export interface UrgentScenario {
  id: string;
  category: CriticalCategory;
  /** 発火 trigger の説明 (mock) */
  trigger: string;
  /** 視覚形態 (§8.5.2) */
  form: UrgentForm;
  /** 解除条件 (§8.5.4) */
  releaseHints: ReadonlyArray<
    "intervention_complete" | "user_dismiss" | "timeout" | "upper_priority_swap"
  >;
  /** 発話要旨 (本文はテンプレ doc、ここでは型のみ表現) */
  messageSummary: string;
  /** §8.6 memory surface の後退モード (demote / compact) */
  memoryFallback: "demote" | "compact";
}

export const CATEGORY_LABELS: Record<CriticalCategory, string> = {
  rupture_detected: "関係 rupture 検出",
  dignity_violation: "尊厳抵触",
  safety_concern: "安全に関わる急変",
  heat_escalation: "感情ヒートアップ",
  asymmetric_overload: "片側過負荷",
};

export const URGENT_SCENARIOS: ReadonlyArray<UrgentScenario> = [
  {
    id: "u01",
    category: "heat_escalation",
    trigger: "S5 中に強い反論連投 + 短文化 + 否定語密度上昇",
    form: "overlay_banner",
    releaseHints: ["intervention_complete", "user_dismiss"],
    messageSummary: "いったんペース落としていい？",
    memoryFallback: "demote",
  },
  {
    id: "u02",
    category: "rupture_detected",
    trigger: "片側の沈黙 + 撤退語彙 + 物理的退出ヒント",
    form: "dominant_card",
    releaseHints: ["intervention_complete", "timeout"],
    messageSummary: "ここで一度区切るね",
    memoryFallback: "compact",
  },
  {
    id: "u03",
    category: "dignity_violation",
    trigger: "存在否定・人格攻撃の語彙検出",
    form: "dominant_card",
    releaseHints: ["intervention_complete", "user_dismiss"],
    messageSummary: "ここは線が見える、間に入るね",
    memoryFallback: "compact",
  },
  {
    id: "u04",
    category: "asymmetric_overload",
    trigger: "片側の発話量・主導権が長期で 80% を超過",
    form: "inline_cue",
    releaseHints: ["intervention_complete", "timeout"],
    messageSummary: "(枠線の彩度のみ、まだ切替前)",
    memoryFallback: "demote",
  },
  {
    id: "u05",
    category: "safety_concern",
    trigger: "外部安全に関わる急変ヒント (mock)",
    form: "overlay_banner",
    releaseHints: ["intervention_complete", "upper_priority_swap"],
    messageSummary: "少し落ち着いてから話そう",
    memoryFallback: "compact",
  },
];

/**
 * §8.6.3 同時出現禁止組み合わせ
 */
export const URGENT_FORBIDDEN_COMBINATIONS: ReadonlyArray<{
  combination: string;
  reason: string;
}> = [
  {
    combination: "memory drawer 展開中 + urgent dominant card 発火",
    reason: "2 つの大型 UI 衝突 → drawer を先に縮退させてから urgent を出す",
  },
  {
    combination: "urgent 中 + memory batch 更新キュー表示",
    reason: "注意分散 → batch 更新は urgent 解除後に繰越",
  },
  {
    combination: "複数 urgent layer 重ね表示",
    reason: "§8.5.4 上位優先切替で置換、重ねない",
  },
  {
    combination: "urgent dominant card 内に memory inline reference 埋め込み",
    reason: "情報密度過多、urgent の主役性が薄れる",
  },
  {
    combination: "urgent + S7 提案カード同居",
    reason: "提案と緊急介入は意味的に競合 (plan §4.9 制約)",
  },
];
