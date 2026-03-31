# Alter 個別化レイヤー Before/After 比較

> 目的: 各レイヤー（P0-P6）が実際にどう効くかを具体的に示す。
> "賢そう" ではなく **本当に個別化されたか** を検証する。

## レイヤー定義（実装ファイルとの対応）

| レイヤー | 内容 | 実装箇所 |
|---------|------|---------|
| P0 | アーキタイプ重み漸減 | `computeArchetypeWeight(observationCount)` → `rankFactsForCategory` 内で `source === "archetype"` の rank を `/archetypeWeight` で劣後化 |
| P1 | 環境文脈（Life Context）注入 | `buildTaggedFacts` 内 `environmentContext` ループ → `source: "environment"` で tags: `["environment"]` |
| P2 | 仮説プール注入 | `buildTaggedFacts` 内 `hypothesisFacts` ループ → `status: "stable"/"strengthening"` かつ `confidence >= 0.5` のみ |
| P3 | ベースラインからのズレ | `detectBaselineDeviations` → `buildTaggedFacts` 内 `baselineDeviations`（magnitude 降順で最大1件、`>= 0.3` のみ） |
| P4 | 深掘りプローブ | `selectDeepeningProbe` → 5トリガー（narrative_recurring / hypothesis_needs_evidence / baseline_deviation_cause / structural_gap / cross_domain_split） |
| P5 | Micro Insight ゲート | `evaluateMIGate` + emotional_load 閾値（`>= 0.75` で提示しない） |
| P6 | 関係マップ（Person Map） | `buildTaggedFacts` 内 `personMapFacts` → `influence_score >= 0.5` かつ `mention_count >= 2`、最大2件 |

---

## 1. 適職（career カテゴリ）

**質問例**: 「今の仕事辞めて転職したほうがいいかな」

### Before（新規ユーザー: observationCount=0）

**facts 構成** (`buildTaggedFacts` の出力):
- `source: "axis"` — 軸スコアがデフォルト（0.5前後）のため、`intensity < 0.15` でほぼ全てフィルタアウト。生成される fact は 0-1 件
- `source: "archetype"` — アーキタイプ深層情報がそのまま入る:
  - `この人の強み: 分析力、構造化` (tags: `["strengths"]`)
  - `成長の鍵: 他者との共創` (tags: `["growth_key"]`)
  - `核心的な欲求: 理解されたい` (tags: `["core_desire"]`)
  - `ストレス下のパターン: 引きこもる` (tags: `["safe_stress"]`)
- `source: "context"` — homeContext があれば天気ラベルのみ
- `source: "environment"` — なし（Life Context 未蓄積）
- `source: "hypothesis"` — なし
- `source: "baseline"` — なし
- `source: "person"` — なし

**rankFactsForCategory の挙動** (career の優先順: `["environment", "strengths", "growth_key", "core_desire", "safe_stress", "core_wound"]`):
- `archetypeWeight = computeArchetypeWeight(0) = max(0.05, 1.0 / (1 + 0 * 0.08)) = 1.0`
- archetype fact の rank ペナルティなし → **全て archetype 由来で上位4件が埋まる**
- 結果: `["この人の強み: 分析力、構造化", "成長の鍵: 他者との共創", "核心的な欲求: 理解されたい", "ストレス下のパターン: 引きこもる"]`

**system prompt に含まれる個別情報**:
- アーキタイプ名（例: "探究者"）と事前定義の性格パターン
- career カテゴリの結論テンプレ: `[この人の強み/適性の理由]を考えると、〜の方向が合っている`
- ドメインオーバーレイ: `buildDomainOverlay` は work ドメインの傾向を出すが、軸スコアが中央付近のため汎用的

**想定される応答の特徴**:
- 「分析力がある」「理解されたい欲求がある」など**アーキタイプ由来の汎用的な記述**が根拠になる
- 具体的な職場環境・経済状況・人間関係への言及がない
- "ITエンジニアが向いています" 的な **職種マッチング** に陥りやすい（LLM が archetype の "分析力" から安易に推論するため）

---

