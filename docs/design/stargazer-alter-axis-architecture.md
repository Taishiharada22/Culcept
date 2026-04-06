# Stargazer → Alter 軸接続アーキテクチャ設計書

**ステータス**: CEO条件付きGO済み（v3: 承認条件3点反映完了版）
**起草日**: 2026-04-06
**改訂日**: 2026-04-06
**起草者**: Build Unit (AI)
**レビュー**: GPT外部レビュー 90/100 通過 → CEO 5点指摘反映(v2) → CEO条件付きGO+3点反映(v3)
**最終決裁**: CEO

---

## 1. 目的と非目的

### 目的

固定47軸 + Expansion 6軸 + 将来追加軸のすべてが、Alter推論・Home・ContextReel・WhyCard・contradiction・blind spot・hypothesis・prediction に確実に還元される構造を作る。

具体的に達成すること:
1. 53軸中10軸(19%)しかAlterに還元されていない現状を、Phase 1完了時に60%、Phase 3完了時に75%以上に引き上げる
2. 軸追加時の必須タッチポイントをaxisRegistry の1箇所に集約する（追加で questions.ts への質問追加、消費側ファイルへの手動ルール追加があり得るが、それらは任意）
3. LLMプロンプトに届く人格情報を、ラベル列挙8軸→派生事実5-8文に変換する
4. ゴースト軸の構造的検出と凍結を自動化する

### 非目的

- 軸数を大幅に増やすこと（53軸前後を維持）
- 既存の動作しているロジックを壊すこと
- 完全自動化で手動設計を排除すること
- Rendezvousのsafety判定ロジックを変更すること

---

## 2. 現状の問題（コードベース実証済み）

### 2-A. LLMに届く軸が8軸に制限されている

`lib/stargazer/alter.ts` line 1887-1890:
```typescript
const axisEntries = Object.entries(personality.axisScores)
  .filter(([, v]) => v !== undefined && v !== null)
  .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5))
  .slice(0, 8);
```

上位8軸のdeviation(0.5基準)のみをラベル+数値でLLMに渡している。残り39+軸はLLMに届かない。

### 2-B. 手動ハードコードが6箇所に散在

| 箇所 | ファイル | ルール数 | 参照軸数 |
|------|---------|---------|---------|
| CROSS_AXIS_RULES | contradictionDetector.ts:147 | 15ペア | 24軸 |
| AXIS_INSIGHT_RULES | alterInsightCardBuilder.ts:283 | 13ルール | 21軸 |
| AXIS_FALLBACK_TEXTS | alterInsightCardBuilder.ts | 6軸分 | 6軸 |
| buildTaggedFacts | alterHomeAdapter.ts | 個別if文 | 5-6軸 |
| ARCHETYPE_WEIGHTS | archetypeResolver.ts | 4層 | ~40軸 |
| STARGAZER_AXES | proactiveUnderstanding.ts | 15詳細/30+stub | 45軸 |

軸を1本追加すると、最大6箇所に手動で接続を書く必要がある。

### 2-C. ゴースト軸が19軸

- 質問0問: 12軸（CognitiveFit 6 + Expansion 6）
- 全消費レイヤー接続0: 7軸（boundary_respect, pressure_risk, escalation_risk, friend_mode_fit, exclusivity_pressure, long_term_shift_risk, fairness_sensitivity）

### 2-D. proactiveUnderstanding の30+軸がstub

probe_seeds と causal_affinity_prior が空のまま。仮説生成・盲点検出が動かない。

---

## 3. 全体構造

```
┌────────────────────────────────────────────────────────────┐
│                    Axis Registry                            │
│         lib/stargazer/axisRegistry.ts (NEW)                 │
│   全軸のメタデータ・テンプレ・domain・causalAffinityを集約     │
│   ルール本体は持たない（ポインタ+テンプレのみ）                │
└──────────────────────┬─────────────────────────────────────┘
                       │
         ┌─────────────┼──────────────────┐
         ▼             ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌────────────────────┐
│ 消費側ファイル  │ │ Derived Fact │ │ Axis Health Check  │
│ (既存維持)     │ │ Generator    │ │ (NEW)              │
│               │ │ (NEW)        │ │                    │
│ contradiction │ │ 全軸スコア    │ │ Layer 1: 構造監査   │
│ Detector.ts   │ │    ↓         │ │ Layer 2: runtime   │
│ insightCard   │ │ 派生事実     │ │   実効監査          │
│ Builder.ts    │ │ 5-8文        │ │                    │
│ proactive     │ │    ↓         │ │ capability profile │
│ Understanding │ │ LLM Prompt   │ │ (自動算出)          │
│ .ts           │ │              │ │                    │
└──────────────┘ └──────────────┘ └────────────────────┘
                       │
                       ▼
              ┌──────────────┐
              │ Analytics     │
              │ (既存拡張)    │
              │ derived_facts │
              │ → sourceAxes  │
              └──────────────┘
```

---

## 4. データ契約

### 4-A. AxisRegistryEntry

```typescript
// lib/stargazer/axisRegistry.ts

export type AxisDomain =
  | "judgment"      // 判断プロセス・意思決定
  | "relational"    // 対人関係・社会性
  | "boundary"      // 境界・安全性
  | "emotional"     // 感情・ストレス
  | "cognitive"     // 認知スタイル・思考
  | "energy"        // エネルギー・回復
  | "identity"      // アイデンティティ・自己認識
  | "aesthetic";    // 美的感覚・表現

export interface AxisRegistryEntry {
  /** 軸ID（TraitAxisKeyと一致） */
  id: TraitAxisKey;
  /** 日本語ラベル: 左極 */
  labelLeft: string;
  /** 日本語ラベル: 右極 */
  labelRight: string;
  /** 既存カテゴリ（traitAxes.tsと一致、後方互換） */
  category: AxisCategory;
  /** 軸ステータス: core=通常, expansion=拡張, frozen=凍結（統合・廃止） */
  tier: "core" | "expansion" | "frozen";
  /** 意味ドメイン（新規） */
  domain: AxisDomain;
  /** Expansion軸の場合の親軸 */
  parentAxes?: TraitAxisKey[];
  /** 心理学的検証キー */
  validationKey?: string;

  // ── frozen軸用フィールド（tier === "frozen" の場合のみ） ──

  /** 凍結軸の統合先axis_id。スコア参照時にこの軸に転送する */
  forwardTo?: TraitAxisKey;
  /** 凍結日（ISO 8601） */
  frozenAt?: string;
  /** 凍結理由（人間が読む用。非独立性の根拠等） */
  frozenReason?: string;

  // ── AUTO層テンプレート（tier !== "frozen" の軸で必須記入） ──

  /** スコアが左寄りの時のfallback洞察文 */
  fallbackInsightLeft: string;
  /** スコアが右寄りの時のfallback洞察文 */
  fallbackInsightRight: string;
  /** ContextReel自動テンプレート。{left}と{right}をスコアで置換 */
  contextReelTemplate: string;
  /** LLMに渡す時のこの軸の説明（日本語1文） */
  llmDescription: string;
  /** 因果的に関連する軸のリスト（最低2軸） */
  causalAffinity: TraitAxisKey[];

  // ── subScore構造（該当する軸のみ） ──
  subScores?: Record<string, {
    weight: number;
    externalLabel: string;
    weightBasis: "theory" | "data" | "hybrid";
    lastUpdated: string;
    updatePolicy: string;
  }>;
}

/**
 * frozen軸に対する型ガード。
 * frozen軸はforwardTo必須、AUTO層テンプレートは統合先を参照するため空文字許容。
 */
export function isFrozenAxis(entry: AxisRegistryEntry): entry is AxisRegistryEntry & {
  tier: "frozen";
  forwardTo: TraitAxisKey;
  frozenAt: string;
  frozenReason: string;
} {
  return entry.tier === "frozen" && entry.forwardTo !== undefined;
}
```

