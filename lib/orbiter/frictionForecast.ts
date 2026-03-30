// ============================================================
// Orbiter Feature 2: Friction Forecast
// すれ違い予報 — 個人の破綻トリガーを学習し、パーソナライズされた予報を提供
//
// 32シナリオテンプレート: 8 CautionCode × 4 Category
// breakpointTriggers でパーソナライズ → severity / advice を上書き
// ============================================================

import type { CautionCode, RendezvousCategory } from "@/lib/rendezvous/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type {
  BreakpointTrigger,
  FrictionForecastItem,
  FrictionForecast,
  FrictionSeverity,
} from "./types";
import type { PositiveFrictionItem } from "@/lib/relational/types";

// ── Scenario Templates ──

interface ScenarioTemplate {
  cautionCode: CautionCode;
  category: RendezvousCategory;
  scenario: string;
  defaultSeverity: FrictionSeverity;
  defaultAdvice: string;
  personalizedAdvice: string; // breakpoint trigger 存在時に差し替え
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  // ── silence_interpretation_gap ──
  {
    cautionCode: "silence_interpretation_gap",
    category: "romantic",
    scenario: "デートで会話が途切れた時、沈黙を不満と受け取られやすい場面が出る",
    defaultSeverity: "medium",
    defaultAdvice: "沈黙が心地よいかどうかを、早い段階でさりげなく確認してみて",
    personalizedAdvice: "あなたは沈黙に敏感な傾向がある。相手の沈黙は考え事かもしれない",
  },
  {
    cautionCode: "silence_interpretation_gap",
    category: "friendship",
    scenario: "LINEの返信が遅い時、既読スルーと感じるか、忙しいだけと感じるかにズレが出やすい",
    defaultSeverity: "low",
    defaultAdvice: "返信頻度の期待値を合わせておくと楽になる",
    personalizedAdvice: "あなたは返信速度でモヤモヤしやすい傾向がある。気になったら直接聞いてOK",
  },
  {
    cautionCode: "silence_interpretation_gap",
    category: "cocreation",
    scenario: "ミーティングでの沈黙が「同意」か「反対だけど言えない」かで解釈が分かれやすい",
    defaultSeverity: "medium",
    defaultAdvice: "発言のない時は「どう思う？」と確認する習慣をつけると安心",
    personalizedAdvice: "あなたは合意の確認を重視する傾向がある。こまめな確認は長所として活かせる",
  },
  {
    cautionCode: "silence_interpretation_gap",
    category: "community",
    scenario: "グループでの沈黙メンバーへの対応で温度差が出やすい",
    defaultSeverity: "low",
    defaultAdvice: "観察型の人もいることを前提に、発言を強制しない場づくりを",
    personalizedAdvice: "あなたは場の空気に敏感。全員が発言しなくても大丈夫な雰囲気づくりを意識して",
  },

  // ── decision_speed_gap ──
  {
    cautionCode: "decision_speed_gap",
    category: "romantic",
    scenario: "デートの場所や予定を決める時、片方がもどかしく感じる場面が出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "大まかな方向だけ先に決めて、詳細は後から調整するスタイルが合うかも",
    personalizedAdvice: "あなたは決断が速い傾向がある。相手のペースに合わせる余裕が信頼につながる",
  },
  {
    cautionCode: "decision_speed_gap",
    category: "friendship",
    scenario: "遊びの予定を決める時、即決派とじっくり派で温度差が出やすい",
    defaultSeverity: "low",
    defaultAdvice: "候補を2-3個に絞ってから提案すると、お互い楽になる",
    personalizedAdvice: "あなたは計画的に決めたい傾向がある。選択肢を用意して共有するのが効果的",
  },
  {
    cautionCode: "decision_speed_gap",
    category: "cocreation",
    scenario: "プロジェクトの方向性を決める時、スピード感の違いがフラストレーションになりやすい",
    defaultSeverity: "high",
    defaultAdvice: "「いつまでに決める」というデッドラインを先に合意しておく",
    personalizedAdvice: "あなたは意思決定の遅さにストレスを感じやすい。期限設定で構造化を",
  },
  {
    cautionCode: "decision_speed_gap",
    category: "community",
    scenario: "グループでの意思決定プロセスで、合意形成に時間がかかりすぎると感じる人が出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "重要度に応じて決定方法を変える（多数決 vs 全員合意）",
    personalizedAdvice: "あなたは効率的な進行を好む傾向がある。ファシリテーション役を引き受けると良い",
  },

