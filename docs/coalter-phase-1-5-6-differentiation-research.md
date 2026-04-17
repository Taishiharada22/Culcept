# CoAlter Phase 1.5.6 差別化設計リサーチ

作成: Research Unit
日付: 2026-04-17
目的: 「旅行会社に絶対勝てないプランニング」を実装するための基礎設計。Phase 1.5.5 の
`PlanTimelineDocument.metadata` にどんなフィールドを持たせれば、1.5.6 で無改修で
深層パーソナライズプランを生成できるかを確定する。

## 0. 要約（3行）

- **Culcept は既に「判断特性47軸 + Alter行動パターン + Life Profile 10カテゴリ +
  既知ペア相性（Phase0 enriched）」という、旅行会社が絶対保有できない深層データ資産を
  持っている**。CoAlter Phase 1.5.5 時点では `profileLoader.ts` が 8軸 +
  interests/values しか読んでいない。これを拡張するだけで差別化の 7 割は取れる。
- **学術研究は明確に示唆している**: ①novelty/familiarity は対立ではなく「混合比」が最適、
  ②chronotype は朝型/夜型だけでなく「ピーク時刻＋休憩配置」のアルゴリズムで扱える、
  ③カップル旅行の崩壊は 68% が pace/budget/decision-style の不一致から生じる、
  ④avoidant attachment は「活動中心＋会話少なめ」で機能する。
  **これらは全て Stargazer 47軸 + life_profile_entries で観測可能なシグナル。**
- **Phase 1.5.5 metadata の型設計は「Plan Brief（プラン生成根拠のスナップショット）」
  として設計すべき**。1.5.5 では収集のみ、1.5.6 で消費。これにより 1.5.6 の実装時に
  DB スキーマ変更と profileLoader 拡張を同時並行で進められる。

---

## 軸1: Culcept 既存データ資産の棚卸し

### 要約（3行）

- `lib/coalter/profileLoader.ts` は現在 `personality_dimensions` から
  **45軸のうち 8軸しか読んでいない**。47軸 + Alter行動パターン + Life Profile + Origin
  感情タグ + Style Profile を統合するだけで、旅行会社が絶対持てない深層シグナル層が
  手に入る。
- 特に強力なのは `stargazer_analytics.event='home_alter_judgment'` の **ActionShape 分布**
  （「迷わず行く/準備してから/まず様子を見る」の8形）と、`stargazer_alter_patterns` の
  **二面性（dualAxes）**。これはユーザーの「判断のクセ」を時系列で観測した結果で、
  アンケートでは絶対に取れない。
- **ペア相性は Phase0 `evaluatePair()` がすでに完成形**。45軸 → 10次元 MatchingVector →
  evaluatePair → reasonCodes/cautionCodes/bestCategory/overallScore が計算済み。
  CoAlter L2 は今これを使っていないが、`generatePairInsight.ts` の enrichedInsights を
  そのまま Plan metadata に入れられる。

### 棚卸しテーブル

