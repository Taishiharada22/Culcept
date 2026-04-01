# P4: 軸拡張エンジン設計書

## CEO 制約（絶対条件）

1. **初回45軸の archetype 基盤は固定** — 24アーキタイプの決定に使う4層圧縮の重みマトリクスは変更しない
2. **追加軸は core と分けて扱う** — 内部的に `tier: "expansion"` で明確に区別
3. **UIでは"追加軸"感を出しすぎない** — 自然に理解が増える体験として見せる
4. **新軸発見は次回アクセス時表示が基本** — リアルタイム通知ではなく、再訪時に気づく

---

## 1. 新軸発見条件

### 1.1 発見トリガー（3種）

| トリガー | 条件 | 説明 |
|---------|------|------|
| **精度飽和** | 既存45軸のうち20軸以上が precision τ > 30 | 「もう既存軸では語り尽くせない」状態 |
| **矛盾蓄積** | contradictionEngine が同一軸ペアで3回以上の矛盾を検出 | 一本の軸では捉えきれない二面性の発見 |
| **観測深度** | 総観測数 ≥ 100 かつ Phase ≥ maturity（31日目以降） | 十分なデータと時間の蓄積 |

**発動ルール**: 上記のうち **2つ以上** が同時に成立したとき、拡張軸候補が解放される。

### 1.1.1 解放条件の成立ログ（CEO条件1）

解放判定のたびに以下をログ出力する。閾値調整の観測基盤として必須。

```typescript
interface ExpansionEligibilityLog {
  userId: string;
  timestamp: string;
  // 各条件の現在値と閾値
  precisionSaturation: { current: number; threshold: 20; met: boolean };
  contradictionAccumulation: { maxPairCount: number; threshold: 3; met: boolean; topPair?: [string, string] };
  observationDepth: { totalObservations: number; daysSinceFirst: number; phaseMet: boolean; met: boolean };
  // 判定結果
  conditionsMet: number;   // 0, 1, 2, 3
  released: boolean;       // conditionsMet >= 2
  releasedAxes: string[];  // 今回解放された軸ID
}
```

集計指標（管理画面 or ログ検索で確認）:
- **ユーザー別解放率**: 全ユーザーのうち解放に到達した割合
- **条件別ボトルネック**: 3条件のうちどれが最も未達になりやすいか
- **到達日数分布**: 解放まで何日かかったか

### 1.2 発見対象（第1弾: 6軸）

初回リリースでは以下の6軸を候補として定義する。全て既存45軸の「間」に存在する軸で、既存観測データから初期推定が可能。

| 拡張軸 ID | 名称 | 由来 | 親軸（推定元） |
|-----------|------|------|--------------|
| `energy_rhythm` | エネルギーリズム | 活動と休息の波のパターン | `introvert_vs_extrovert` × `emotional_variability` × `stress_isolation_vs_social` |
| `conflict_style` | 葛藤処理スタイル | 対立時の対処パターン | `direct_vs_diplomatic` × `emotional_regulation` × `independence_vs_harmony` |
| `novelty_threshold` | 新奇性の閾値 | 刺激を求めるか避けるかの境界線 | `change_embrace_vs_resist` × `tradition_vs_novelty` × `cautious_vs_bold` |
| `self_disclosure_depth` | 自己開示の深度 | 自分をどこまで見せるか | `intimacy_pace` × `public_private_gap` × `boundary_awareness` |
| `decision_regret` | 決断後の振り返り傾向 | 決めた後にどう処理するか | `rumination_tendency` × `locus_of_control` × `perfectionist_vs_pragmatic` |
| `relational_investment` | 関係への投資配分 | 広く薄く vs 狭く深く | `quality_vs_quantity` × `individual_vs_social` × `friend_mode_fit` |

### 1.2.1 各軸が既存45軸では足りない理由（CEO条件3）

| 拡張軸 | 既存軸の限界 | この軸が追加で説明できること |
|--------|-------------|--------------------------|
| `energy_rhythm` | 内向/外向は「好む方向」を測るが、**充電→消費の波の周期と深さ**は測れない | 同じ内向型でも「短時間で回復→活動」と「長い充電期間が必要」の違いが分かる |
| `conflict_style` | 率直/外交的は「伝え方」、感情調整は「制御力」だが、**対立という場面での統合的な振る舞いパターン**は別物 | 「論理で戦う」「沈黙で守る」「感情で押す」「距離を取る」の4型を識別できる |
| `novelty_threshold` | 変化歓迎/抵抗と新規/伝統は「好み」だが、**どこまでの新しさなら受け入れるかの境界線**は測れない | 「新しいカフェはOKだが転職は怖い」のようなドメイン別の新奇性耐性を捉える |
| `self_disclosure_depth` | 親密ペースは「速度」、表裏ギャップは「差分」だが、**意図的にどの層まで開くかの天井**は別次元 | 「すぐ打ち解けるが核心は見せない」vs「時間はかかるが一度開くと全部見せる」を区別 |
| `decision_regret` | 反芻は「引きずる傾向」、統制感は「原因帰属」だが、**決断後の心理処理プロセス全体**は捉えきれない | 「決めた後に安心する」vs「決めた瞬間から別の選択肢を考え始める」の差を可視化 |
| `relational_investment` | 質/量は「物事への姿勢」、個/社は「活動の場」だが、**人間関係への資源配分の構造**は別の軸 | 「友達100人を薄く」vs「3人を深く」は質/量軸だけでは捉えきれない対人資源の戦略 |