  // ── depth_progression_gap ──
  {
    cautionCode: "depth_progression_gap",
    category: "romantic",
    scenario: "関係の深め方のペースにズレが出やすい。片方が「まだ早い」と感じる場面がある",
    defaultSeverity: "high",
    defaultAdvice: "段階を急がず、相手の反応を見ながら少しずつ深めていく",
    personalizedAdvice: "あなたは深い関係を求める傾向が強い。相手の準備を待つ忍耐が鍵になる",
  },
  {
    cautionCode: "depth_progression_gap",
    category: "friendship",
    scenario: "どこまで本音を話すかの線引きが違い、一方が踏み込みすぎと感じることがある",
    defaultSeverity: "medium",
    defaultAdvice: "自分が先にオープンになり、相手がついてくるかを観察する",
    personalizedAdvice: "あなたは深い対話を自然に求める。相手によってはゆっくり段階を踏む方が合う",
  },
  {
    cautionCode: "depth_progression_gap",
    category: "cocreation",
    scenario: "仕事の関係を超えた深い対話を求める度合いにズレが出やすい",
    defaultSeverity: "low",
    defaultAdvice: "仕事の成果で信頼を積み、関係の深まりは自然に任せる",
    personalizedAdvice: "あなたは仕事仲間とも深い関係を求める。まずは実績ベースの信頼構築から",
  },
  {
    cautionCode: "depth_progression_gap",
    category: "community",
    scenario: "コミュニティ内での親密度の期待にズレがあり、距離感が合わないと感じる人が出やすい",
    defaultSeverity: "low",
    defaultAdvice: "全員と同じ深さの関係を求めず、自然に合う人との関係を育てる",
    personalizedAdvice: "あなたは少数の深い関係を好む。コミュニティ内でキーパーソンを見つけよう",
  },

  // ── distance_need_gap ──
  {
    cautionCode: "distance_need_gap",
    category: "romantic",
    scenario: "ひとりの時間の必要量が違い、片方が「冷たい」と感じやすい",
    defaultSeverity: "high",
    defaultAdvice: "「会わない時間」は相手への無関心ではなく、充電だと伝えてみて",
    personalizedAdvice: "あなたはひとりの時間が必要なタイプ。それを最初に共有すると誤解が減る",
  },
  {
    cautionCode: "distance_need_gap",
    category: "friendship",
    scenario: "連絡頻度や会う頻度の期待にズレが出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "「月1で会えたら嬉しい」など、期待値を先に共有するとスムーズ",
    personalizedAdvice: "あなたは自分のペースを大切にする傾向がある。それを友人に伝えると楽になる",
  },
  {
    cautionCode: "distance_need_gap",
    category: "cocreation",
    scenario: "作業の進捗共有頻度にズレが出やすい。報告不足 vs 干渉しすぎの境界線が異なる",
    defaultSeverity: "medium",
    defaultAdvice: "定期チェックインのリズムを最初に決めておく",
    personalizedAdvice: "あなたは自律的に動きたいタイプ。進捗報告のルーチンを仕組み化すると安心",
  },
  {
    cautionCode: "distance_need_gap",
    category: "community",
    scenario: "活動への参加頻度の期待にズレが出やすい",
    defaultSeverity: "low",
    defaultAdvice: "参加は義務ではなく、心地よいペースを尊重する文化をつくる",
    personalizedAdvice: "あなたは選択的に参加したい傾向がある。コアメンバーとの個別関係を大切に",
  },