### After（30セッションユーザー: observationCount=30、全データ蓄積あり）

**facts 構成の変化**:

**P0: アーキタイプ漸減**
- `archetypeWeight = computeArchetypeWeight(30) = max(0.05, 1.0 / (1 + 30 * 0.08)) = max(0.05, 1/3.4) = 0.294`
- archetype fact の rank 計算: `bestRank = Math.round(bestRank / 0.294)`
  - 例: strengths が priority index 1 だった場合 → `Math.round(1 / 0.294) = 3`
  - 例: growth_key が priority index 2 だった場合 → `Math.round(2 / 0.294) = 7`
- **結果: archetype fact は 4枠中 0-1枠に後退**。environment/hypothesis/baseline が上位を占める

**P1: 環境文脈 facts**
- `source: "environment"`, tags: `["environment"]` — career の priority index 0（最高優先度）
- 具体例:
  - `フリーランスで3年目` (confidence: 0.8, source: "user_stated")
  - `経済的に余裕がない状況` (confidence: 0.7, source: "user_implied")
  - `（推定）リモートワーク中心の生活` (confidence: 0.55, source: "inferred")

**P2: 仮説 facts**
- `source: "hypothesis"`, status: "stable", confidence: 0.6
- 具体例:
  - `（傾向）安定を求めているが、退屈に耐えられず変化を求める矛盾パターンがある` (tags: `["core_wound"]`, hypothesis_type: "contradiction_pattern")
  - `（傾向）仕事とプライベートで判断のリスク許容度が逆転する` (tags: `["impulse_caution"]`, hypothesis_type: "cross_context")

**P3: ベースラインズレ facts**
- `source: "baseline"`, 最大1件のみ注入
- 具体例:
  - `（変化検出）workの判断が普段と異なっている可能性` (magnitude: 0.4, tags: `["impulse_caution"]`)
  - 根拠: `detectBaselineDeviations` が work ドメインの goRatio ベースラインと今回の判断傾向を比較し、30%以上のズレを検出

**P6: 関係マップ facts**
- `source: "person"`, 高影響度の人物のみ（最大2件）
- 具体例:
  - `取引先の田中さん（取引先）は影響度の高い人物。関係にストレスを感じている` (influence_score: 0.7, sentiment_trend: "declining")

**rankFactsForCategory の結果**（上位5件、ドメインオーバーレイ追加で+1枠）:
1. `フリーランスで3年目` (environment, rank=0)
2. `経済的に余裕がない状況` (environment, rank=0)
3. `（変化検出）workの判断が普段と異なっている可能性` (baseline→impulse_caution, rank=?)
4. `（傾向）安定を求めているが退屈に耐えられず変化を求める矛盾パターン` (hypothesis→core_wound, rank=?)
5. `取引先の田中さんは影響度の高い人物。関係にストレスを感じている` (person→social_load, rank=?)

**追加注入**:

- **P4: 深掘りプローブ** — `selectDeepeningProbe` が発火する可能性:
  - trigger: `cross_domain_split` — 「仕事では慎重なのに、プライベートでは即断する傾向がある」仮説の検証
  - question_hint: `workとselfで判断傾向が異なるパターンが検出されている。なぜこの領域では違う判断をするのかを、ユーザー自身に考えさせる形で探る。`
  - 応答の末尾に自然に1文添えられる: 例「転職とプライベートの決断って、同じ感覚で決められる？」
  - 発火条件: `trustLevel >= 2` かつ `currentDomain` が仮説の domains に含まれる

- **P5: Micro Insight** — 収束していれば提示可能:
  - 例: `最近、「安定 vs 変化」に関する言及が3回連続で検出。presentation_type: "gentle_inquiry"`
  - suggested_prompt: `安定したいのに退屈に耐えられない、って前にも言ってた気がするけど、最近特に何かあった？`
  - 提示条件: `emotional_load < 0.75` かつ MI Gate 通過（1セッション1回、72h内1回）