**ルール本体は持たない**。contradictionRules, insightRules等はそれぞれの既存ファイルに残す。Registryはメタデータとテンプレートの単一定義源。

### 4-B. DerivedFact（派生事実）

```typescript
// lib/stargazer/derivedFactGenerator.ts

export type DerivedFactType =
  | "contradiction"   // 矛盾事実: 2軸以上の対立パターン
  | "blindspot"       // 盲点事実: 本人が気づいていない傾向
  | "personality"     // 人格事実: ドメイン横断パターン
  | "context";        // 文脈事実: 質問domainに関連する軸パターン

export interface DerivedFact {
  /** LLMに渡す派生事実文（日本語） */
  text: string;
  /** 事実の種類 */
  sourceType: DerivedFactType;
  /** この事実を生成した軸群 */
  sourceAxes: TraitAxisKey[];
  /** 事実の確信度 (0-1) */
  confidence: number;
  /** どのルールから生成されたか（トレーサビリティ用） */
  generationRule: string;
}

export interface DerivedFactSet {
  /** 最終的にLLMに渡す派生事実群（5-8文） */
  facts: DerivedFact[];
  /** 寄与した軸の総数 */
  totalAxesUsed: number;
  /** 生成日時 */
  generatedAt: string;
  /** 生成に使った全軸スコアのスナップショット（デバッグ用） */
  inputScoresSnapshot: Partial<Record<TraitAxisKey, number>>;
}
```

### 4-C. AxisHealthReport

```typescript
// lib/stargazer/axisHealthCheck.ts

/** Layer 1: 構造監査（ビルド時/CI実行） */
export interface StructuralHealth {
  /** questions.tsでこの軸にマップされている質問数 */
  questionCount: number;
  /** CROSS_AXIS_RULESでこの軸を参照するルール数 */
  contradictionRuleCount: number;
  /** AXIS_INSIGHT_RULESでこの軸を参照するルール数 */
  insightRuleCount: number;
  /** AXIS_FALLBACK_TEXTSにエントリがあるか */
  hasFallbackText: boolean;
  /** axisRegistryにcausalAffinity 2軸以上があるか */
  hasCausalAffinity: boolean;
  /** axisRegistryにcontextReelTemplateがあるか */
  hasContextReelTemplate: boolean;
  /** 重み付き構造スコア */
  structuralScore: number;
}

/** Layer 2: runtime実効監査（月次、analyticsから集計） */
export interface RuntimeHealth {
  /** 集計期間 */
  periodStart: string;
  periodEnd: string;
  /** 集計に使えた対象ユーザー数 */
  eligibleUserCount: number;

  // 矛盾ルール実効性
  contradictionFireCount: number;
  contradictionFireRate: number;  // fireCount / eligibleUserCount

  // InsightCard実効性
  insightCardSelectedCount: number;
  insightCardDisplayRate: number; // selectedCount / 表示機会数

  // 派生事実寄与
  derivedFactContribution: number;    // sourceAxesに含まれた回数
  derivedFactAdoptionRate: number;    // 最終promptに採用された率

  // ユーザー反応
  positiveReactionRate: number;       // この軸寄与の応答へのpositive率
  sampleSize: number;                 // 反応データのN数

  /** 重み付きruntimeスコア */
  runtimeScore: number;
}

export interface AxisHealthReport {
  axisId: TraitAxisKey;
  domain: AxisDomain;
  tier: "core" | "expansion" | "frozen";
  structural: StructuralHealth | null;  // frozen軸はnull（構造監査対象外）
  runtime: RuntimeHealth | null;        // データ不足またはfrozen軸はnull
  /** 総合判定 */
  status: "healthy" | "weak" | "ghost" | "frozen";
  /** 判定根拠 */
  statusReason: string;
  /** frozen軸の場合の転送先 */
  forwardTo?: TraitAxisKey;
  /** frozen軸の場合の凍結日 */
  frozenAt?: string;
}
```

### 4-D. Analytics拡張: derived_factsフィールド

既存の `stargazer_analytics` event=`home_alter_judgment` のmetadata JSONBに以下を追加:

```typescript
// 既存metadata構造に追加するフィールド
metadata: {
  ...existingFields,

  /** 派生事実トレーサビリティ（v3で追加） */
  derived_facts?: Array<{
    sourceType: DerivedFactType;
    sourceAxes: TraitAxisKey[];
    confidence: number;
    generationRule: string;
    /** この事実が最終promptに含まれたか */
    includedInPrompt: boolean;
  }>;

  /** 派生事実生成サマリー */
  derived_facts_summary?: {
    totalGenerated: number;
    totalIncluded: number;
    uniqueAxesUsed: number;
  };
}
```

**全経路での契約保証**: derived_factsは以下の全パスで記録する:
- `alter/route.ts` の home_alter_judgment イベント内
- `alter/home-insights/route.ts` の home_insight_displayed イベント内（InsightCardのsource追跡用）

DB変更不要（既存JSONB列への追加フィールドのみ）。

---

## 5. 判定式

### 5-A. 構造スコア（StructuralScore）

```
StructuralScore =
    min(questionCount, 3) * W_question        // 質問: 重み3, 上限3問で満点
  + min(contradictionRuleCount, 2) * W_contra  // 矛盾: 重み2, 上限2ルールで満点
  + min(insightRuleCount, 2) * W_insight       // Insight: 重み2, 上限2ルールで満点
  + (hasFallbackText ? 1 : 0) * W_fallback     // Fallback: 重み1
  + (hasCausalAffinity ? 1 : 0) * W_causal     // CausalAffinity: 重み1
  + (hasContextReelTemplate ? 1 : 0) * W_ctx   // ContextReel: 重み1

where:
  W_question = 3
  W_contra   = 2
  W_insight  = 2
  W_fallback = 1
  W_causal   = 1
  W_ctx      = 1

最大値 = 3*3 + 2*2 + 2*2 + 1 + 1 + 1 = 20
```