  // ── initiative_gap ──
  {
    cautionCode: "initiative_gap",
    category: "romantic",
    scenario: "デートの誘いや連絡がいつも片方からになり、不公平感が出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "「次はそっちが誘ってね」と軽くバランスを提案してみて",
    personalizedAdvice: "あなたは受動的になりやすい傾向がある。たまにはこちらから誘ってみると新鮮",
  },
  {
    cautionCode: "initiative_gap",
    category: "friendship",
    scenario: "予定の提案がいつも同じ人からになり、モチベーションが下がりやすい",
    defaultSeverity: "low",
    defaultAdvice: "交代制で幹事をするルールにすると気楽になる",
    personalizedAdvice: "あなたは提案を待ちがちな傾向がある。自分から動くと関係が活性化する",
  },
  {
    cautionCode: "initiative_gap",
    category: "cocreation",
    scenario: "タスクの着手タイミングにズレが出やすい。先に動く人に負荷が集中しやすい",
    defaultSeverity: "high",
    defaultAdvice: "各タスクの開始・締切を明文化し、見える化する",
    personalizedAdvice: "あなたは率先して動くタイプ。相手にもスタートラインを共有して巻き込もう",
  },
  {
    cautionCode: "initiative_gap",
    category: "community",
    scenario: "イベント企画が一部のメンバーに集中し、燃え尽きリスクがある",
    defaultSeverity: "medium",
    defaultAdvice: "役割を明確に分担し、定期的にローテーションする",
    personalizedAdvice: "あなたは裏方に回りがちな傾向がある。声をかけてもらえると動きやすい",
  },

  // ── emotional_expression_gap ──
  {
    cautionCode: "emotional_expression_gap",
    category: "romantic",
    scenario: "感情の表現の仕方にズレがあり、「何を考えているかわからない」と感じやすい",
    defaultSeverity: "high",
    defaultAdvice: "感情を言葉にする練習として、小さなことから気持ちを伝えてみて",
    personalizedAdvice: "あなたは感情を内に溜める傾向がある。小さな「嬉しい」を声に出す習慣を",
  },
  {
    cautionCode: "emotional_expression_gap",
    category: "friendship",
    scenario: "嬉しい時・困った時の表現の差が、関係の深まりを阻むことがある",
    defaultSeverity: "medium",
    defaultAdvice: "リアクションが薄い人は無関心ではなく、表現が控えめなだけかも",
    personalizedAdvice: "あなたは表現が豊かなタイプ。相手が控えめでも、内心では同じ気持ちかも",
  },
  {
    cautionCode: "emotional_expression_gap",
    category: "cocreation",
    scenario: "成果への喜びやフラストレーションの表現に温度差が出やすい",
    defaultSeverity: "low",
    defaultAdvice: "感情ではなく事実ベースのフィードバックを心がけるとスムーズ",
    personalizedAdvice: "あなたは仕事にも感情を込めるタイプ。ロジカルなコミュニケーションも併用して",
  },
  {
    cautionCode: "emotional_expression_gap",
    category: "community",
    scenario: "イベントへの温度差が可視化され、ノリが合わないと感じる人が出やすい",
    defaultSeverity: "low",
    defaultAdvice: "テンションの違いは個性であり、無理に合わせなくて良い",
    personalizedAdvice: "あなたはマイペースに参加したいタイプ。盛り上がり方は人それぞれでOK",
  },

  // ── conflict_style_gap ──
  {
    cautionCode: "conflict_style_gap",
    category: "romantic",
    scenario: "意見が合わない時、話し合いたい vs 距離を置きたいで衝突しやすい",
    defaultSeverity: "high",
    defaultAdvice: "「一旦クールダウンしてから話そう」をルールにすると安全",
    personalizedAdvice: "あなたは対立を避けたい傾向がある。冷静な時に事前ルールを決めておこう",
  },
  {
    cautionCode: "conflict_style_gap",
    category: "friendship",
    scenario: "不満を直接言うか、距離を置くかのスタイル差が友情に影を落とすことがある",
    defaultSeverity: "medium",
    defaultAdvice: "大きくなる前に小さな不満を共有する習慣をつけると良い",
    personalizedAdvice: "あなたは本音を伝えるのが苦手な傾向がある。小さいうちに話すと楽になる",
  },
  {
    cautionCode: "conflict_style_gap",
    category: "cocreation",
    scenario: "プロジェクトの方向性で意見が割れた時、議論の進め方にズレが出やすい",
    defaultSeverity: "high",
    defaultAdvice: "意思決定プロセスを事前に合意しておく（データで判断/多数決/話し合い）",
    personalizedAdvice: "あなたはデータ重視の判断を好む傾向がある。感情面も含めた議論の場を設けよう",
  },
  {
    cautionCode: "conflict_style_gap",
    category: "community",
    scenario: "グループ内の意見対立への対処法にズレが出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "対立をネガティブに捉えず、建設的な議論の場として設計する",
    personalizedAdvice: "あなたは調整役になりやすい。第三者として冷静に場をまとめる力を活かそう",
  },