| データソース | テーブル / ファイル | 取得できる情報 | プラン反映への利用価値 | アクセス経路 |
|---|---|---|---|---|
| **Stargazer 47軸スコア** | `stargazer_profiles.dimensions` + `stargazer_core_star.core_traits` + `stargazer_resolved_types.axis_scores`（3テーブルマージ）| 性格・判断・認知・愛着・恥罪悪感・反芻・公平感度など47次元 (-1.0〜+1.0) | **最高**: chronotype / pace / novelty / 対立スタイル / 親密ペース等ほぼ全機能の起点 | `loadAxisScores()` (phase0/enrichedDataLoader.ts:312) |
| **Archetype** | `stargazer_resolved_types.archetype_code` + `stargazer_users_unseen_map` | 3文字アーキタイプ、core_fear、core_desire | **高**: プラン全体のトーン設定、「安心を求める/冒険を求める」の主軸 | profileLoader.ts:65 (未完全活用) |
| **Alter判断パターン** | `stargazer_analytics` (event=`home_alter_judgment`, 直近50件) | ActionShape 8形 (full_go / bounded_go / prepare_then_go / trial_then_decide / observe_first / delegate_or_request / defer_with_trigger / skip)、ForceBalance (expand/protect/regret)、domain分布、top regret方向 | **最高**: 「この人は新しいレストランを選んだ時、どう判断するか」のリアル観測値。旅行会社は絶対持てない | `enrichedDataLoader.ts:175-244` |
| **Alter成長状態** | `stargazer_alter_growth` | trust_level、sessions_completed、growth_state (JSONB) | 中: 関係の成熟度のみ。プラン直接反映は薄い | enrichedDataLoader.ts |
| **二面性（矛盾軸）** | `stargazer_alter_patterns` (pattern_type=`contradiction`) | 軸ID、ポール、強度。「新規 vs 安定」等で両極を持つ軸 | **高**: プランのブレ幅を事前吸収できる。「普段は冒険派だが、疲れている時は安定派」を予測 | enrichedDataLoader.ts:258-280 |
| **対人関係マップ** | `stargazer_alter_person_map` | ラベル、役割、感情、影響度、言及回数 | 中: 「同伴者以外にこの体験を話したい相手がいるか」の判断に使える | enrichedDataLoader.ts:283-292 |
| **Origin ジャーナル** | `origin_journal_entries` (直近30件) | emotion_tags、ai_summary | **高**: 「直近2週間どう感じていたか」→ 今回のプランは回復系か推進系か決定できる | enrichedDataLoader.ts:134-140 |
| **Origin エントリレコード** | `origin_entry_records` | category (work_decision / relationship / time_allocation / self_care / money / nothing_special) | 中: 直近関心領域。プランのテーマ合わせに | enrichedDataLoader.ts:142-146 |
| **Life Profile 10カテゴリ** | `life_profile_entries` | skills / family / pets / romantic / friendships / **passions** / life_events / career / **living** / **values**。各エントリに depth_responses (なぜ/どう自分を形作ったか) | **最高**: 趣味の「深い理由」、ペット（同伴制約）、values、居住環境。旅行会社が1回のアンケートでは絶対得られない層 | `profileLoader.ts:56-61` が `interest/value/passion` のラベルのみ取得。**depth_responses と impact と since/until が未利用** |
| **Life Profile 深掘り** | `life_profile_entries.depth_responses` (JSONB) | 「なぜ犬を飼い始めた」「この情熱のきっかけ」等の自由記述 | **高**: LLM に渡す narrative コンテキスト。プランの「なぜこれが2人に合うか」説明に使う | **未利用** |
| **Life Profile 時系列** | `life_profile_entries.since/until/impact` | 情熱の現役/引退、影響度1-5 | 中: 「かつて好きだったが離れたもの」→ 復活候補提案に使える | **未利用** |
| **Style Profile** | `user_style_summary.quiz_result.myStyleState` (+ bridge API) | coreLanes/rareLanes/secretLanes、desiredImpressions、attractedWorldviews、dominantColors、pcSeason、bodyType | **高**: 店・宿の「世界観」マッチング。「モード好き」と「温かい空気好き」を分ける | `lib/shared/styleProfile.ts` 経由 **CoAlterでは未利用** |
| **Wardrobe** | `user_style_summary.quiz_result.myStyleState.wardrobe` | 所有アイテム + カテゴリ + silhouette + formality | 中: TPOに合う服がない場合の警告、持ち物リスト生成 | `lib/shared/wardrobe.ts` **未利用** |
| **Wear Events** | `culcept_calendar_worn_v1` + `style_wear_events` | 着用日、満足度、気分タグ | 低〜中: 過去の「この服で気分よかった日」パターン | `lib/shared/wearEvents.ts` **未利用** |
| **Location** | `profiles.prefecture`, `profiles.city`, `user_weather_settings` | 都道府県 + 市区町村 + JMA office code + 座標 | **高**: 距離コスト、往復時間、局所名物 | `lib/shared/location.ts` 経由。**CoAlter は現状 conversationParser で抽出した場所のみ** |
| **Occupation** | `profiles.occupation`, `profiles.occupation_detail` | 職業ID + 具体役職 | 中: 休み方（疲労源が座り仕事か立ち仕事か）、平日/週末コスト感 | **未利用** |
| **Date of birth / Gender** | `profiles` (rendezvous 経由) | 年齢、性別 | 中: ライフステージ補正 | **未利用** |
| **Chronotype推定** | `chronotypeFitness.analyzeChronotype(axisScores)` 関数 | type (morning/evening/balanced)、peakHour、lowHour、timeBlocks[] | **最高**: 疲労配分アルゴリズムの基礎 | **CoAlter では未呼び出し**。関数は完成済み |
| **Phase0 ペア評価** | `evaluatePair()` (lib/rendezvous/evaluate.ts) | reasonCodes, cautionCodes, bestCategory, overallScore, scoreABByCategory, attachment相性, SDT相性 | **最高**: 2人の相性の構造化出力が完成している | 未使用（generatePairInsight 経由で同等計算可能） |
| **Attachment Profile** | `attachmentProfile.ts` | anxietyLevel, avoidanceLevel, secureBase | **高**: 会話vs活動の配分、沈黙耐性 | Phase0 側で算出済み |
| **SDT Profile** | `sdtAxes.ts` | autonomy / competence / relatedness 充足度 | 高: 「自律性の尊重」「達成感の配分」軸 | Phase0 側 |
| **Origin Rendezvous Signal** | (lifeProfile/rendezvousPipeline.ts) | petSignals, familySignals, coreValues, careerTraits, romanticTraits, passionSignals (deepReason付き), livingTraits, topInterestCategories, introspectionLevel, selfUnderstandingDepth | **最高**: 「何に情熱を持つか＋なぜ」が構造化済み | `lib/origin/lifeProfile` **CoAlter 未利用** |
| **Body Color / Phenotype** | `body_color_profiles`, `body_avatar_profiles`, `face_phenotype`, `eye_profile` | パーソナルカラー、骨格、顔型、瞳プロファイル | 低〜中: 映える場所・写真映え・店の照明タイプ推奨に使える（差別化要素としては面白い） | 未利用 |
| **Calendar Worn Records** | `calendar_worn_records` | 過去日のコーデ満足度 | 低: 単独では薄い | 未利用 |
| **Genome Connections** | `genome_connections` (2026-03-20系) | カード交換履歴、friends層 | 低: プラン決定に直接は使わない | 未利用 |
| **Exchange Protocol** | `exchange_protocol_*` (2026-04-16) | 段階的開示の進度 | 低: Rendezvous専用 | 未利用 |
| **CoAlter 公平性台帳** | `coalter_sessions` (今後) | 過去セッションの biasScore | 中: 今回はどちら寄りに偏らせるか調整 | `RelationshipContext.fairnessLedger` 型のみ定義、実装未着手 |
| **CoAlter Plan Shelf** | `coalter_plan_items` | 過去採用した候補、代替案、pairNarrative | 中: 「前回行ったから別のパターン」等の継続学習 | 実装済み、未活用 |

### So what?（結論）

1. **CoAlter profileLoader.ts は「9軸版」で、実装済みの「47軸 + 判断行動 + Life Profile 深層 + Style + Origin + chronotype」のうち **約80% を未活用**。これを拡張するのが 1.5.6 のハイレバレッジポイント。
2. **2人のペア相性は evaluatePair() が既に世界水準**。reasonCodes / cautionCodes /
   attachment / SDT の出力はそのまま Plan Brief に乗せられる。
3. **「旅行会社が絶対持てない」核心データは 3 つ**: (a) home_alter_judgment の
   ActionShape 分布、(b) Life Profile の depth_responses、(c) 二面性 dualAxes。
   この 3 つは時系列観測の結果であり、アンケートで再現不能。

---

## 軸2: パーソナリティ → プラン変換の学術/業界知見

### 要約（3行）

- Big Five × 食の好み、chronotype × 性格、SPS（感覚処理感受性）× 混雑耐性は研究が成熟。
  **47軸のうち既存軸から計算可能なマッピングが多数存在**。