**domain別最低要件**:

**判定式**: `structuralScore >= 閾値` **かつ** `全必須項目充足` の両方が必要。どちらか一方でも欠ければ healthy にしない。

| ドメイン | 最低StructuralScore | 必須項目（全て満たすこと） |
|---------|-------------------|---------|
| judgment | 12 | questionCount >= 3, contradictionRuleCount >= 1 |
| relational | 10 | questionCount >= 2, insightRuleCount >= 1 |
| boundary | 8 | questionCount >= 2, hasCausalAffinity = true |
| emotional | 12 | questionCount >= 3, contradictionRuleCount >= 1, insightRuleCount >= 1 |
| cognitive | 10 | questionCount >= 3, insightRuleCount >= 1 |
| energy | 8 | questionCount >= 2, hasContextReelTemplate = true |
| identity | 10 | questionCount >= 2, contradictionRuleCount >= 1 |
| aesthetic | 8 | questionCount >= 2, hasContextReelTemplate = true |

> **再点検（2026-04-06 CEO条件①に基づき実施）**
>
> 最小通過シナリオを全domainで検算した結果:
>
> | ドメイン | 必須項目だけの最低スコア | 閾値通過に追加で必要なもの |
> |---------|---------------------|-------------------------|
> | judgment | 3q(9)+1contra(2)=11 | **不足1pt**: fallback/causal/ctx のいずれか1つ必須 |
> | relational | 2q(6)+1insight(2)=8 | **不足2pt**: 3問目 or 矛盾ルール1本が事実上必須 |
> | boundary | 2q(6)+causal(1)=7 | **不足1pt**: 矛盾/insightルール or fallback が必須 |
> | emotional | 3q(9)+1contra(2)+1insight(2)=13 | 余裕あり。最も厳しい基準で適切 |
> | cognitive | 3q(9)+1insight(2)=11 | 余裕あり |
> | energy | 2q(6)+ctx(1)=7 | **不足1pt**: ルールか他テンプレが必須 |
> | identity | 2q(6)+1contra(2)=8 | **不足2pt**: 3問目 or insightルールが事実上必須 |
> | aesthetic | 2q(6)+ctx(1)=7 | **不足1pt**: ルールか他テンプレが必須 |
>
> **結論**: 全domainで「必須項目だけでは閾値に届かない」設計になっている。
> healthy には必須項目 + 追加の構造接続（ルール or テンプレート）が常に必要。
> 質問のみ3問(9pt)で通過できるdomainは存在しない（最低閾値8のdomain でも必須項目の AND条件が防壁として機能）。
> **判定: 甘すぎない。現行値で適切。**

### 5-B. RuntimeScore（絶対閾値ベース）

各入力値は相対ランキングではなく、**絶対閾値**で0-1に変換する。これにより、全軸のcontributionが一律に低い場合でも相対的に「良い」と誤判定されることを防ぐ。

```
RuntimeScore =
    normalize_df(derivedFactContribution) * W_df_contrib   // 派生事実寄与: 重み3
  + normalize_fire(contradictionFireRate) * W_fire         // 矛盾発火率: 重み2
  + normalize_display(insightCardDisplayRate) * W_display   // InsightCard表示率: 重み2
  + positiveReactionRate * W_reaction                      // ユーザー正反応率: 重み3

where:
  W_df_contrib = 3
  W_fire       = 2
  W_display    = 2
  W_reaction   = 3

最大値 = 3 + 2 + 2 + 3 = 10
```

**正規化関数（絶対閾値方式）**:

```typescript
// 派生事実寄与: sourceAxesに含まれた月次回数を絶対基準で正規化
function normalize_df(contribution: number, tier: AxisTier, domain: AxisDomain): number {
  const threshold = DF_THRESHOLDS[tier][domain];
  // threshold.full = 1.0到達の基準回数, threshold.min = 0を超える最低回数
  if (contribution < threshold.min) return 0;
  return Math.min(1.0, contribution / threshold.full);
}

// 矛盾発火率: eligibleUserCount中の発火率を絶対基準で正規化
function normalize_fire(fireRate: number): number {
  // 矛盾は本来「たまに発火する」もの。0.05(5%)で満点
  return Math.min(1.0, fireRate / 0.05);
}

// InsightCard表示率: 表示機会中の選出率を絶対基準で正規化
function normalize_display(displayRate: number): number {
  // InsightCardは3枠中1枠に入る競争。0.10(10%)で満点
  return Math.min(1.0, displayRate / 0.10);
}
```

**domain別 × tier別の派生事実寄与閾値（DF_THRESHOLDS）**:

| domain | core: full / min | expansion: full / min |
|--------|------------------|-----------------------|
| judgment | 50回/月 / 5回 | 30回/月 / 3回 |
| relational | 40回/月 / 4回 | 25回/月 / 3回 |
| boundary | 30回/月 / 3回 | 20回/月 / 2回 |
| emotional | 50回/月 / 5回 | 30回/月 / 3回 |
| cognitive | 30回/月 / 3回 | 20回/月 / 2回 |
| energy | 25回/月 / 3回 | 15回/月 / 2回 |
| identity | 30回/月 / 3回 | 20回/月 / 2回 |
| aesthetic | 20回/月 / 2回 | 15回/月 / 2回 |

閾値の根拠: judgmentとemotionalは質問domainとの紐付き頻度が高く、LLMが参照する頻度も高い。aestheticとenergyは特定コンテキストでのみ寄与するため基準を低く設定。expansion軸はcore比60-75%の基準（bayesianAxisUpdaterのEXPANSION_CONFIDENCE_CAP=0.45との整合）。

> **⚠️ 全Runtime閾値は「初期仮説値」であり、固定真理ではない**
>
> 本セクションの全数値 — DF_THRESHOLDS の full/min、normalize_fire の 0.05、
> normalize_display の 0.10、§5-C runtimeScore healthy基準 3.0 — は、
> **実データが一切存在しない状態での理論的仮設定**である。
>
> これらの値は以下の性質を持つ:
> - 実運用で「正しかった」と証明されるまでは仮説のまま扱う
> - 初期値をそのまま恒久運用することは**明示的に禁止**する
> - Phase 3 のruntime監査開始後、最初の30日分データで全閾値を再校正する（**必須**）
> - 再校正の結果、閾値が大幅に変わる可能性がある（例: 0.05 → 0.02 等）
>
> 実装時は全閾値を定数ファイルに集約し、コード内にマジックナンバーとして散在させない。