  // ── rhythm_gap ──
  {
    cautionCode: "rhythm_gap",
    category: "romantic",
    scenario: "朝型/夜型、アクティブ/まったりなど、生活リズムのズレがストレスになりやすい",
    defaultSeverity: "medium",
    defaultAdvice: "一緒に過ごす時間帯を互いのベストに合わせる工夫を",
    personalizedAdvice: "あなたは規則的なリズムを好む傾向がある。相手のリズムも尊重する余裕を持って",
  },
  {
    cautionCode: "rhythm_gap",
    category: "friendship",
    scenario: "返信のタイミングや会う頻度のリズムが合わず、ズレが気になりやすい",
    defaultSeverity: "low",
    defaultAdvice: "お互いのリズムを理解した上で、柔軟に対応できると楽",
    personalizedAdvice: "あなたは即レスタイプの傾向がある。相手のペースに合わせる余裕も大事",
  },
  {
    cautionCode: "rhythm_gap",
    category: "cocreation",
    scenario: "作業する時間帯や集中のリズムが違い、同期作業でフラストレーションが出やすい",
    defaultSeverity: "medium",
    defaultAdvice: "同期作業と非同期作業を明確に分け、各自のベストタイムを尊重する",
    personalizedAdvice: "あなたは集中タイムを大切にする傾向がある。作業ブロックを共有して調整しよう",
  },
  {
    cautionCode: "rhythm_gap",
    category: "community",
    scenario: "イベントの開催時間や活動頻度のリズムが合わないメンバーが出やすい",
    defaultSeverity: "low",
    defaultAdvice: "複数の時間帯でイベントを開催し、参加しやすい選択肢を増やす",
    personalizedAdvice: "あなたは決まったリズムで参加したい傾向がある。定期開催を提案してみよう",
  },
];

// ── Gap-based severity estimation (when no breakpoint trigger exists) ──

/**
 * 軸ベースのギャップからデフォルト severity を推定する。
 * breakpointTriggers がない場合のフォールバック。
 */
function estimateGapSeverity(
  selfAxisScores: Partial<Record<TraitAxisKey, number>>,
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>,
  cautionCode: CautionCode,
): FrictionSeverity {
  // cautionCode → 関連する軸のマッピング（45軸から正確にマッチ）
  const CAUTION_TO_AXES: Record<CautionCode, TraitAxisKey[]> = {
    silence_interpretation_gap: [
      "introvert_vs_extrovert" as TraitAxisKey,
      "direct_vs_diplomatic" as TraitAxisKey,
    ],
    decision_speed_gap: [
      "cautious_vs_bold" as TraitAxisKey,
      "plan_vs_spontaneous" as TraitAxisKey,
    ],
    depth_progression_gap: [
      "intimacy_pace" as TraitAxisKey,
      "emotional_regulation" as TraitAxisKey,
    ],
    distance_need_gap: [
      "introvert_vs_extrovert" as TraitAxisKey,
      "intimacy_pace" as TraitAxisKey,
    ],
    initiative_gap: [
      "cautious_vs_bold" as TraitAxisKey,
      "social_initiative" as TraitAxisKey,
    ],
    emotional_expression_gap: [
      "emotional_regulation" as TraitAxisKey,
      "emotional_variability" as TraitAxisKey,
    ],
    conflict_style_gap: [
      "direct_vs_diplomatic" as TraitAxisKey,
      "independence_vs_harmony" as TraitAxisKey,
    ],
    rhythm_gap: [
      "plan_vs_spontaneous" as TraitAxisKey,
      "change_embrace_vs_resist" as TraitAxisKey,
    ],
    anxious_avoidant_risk: [
      "intimacy_pace" as TraitAxisKey,
      "emotional_regulation" as TraitAxisKey,
    ],
    repair_style_gap: [
      "direct_vs_diplomatic" as TraitAxisKey,
      "emotional_regulation" as TraitAxisKey,
    ],
    autonomy_tension: [
      "independence_vs_harmony" as TraitAxisKey,
      "introvert_vs_extrovert" as TraitAxisKey,
    ],
  };

  const axes = CAUTION_TO_AXES[cautionCode] ?? [];
  let maxGap = 0;

  for (const axis of axes) {
    const self = selfAxisScores[axis];
    const other = counterpartAxisScores[axis];
    if (self !== undefined && other !== undefined) {
      maxGap = Math.max(maxGap, Math.abs(self - other));
    }
  }

  if (maxGap > 1.0) return "high";
  if (maxGap > 0.5) return "medium";
  return "low";
}