**想定される応答の特徴**:
- "ITエンジニアが向いています" は **消える**。アーキタイプの "分析力" が facts 上位から脱落するため
- 代わりに: 「フリーランス3年で経済的にタイトな中、取引先との関係にストレスがある。普段は慎重なのに今日は転職に傾いている。安定を求めつつ変化を求める矛盾がある」という **この人固有の状況** から判断が組み立てられる
- 結論テンプレ `[この人の核心的な欲求/恐れ]があるから、〜を選ぶと長続きしやすい` に対して、P2 仮説の "安定 vs 変化の矛盾パターン" が根拠として使われる

---

## 2. 勉強（work カテゴリ）

**質問例**: 「資格の勉強を続けるべきか迷ってる」

### Before（新規ユーザー: observationCount=0）

**facts 構成**:
- `source: "axis"` — 0-1件（スコアが中央付近でフィルタアウト）
- `source: "archetype"` — アーキタイプの全情報が入る（archetypeWeight=1.0）
  - `根っこにある恐れ: 見捨てられること` (tags: `["core_wound"]`)
  - `盲点: 完璧主義に気づいていない` (tags: `["personality_blind"]`)
- `source: "context"` — 天気ラベルのみ
- environment/hypothesis/baseline/person — 全てなし

**rankFactsForCategory** (work の優先順: `["environment", "scatter_focus", "decision_speed", "temporal", "insight", "change_stress"]`):
- environment タグを持つ fact がないため、scatter_focus/decision_speed の archetype fact が上位
- 結果: archetype 由来の汎用的な判断傾向のみ

**想定される応答の特徴**:
- 「あなたは深く掘り下げるタイプだから続けた方がいい」のような汎用アドバイス
- 経済状況・勉強に使える時間・なぜこの資格なのか、への言及なし

---

### After（環境文脈に「フリーランス」「経済的にtight」蓄積、decision_shift ベースラインズレ検出）

**facts 構成の変化**:

**P0: アーキタイプ漸減**
- observationCount=30 → archetypeWeight=0.294
- archetype 由来の "根っこにある恐れ" は rank が `Math.round(元のrank / 0.294)` に悪化
- work の priority で core_wound は index 外（上位6タグに含まれない）→ rank=999 → `/0.294` = rank 3401 → 事実上消滅

**P1: 環境文脈 facts**（career で environment priority index=0 → 最高優先）
- `フリーランスで3年目。収入の波がある` (environment, rank=0)
- `経済的に余裕がない。固定費の支払いに追われている` (environment, rank=0)

**P2: 仮説 facts**
- `（傾向）自己投資の判断で「いつか役に立つ」と先延ばしにする傾向がある` (hypothesis_type: "recurring_pattern", tags: `["decision_speed"]`, work priority index=2)

**P3: ベースラインズレ facts** — ここが今回の着目点
- `detectBaselineDeviations` の判定:
  - emotional baseline: avgLoad=0.35, variance=0.04, 今回の emotionalLoad=0.55
  - z-score = (0.55 - 0.35) / sqrt(0.04) = (0.20) / 0.20 = 1.0 → **閾値1.5未満: emotional_spike は発火しない**
  - decision_shift: work ドメインの goRatio=0.65（普段は積極的）→ 今回は "迷っている"（observe_first）→ magnitude = |0.65 - 0| = 0.65 ≥ 0.3 → **発火**
  - 注入される fact: `（変化検出）workの判断が普段と異なっている可能性` (tags: `["impulse_caution"]`, work priority index 外だが rank は低め)

**rankFactsForCategory の結果**（上位5件）:
1. `フリーランスで3年目。収入の波がある` (environment, rank=0)
2. `経済的に余裕がない。固定費の支払いに追われている` (environment, rank=0)
3. `（傾向）自己投資で「いつか役に立つ」と先延ばし傾向` (hypothesis→decision_speed, rank=2)
4. `（変化検出）workの判断が普段と異なっている可能性` (baseline→impulse_caution, rank=?)
5. 軸スコアから生成された scatter_focus 系 fact（もしあれば）

**追加注入**:

- **P4: 深掘りプローブ** — `baseline_deviation_cause` トリガーが発火:
  - 条件: `baselineDeviations` に decision_shift (magnitude=0.65 ≥ 0.4) が含まれる
  - priority: `0.55 + 0.65 * 0.2 = 0.68`（高優先度）
  - question_hint: `workで普段と異なる判断傾向。この変化の原因（何があったか、最近の状況変化）を自然に探る。「普段と違うね」とは言わない。`
  - 応答末尾に添えられる質問例: 「最近、何か状況変わった？」
  - **「普段と違うね」とは絶対に言わない**（formatDeepeningProbeForPrompt の禁止事項）

- **P5: Micro Insight** — emotional_load=0.55 < 0.75 なので提示可能（Gate が通れば）
  - ただし、MI は判断本体ではなく「気づきの添え物」なので、勉強の質問に対して発火するかはシグナル収束次第

**想定される応答の特徴**:
- 「フリーランスで収入の波があり、経済的に厳しい中で資格の勉強に時間を使うべきか」という **この人の文脈で** 判断が構成される
- P3 の decision_shift により、「普段は仕事の判断で積極的なのに今回迷っている」ことが内部的に考慮され、**無理に "やるべき" と押さない**応答になる
- P4 の深掘り質問で、迷いの原因を探る1文が末尾に添えられる可能性がある
- 結論テンプレ `[今の状態/傾向の理由]なので、一度立ち止まった方がいい` が選択されやすい

---

## 3. 人間関係（contact/gathering カテゴリ）

**質問例A**: 「上司に相談しようか迷ってる」
**質問例B**: 「親友に本音を言おうか迷ってる」

### Before（person_map なし: observationCount=0）

**facts 構成**:
- `source: "axis"` — social_energy/harmony_autonomy のスコアが偏っていれば 1-2件
  - 例: social_energy=0.3 → `君は対人場面が続くと消耗しやすい。長時間の集まりの後は回復に時間がかかる` (tags: `["social_load"]`)
- `source: "archetype"` — archetypeWeight=1.0 で全量入る
- person/environment/hypothesis/baseline — 全てなし

**rankFactsForCategory** (contact の優先順: `["impulse_caution", "environment", "blindspot", "energy_state", "temporal", "insight"]`):
- social_load タグは contact の上位6に**含まれない** → 軸由来の対人消耗 fact は priority 外
- archetype の blindspot/impulse_caution が上位を占める

**RelationalLens の抽出** (`extractRelationalLens`):
- 「上司」→ target_role: "boss", interaction_purpose: "work", relational_temperature: "unknown"
- 「親友」→ target_role: "close_friend", interaction_purpose: "personal", relational_temperature: "unknown"
- **どちらも temperature/risk_direction は "unknown"** — person_map がないため推定不能

**想定される応答の特徴**:
- 上司の場合も親友の場合も、**同じ性格根拠**（archetype の impulse_caution）で回答
- 「相手との関係性」は relationalLens で role は取れるが、**感情・影響度・トレンドは不明** → 汎用的な "上司なら丁寧に" 程度

---

### After（person_map 蓄積あり）

**P6: 関係マップ facts — 上司の話の場合**

person_map に以下が蓄積:
- 上司: `{ label: "山田部長", role: "boss", influence_score: 0.7, sentiment_trend: "declining", last_sentiment: "negative", mention_count: 5 }`
- 親友: `{ label: "健太", role: "close_friend", influence_score: 0.6, sentiment_trend: null, last_sentiment: "positive", mention_count: 4 }`

**質問A「上司に相談しようか」の facts 構成**:

`buildTaggedFacts` が person_map から生成する fact:
- `山田部長（上司）は影響度の高い人物。関係にストレスを感じている。最近ネガティブな話題が多い` (source: "person", tags: `["social_load"]`)
- `健太（親友）は影響度の高い人物` (source: "person", tags: `["social_load"]`) — influence_score=0.6 ≥ 0.5, mention_count=4 ≥ 2 で通過

`rankFactsForCategory` (contact の priority):
- "social_load" は contact の priority リストにない → rank=999
- ただし person fact は上位2件のうち、質問中の「上司」に一致する fact が文脈的に重要
- **注意**: contact の priority は `["impulse_caution", "environment", "blindspot", "energy_state", "temporal", "insight"]` であり、social_load が明示的には上位にない。しかし environment (rank=1) に LifeContext fact がある場合はそちらが先行する