**閾値更新方針**:

| タイミング | 実施内容 | 承認 |
|-----------|---------|------|
| Phase 3 開始30日後 | 全閾値の初回キャリブレーション（実データ分布ベース） | CEO承認必須 |
| 以後半年ごと | runtimeScore中央値が0.4-0.6に収まるよう再校正 | CEO承認不要、decision-log記録 |
| 異常検知時 | 中央値が0.2未満 or 0.8超なら臨時再校正 | CEO承認必須 |

校正のたびに本セクションの閾値テーブルも更新し、過去の値を脚注に残すこと。

**低N数保護**: sampleSize < 30 の場合、runtimeScore = null（判定不能）とする。これにより、フィードバックが少ない軸での誤判定を防ぐ。

### 5-C. 総合判定

```
if (tier === "frozen"):
  status = "frozen"
  structural = null    // frozen軸は構造監査対象外
  runtime = null       // frozen軸はruntime監査対象外
  forwardTo = registry[axisId].forwardTo
  frozenAt = registry[axisId].frozenAt
  statusReason = registry[axisId].frozenReason

else if (structural.questionCount === 0):
  status = "ghost"

else if (structuralScore < domain別最低要件):
  status = "weak"

else if (runtime === null):
  // cold start: 構造監査のみで判定
  status = structuralScore >= domain別最低要件 ? "healthy" : "weak"

else if (runtime.sampleSize < 30):
  // 低N数: 構造判定を維持、runtime参考値として記録のみ
  status = structuralScore >= domain別最低要件 ? "healthy" : "weak"

else:
  // 十分なデータあり: 両方で判定
  if (structuralScore >= domain別最低要件 AND runtimeScore >= RUNTIME_HEALTHY_THRESHOLD):
    status = "healthy"
    // RUNTIME_HEALTHY_THRESHOLD = 3.0 (初期仮説値。§5-B閾値更新方針に従い再校正)
  else if (structuralScore >= domain別最低要件):
    status = "weak" // 構造はあるがruntimeで効いていない
    statusReason = "構造接続あり、runtime実効性が低い"
  else:
    status = "weak"
```

**cold start対応**: 新軸追加直後はruntime = null。構造監査のみで"healthy"判定を出せる。runtime集計はユーザーデータ蓄積後（最低30日想定）に開始。null期間中に凍結判定は行わない。

---

## 6. 派生事実生成器（Derived Fact Generator）

### 6-A. 生成フロー

```
入力: axisScores (全53軸)
      contradictions (検出済み矛盾リスト)
      blindSpots (検出済み盲点リスト)
      queryDomain (質問のドメイン, nullable)
      axisRegistry (全軸メタデータ)

処理:
  Step 1: 矛盾事実の生成 (最大2文)
    - contradictionDetector.tsの検出結果を利用
    - 各矛盾にsourceAxes = [axisA, axisB]を付与
    - tensionが高い順に上位2つを選択

  Step 2: 盲点事実の生成 (最大2文)
    - blindSpotDrop.tsの検出結果を利用
    - 各盲点にsourceAxes = 関連軸を付与
    - 確信度が高い順に上位2つを選択

  Step 3: 人格事実の生成 (最大2文)
    - 全軸スコアからdeviation上位軸を取得
    - 同一domain内で2軸以上が極端な場合、ドメイン横断パターンを文章化
    - axisRegistryのllmDescriptionとfallbackInsightを参照
    - sourceAxes = パターンに寄与した軸群

  Step 4: 文脈事実の生成 (最大2文, queryDomainがある場合のみ)
    - queryDomainに対応するaxisRegistry.domainの軸群を取得
    - その中でスコアが極端な軸のパターンを文章化
    - sourceAxes = 選出された軸群

  Step 5: 選出 (5-8文に収める)
    - contradiction(2) + blindspot(2) + personality(2) + context(2) = 最大8
    - 各事実のconfidenceでソート
    - confidence < 0.3の事実は除外
    - 最低5文を保証（不足時はfallbackInsightから補充）

出力: DerivedFactSet
```

### 6-B. LLMプロンプトへの注入

現行の `buildDeepAlterPrompt` の "### 軸スコア" セクションを以下に置換:

```
Before (現行):
  ### 軸スコア（具体的な数値と意味）
  - 慎重/大胆: 0.72 → 明確な「大胆」傾向
  - 感情安定/感情変動: 0.65 → やや「感情変動」傾向
  ... (8軸)

After (派生事実):
  ### この人の判断と行動の特徴
  - 追い詰められると判断基準が変わる。普段は大胆だが、感情が揺れると
    突然慎重になる。本人はそれに気づいていない。
  - 独立していたいのに、最終判断は「人にどう思われるか」で決めている。
    自由を求めながら他人の評価で動いている矛盾がある。
  - 感情は抑えられるが、頭の中では同じことを反芻しやすい。
    外から見えない消耗が常にある。
  - 仕事では理詰めで判断するのに、対人では直感で動く。
    自分でも気づきにくいズレがある。
  - [文脈事実: 質問に関連するドメイン固有のパターン]
  ... (5-8文)

  ### 生データ参照（確認用）
  - 最も極端な3軸: cautious_vs_bold=0.72, emotional_variability=0.65, ...
```

"生データ参照"セクションは3軸に縮小し、派生事実を補強する確認用データとしてのみ残す。

### 6-C. 派生事実の品質保証

| 保証項目 | 方法 |
|---------|------|
| 事実が空にならない | fallbackInsightからの補充（Step 5） |
| 同じ事実の重複を防ぐ | theme dedup（既存insightCardBuilderのロジック流用） |
| 事実の鮮度 | 前回生成の事実と比較し、50%以上同一なら再生成 |
| confidence閾値 | 0.3未満は除外 |
| 軸の多様性 | 同一軸が3文以上に寄与しないよう制限 |

---

## 7. sourceAxes トレーサビリティ

### 7-A. 記録経路

| イベント | 記録場所 | derived_factsの有無 |
|---------|---------|-------------------|
| Alter会話応答 | `home_alter_judgment` metadata | **必須** |
| InsightCard表示 | `home_insight_displayed` metadata | **必須**（card生成に使った軸を記録） |
| Alterフィードバック | `stargazer_alter_feedback` response_metadata | **必須**（フィードバック���点のderived_factsスナップショット） |
| Followup実行/スキップ | `home_alter_followup` metadata | **必須**（元のderived_factsを継承） |

全4経路で `derived_facts` フィールドを記録することで、「どの軸が→どの事実を生成し→promptに入り→ユーザーがどう反応したか」の因果チェーンが完成する。

### 7-B. 記録フォーマット