// ── Main Export ──

export function computeFrictionForecast(params: {
  positiveFriction: PositiveFrictionItem[];
  breakpointTriggers: BreakpointTrigger[];
  selfAxisScores: Partial<Record<TraitAxisKey, number>>;
  counterpartAxisScores: Partial<Record<TraitAxisKey, number>>;
  category: RendezvousCategory;
}): FrictionForecast {
  const {
    positiveFriction,
    breakpointTriggers,
    selfAxisScores,
    counterpartAxisScores,
    category,
  } = params;

  // Phase 1 の positiveFriction から関連 cautionCodes を抽出
  const activeCautionCodes = new Set(
    positiveFriction.map((pf) => pf.cautionCode),
  );

  // breakpoint triggers マップ
  const triggerMap = new Map(
    breakpointTriggers.map((t) => [t.cautionCode, t]),
  );

  // 該当カテゴリ + 該当 cautionCode のテンプレートをフィルタ
  const matchingTemplates = SCENARIO_TEMPLATES.filter(
    (t) => t.category === category && activeCautionCodes.has(t.cautionCode),
  );

  const items: FrictionForecastItem[] = matchingTemplates.map((template) => {
    const trigger = triggerMap.get(template.cautionCode);
    const isPersonalized = !!trigger && trigger.sampleCount >= 3;

    let severity: FrictionSeverity;
    let advice: string;

    if (isPersonalized) {
      // パーソナライズされた severity
      if (trigger.sensitivityScore > 0.6) severity = "high";
      else if (trigger.sensitivityScore > 0.3) severity = "medium";
      else severity = "low";
      advice = template.personalizedAdvice;
    } else {
      // ギャップベースの推定 or テンプレートデフォルト
      const gapSeverity = estimateGapSeverity(
        selfAxisScores,
        counterpartAxisScores,
        template.cautionCode,
      );
      // テンプレートデフォルトとギャップ推定の厳しい方を採用
      const severityOrder: FrictionSeverity[] = ["low", "medium", "high"];
      const templateIdx = severityOrder.indexOf(template.defaultSeverity);
      const gapIdx = severityOrder.indexOf(gapSeverity);
      severity = severityOrder[Math.max(templateIdx, gapIdx)];
      advice = template.defaultAdvice;
    }

    return {
      cautionCode: template.cautionCode,
      scenario: template.scenario,
      severity,
      personalSensitivity: trigger?.sensitivityScore ?? 0.5,
      advice,
      isPersonalized,
    };
  });

  // severity でソート (high → medium → low)
  const severityOrder: Record<FrictionSeverity, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  items.sort(
    (a, b) => severityOrder[b.severity] - severityOrder[a.severity],
  );

  // Overall risk
  const highCount = items.filter((i) => i.severity === "high").length;
  const mediumCount = items.filter((i) => i.severity === "medium").length;
  let overallRisk: FrictionSeverity = "low";
  if (highCount >= 2) overallRisk = "high";
  else if (highCount >= 1 || mediumCount >= 3) overallRisk = "medium";

  // Personalized count
  const personalizedCount = items.filter((i) => i.isPersonalized).length;

  // Narrative summary — パーソナライズ状況を反映
  let narrativeSummary: string;
  if (items.length === 0) {
    narrativeSummary = "現時点で目立つすれ違いリスクは少ない。自然体で関係を楽しめる";
  } else if (overallRisk === "high") {
    const firstHigh = items.find((i) => i.severity === "high");
    narrativeSummary = personalizedCount > 0
      ? `あなたの傾向から${highCount}件の要注意ポイントを特定。特に「${firstHigh?.scenario.slice(0, 15)}…」に注意`
      : `${highCount}件の注意ポイントがある。事前に意識しておくとスムーズに進めやすい`;
  } else if (overallRisk === "medium") {
    narrativeSummary = personalizedCount > 0
      ? "あなたの過去の傾向を反映した予報。意識すれば十分に対処できるレベル"
      : "いくつかのすれ違いポイントがあるが、お互いの理解で乗り越えられる";
  } else {
    narrativeSummary = "大きなすれ違いリスクは少なく、自然体で関係を育てられそう";
  }

  return {
    items,
    overallRisk,
    personalizedCount,
    narrativeSummary,
  };
}