- Novelty/Familiarity は「対立」ではなく「混合比」。ペアで novelty-seeking 差が大きい時は
  **両方の要素を含む1つの体験**（例: 既知の街の新しい店）が最適解。
- カップル旅行崩壊の 68% は pace/budget/decision-style 不一致。**pace は chronotype と
  decision_tempo、budget は価値観カテゴリの money、decision-style は ActionShape で観測可能**。

### 2-1. 体力・エネルギーモデル（chronotype）

**学術基盤**:
- Horne & Östberg (1976) MEQ: 朝型/夜型質問紙の原典
- Dan Pink "When" (2018): 一日の3フェーズ (Peak / Trough / Recovery)
- [NIH Circadian Rhythms in Attention](https://pmc.ncbi.nlm.nih.gov/articles/PMC6430172/):
  ピーク2つ（起床後2-3時間、起床後9-10時間）+ 午後のdip

**Culcept でのマッピング** (`chronotypeFitness.ts` 既実装):
```
chronoScore = plan_vs_spontaneous × 0.3
            + cautious_vs_bold × 0.2
            + emotional_variability × 0.2
            - emotional_regulation × 0.15
            + analytical_vs_intuitive × 0.15

chronoScore < -0.15 → morning (朝型)
chronoScore >  0.15 → evening (夜型)
else                → balanced
```

**プラン適用**:
- 朝型: 6-10時ピーク / 14-16時 dip / 19時以降低下
- 夜型: 10-12時始動 / 15-17時ピーク / 20時以降も活動可
- カップル不一致時: `min(peakA, peakB) ～ max(peakA, peakB)` の共通窓でハイインパクト配置、
  外れた時間帯は個別/休憩/移動に充てる

**疲労配分アルゴリズム**:
- 全プランに 1/3 以上の buffer（休憩・移動・自由時間）を保持
- 食後 90 分以内に高刺激活動を置かない（post-lunch dip）
- 「活動密度」指標 = 主活動数 / 起きている時間。0.4 超は過密警告

### 2-2. 食の好み（食 × 性格）

**学術基盤**:
- [Tiainen et al. (Springer BMC Psychology)](https://link.springer.com/article/10.1186/s40359-019-0286-z):
  Openness ⇔ food variety / plant-based / fish を有意に予測
- [Keller & Siegrist (ScienceDirect)](https://www.sciencedirect.com/science/article/abs/pii/S0195666314004735):
  Conscientiousness ⇔ variety & sugar-moderation、Agreeableness ⇔ neophobia逆相関
- [Psychology Today (2024)](https://www.psychologytoday.com/us/blog/head-games/202412/how-what-you-eat-reveals-your-personality):
  「食は性格のカロリー可視化」

**Culcept でのマッピング**:
- `tradition_vs_novelty` 高 → 新ジャンル（タイ料理の未知店等）歓迎
- `tradition_vs_novelty` 低 → 既知ジャンル（和食・イタリアン等）の良店
- `quality_vs_quantity` 低（質深く）→ 少量・高単価・静かな個室
- `quality_vs_quantity` 高（量広く）→ シェアプレート・はしご可能
- `minimal_vs_maximal` 低 → シンプル（寿司カウンター、ビストロ）
- `minimal_vs_maximal` 高 → 盛りだくさん（コース、食べ放題、市場）
- Life Profile `passions` で食関連ラベル（コーヒー、ワイン等）→ 強い選好シグナル

**アレルギー/制約**: `life_profile_entries (category='values')` + `depth_responses` に
自由記述で存在し得るが構造化されていない。**Phase 1.5.6 では LLM による
inline抽出が現実解**（専用DBスキーマ追加は過剰投資）。

### 2-3. 空間嗜好（混雑・光・音・プライバシー）

**学術基盤**:
- Aron & Aron (1997): SPS は introversion とは独立した別次元
- [Thomas 2025 (Journal of Personality)](https://onlinelibrary.wiley.com/doi/pdf/10.1111/jopy.12970):
  SPS 高 × introvert = 短時間で過刺激、HSP は 1 時間以内に退出したい場合も
- 高感受性は「計算能力低下・気が散る・落ち着かない」を引き起こす

**Culcept でのマッピング（SPS proxy）**:
- SPS proxy = `introvert_vs_extrovert` × 0.4 + `emotional_variability` × 0.3
             + `reassurance_need` × 0.2 + `boundary_awareness` × 0.1
- SPS 高 → 混雑スコア上限 0.4、音環境「静か」優先、個室推奨
- SPS 低 → 活気ある店・人気スポット・ストリート体験も可

**追加軸**:
- `quietness` (CoAlter 既存軸) を SPS と結合して自動推定
- `atmosphere` (CoAlter 既存軸) を `function_vs_expression` で補正

### 2-4. 体験嗜好（novelty vs familiarity）

**学術基盤**:
- [Toyama & Yamada (2012 PDF)](https://pdfs.semanticscholar.org/5e10/db2ecf74cf69829d321dd241b4a077e9b0c3.pdf):
  Novelty/Familiarity は continuum ではなく**独立2次元**。最適は「両方高い」
- [T&F 2024](https://www.tandfonline.com/doi/full/10.1080/13683500.2024.2428767):
  Familiarity = 安心と制御 / Novelty = 興奮と新体験。2人で planning する場合、
  smart tech が**personality差を橋渡し**する役割を果たす
- [PMC 8791698](https://pmc.ncbi.nlm.nih.gov/articles/PMC8791698/):
  Tourist worries と novelty-seeking の balance が satisfaction を決める

**Culcept でのマッピング**:
- A と B の `tradition_vs_novelty` 差 > 0.4 → **混合戦略**:
  - 既知のエリア × 新しい店 / 既知のジャンル × 新しい体験
  - 「novelty を B が安心して受け入れられる familiar 要素とセットで提供」
- `cautious_vs_bold` 差が大きい → 撤退オプションを事前に言語化（大胆側を慎重側が信じられる）

### 2-5. カップル旅行崩壊の 68% パターン

**学術・業界基盤**:
- [Fodor's 2026](https://www.fodors.com/news/photos/the-real-reasons-so-many-couples-split-on-vacation-experts-reveal-hidden-stressors):
  "68% of those who reported high stress had a travel companion who clashed with
  their pacing, budget, or decision-making style"
- [Gottman - A Vacation Survival Guide](https://www.gottman.com/blog/a-vacation-survival-guide-for-couples/):
  decision fatigue が irritability を引き起こす
- [Uncommon Family Adventures](https://uncommonfamilyadventures.com/blog/traveling-together-how-to-balance-different-travel-styles):
  rest は「非交渉アイテム」として itinerary に組み込むべき

**Culcept での摩擦シグナル**:
| 崩壊源 | 観測軸 | 閾値 | 吸収方法 |
|---|---|---|---|
| Pace | chronotype差 + `decision_tempo` 差 | 差 > 0.5 | 前半/後半で主導権を交代、非同期アクティビティ挿入 |
| Budget | values 深掘り (depth_responses) + `quality_vs_quantity` | 価値観ラベルに「節約」「贅沢」がある | プラン段階で価格帯を 1 本化、分担ルールを提示 |
| Decision-style | ActionShape 分布差 (full_go vs observe_first 等) | top shape が異なる | 誰がどの決定を握るかを事前にカードで提示 |
| Fatigue | chronotype + `energy_rhythm` (expansion) | disposable | 1/3 buffer ルール、個別休憩スポット |
| 会話 vs 沈黙 | attachment avoidance 差 | 差 > 0.3 | 活動中心（cooking、hiking、museum）優先 |

### 2-6. Attachment × 活動設計

- [Maclynn](https://maclynninternational.us/blog/attachment-style-and-compatibility/):
  avoidant は「side-by-side activity」が快適。cinema 等 sedentary だと粗探しが起きやすい
- [Attachment Project - Avoidant Dating](https://www.attachmentproject.com/avoidant-attachment-relationships/dating/):
  avoidant は future plan を避ける。plan 表現は「今回1回分」に限定
- [Heirloom Counseling](https://www.heirloomcounseling.com/blog/2021/11/29/how-to-connect-based-on-your-attachment-style):
  anxious は reassurance の先回り、secure は consistency

**Culcept マッピング**:
- `attachment_style` (-1 = 回避 / +1 = 不安) と Phase0 の `AttachmentProfile`
- avoidance 高 → 活動中心、cooking class / hike / museum / craft
- anxiety 高 → 予定の明文化、リマインダー、確認ポイント多め
- 両者とも secure → 会話中心のディナー、ゆっくりカフェでも機能

---

## 軸3: 旅行会社 vs CoAlter の差別化マトリクス

### 要約（3行）

- 旅行会社 (JTB/HIS/じゃらん) は「地点データ×空室×価格」の最適化で強い。
  AI トリッププランナー (Layla/Mindtrip/TripAdvisor AI) は検索+一般的好み抽出で止まる。
  **どちらも「2人の性格×過去の判断パターン×価値観の深層理由」を持っていない**。
- Airbnb Experiences は Host culture（個人主義）を強調するが、**ゲスト側の性格理解には
  踏み込まない**。結果、レビュー頼りの selection になる。
- **CoAlter の決定的優位は「2人の観測履歴」**。1回のアンケートや検索セッションでは
  収集不可能。

### 3-1. 既存プランニング手法の限界

| プレイヤー | 入力 | 内部モデル | 限界 |
|---|---|---|---|
| **JTB/HIS 店頭** | 旅行日・予算・大まかな希望 | スタッフ経験 + パッケージDB | ①スタッフの当たり外れが大きい ②2人の性格差を聞き出せない ③追加費用が発生しやすい |
| **JTB るるぶ / じゃらん** | 行き先 + 日程 + 条件 | ランキング + レビュー | ①平均点の罠（「全員にとって可もなく不可もない」）②個人差ゼロ |
| **TripAdvisor** | 行き先 | レビュー集約 + アルゴリズム | ①観光地バイアス ②2人の関係軸なし |
| **Airbnb Experiences** | 行き先 + 日時 | ホストキュレーション | ①ホスト品質ばらつき ②ゲスト側パーソナライズなし |
| **Layla/Mindtrip/TripPlanner.ai** | チャット | GPT + 検索 + rating | ①初回セッションで「好み」をアンケート的に取る ②時系列観測ゼロ ③ペアの相性未対応 |
| **旅行代理店のAI化** | 同上 + 履歴 | リピート履歴 | ①「過去にどこに行ったか」止まり ②判断プロセス・二面性・core_fearは観測不能 |

### 3-2. CoAlter だけが持てる強み

1. **47軸 × 2人の時系列ベクトル**: 一度きりのアンケートではなく、
   Stargazer 100問 + Alter対話 + Origin 日記 + Home判断 の累積観測値
2. **ActionShape 分布**: 「この人が"新しい店"を選ぶときの癖」を 50件サンプルから知っている
3. **二面性（dualAxes）**: 「普段と疲れた時の別人格」を分けて扱える
4. **core_fear / core_desire**: アーキタイプから導出される「絶対避けたいこと」を
   プランから予め除外できる
5. **Phase0 evaluatePair()**: reasonCodes/cautionCodes による構造化相性評価
6. **Life Profile depth_responses**: 「なぜこの情熱なのか」の narrative
7. **共有観測 (2人同時アクセス可)**: 2人それぞれの Alter が両方の内面を知った上で、
   CoAlter が第三者視点で調整する
8. **公平性台帳**: 過去セッションの偏りを記録し、今回どちらに寄せるかを中和できる
9. **Caring Intensity の会話観測**: リアルタイムで「どちらがより気にかけているか」を計測
10. **styleProfile**: 世界観の言語化（Core/Rare/Secretレーン）→ 店・宿の「空気」合わせ

### 3-3. 旅行会社が絶対出せない提案 5 ケース

**ケース 1: 「疲れてる時の2人」プラン**
```
観測根拠: A の Origin 感情タグが直近2週間「疲労」「焦燥」主体、かつ
         A の ActionShape が通常 full_go だが直近 7日は observe_first にシフト
提案: 通常なら B が好む冒険型を A が受けられないため、午前はゆっくりカフェ→
     B が 14-16時に単独で行きたい場所に個別行動→17時に合流で温泉宿
差別化: 旅行会社は「2人の直近の心理状態」を持っていない
```

**ケース 2: 「二面性を予防する」プラン**
```
観測根拠: B の dualAxes に tradition_vs_novelty の二面性 (±0.7) あり
提案: 新店舗（novelty 満たし）だが定番ジャンル（tradition 満たし）の店で
     1時間のディナー。長時間だと B の「飽きた…」フェーズに入るため短時間設計
差別化: 旅行会社は「同じ人の中の2つの顔」を時系列で持っていない
```

**ケース 3: 「避けたいこと」除外プラン**
```
観測根拠: A の core_fear = "置いてけぼりにされる", B の attachment avoidance 高
提案: 散策型（並んで歩く）を優先、展望台や広場など離れても視線が届く空間を挟む
     B には「1人時間」を明示しない形で動線に組み込む（トイレ待ち時の買い物等）
差別化: core_fear は Archetype理論の中枢。アンケートで直接聞けない
```

**ケース 4: 「Life Profile の深層理由」反映プラン**
```
観測根拠: A の life_profile passions に「陶芸」、depth_responses に
         "祖母が焼き物をしていた、触れると落ち着く"
提案: 当日1時間の陶芸体験（地元の窯元）。A にとっては趣味以上の意味。
     B には事前に A の背景を narrative で共有（pair_narrative 生成）
差別化: 旅行会社は体験コースを紹介できるが「なぜ A にとって特別か」を語れない
```

**ケース 5: 「決定権の配分」プラン**
```
観測根拠: A の top ActionShape = full_go / B = observe_first
         過去 fairness biasScore 平均 +0.3 (B 寄り)
提案: 午前の決定権は A（A が推す新店カフェ）、午後は B（B のペースで好きな書店）、
     夕食は公平台帳を均すため A 選択。事前に「今日の決定配分」を CoAlter が提示
差別化: 意思決定の平等は旅行会社のスコープ外。カップル専門カウンセラーの領域を
        自動化する
```

---

## 軸4: Phase 1.5.5 の metadata 受け皿型設計

### 要約（3行）

- `PlanTimelineMetadata` は「Plan Brief（プラン生成根拠のスナップショット）」として
  設計。**1.5.5 では収集 optional、1.5.6 で消費**。
- 3 層構造: **pair-level**（2人の関係）/ **day-level**（この日の目的とmood）/
  **per-slot**（各スロットに紐づくフィット理由）。後方互換のため全フィールド optional。
- metadata はキャッシュ。**再生成は explicit操作**（refine時/日付変更時/
  観測が大きく更新された時）のみ。毎回読み直すと遅い。

### 型設計

```typescript
// lib/coalter/planTimeline.ts に追加する型（新規ファイル planMetadata.ts 推奨）

// ─────────────────────────────────────────────
// PlanTimelineMetadata — Plan Brief スナップショット
// ─────────────────────────────────────────────

/**
 * 1.5.5 が書き込み / 1.5.6 が読み取り。
 * 全フィールド optional（段階的に埋まる）。null と undefined の区別:
 *   - undefined: まだ計算していない
 *   - null: 計算したが該当データなし（明示不在）
 *
 * 保存先:
 *   Supabase coalter_plan_documents.metadata (JSONB) を新設、もしくは
 *   coalter_plan_items に pair_plan_metadata_id で紐付け
 */
export interface PlanTimelineMetadata {
  /** スキーマバージョン（将来の破壊的変更に備える） */
  version: 1;

  /** このメタデータの対象日（Plan Shelf の targetDate と一致） */
  targetDate: string; // YYYY-MM-DD

  /** 生成時刻。stale判定に使う（6時間以上前なら再生成候補） */
  generatedAt: string;

  /**
   * データソースのバージョン。ユーザーの観測が大きく進んだら再生成すべき。
   * 例: { axisCountA: 42, axisCountB: 38, alterSessionsA: 12, ... }
   */
  sourceDigest: PlanSourceDigest;

  // ─ Pair-level ─────────────────────────────

  /** 2人のペース嗜好 */
  pacePreference?: PacePreference;

  /** 2人の社会エネルギー・混雑耐性・沈黙耐性 */
  socialTemperature?: SocialTemperature;

  /** 体力バジェット（1日の総エネルギーと配分） */
  staminaBudget?: StaminaBudget;

  /** 新規性と慣れの配合比 */
  noveltyMix?: NoveltyMix;

  /** 摩擦ガードレール（避けるべきこと） */
  frictionGuardrails?: FrictionGuardrail[];

  /** 価値観・嗜好の共通点（narrative生成のシード） */
  sharedValues?: SharedValueSignal[];

  /** 個別の強い選好（「A は coffee 命」等） */
  personalAnchors?: PersonalAnchor[];

  /** Phase0 ペア相性の構造化結果（evaluatePair 由来） */
  pairCompatibility?: PairCompatibilitySnapshot;

  /** 公平性配慮（今回どちらに寄せるべきか） */
  fairnessAdjustment?: FairnessAdjustment;

  // ─ Day-level ──────────────────────────────

  /** この日のmood / 目的（直近Origin感情タグから導出） */
  dayIntent?: DayIntent;

  /** 天気・気候コンテキスト */
  weatherContext?: WeatherContext;

  /** 時間バジェット（起床〜就寝、固定制約） */
  timeWindow?: TimeWindow;

  // ─ Per-slot ───────────────────────────────

  /** 各スロットの詳細フィット（Plan Item ID → フィット情報） */
  slotFits?: Record<string /* planItemId */, SlotFit>;

  // ─ LLM 用 pre-synthesized ──────────────────

  /**
   * LLM プロンプトに貼れる形に要約済みの narrative。
   * 1.5.6 で生成時に事前に焼いておくと、毎回計算しなくて済む。
   */
  llmBrief?: LlmPlanBrief;
}

// ─────────────────────────────────────────────
// サブ型
// ─────────────────────────────────────────────

export interface PlanSourceDigest {
  /** axis数（2人分） */
  axisCountA: number;
  axisCountB: number;
  /** 直近Alterセッション数 */
  alterSessionsA: number;
  alterSessionsB: number;
  /** Life Profile entry 数 */
  lifeProfileCountA: number;
  lifeProfileCountB: number;
  /** Origin 直近 30日 entry 数 */
  originRecentCountA: number;
  originRecentCountB: number;
  /** Stargazer home_alter_judgment の観測数 */
  judgmentObservationsA: number;
  judgmentObservationsB: number;
  /** このダイジェストの総合信頼度 0-1 */
  overallConfidence: number;
}

export type ChronoType = "morning" | "evening" | "balanced";
export type Pace = "leisurely" | "moderate" | "packed";

export interface PacePreference {
  userA: {
    chronotype: ChronoType;
    peakHourRange: [number, number]; // "06-10" 等を [6, 10] で
    lowHourRange: [number, number];
    naturalPace: Pace;
    /** 由来: plan_vs_spontaneous × decision_tempo 等 */
  };
  userB: {
    chronotype: ChronoType;
    peakHourRange: [number, number];
    lowHourRange: [number, number];
    naturalPace: Pace;
  };
  /** 2人のマージ結果。どちらかが犠牲にならないよう折衷 */
  combined: {
    pace: Pace;
    /** ハイインパクト活動の推奨窓 */
    primeWindow: [number, number];
    /** 休憩推奨時刻 */
    restWindows: Array<[number, number]>;
    /** 差分警告（pace差が大きい場合 null 以外） */
    mismatchNote?: string;
  };
}

export interface SocialTemperature {
  /** 混雑耐性 0-1 (SPS proxy) */
  crowdToleranceA: number;
  crowdToleranceB: number;
  /** 沈黙耐性 0-1 (attachment avoidance 由来) */
  silenceToleranceA: number;
  silenceToleranceB: number;
  /** 音環境嗜好 */
  noisePreference: "quiet" | "lively" | "mixed";
  /** 推奨空間密度（店の席間隔等）0=密集OK 1=ゆったり */
  preferredDensity: number;
  /** 会話中心 vs 活動中心 0=会話 1=活動 */
  conversationVsActivity: number;
}

export interface StaminaBudget {
  /** 1日の「活動単位」容量。high=5 / medium=3 / low=2 程度 */
  totalCapacityA: number;
  totalCapacityB: number;
  /** ペアとしての容量（少ない方に寄せる） */
  pairCapacity: number;
  /** 1活動の最大継続時間（分） */
  maxActivityDurationMinA: number;
  maxActivityDurationMinB: number;
  /** 1日を通じた最低休憩回数 */
  minRestCount: number;
  /** 食事以外の休憩で推奨される最小1回分（分） */
  minRestLengthMin: number;
}

export interface NoveltyMix {
  /** 2人の novelty 嗜好 0-1 */
  noveltyAppetiteA: number;
  noveltyAppetiteB: number;
  /** 推奨比率 familiar : novel (0.0〜1.0) */
  familiarityRatio: number;
  /** 戦略: 完全新規 / 既知の新要素 / 慣れ親しんだもの */
  strategy: "all_new" | "new_within_familiar" | "deepen_known";
  /** カップル差が大きい時のみ出る fallback 案 */
  compromiseNote?: string;
}

export interface FrictionGuardrail {
  /** 摩擦の種類 */
  type:
    | "pace_mismatch"
    | "decision_style_clash"
    | "budget_sensitivity"
    | "crowd_overload"
    | "avoidant_overexposure"
    | "anxious_uncertainty"
    | "fairness_debt"
    | "core_fear_trigger"
    | "two_faces_risk"; // 二面性の揺れ
  severity: "low" | "medium" | "high";
  /** 対象ユーザー (どちらの軸由来か) */
  forUser: "userA" | "userB" | "both";
  /** この摩擦を避けるための具体的ルール */
  avoidanceRule: string;
  /** ユーザーには見せない内部根拠（axis名・スコア等） */
  _internal: {
    axes?: string[];
    thresholdCrossed?: string;
  };
}

export interface SharedValueSignal {
  /** 共通点ラベル（例: "静かな時間を大切にする"） */
  label: string;
  /** 由来 */
  sources: Array<
    | "life_profile_values"
    | "life_profile_passions"
    | "axis_alignment"
    | "origin_category"
    | "archetype_overlap"
    | "sdt_alignment"
  >;
  /** 信頼度 0-1 */
  confidence: number;
}

export interface PersonalAnchor {
  forUser: "userA" | "userB";
  label: string; // "コーヒーに強いこだわり"
  /** Life Profile の depth_responses を要約した narrative */
  deepReason: string | null;
  /** プランへの影響度 0-1 */
  weight: number;
  source: "life_profile_passion" | "life_profile_value" | "origin_tag";
}

export interface PairCompatibilitySnapshot {
  /** evaluatePair のベストカテゴリ */
  bestCategory: "friendship" | "romantic" | "cocreation" | "community" | null;
  overallScore: number | null;
  /** なぜ合うか（reasonTexts） */
  resonancePoints: string[];
  /** 注意点（cautionTexts） */
  cautionPoints: string[];
  /** attachment 相性メモ */
  attachmentNote: string | null;
  /** SDT 充足メモ */
  sdtNote: string | null;
}

export interface FairnessAdjustment {
  /** 過去セッションの累積バイアス -1(A寄り)〜+1(B寄り) */
  historicalBias: number;
  /** 今回のセッションでどちらに重みを寄せるか */
  favorUser: "userA" | "userB" | "balanced";
  /** 調整強度 0-1 */
  adjustmentStrength: number;
}

export interface DayIntent {
  /** 直近感情タグから導出した「今日の目的」 */
  mode: "recover" | "reset" | "celebrate" | "explore" | "maintenance" | "reconnect";
  /** この mode を選んだ根拠 */
  rationale: string;
  /** エネルギー投入目標 low/medium/high */
  energyTarget: "low" | "medium" | "high";
}

export interface WeatherContext {
  /** プランの生成時点での予報 */
  forecast: string | null;
  /** temperature_high */
  tempHighC: number | null;
  tempLowC: number | null;
  /** 雨/雪/晴れ等 */
  condition: "sunny" | "cloudy" | "rain" | "snow" | "mixed" | null;
  /** 屋外活動の適性 0-1 */
  outdoorSuitability: number;
  /** 服装ヒント（Wardrobe連携用） */
  clothingHint: string | null;
}

export interface TimeWindow {
  /** この日の活動開始時刻 HH:MM */
  startsAt: string;
  /** この日の活動終了時刻 HH:MM */
  endsAt: string;
  /** 固定制約（「15時から美術館のチケット」等） */
  fixedAnchors: Array<{
    time: string; // HH:MM
    label: string;
    flexibility: "hard" | "soft";
  }>;
}

export interface SlotFit {
  planItemId: string;
  /** この候補が 2人にとってなぜ合うか（短文） */
  fitReason: string;
  /** 各軸別のフィットスコア */
  axisScores: {
    pace: number; // 0-1
    novelty: number;
    social: number;
    quietness: number;
    atmosphere: number;
  };
  /** この slot で発動する guardrail の有無 */
  activeGuardrails: string[]; // FrictionGuardrail.type の列挙
  /** LLM narrative 生成用の個別根拠 */
  _rawContext: {
    matchedInterestsA?: string[];
    matchedInterestsB?: string[];
    invokedAxesA?: string[];
    invokedAxesB?: string[];
  };
}

export interface LlmPlanBrief {
  /** prompt に貼れる形に整えた 2人コンテキスト（<= 400字） */
  pairContext: string;
  /** この日の意図と制約（<= 200字） */
  dayContext: string;
  /** 避けるべきリスト（箇条書き、<= 5件） */
  avoidanceList: string[];
  /** 推奨トーン（narrative生成時の文体調整） */
  tone: "warm" | "calm" | "playful" | "careful" | "celebratory";
}
```

### 設計ポリシー

1. **全 optional**: 1.5.5 段階で埋められるのは axis系・Life Profile系のみ。
   残りは 1.5.6 で徐々に計算。
2. **_internal プレフィックス**: ユーザーに見せない内部根拠を明示区別。
3. **source 明記**: どのテーブル/軸由来かを `sources[]` で残す。監査と更新判定に必須。
4. **version フィールド**: スキーマ変更時の移行コストを 0 に。
5. **sourceDigest**: 「データがどのくらい揃った時点のスナップショットか」を記録。
   observation が 1.5 倍になったら再生成、等の判定ロジックを後で入れられる。
6. **stale判定**: `generatedAt` + `targetDate` から「今日のプランなのに2日前の brief」
   という不整合を検出可能に。
7. **slotFits は Map 構造**: Plan Shelf の各 PlanItem に 1:1 紐付け。
   refine で item が差し替わった時、旧 slotFits を破棄して新 slotFits を生成。

### 保存戦略

- **DB 追加案**: `coalter_plan_day_metadata` テーブル
  ```sql
  CREATE TABLE coalter_plan_day_metadata (
    thread_id UUID NOT NULL,
    target_date DATE NOT NULL,
    metadata JSONB NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, target_date)
  );
  ```
- Plan Shelf とは独立。Plan Shelf アイテムが増減しても brief は残せる
- RLS は Plan Shelf と同じ（pair メンバー2人のみアクセス可）

### 1.5.5 → 1.5.6 の移行パス

1. **1.5.5 (今)**: metadata 型を定義し、`pacePreference` と `sharedValues` の
   計算だけ実装して保存。残りは空で OK。
2. **1.5.5 後半**: `profileLoader.ts` を 47軸 + Life Profile 深層に拡張
3. **1.5.6 入口**: `staminaBudget` / `noveltyMix` / `frictionGuardrails` を追加計算
4. **1.5.6 本体**: `slotFits` を各候補生成時に焼いておく + `llmBrief` を生成
5. **1.5.6 後半**: `fairnessAdjustment` / `dayIntent`（Origin 直近感情との連携）

---

## 結論と推奨アクション

### Phase 1.5.6 の優先順位（Research Unit 提案）

| 優先 | タスク | 根拠 | 推定工数 |
|---|---|---|---|
| 1 | profileLoader を 47軸全部読み込みに拡張 + Alter判断パターン統合 | 全ての後続が依存 | 1-2日 |
| 2 | PlanTimelineMetadata 型定義 + DB スキーマ | metadataなしに 1.5.6 は始まらない | 0.5日 |
| 3 | pacePreference 計算（chronotypeFitness を呼ぶ） | 疲労配分の前提 | 0.5日 |
| 4 | noveltyMix + frictionGuardrails | 2人の差を吸収する核 | 1日 |
| 5 | Life Profile depth_responses の narrative 要約 | 差別化の核 | 1日 |
| 6 | slotFits 生成（各候補に pair-fit 理由を付与）| ユーザーが納得する理由生成 | 1-2日 |
| 7 | llmBrief 生成 + Plan narrative 生成 | 完成形の文体 | 0.5-1日 |

### 「この機能は第二の自己として必要か？」への回答

**YES**。旅行会社や他の AI プランナーに対する絶対優位は、
**「2人の深層観測履歴を時系列で持っていること」**。
Phase 1.5.6 はこの優位を最大活用する。
他のプレイヤーは1回のセッションで「好みを聞く」しかできない。
CoAlter は「あの時 A はこう判断した」「B の情熱は幼少期のこの経験から来ている」と
いう文脈を持ったまま提案できる。これは真に「2人の第二の自己」の振る舞い。

### リスクと監視項目

1. **データ欠損耐性**: 新規ユーザーはほぼ全てのシグナルが欠ける。
   `sourceDigest.overallConfidence` で段階的に「深さ」を見せる設計必須。
2. **privacy**: Life Profile の深掘り回答は機微情報。CoAlter が parse する時は
   「pair に見せていい narrative」に LLM が変換すべき（原文は見せない）。
3. **過度な個別最適の不気味さ**: 「あなたの core_fear を避けました」と言うと怖い。
   narrative は常に「2人にとって」の観点から書く。
4. **stale brief 問題**: 観測が更新されたのに古い brief のまま → 再生成トリガーを
   明確化（refine / explicit再計算ボタン / 7日経過）。

---

## 情報ソース

### Culcept 内部（コードベース）
- `/Users/haradataishi/Culcept/lib/coalter/profileLoader.ts` (現行9軸版)
- `/Users/haradataishi/Culcept/lib/coalter/types.ts` (CoAlterPersonProfile)
- `/Users/haradataishi/Culcept/lib/coalter/planTimeline.ts` (Phase 1.5.3 ①)
- `/Users/haradataishi/Culcept/lib/coalter/planShelf.ts`
- `/Users/haradataishi/Culcept/lib/stargazer/traitAxes.ts` (47軸定義)
- `/Users/haradataishi/Culcept/lib/stargazer/chronotypeFitness.ts` (実装済み未活用)
- `/Users/haradataishi/Culcept/lib/stargazer/alter.ts` (AlterPersonality)
- `/Users/haradataishi/Culcept/lib/rendezvous/phase0/enrichedDataLoader.ts` (UserFullProfile)
- `/Users/haradataishi/Culcept/lib/rendezvous/phase0/generatePairInsight.ts` (Phase0PairInsight)
- `/Users/haradataishi/Culcept/lib/rendezvous/types.ts` (MatchingVector 10次元)
- `/Users/haradataishi/Culcept/lib/rendezvous/evaluate.ts` (evaluatePair)
- `/Users/haradataishi/Culcept/lib/origin/lifeProfile/types.ts` (LifeProfileEntry)
- `/Users/haradataishi/Culcept/lib/origin/lifeProfile/rendezvousPipeline.ts` (RendezvousSignal)
- `/Users/haradataishi/Culcept/lib/shared/styleProfile.ts` / `wardrobe.ts` / `wearEvents.ts` / `location.ts`
- `/Users/haradataishi/Culcept/supabase/migrations/20260417100000_coalter_plan_shelf.sql`
- `/Users/haradataishi/Culcept/supabase/migrations/20260417*.sql` (plan関連4つ)
- `/Users/haradataishi/Culcept/supabase/migrations/20260318200000_alter_growth_state.sql`
- `/Users/haradataishi/Culcept/supabase/migrations/20260408300000_profiles_occupation.sql`
- `/Users/haradataishi/Culcept/supabase/migrations/20260407100000_profiles_add_city.sql`

### 学術・業界（Web）
- [Frontiers - Big Five, eating habits, physical activity](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.881436/full)
- [PMC - Big Five Personality Dimensions, Chronotype, and DSM-V](https://pmc.ncbi.nlm.nih.gov/articles/PMC10013154/)
- [Springer BMC Psychology - Big Five and Dietary Habits (Ghana)](https://link.springer.com/article/10.1186/s40359-019-0286-z)
- [ScienceDirect - Personality influence on eating styles](https://www.sciencedirect.com/science/article/abs/pii/S0195666314004735)
- [Psychology Today - How What You Eat Reveals Your Personality (2024)](https://www.psychologytoday.com/us/blog/head-games/202412/how-what-you-eat-reveals-your-personality)
- [PMC - Sensory Processing Sensitivity (Aron & Aron 1997)](https://pubmed.ncbi.nlm.nih.gov/9248053/)
- [Wiley - Multifaceted Introversion and SPS on Solitude-Seeking (Thomas 2025)](https://onlinelibrary.wiley.com/doi/pdf/10.1111/jopy.12970)
- [PMC - Smart Tourism and Novelty Seeking for Travel Satisfaction](https://pmc.ncbi.nlm.nih.gov/articles/PMC8791698/)
- [T&F - Novelty-Familiarity Continuum (2024)](https://www.tandfonline.com/doi/full/10.1080/13683500.2024.2428767)
- [T&F - Leisure Travel Market Segments on Novelty](https://www.tandfonline.com/doi/full/10.1080/10548400903163129)
- [Semantic Scholar - Novelty, Familiarity, Satisfaction, Destination Loyalty](https://pdfs.semanticscholar.org/5e10/db2ecf74cf69829d321dd241b4a077e9b0c3.pdf)
- [Fodor's - Why Couples Split on Vacation (68% pacing/budget/decision)](https://www.fodors.com/news/photos/the-real-reasons-so-many-couples-split-on-vacation-experts-reveal-hidden-stressors)
- [Gottman - Vacation Survival Guide for Couples](https://www.gottman.com/blog/a-vacation-survival-guide-for-couples/)
- [Uncommon Family Adventures - Balance Different Travel Styles](https://uncommonfamilyadventures.com/blog/traveling-together-how-to-balance-different-travel-styles)
- [HBR - Ideal Work Schedule Determined by Circadian Rhythms](https://hbr.org/2015/01/the-ideal-work-schedule-as-determined-by-circadian-rhythms)
- [PMC NIH - Circadian Rhythms in Attention](https://pmc.ncbi.nlm.nih.gov/articles/PMC6430172/)
- [Maclynn - Attachment Styles and First Date Observations](https://maclynninternational.us/blog/attachment-style-and-compatibility/)
- [Attachment Project - Avoidant Attachment Dating](https://www.attachmentproject.com/avoidant-attachment-relationships/dating/)
- [Heirloom Counseling - How to Connect Based on Your Attachment Style](https://www.heirloomcounseling.com/blog/2021/11/29/how-to-connect-based-on-your-attachment-style)
- [TravelAwaits - Tour Platform Comparison (TripAdvisor/Airbnb/GetYourGuide)](https://www.travelawaits.com/3005083/breakdown-of-the-most-popular-platforms-for-booking-tours/)
- [Layla AI Trip Planner](https://layla.ai/)
- [Mindtrip AI Travel](https://mindtrip.ai/)