RelationalLens 強化:
- `extractRelationalLens` が "上司" を検出 → target_role: "boss"
- `buildRelationalContext` が role-purpose マトリクスから: risk_direction: "do_risky"（相談しないリスクの方が高い＝やったほうがいい方向）, communication_register: "polite"

**P1 環境文脈 + P6 の組み合わせ**:
- P1: `会社でのポジションに不満がある` (environment)
- P6: `山田部長...関係にストレスを感じている`
- → これらが合わさり、「上司との関係が悪化傾向にある中で相談するかどうか」という**具体的な状況判断**になる

**質問B「親友に本音を言おうか」の facts 構成**:

P6: `健太（親友）は影響度の高い人物` — sentiment は positive、trend は null（安定）
- → 上司の場合と全く異なる fact が注入される
- 上司: declining + negative → 慎重化バイアス
- 親友: positive + 安定 → リスク低い方向

**追加注入**:

- **P4: 深掘りプローブ** — `narrative_recurring` トリガーの可能性:
  - 「上司との関係」が narratives テーブルに mention_count=5 で蓄積されていれば発火
  - question_hint: `ユーザーは「上司との関係」について5回言及している。この繰り返しパターンの背景にある理由を探る`
  - 例: 「この話、前にもしてたよね。何がいちばん引っかかってる？」

**想定される応答の特徴**:
- **上司の話**: 「関係にストレスがある中での相談」→ 慎重寄りの判断（bounded_go: 相談するが、伝え方に条件をつける）+ 感情的な配慮
- **親友の話**: 「関係は安定している中での本音」→ 積極寄りの判断（full_go: 言った方がいい）+ 背中を押すトーン
- **同じ「誰かに何かを伝えるか」という構造でも、P6 の person fact が異なるため応答が変わる**

---

## 4. 感情が揺れている日の判断（emotional_load 高い状態）

**質問例**: 「もう全部やめたい」

### Before（emotional_load=0.2、平常時）

**facts 構成**:
- `estimateUserState("もう全部やめたい")` →
  - emotional_load: 推定 0.7-0.8（メッセージ単体からの推定は高く出る）
  - ただし Before シナリオでは平常の emotional_load=0.2 を想定（homeContext 由来）
- `source: "axis"` — emotional_regulation のスコアが偏っていれば 1件
- `source: "archetype"` — 全量

**State Layer の影響**:
- `computeStateAdjustment`: capacity 高い → `simplify_response: false`
- responseMode: 曖昧性次第だが、情報不足で `clarify` になりやすい（「何をやめたいの？」）

**P5: Micro Insight**:
- emotional_load=0.2 < 0.75 → MI 提示可能（Gate 次第）
- 気づきを提示するかもしれない: 「最近こういうこと多くない？」

**想定される応答の特徴**:
- clarify か conclude のどちらか
- conclude の場合は archetype ベースの一般的な「何がいちばん重いか考えてみよう」

---

### After（emotional_load=0.8、高負荷 + emotional_spike ベースラインズレ検出）

**P3: ベースラインズレ — emotional_spike**

`detectBaselineDeviations` の計算:
- emotional baseline: avgLoad=0.35, variance=0.04 (σ=0.20)
- 今回: emotionalLoad=0.8
- z-score = (0.8 - 0.35) / 0.20 = 2.25 → **閾値1.5 を超える: emotional_spike 発火**
- magnitude = min(1, |2.25| / 3) = 0.75
- 注入される fact: `（変化検出）今の感情負荷が普段より高い` (tags: `["energy_state"]`, source: "baseline")
- magnitude=0.75 ≥ 0.3 → `buildTaggedFacts` の最大1件の baseline fact として注入される

**State Layer の影響**:
- `estimateUserState`: emotional_load=0.8（メッセージ内容からも高く推定される）
- `computeStateAdjustment`:
  - `simplify_response: true`（capacity 低い）
  - emotional_load > 0.7 → **branch → conclude に降格**（route.ts L936-941）
  - skeleton の action_shape を1段階下げる（例: bounded_go → trial_then_decide）