### 1.3 初期値の算出

発見時に親軸のスコアから初期推定値を算出する。

```
initial_μ = weighted_average(parent_axis_scores)
initial_τ = 0.3  （通常prior 0.5 より低い = 不確実性が高い）
confidence_cap = 0.45  （既存直接観測 0.65、推論 0.35 の中間）
```

発見後は既存と同じベイズ更新ルートに乗る（質問回答・日次観測から更新）。

### 1.4 拡張軸の文言上限（CEO条件2）

内部 confidence cap（0.45）に加え、**UI表示での断定度にも上限**を設ける。

| confidence 帯 | 許容表現 | 禁止表現 |
|--------------|---------|---------|
| 0.00 – 0.15 | （非表示。裏で育成中） | — |
| 0.15 – 0.25 | 「見え始めています」「かすかな傾向があります」 | 「あなたは〜です」「〜タイプです」 |
| 0.25 – 0.35 | 「輪郭が出てきました」「〜の傾向が育っています」 | 「明確に〜です」「間違いなく〜」 |
| 0.35 – 0.45 | 「〜の傾向が見えてきました」「〜寄りのようです」 | 断定形すべて禁止 |

実装: `getExpansionAxisLabel(confidence: number)` ユーティリティで文言を一元管理。UIコンポーネント側で直接 confidence を判定しない。

---

## 2. 既存45軸との関係

### 2.1 アーキタイプへの影響

**影響させない。**

- `archetypeResolver.ts` の4層圧縮（Cognition / Emotion / Social / Execution）は45軸のみで決定
- 拡張軸はアーキタイプの **解像度を上げる補助情報** として扱う
- 例: 同じ `ACIO`（Architect）でも、`conflict_style` が異なれば「対立に沈黙するArchitect」と「対立に論理で立ち向かうArchitect」の違いが見える

### 2.2 データ構造上の分離

```typescript
// traitAxes.ts に追加
export type AxisTier = "core" | "expansion";

export interface TraitAxisDef {
  id: TraitAxisKey;
  labelLeft: string;
  labelRight: string;
  category: AxisCategory;
  tier: AxisTier;                    // 追加: "core" | "expansion"
  parentAxes?: TraitAxisKey[];       // 追加: 推定元の軸
  discoverCondition?: string;       // 追加: 発見条件の説明
  validationKey?: string;
}
```

- 既存45軸は全て `tier: "core"` — 後方互換
- 拡張軸は `tier: "expansion"` — profile API / UI で区別可能
- `TRAIT_AXIS_KEYS` の `as const` 配列に拡張軸を追加するが、`archetypeResolver` のウェイトマトリクスには含めない

### 2.3 推論エンジンとの関係

- `axisInferenceEngine.ts` に拡張軸用の推論ルールを追加
- ただし推論の深度は1パスのみ（拡張軸→拡張軸のチェーン推論は禁止）
- 推論 confidence cap は既存 0.35 より低い **0.25** に設定

---

## 3. 通知頻度

### 3.1 発見通知

- **頻度**: 最大 **月1回**
- **タイミング**: ユーザーが Stargazer を開いたとき（次回アクセス時表示）
- **条件**: 前回の発見から最低7日経過

### 3.2 通知の抑制ルール

| 条件 | 抑制理由 |
|------|---------|
| 前回発見から7日未満 | 連続通知を避ける |
| confidence < 0.15 | まだ十分な観測がない |
| ユーザーが結果画面を見ていない（最終閲覧 > 3日前） | 離脱中のユーザーに通知しない |
| 既に発見済みの軸が confidence < 0.30 のままの場合 | 前の軸がまだ育っていない |

### 3.3 通知なしの更新

- 拡張軸のスコアは **通知なしで裏で更新し続ける**
- precision が一定に達した（τ > 10）時点で初めて通知候補に昇格
- ユーザーには「観測を続けるうちに、新しい軸が見つかりました」と事後的に伝える

---

## 4. 表示場所

### 4.1 メイン表示: Stargazer ダッシュボード