```typescript
// 全経路共通のderived_facts記録フォーマット
interface DerivedFactsLog {
  derived_facts: Array<{
    sourceType: DerivedFactType;
    sourceAxes: TraitAxisKey[];
    confidence: number;
    generationRule: string;
    includedInPrompt: boolean;
  }>;
  derived_facts_summary: {
    totalGenerated: number;
    totalIncluded: number;
    uniqueAxesUsed: number;
  };
}
```

### 7-C. InsightCardへのsourceAxes付与

現行の `AlterInsightCard` 型を拡張:

```typescript
export type AlterInsightCard = {
  // ... 既存フィールド ...
  /** この洞察カードの生成に寄与した軸（トレーサビリティ用） */
  sourceAxes?: TraitAxisKey[];
};
```

AXIS_INSIGHT_RULES の各ルールが参照する軸を、カード生成時に自動付与する。

---

## 8. subScore重み設計

### 8-A. control_tendency のサブスコア

| サブスコア | 重み | 外部ラベル | 根拠 | 根拠種別 |
|-----------|------|-----------|------|---------|
| general_control | 0.5 | コントロール全般 | InsightCardルール(ax_control_emotional)で単独参照される親概念。最も広い行動範囲をカバー | theory |
| pressure_risk | 0.3 | 圧力傾向 | Rendezvous safety判定で「相手に圧をかけるか」は排他性より直接的なリスク指標。心理学的にcontrol_tendencyの最も観察可能な表出形態 | theory |
| exclusivity_pressure | 0.2 | 排他的傾向 | 排他的行動はpressure_riskの特殊形態。一般集団での発現頻度が低く、重みを低めに設定 | theory |

### 8-B. 重み更新方針

| フェーズ | 重み決定方法 | トリガー | 承認 |
|---------|-------------|---------|------|
| Phase 0（初期） | 理論根拠ベース仮置き | 初期実装時 | CEO承認済みで適用 |
| Phase 1 | Rendezvous safety判定での発火率で補正 | ユーザー100人到達 | CEO承認必須 |
| Phase 2 | 回帰分析: safety eventとの相関 | safety event 50件蓄積 | CEO承認必須 |

`weightBasis` フィールドにより、各重みが「theory」「data」「hybrid」のどれに基づくか常に明示。更新時は前の値と根拠を `docs/decision-log.md` に記録。

### 8-C. boundary_awareness 統合

boundary_respect → boundary_awareness に統合。

**根拠（非独立性の証拠）**:
1. 同一質問の共有: 両軸ともq43で測定
2. ラベルの類似性: 「境界を柔軟に扱う⇔境界を明確に意識」 vs 「境界線を柔軟に扱う⇔境界線を明確に守る」
3. Stage分離のみが根拠: 概念的独立性の証拠なし

**移行方法**: boundary_respectの既存スコアデータはboundary_awarenessに統合（加重平均）。旧axis_id "boundary_respect" は axisRegistry で `{ tier: "frozen", forwardTo: "boundary_awareness" }` として残し、参照時に自動転送。

**データ移行SQL**:
```sql
-- boundary_respect → boundary_awareness 統合
-- 既存スコアの加重平均で統合（boundary_awarenessが主、boundary_respectが副）
UPDATE stargazer_axis_scores SET
  score = (
    COALESCE(
      (SELECT score FROM stargazer_axis_scores AS br
       WHERE br.user_id = stargazer_axis_scores.user_id
       AND br.axis_id = 'boundary_awareness') * 0.7
    +
      (SELECT score FROM stargazer_axis_scores AS ba
       WHERE ba.user_id = stargazer_axis_scores.user_id
       AND ba.axis_id = 'boundary_respect') * 0.3,
      stargazer_axis_scores.score
    )
  )
WHERE axis_id = 'boundary_awareness';
-- boundary_respectの行は削除せず保持（analytics後方互換）
```

**frozen Registryエントリ**:
```typescript
{
  id: "boundary_respect",
  tier: "frozen",
  forwardTo: "boundary_awareness",
  frozenAt: "2026-04-XX",   // 実行日
  frozenReason: "boundary_awarenessと非独立。q43を共有、ラベル類似、Stage分離のみが根拠で概念的独立性なし。",
  domain: "boundary",
  category: "relationship",
  labelLeft: "境界線を柔軟に扱う",
  labelRight: "境界線を明確に守る",
  fallbackInsightLeft: "",  // frozen軸: 統合先を参照
  fallbackInsightRight: "",
  contextReelTemplate: "",
  llmDescription: "",
  causalAffinity: [],
}
```

### 8-D. pressure_risk → control_tendency サブスコア移行契約

**根拠（非独立性の証拠）**:
1. 概念的包含: pressure_riskは「相手に圧をかけるか」で、control_tendency（コントロール傾向）の最も観察可能な表出形態
2. Rendezvous safety判定での共起: 両軸が同時に高い場合のみsafety flagが立つ。単独での判別力が低い
3. 心理学的根拠: 対人支配性(interpersonal dominance)の一次元上に位置する概念

**移行方法**: pressure_riskはcontrol_tendencyのサブスコア（weight: 0.3）として吸収。外部ラベル「圧力傾向」は維持し、Rendezvous safety判定での可読性を保つ。

**データ移行SQL**:
```sql
-- pressure_risk → control_tendency サブスコア化
-- control_tendencyの新スコア = general_control(0.5) + pressure_risk(0.3) + exclusivity_pressure(0.2)
-- Step 1: 既存control_tendencyスコアをgeneral_control成分として保持
-- Step 2: 新composite scoreを算出
UPDATE stargazer_axis_scores SET
  score = (
    COALESCE(
      (SELECT score FROM stargazer_axis_scores AS ct
       WHERE ct.user_id = stargazer_axis_scores.user_id
       AND ct.axis_id = 'control_tendency') * 0.5
    +
      (SELECT score FROM stargazer_axis_scores AS pr
       WHERE pr.user_id = stargazer_axis_scores.user_id
       AND pr.axis_id = 'pressure_risk') * 0.3
    +
      (SELECT score FROM stargazer_axis_scores AS ep
       WHERE ep.user_id = stargazer_axis_scores.user_id
       AND ep.axis_id = 'exclusivity_pressure') * 0.2,
      stargazer_axis_scores.score  -- fallback: 元の値を維持
    )
  )
WHERE axis_id = 'control_tendency';
-- pressure_risk, exclusivity_pressureの行は削除せず保持（analytics後方互換）
```