- prompt 注入: `相手の感情的負荷が高い。まず受け取ること。分析より共感を先に` + `文体: やさしく短く。「〜だよね」「無理しなくていい」。押さない`

**P5: Micro Insight — 抑制**

route.ts L2120-2121:
```
&& (userState?.emotional_load ?? 0) < 0.75 // 感情的に重い時は気づきを差し込まない
```
- emotional_load=0.8 ≥ 0.75 → **insightPresented = false**
- MI 候補が収束していても、この閾値で**強制的に提示しない**
- 理由: 感情的に重い状態で「パターンが見えるよ」と言われても、受け取れない。共感が先。

**P3 fact の効果**:
- `（変化検出）今の感情負荷が普段より高い` が facts に入ることで、LLM は「普段と違う状態にある」ことを考慮
- ただし prompt 上は「普段と違うね」とは言わない（formatDeepeningProbeForPrompt の禁止事項）
- facts としてはプロンプト内部で参照されるが、ユーザーには見せない

**P4: 深掘りプローブ — baseline_deviation_cause**
- magnitude=0.75 ≥ 0.4 → 発火可能
- priority: 0.55 + 0.75 * 0.2 = 0.70（高い）
- question_hint: `感情負荷が普段より高い。この変化の原因を自然に探る。「普段と違うね」とは言わない。`
- **ただし**: emotional_load が高い状態で深掘り質問を添えるべきかは、LLM のプロンプト内で「無理に聞かない」「文脈に合わない場合は省略」と指示されている → LLM 判断で省略される可能性が高い

**Wound Activation**:
- 「全部やめたい」が registered wound のキーワードに一致すれば `computeWoundActivation` が発火
- `should_suppress_mi: true` になる可能性（傷の活性化スコアが高い場合）
- `caution_prompts` がプロンプトに注入: 例「この話題は相手にとって敏感な領域。踏み込みすぎない。判断を急がせない。」

**想定される応答の特徴**:
- **MI は出ない**（emotional_load ≥ 0.75）
- **branch は出ない**（State Layer が conclude に降格）
- 応答トーン: 短く、やさしく。分析ではなく共感が先
- 骨格の action_shape が1段階ダウングレード → 「まず今日一日をしのぐこと」のような **最小限の提案** に留まる
- P3 の "普段より感情負荷が高い" が内部的に考慮され、「これが一時的なものか、構造的な問題か」を慎重に扱う
- P4 の深掘り質問は LLM が「今は聞くタイミングではない」と判断して省略する可能性が高い

---

## まとめ: 何が変わるのか

| 観点 | Before（新規） | After（蓄積あり） |
|-----|---------------|-----------------|
| facts の source 構成 | archetype 100% | environment + hypothesis + baseline + person が上位を占め、archetype は 0-20% |
| 判断根拠 | 「あなたは〇〇タイプだから」（事前分布） | 「フリーランスで経済的にタイトな中、上司との関係が悪化傾向で」（実観測） |
| 人物への対応 | role ラベルのみ（boss/friend の汎用処理） | sentiment_trend + influence_score で応答トーンが変わる |
| 感情状態の配慮 | State Layer のルールベース推定のみ | ベースラインとの z-score 比較で「普段と違う」を検出 + MI 自動抑制 |
| 深掘り質問 | structural_gap フォールバックのみ | 5トリガー（recurring narrative / 仮説検証 / ズレ原因 / gap / ドメイン間矛盾）から最適な1問 |
| MI 提示 | Gate が通れば提示 | 感情高負荷で自動抑制 / 否定率フィードバックで全停止 / 傷活性化で抑制 |

**P0 の核心**: `computeArchetypeWeight(30) = 0.294` により、archetype fact の rank が `/0.294` = 約3.4倍に悪化。30セッションで archetype は facts 上位からほぼ消え、実観測データに置き換わる。これが「ITエンジニアが向いています」が消える仕組み。