**拡張軸セクション**（既存タブ内）:

```
┌─────────────────────────────────────┐
│ ▾ あなたの観測が深まっています        │
│                                     │
│  エネルギーリズム      ●───────○     │
│  静かに充電            活発に消費    │
│  confidence: ▓▓▓░░ 38%             │
│                                     │
│  ↳ この軸は「内向/外向」と            │
│    「感情の波」の間に見つかりました   │
│                                     │
│  🔍 もっと正確にするには → 質問に答える│
└─────────────────────────────────────┘
```

- 既存45軸の表示と同じ AxisBar コンポーネントを使う
- ただし背景色を微妙に変え、「新しく見えてきた軸」であることを自然に伝える
- 軸名の下に「由来」を1行で表示（例: 「内向/外向 × 感情の波 の間に」）

### 4.2 発見モーメント: ResultsSequence 拡張（CEO条件4）

初回発見時のみ、ResultsSequence に **1枚の補助カード** を挿入する。**主役はあくまでアーキタイプ結果。**

#### 発見カードの表示ルール（4条件）

1. **短い** — テキスト量は最大4行。スクロールが必要な量は禁止
2. **1軸だけ** — 複数軸が同時に解放されても、カードに出すのは1軸のみ。残りはダッシュボードで表示
3. **「今後こう深まります」を示す** — 現在値の断定ではなく、観測の先にある解像度の予告
4. **既存結果の邪魔をしない** — カード7（Save & Share）の直前に挿入し、フローの到達感を壊さない

```
┌─────────────────────────────────────┐
│                                     │
│  ✦ 新しい軸が見え始めています        │
│                                     │
│  「エネルギーリズム」                 │
│  観測を重ねると、輪郭が見えてきます   │
│                                     │
│           [タップで次へ]              │
└─────────────────────────────────────┘
```

- Card 7（Save & Share）の前に挿入（`TOTAL_CARDS = 9` に）
- 発見済みの軸がない場合は既存の8枚のまま
- 1回表示したらフラグを立て、次回以降はダッシュボードのみで表示
- アニメーションは控えめ（starBorn や insightReveal のサウンドは鳴らさない）

### 4.3 非表示場所

- **アーキタイプ表示**: 拡張軸は含めない（「あなたは ACIO です」に影響しない）
- **Rendezvous マッチング**: 初期は含めない（Phase 2以降で検討）
- **Genome Card**: 初期は含めない（カード密度が上がりすぎる）

---

## 5. 質問生成

### 5.1 拡張軸専用の質問

各拡張軸に対して **3問** のセマンティックディファレンシャル質問を用意する（計18問）。

- 既存51問（questions.ts）には追加しない — 別ファイル `expansionQuestions.ts` に格納
- 質問は日次観測の中で **自然に混ぜる**（「今日の深掘り」として1問ずつ出現）
- 1日最大1問、同じ拡張軸から連続では出さない

### 5.2 質問の出現条件

```
拡張軸が発見済み
AND confidence < 0.40（まだ精度が低い）
AND 前回の拡張質問から24時間以上
AND ユーザーがその日1つ以上の通常質問に回答済み
```

---

## 6. 実装ロードマップ

### Phase A: 基盤（〜1日）
1. `traitAxes.ts` に `tier` フィールド追加（既存は全て `"core"`）
2. `expansionAxes.ts` 新規: 6拡張軸の定義
3. `expansionDiscovery.ts` 新規: 発見条件の判定ロジック

### Phase B: データ層（〜1日）
4. profile API に拡張軸のスコア返却を追加（`tier: "expansion"` でフィルタ可能）
5. ベイズ更新に拡張軸の precision 制限を追加（τ_max = 40, conf_cap = 0.45）
6. 推論エンジンに拡張軸ルール追加（1パスのみ、conf_cap = 0.25）

### Phase C: UI 表示（〜1日）
7. ダッシュボードに拡張軸セクション追加
8. ResultsSequence に発見カード挿入（条件付き）
9. 「新しい軸が見つかりました」通知ロジック

### Phase D: 質問供給（〜0.5日）
10. `expansionQuestions.ts`: 6軸 × 3問 = 18問
11. 日次観測フローに拡張質問の混入ロジック

---

## 7. 不変条件チェックリスト

- [ ] `archetypeResolver.ts` の重みマトリクスに拡張軸を追加していないこと
- [ ] 既存45軸の `TRAIT_AXIS_KEYS` 配列の順序を変えていないこと
- [ ] `TRAIT_AXES` の既存45件の定義を変更していないこと
- [ ] Rendezvous / Genome Card / マッチングスコアに拡張軸を含めていないこと
- [ ] 拡張軸の confidence_cap が 0.45 以下であること
- [ ] 拡張軸→拡張軸のチェーン推論がないこと