**frozen Registryエントリ**:
```typescript
{
  id: "pressure_risk",
  tier: "frozen",
  forwardTo: "control_tendency",
  frozenAt: "2026-04-XX",   // 実行日
  frozenReason: "control_tendencyのサブスコア化。対人支配性の表出形態として親概念に吸収。外部ラベル'圧力傾向'はsubScores.externalLabelで維持。",
  domain: "boundary",
  category: "relationship",
  labelLeft: "圧力をかけにくい",
  labelRight: "圧力をかけやすい",
  fallbackInsightLeft: "",  // frozen軸: 統合先を参照
  fallbackInsightRight: "",
  contextReelTemplate: "",
  llmDescription: "",
  causalAffinity: [],
}
```

**スコア参照時の転送ルール**:
```typescript
// pressure_riskが参照された場合
function resolveAxisScore(axisId: TraitAxisKey, scores: AxisScores): number {
  const entry = axisRegistry[axisId];
  if (isFrozenAxis(entry)) {
    // frozen軸: 統合先のスコアを返す
    return scores[entry.forwardTo] ?? 0;
  }
  return scores[axisId] ?? 0;
}
```

**Rendezvous safety判定との互換**: 既存のsafety判定コードが `pressure_risk` を直接参照している場合、`resolveAxisScore` 経由で `control_tendency` のcompositeスコアが返る。safety閾値はcompositeスコア基準に再キャリブレーション（Phase 2, P2-5で実施）。

### 8-E. exclusivity_pressure → control_tendency サブスコア移行契約

**根拠（非独立性の証拠）**:
1. 概念的包含: exclusivity_pressure（排他的傾向）はpressure_riskの特殊形態であり、control_tendencyの下位概念
2. 一般集団での発現頻度: pressure_riskより低く、独立軸としての弁別力が弱い
3. 測定の重複: 関連質問がpressure_riskと同じ行動文脈を測定

**移行方法**: exclusivity_pressureはcontrol_tendencyのサブスコア（weight: 0.2）として吸収。外部ラベル「排他的傾向」は維持。

**データ移行SQL**: §8-D のSQL内で同時処理（control_tendencyのcomposite算出に含まれる）。

**frozen Registryエントリ**:
```typescript
{
  id: "exclusivity_pressure",
  tier: "frozen",
  forwardTo: "control_tendency",
  frozenAt: "2026-04-XX",   // 実行日
  frozenReason: "control_tendencyのサブスコア化。pressure_riskの特殊形態として親概念に吸収。外部ラベル'排他的傾向'はsubScores.externalLabelで維持。",
  domain: "boundary",
  category: "relationship",
  labelLeft: "排他性が低い",
  labelRight: "排他的になりやすい",
  fallbackInsightLeft: "",
  fallbackInsightRight: "",
  contextReelTemplate: "",
  llmDescription: "",
  causalAffinity: [],
}
```

**3軸統合後のcontrol_tendency Registryエントリ（subScores構造）**:
```typescript
{
  id: "control_tendency",
  tier: "core",
  domain: "boundary",
  // ... 既存フィールド ...
  subScores: {
    general_control: {
      weight: 0.5,
      externalLabel: "コントロール全般",
      weightBasis: "theory",
      lastUpdated: "2026-04-XX",
      updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)"
    },
    pressure_risk: {
      weight: 0.3,
      externalLabel: "圧力傾向",
      weightBasis: "theory",
      lastUpdated: "2026-04-XX",
      updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)"
    },
    exclusivity_pressure: {
      weight: 0.2,
      externalLabel: "排他的傾向",
      weightBasis: "theory",
      lastUpdated: "2026-04-XX",
      updatePolicy: "Phase 1: 理論ベース仮置き → Phase 2: safety発火率で補正(CEO承認必須)"
    }
  }
}
```

---

## 9. 軸ID互換性とバージョン管理

### 9-A. 変更不可ルール

- 既存の `TraitAxisKey` の値（文字列）は変更禁止
- 新軸追加は `TraitAxisKey` union型への追加のみ
- 削除は行わない（frozen化で対応）

### 9-B. frozen軸の扱い

```typescript
// axisRegistry.ts
{
  id: "boundary_respect",
  tier: "frozen" as const,
  forwardTo: "boundary_awareness" as TraitAxisKey,
  frozenAt: "2026-04-XX",
  frozenReason: "boundary_awarenessと非独立。q43を共有。",
  // ... 他フィールドは統合先の値を参照
}
```

frozen軸のスコアが参照された場合:
1. `forwardTo` が設定されていれば、統合先のスコアを返す
2. 設定されていなければ 0 を返す
3. analytics記録時は元のaxis_idを保持（後方互換）

### 9-C. バージョニング

axisRegistryにバージョン番号を持たせる:

```typescript
export const AXIS_REGISTRY_VERSION = "1.0.0";
// メジャー: 軸の統合/削除
// マイナー: 新軸追加
// パッチ: テンプレート変更
```

analytics記録時に `axis_registry_version` をmetadataに含め、過去データとの照合を可能にする。

---

## 10. 移行計画

### Phase 1: 基盤構築（1-2週間）

**目標**: Registry作成 + 派生事実生成器のプロトタイプ + HealthCheck Layer 1

| タスク | ファイル | 内容 | 影響範囲 |
|--------|---------|------|---------|
| P1-1 | `lib/stargazer/axisRegistry.ts` (新規) | 全53軸のRegistryEntry定義。既存traitAxes.tsをimportして拡張。traitAxes.tsは変更しない | 新規ファイルのみ |
| P1-2 | `lib/stargazer/derivedFactGenerator.ts` (新規) | DerivedFact/DerivedFactSet型定義 + generateDerivedFacts()実装。既存contradictionDetector, blindSpotDropの出力を入力として使用 | 新規ファイルのみ |
| P1-3 | `lib/stargazer/alter.ts` | buildDeepAlterPromptの "### 軸スコア" セクションをderivedFactGeneratorに置換。旧top8ロジックは `_legacyTop8()` として残し、feature flagで切替可能に | alter.ts 1箇所 |
| P1-4 | `app/api/stargazer/alter/route.ts` | home_alter_judgment metadataに `derived_facts` と `derived_facts_summary` フィールド追加 | route.ts analytics記録部分 |
| P1-5 | `lib/stargazer/axisHealthCheck.ts` (新規) | Layer 1(構造監査)のみ実装。questions.ts, contradictionDetector.ts, alterInsightCardBuilder.tsを静的走査 | 新規ファイルのみ |
| P1-6 | `lib/stargazer/alterInsightCardBuilder.ts` | AlterInsightCardにsourceAxes追加。AXIS_INSIGHT_RULESの各ルールから参照軸を自動抽出してカードに付与 | 型拡張 + 生成ロジック微修正 |

**Phase 1 完了基準**:
- [ ] axisRegistryに53軸全てのエントリが存在する
- [ ] derivedFactGeneratorが全軸スコアから5-8文の派生事実を生成できる
- [ ] alter.tsが派生事実をLLMプロンプトに注入している（feature flag ON時）
- [ ] home_alter_judgmentにderived_factsが記録されている
- [ ] axisHealthCheckのLayer 1が全軸をスキャンし、StructuralHealthを出力できる
- [ ] 既存テストが全てパスする

**ロールバック手順**: P1-3のfeature flagをOFFにすれば旧top8ロジックに即時復帰。新規ファイル(P1-1,P1-2,P1-5)は既存コードに依存されないため、削除するだけで完全復旧。

### Phase 2: 接続強化（2-3週間）

**目標**: 弱い軸の接続強化 + proactiveUnderstanding stub埋め + 質問追加

| タスク | 内容 |
|--------|------|
| P2-1 | Stage3深層心理5軸に矛盾ルール追加（5ペア）。contradictionDetector.tsのCROSS_AXIS_RULESに追加 |
| P2-2 | 1問軸17軸に各2問追加（計34問）。questions.tsに追加。優先: safety軸 → relational軸 → aesthetic軸 |
| P2-3 | proactiveUnderstanding.tsのstub 30軸にcausalAffinity 2軸以上を記入 |
| P2-4 | 全53軸のfallbackInsight(左右各1文)をaxisRegistryに記入。alterInsightCardBuilder.tsのAXIS_FALLBACK_TEXTSをRegistry参照に切替 |
| P2-5 | 3軸統合実行: boundary_respect→boundary_awareness、pressure_risk+exclusivity_pressure→control_tendencyサブスコア |
| P2-6 | home_insight_displayedにsourceAxes記録追加 |
| P2-7 | stargazer_alter_feedbackのresponse_metadataにderived_factsスナップショット追加 |

**Phase 2 完了基準**:
- [ ] structuralScore >= domain別最低要件を満たす軸が、全軸の60%以上
- [ ] ゴースト軸（questionCount=0）が12軸→6軸以下に削減
- [ ] derived_factsが全4経路（judgment, insight_displayed, feedback, followup）で記録されている
- [ ] proactiveUnderstandingのstub軸が15軸以下に削減

**ロールバック手順**: 質問追加(P2-2)とルール追加(P2-1)は追加操作のみで既存を変更しないため、リバートは該当commitの取り消しで完了。統合(P2-5)はfrozen+forwardToで旧IDを維持するため、forwardToを解除すれば復旧。

### Phase 3: 自動化と評価（3-4週間）

**目標**: Runtime監査 + capability自動算出 + ゴースト防止の自動化

| タスク | 内容 |
|--------|------|
| P3-1 | axisHealthCheck.ts Layer 2(runtime実効監査)実装。stargazer_analyticsからderived_facts.sourceAxesを集計 |
| P3-2 | capability profile自動算出スクリプト。月次実行、結果をdocs/axis-health-report.mdに出力 |
| P3-3 | CognitiveFit活性化判定（CEO判断）: abstract_structuring, cognitive_updating, social_modelingに各3問追加 or 正式凍結 |
| P3-4 | Expansion活性化判定（CEO判断）: energy_rhythm, self_disclosure_depth, decision_regretに各3問追加 or 正式凍結 |
| P3-5 | 派生事実生成器のfeature flagをONに固定。旧top8ロジックを削除 |
| P3-6 | 月次HealthCheckの自動実行設定（CIまたはcron） |

**Phase 3 完了基準**:
- [ ] RuntimeHealthが全healthy軸に対して算出されている（sampleSize >= 30の軸のみ）
- [ ] capability profileが自動算出され、月次レポートが生成されている
- [ ] ゴースト軸が6軸以下（凍結軸を除く）
- [ ] 旧top8ロジックが削除されている
- [ ] CognitiveFit/Expansion各軸のCEO判定が完了している

**ロールバック手順**: Phase 3はPhase 1-2の上に乗る追加であり、各タスクは独立。個別revertで対応可能。

---

## 11. 失敗時のロールバック

### 11-A. 全体ロールバック戦略

| 障害レベル | 症状 | 対応 |
|-----------|------|------|
| Level 1: 派生事実の品質低下 | Alterの応答が浅くなった/的外れになった | feature flagで旧top8ロジックに即時復帰。derivedFactGeneratorの改善後に再有効化 |
| Level 2: analyticsデータ破損 | derived_factsフィールドの形式不正 | 不正データのクリーンアップSQL実行。derived_factsフィールドをnullに戻す |
| Level 3: axisRegistry定義エラー | 型エラー/runtime例外 | axisRegistryをimportしている箇所は全てtry-catchで既存traitAxes.tsにフォールバック |
| Level 4: 軸統合の問題 | frozen軸のforwardToが機能しない | forwardToを解除し、旧axis_idでの参照を復活 |

### 11-B. feature flag設計

```typescript
// lib/stargazer/featureFlags.ts
export const STARGAZER_FLAGS = {
  /** 派生事実生成器を使うか（false = 旧top8） */
  useDerivedFacts: process.env.STARGAZER_USE_DERIVED_FACTS === "true",
  /** derived_factsをanalyticsに記録するか */
  logDerivedFacts: process.env.STARGAZER_LOG_DERIVED_FACTS === "true",
  /** axisRegistryからfallbackInsightを読むか */
  useRegistryFallbacks: process.env.STARGAZER_USE_REGISTRY_FALLBACKS === "true",
} as const;
```

Phase 1ではすべてfalse（opt-in）。動作確認後にtrue化。Phase 3完了時にフラグ自体を削除し、新ロジックに固定。

---

## 12. 受け入れ基準

この設計が「成功した」と判断する条件:

### Phase 1 完了時の定量基準

旧「Alterに還元されている軸率」を以下4指標に分解。それぞれ独立に測定し、単一指標のマスキングを防ぐ。

| 指標 | 定義 | 現状値 | 目標値 | 測定方法 |
|------|------|-------|-------|---------|
| **①構造接続率** | axisHealthCheckのStructuralScore ≥ domain別最低要件を満たす軸の割合 | 19% (10/53) | 45% (24/53) | `axisHealthCheck` Layer 1 出力 |
| **②派生事実寄与率** | 過去30日のderived_factsのsourceAxesに1回以上含まれた軸の割合 | 0% (未実装) | 40% (21/53) | `stargazer_analytics` の derived_facts.sourceAxes を DISTINCT集計 |
| **③prompt採用率** | 生成された派生事実のうち最終promptに `includedInPrompt=true` で採用された率 | 0% (未実装) | 80% | `derived_facts` の includedInPrompt=true / totalGenerated |
| **④UI露出率** | InsightCard・ContextReel・WhyCardのいずれかでsourceAxesに含まれた軸の割合 | 11% (6/53 fallbackのみ) | 30% (16/53) | `home_insight_displayed` + ContextReel analytics の sourceAxes DISTINCT集計 |
| LLMに届く人格情報量 | — | 8軸のラベル | 5-8文の派生事実 | buildDeepAlterPromptの出力確認 |
| ゴースト軸数 | — | 19軸 | 19軸（Phase 1では変化なし） | questionCount === 0 の軸数 |
| analytics記録のderived_facts率 | — | 0% | 100%（flag ON時） | home_alter_judgment でのderived_facts存在率 |

**4指標の関係**: ①構造接続 → ②派生事実生成 → ③prompt採用 → ④UI表示 のファネル構造。上流が低いと下流も必然的に低くなる。Phase 1では①②を重点的に上げ、③④はPhase 2-3で改善。

### Phase 3 完了時の定量基準

| 指標 | 現状値 | 目標値 | 測定方法 |
|------|-------|-------|---------|
| **①構造接続率** | 19% | 75%+ (40/53) | axisHealthCheck structural（frozen軸を分母から除外） |
| **②派生事実寄与率** | 0% | 60%+ (32/53) | 月次derived_facts.sourceAxes DISTINCT / 非frozen軸数 |
| **③prompt採用率** | 0% | 85%+ | includedInPrompt=true / totalGenerated（月次平均） |
| **④UI露出率** | 11% | 50%+ (27/53) | InsightCard + ContextReel + WhyCard の sourceAxes DISTINCT / 非frozen軸数 |
| ゴースト軸数 | 19軸 | 6軸以下（凍結除く） | questionCount === 0 かつ frozen でない軸数 |
| 矛盾ルール数 | 15ペア | 25ペア以上 | CROSS_AXIS_RULES.length |
| InsightCard全軸カバー率 | 6軸/53軸 (fallback) | 53軸/53軸 | Registry fallbackInsight記入率 |
| proactive stub率 | 30+/45軸 | 10軸以下 | causalAffinity空の軸数 |

### 定性基準

- Alterの応答に「この人固有の矛盾・盲点・判断パターン」が含まれる頻度が体感で増加
- 「え、なんでわかるの？」相当のポジティブフィードバックが `stargazer_alter_feedback` で観測される
- 軸追加時の**必須**タッチポイントはaxisRegistry の1箇所のみ。加えて questions.ts への質問追加（観測データ取得のため推奨）、消費側ファイルへの手動ルール追加（矛盾・洞察の深化のため任意）があり得る。合計最大3箇所だが、必須は registry のみ

### オフライン評価ゲート（Phase 1 GO前の必須条件）

Phase 1のfeature flag ON（派生事実の本番有効化）前に、旧top8 vs derived facts のオフライン品質比較を実施する。これに合格しない限り、旧top8ロジックからの切替を行わない。

**評価手順**:

1. **テストセット作成**: 実ユーザー20人分のaxisScoresスナップショットを匿名化して固定テストセットとする（`tests/fixtures/alter-axis-snapshots.json`）。各ユーザーの過去の質問5件をペアリングし、計100ケースを用意。

2. **並列プロンプト生成**: 各ケースに対して以下2つのプロンプトを生成:
   - **A（旧top8）**: 現行の `_legacyTop8()` でLLMプロンプトを構築
   - **B（derived facts）**: `generateDerivedFacts()` でLLMプロンプトを構築

3. **LLM応答生成**: 同一のLLM（同一temperature、同一seed）でA・Bそれぞれから応答を生成

4. **品質評価（5指標）**:

| 指標 | 測定方法 | A合格基準 | B合格基準（Bが本番採用される条件） |
|------|---------|----------|-------------------------------|
| **パーソナライズ度** | 応答中にユーザー固有の判断パターン・矛盾・盲点に言及している箇所数 | — | B ≥ A × 1.3（Aより30%以上多い） |
| **軸カバレッジ** | 応答が暗黙的に参照している軸の数（人手アノテーション） | — | B ≥ A × 1.5（Aより50%以上多い） |
| **応答の具体性** | 汎用的アドバイス vs ユーザー固有のアドバイスの比率 | — | B固有率 ≥ 60% |
| **事実の正確性** | 応答内の人格記述がaxisScoresと矛盾していないか（矛盾箇所数） | — | B矛盾数 ≤ A矛盾数 |
| **自然さ** | 文章の読みやすさ・不自然な情報詰め込みがないか（5段階、人手評価） | — | B ≥ 3.5/5.0 かつ B ≥ A - 0.5（Aより大幅に劣化しない） |

5. **合格判定**:
   - 5指標中4指標以上でB合格基準を満たすこと
   - 「事実の正確性」は必須合格（矛盾が増えるなら不合格）
   - 100ケース中、Bが明確に劣る（パーソナライズ度+具体性の両方でA未満）ケースが10%以下

6. **不合格時の対応**:
   - derivedFactGeneratorのルール調整後に再評価
   - 3回不合格の場合、設計の根本見直し（CEO判断）

**評価スクリプト**: `scripts/eval-derived-facts-offline.ts` として実装。テストセット+プロンプト生成+LLM呼び出し+指標算出を自動化。人手評価は「自然さ」と「軸カバレッジ」の2指標のみ。

**記録**: 評価結果は `docs/eval/derived-facts-v1.md` に記録し、CEO承認を得てからfeature flag ONとする。

---

## 13. 決定事項サマリー

| 決定 | 内容 | 承認 |
|------|------|------|
| D1 | LLMプロンプトを旧top8ラベル列挙から派生事実5-8文に変更 | CEO承認待ち |
| D2 | axisRegistry.ts新設（slim版、メタデータ+テンプレのみ。frozen tier対応） | CEO承認待ち |
| D3 | axisHealthCheck.ts新設（構造監査+runtime実効監査の2層。絶対閾値ベース） | CEO承認待ち |
| D4 | boundary_respect → boundary_awareness 統合（§8-C: 移行SQL+frozen契約明文化済み） | CEO承認待ち |
| D5 | pressure_risk + exclusivity_pressure → control_tendency サブスコア化（§8-D/E: 移行SQL+frozen契約+resolveAxisScore明文化済み） | CEO承認待ち |
| D6 | derived_facts を stargazer_analytics metadata に追加（DB変更なし） | CEO承認待ち |
| D7 | feature flagによる段階有効化（Phase 1: opt-in → Phase 3: 固定） | CEO承認待ち |
| D8 | CognitiveFit 3軸 + Expansion 3軸の活性化/凍結判定をPhase 3でCEO判断 | Phase 3で判断 |
| D9 | Alter還元率を4指標（構造接続率/派生事実寄与率/prompt採用率/UI露出率）に分解 | CEO承認待ち |
| D10 | オフライン評価ゲート: 旧top8 vs derived facts の品質比較をPhase 1 GO前に必須実施 | CEO承認待ち |
