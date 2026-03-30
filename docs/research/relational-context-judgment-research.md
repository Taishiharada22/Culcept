# Relational Context & Judgment Research Report

## リサーチレポート: 判断における「関係性コンテクスト」の役割 -- Alter の次世代設計に向けて

日付: 2026-03-29

---

### 要約（3行以内）

現行 Alter は「自分はどういう人間か」（性格45軸 + ForceBalance）に基づく判断エンジンだが、同じ性格の人間でも「相手が誰か」「関係の構造がどうか」「何を目的としているか」で最適な行動は根本的に変わる。本レポートでは10領域の学術研究を横断し、Alter に不足している **Relational Context Layer** の設計要件を抽出する。結論として、現行の ForceBalance 7変数 + relation_value (low/medium/high) では関係性の構造を捉えきれず、最低でも **8つの新次元** を追加捕捉する必要がある。

---

## 1. Relational Frame Theory -- 関係の「フレーム」が判断を根本から変える

### 発見事項

Relational Frame Theory (RFT; Steven C. Hayes) は、人間の認知の基本単位が「関係づけ (relating)」であると主張する。2024年の HDML (Hyper-Dimensional Multi-Level) モデルでは、関係認知を ROE-M (Relationship, Orientation, Evocation, Motivation) の4側面で分析する枠組みが提示された。特に重要なのは **transformation of stimulus functions** -- ある刺激の行動的機能が、それが他の事象と持つ「関係フレーム」によって変容するという知見である。

人間関係においては、**dominance-submission frame** と **equivalence frame** の2つが基本フレームとして機能する。ある人が上司なのか友人なのかによって、同じ「連絡する」という行為の持つ心理的意味（stimulus function）が完全に変わる。

### 「連絡するべき？」への影響

| フレーム | 連絡の意味 | 最適行動 |
|---------|----------|---------|
| 上司（dominance-submission） | 報告義務、能力の証明 | prepare_then_go: 要件を整理してから |
| 友人（equivalence） | 自発的な好意、気軽さ | full_go / bounded_go: 気軽に送る |
| 元恋人（複合: 旧equivalence + 現在のambiguity） | 執着 or 成長、相手にとっての侵入リスク | observe_first → 自問を促す |
| 疎遠な知人（weak equivalence） | 関係メンテナンス、表面的 | defer_with_trigger: 用件がなければ不要 |

**現行の問題**: `relation_value: low/medium/high` は関係の「強さ」だけを測っている。フレームの「種類」が欠落しており、上司(high + dominance) と親友(high + equivalence) が同じ `high` になってしまう。

### 捕捉すべき変数

- **relationship_frame**: dominance / equivalence / caregiving / rivalry / ambiguous
- **frame_stability**: このフレームは安定しているか、移行中か（例: 同僚→恋人）

---

## 2. Social Psychology of Judgment -- 文脈・聴衆・権力が判断を歪める

### 発見事項

Social Judgment Theory (SJT) は、判断が既存の信念を「アンカー」として、受容域 / 拒否域 / 非関与域 の3つの範囲で処理されることを示す。重要なのは **ego involvement** -- そのテーマへの自己関与度が高いほど、受容域は狭くなり、判断は極端になる。

Nature (2025) の研究では、信頼性判断において「グループ平均」ではなく **個人固有の分散** が意味を持つことが示された。さらに、同じ人物の信頼性でも「子供を預けられるか」と「車を修理してもらえるか」で文脈依存的にカテゴリが変わる。

権力の効果も顕著で、権力を持つ側は行動がリスク許容的になり、持たない側は社会規範に過剰適合する。**Group polarization** により、集団の空気が個人の判断をその方向に増幅する。

### 「連絡するべき？」への影響

同じ「連絡するべき？」でも、**誰がその場にいるか（聴衆効果）** で判断が変わる。例えば:
- 恋人と一緒にいるときに元恋人に連絡 → 聴衆効果で心理的コストが爆増
- 職場で私的な連絡をするか → 社会規範の圧力
- グループLINEで個人的な話題を出すか → 聴衆の構成次第

**現行の問題**: ForceBalance は「本人 vs. 行為」の2者関係しかモデリングしていない。「誰がこの判断を見ているか」「どの集団規範が作用しているか」が未考慮。

### 捕捉すべき変数

- **audience_presence**: この判断を知っている/見ている他者は誰か
- **social_norm_pressure**: この行為に対する社会的な期待/圧力の方向性（やるべき / やるべきでない / 中立）
- **power_differential**: 相手との権力関係 (-1.0 自分が弱い ~ 0 対等 ~ +1.0 自分が強い)

---

## 3. Attachment Theory -- 愛着スタイルが「同じ状況」で真逆の行動を生む

### 発見事項

Attachment Theory の成人関係への適用研究は、同じ状況に対して愛着スタイルによって **正反対の行動** が生まれることを示す。

| スタイル | 分離時の行動 | 連絡パターン | 再接触時 |
|---------|------------|------------|---------|
| 安定型 (Secure) | 自然に距離を取れる | 必要に応じて | 素直に喜べる |
| 不安型 (Anxious) | 強い不安、携帯を頻繁に確認 | 過剰に確認を求める | 怒りと安堵の混合 |
| 回避型 (Avoidant) | 感情を自覚しない、距離を取る | 連絡しない、受動的 | 親密さを避ける |
| 恐れ型 (Disorganized) | 混乱、接近と回避の交互 | 不規則、予測不能 | 近づきたいが怖い |

PMC の研究によれば、不安型は「相手から連絡が来ないこと」をトーン分析的に解釈し（「怒っているのか」「嫌われたか」）、回避型は「連絡するべき」と頭で分かっていても身体が動かない。

重要なのは、愛着スタイルは **関係固有** であるという知見。同じ人間が上司にはSecure、恋人にはAnxious、親にはAvoidant ということが起こり得る。

### 「連絡するべき？」への影響

Alter が「連絡した方がいい」と判断しても:
- 不安型ユーザー → 「やっぱりダメだった」の確認に使いがち → Alter は「返信がなくても大丈夫」まで言うべき
- 回避型ユーザー → 「連絡すべき」と分かっても行動に移せない → Alter は行動のハードルを下げる具体案（「スタンプ1個でいい」）を出すべき
- 不安型が回避型に連絡 → 最も危険なパターン。連絡しすぎは関係を悪化させる

**現行の問題**: `regret_if_skip` / `regret_if_do` はユニバーサルな後悔予測だが、愛着スタイルごとに後悔の質と強度が完全に異なる。不安型の regret_if_skip は「見捨てられ不安」、回避型の regret_if_do は「自律性の喪失」。

### 捕捉すべき変数

- **user_attachment_style**: この相手に対するユーザーの愛着傾向 (secure / anxious / avoidant / disorganized)
- **target_attachment_style_estimate**: 相手の推定愛着傾向（行動パターンから推測）
- **attachment_interaction_risk**: 2者の愛着パターンの組み合わせリスク

---

## 4. Ecological/Situated Cognition -- 環境は「入力」ではなく判断の構成要素

### 発見事項

Gigerenzer の ecological rationality は「合理性とは環境の構造とヒューリスティクスの適合度」だと定義する。しかし Vernon Smith 系の situated cognition はさらに踏み込み、**環境は認知の外部入力ではなく、認知システムの一部** だと主張する。

"Cognition is situated, time pressured, we off-load cognitive work onto the environment, the environment is part of the cognitive system, and cognition is for action."

つまり「今どこにいるか」「何時か」「誰といるか」は判断の「条件」ではなく、判断そのものの一部である。2025年のケンブリッジ大学の研究も、環境-心的相互作用をACT-Rでモデリングし、環境制約が認知戦略の選択そのものを規定することを示した。

### 「連絡するべき？」への影響

- 夜23時にベッドで1人 → 内省的判断。感情が増幅される。lonely contact リスク
- 朝の通勤電車 → 短時間・実用的判断。効率的な連絡は自然
- 飲み会の帰り → 判断力低下 + 感情増幅。Alter は「明日もう一度考えて」を推奨すべき
- 相手と物理的に近い場所 → 「直接言う」が最適解になり得る

**現行の問題**: `weather` や `constellation` はコンテクスト情報として存在するが、「時間帯」「場所」「身体状態」といった判断の基盤環境が捕捉されていない。環境を「付加情報」ではなく「判断構造の一部」として再設計すべき。

### 捕捉すべき変数

- **temporal_context**: 時間帯 + 曜日（深夜判断は別カテゴリ）
- **physical_context**: 一人 / 相手と同席 / 第三者がいる
- **cognitive_state**: 飲酒・疲労・感情的高揚などの判断力変調要因

---

## 5. Risk Perception Asymmetry -- 同じ行為が関係性で全く異なるリスクプロファイルを持つ

### 発見事項

Murray らの Risk Regulation System 研究は、人間関係における自己評価と拒絶リスクの連動を示す。重要な発見は、"psychological features of the situation correspond to characteristics of an interaction partner in a particular context" -- つまり同じ行為でも、相手が誰かによってリスクの構造が質的に変わる。

さらに、"the very same action -- depending on a person's psychological state, current needs, and overall abilities -- could be a risk taken willingly, an impulse regretted immediately, a last resort when cornered, or child's play for the highly skilled" という知見は、リスクが行為に内在するのではなく **行為者 x 相手 x 状況の関数** であることを示す。

### 「連絡するべき？」のリスクマトリクス

| 相手 | 連絡するリスク | 連絡しないリスク | 非対称性 |
|-----|-------------|--------------|---------|
| 親友 | ほぼゼロ（多少変な時間でもOK） | 疎遠化（ゆっくり進行） | 低リスク |
| 上司 | 内容次第で評価に直結 | 報告遅延で信頼喪失 | 内容精度が全て |
| 元恋人 | 相手の回復を妨害、自分の依存強化 | 「もう終わった」の受容が進む | やらないリスクの方が低い |
| 取引先 | タイミングが悪いと不快感 | ビジネスチャンス喪失 | やるリスク < やらないリスク |
| 片思い相手 | 拒絶、以後気まずい | 永遠に進展しない | 最大の非対称性。Alter が最も価値を出せる |

**現行の問題**: `regret_if_skip` と `regret_if_do` は対称的なスカラー値だが、リスクの **質** が根本的に異なる。上司への連絡を躊躇するリスクは「キャリア損害」、元恋人への連絡リスクは「心理的退行」。同じ0.7でも比較不能。

### 捕捉すべき変数

- **risk_type_if_do**: この行為のリスクの質（reputation / emotional / relational / career / physical）
- **risk_type_if_skip**: しないリスクの質（同上）
- **risk_asymmetry_score**: do vs skip のリスク重大度の非対称性 (-1.0 やる方が危険 ~ +1.0 やらない方が危険)

---

## 6. Japanese Cultural Context -- 内/外、甘え、空気が判断を構造的に支配する

### 発見事項

日本の対人関係には、判断エンジンの設計に不可欠な3つの構造がある。

#### 6a. 内/外 (Uchi/Soto)

日本人は常に（ほぼ無意識に）相手が「内」か「外」かを判定し、それに応じて言語・態度・距離感を切り替えている。これは静的分類ではなく **動的で文脈依存** -- 同じ同僚でも、社内では「内」、取引先の前では「外（の代表）」になる。

Waseda大学の研究（2023）では、空気を読む (KWY) が3層構造 -- **(1)知覚**: 周囲の人・規範・暗黙の文脈への気づき、**(2)態度**: 配慮・同調・責任・調和維持、**(3)行動**: 柔軟性・協力・主体性 -- であることが示された。

#### 6b. 甘え (Amae)

土居健郎の概念。「他者の好意に甘え、依存できること」が日本の関係性の基盤。しかし甘えが許される相手は限定的で、uchi/soto の境界と完全に連動する。uchi の相手には甘えが許される（むしろ期待される）が、soto の相手に甘えるのは非常識。

重要なのは、甘えは受動的な依存だけでなく、**能動的に目標を達成する手段、愛情を試す手段、親密さを強化する手段** としても機能するという現代的理解。

#### 6c. 遠慮 (Enryo) と 察し (Sasshi)

遠慮 = 自己表現の抑制。察し = 非言語的な共感的推測。この2つは対になっており、「言わなくても分かってほしい」と「言われなくても分かるべき」が社会的に機能する。

### 「連絡するべき？」への影響

日本文化コンテクストでは、「連絡するべき？」の答えは uchi/soto の境界で決定的に変わる:

- **内の相手**: 甘えが許される。「なんとなく連絡した」が最もポジティブに解釈される。逆に連絡しないと「壁を作っている」と解釈されるリスク。
- **外の相手**: 用件がない連絡は不自然。「何か用があるのか」と警戒される。
- **内→外に移行中の相手**（例: 喧嘩した友人）: 最もデリケート。連絡の仕方自体が「まだ内にいたいか」のシグナルになる。
- **外→内に移行させたい相手**（例: 気になる人）: 距離の詰め方がカギ。急すぎると「空気が読めない」、遅すぎると「興味がない」。

**現行の問題**: Alter は完全に uchi/soto ブラインド。日本語で動作するサービスとして、この構造を無視していることは致命的。

### 捕捉すべき変数

- **uchi_soto_position**: 相手は内か外か（内 / 内寄り / 中間 / 外寄り / 外）
- **uchi_soto_trajectory**: 内→外 に移行中か、外→内 に移行中か、安定か
- **amae_allowance**: この相手に甘えが許される度合い (0.0-1.0)
- **enryo_expectation**: この相手にどの程度の遠慮が期待されるか (0.0-1.0)

---

## 7. Dyadic Decision Theory -- 2人で決める判断は本質的に異なる

### 発見事項

Kelley & Thibaut の Interdependence Theory は、対人判断の核心を **outcome transformation** に置く。人間は「自分にとっての利得（given matrix）」から「関係性を考慮した利得（effective matrix）」に変換して行動する。この変換過程こそが、利己的行動と向社会的行動を分ける。

式: **I = f(A, B, S)** -- 相互作用(I) は、自分(A)と相手(B)と状況(S)の関数。

重要なのは **transformation の種類**:
- 配向ベース（orientation-based）: 協調志向（共同利益最大化）、公平志向（差異最小化）
- ルールベース（rule-based）: しっぺ返し、一般的互恵性

さらに、PMC (2022) の研究では、ダイアディック意思決定においてパートナーの不確実性が自分の不確実性に影響することが示された -- 相手が迷っていると自分も迷う。

### 「連絡するべき？」への影響

「連絡するべき？」は実は3種に分解される:
1. **自分だけの判断**: 相手の意見を聞く必要がない（例: 疎遠な人への久しぶりの連絡）
2. **相手を巻き込む判断**: 連絡自体が相手に行動を要請する（例: 謝罪、誘い）
3. **2人で決める判断**: 連絡は合意形成の入口（例: 予定調整、関係の方向性）

現行 Alter はすべてを1として処理しているが、2と3は相手の反応予測が不可欠。

**transformation の適用**: ユーザーが「自分は連絡したい」と思っていても、「相手にとってどうか」を考慮するよう促すのが Alter の仕事。

### 捕捉すべき変数

- **decision_type**: solo / involves_other / joint
- **outcome_interdependence**: この行為の結果は相手の行動に依存するか (0.0-1.0)
- **transformation_tendency**: ユーザーのこの相手に対する利益変換傾向（prosocial / individualistic / competitive）

---

## 8. Communication Accommodation Theory -- 関係によってコミュニケーション自体が変わる

### 発見事項

Howard Giles の Communication Accommodation Theory (CAT) は、人間が対話相手に合わせてコミュニケーションスタイルを収斂（convergence）または発散（divergence）させることを示す。

- **Convergence**: 好意・承認・帰属の欲求 → スタイルを近づける
- **Divergence**: アイデンティティ維持・距離確保 → スタイルを遠ざける
- **Over-accommodation**: 過度な収斂は見下しと解釈される

CAT では、4つの社会心理学的基盤が指摘される:
1. 類似性-魅力仮説: 似ているほど惹かれる
2. 社会的交換: コスト-報酬の計算
3. 因果帰属: 相手の行動の原因推定
4. 集団間弁別: 集団アイデンティティの維持

特に権力差がある関係では、低地位の側が高地位の側に convergence する傾向が強い。

### 「連絡するべき？」への影響

Alter は「連絡するか」だけでなく **「どう連絡するか」** まで提案すべき。同じ「連絡する」でも:

- 上司に → 敬語、要件明確、短文（convergence to power）
- 親友に → タメ口、用件不要、スタンプもOK（equivalence convergence）
- 元恋人に → 感情を抑えた中間的トーン（strategic maintenance）
- 目上の知人に → 丁寧だが堅すぎない（calibrated convergence）

**現行の問題**: ActionShape は「行くか行かないか」のスペクトラムだが、「どういうトーンで」が完全に欠落している。prepare_then_go の「準備」とは具体的にどの水準のコミュニケーション調整を意味するのかが不明。

### 捕捉すべき変数

- **communication_register**: この相手に適切なコミュニケーション水準（casual / neutral / formal / strategic）
- **convergence_direction**: 今のやり取りで収斂すべきか発散すべきか

---

## 9. Purpose-Driven Judgment -- 目的が変われば最適解が変わる

### 発見事項

Self-Determination Theory (SDT) の Goal Contents Theory は、目標を内発的（親密さ、成長、コミュニティ）と外発的（評価、外見、名声）に分類し、目標の種類そのものが行動の質を規定することを示す。

Miami大学の研究は、目標追求の対人次元として4つを特定:
1. **Goal Support**: 他者からの支援
2. **Joint Pursuit**: 共同での追求
3. **Stewardship**: 他者への責任感
4. **Accountability**: 説明責任

さらに、**Partner Goal Contagion** -- パートナーの目標を自分のものとして取り込む現象 -- は、関係性が目標自体を変容させることを示す。

### 「連絡するべき？」への影響

同じ「連絡するべき？」でも目的が異なれば最適解が完全に変わる:

| 目的 | 最適な ActionShape | トーン | タイミング |
|-----|-------------------|-------|----------|
| 謝罪 | prepare_then_go | 真剣、誠実 | 早い方がいい |
| 再接続 | bounded_go | 軽い、nostalgic | 自然なきっかけ（誕生日、季節） |
| 境界設定 | prepare_then_go | 明確、非攻撃的 | 冷静なとき |
| 助けを求める | full_go or bounded_go | 脆弱、正直 | 相手の余裕があるとき |
| 情報確認 | full_go | 事務的 | 営業時間内 |
| 関係テスト（相手の態度を見たい） | observe_first → 自問を促す | -- | Alter は目的自体を問い直すべき |

**現行の問題**: `HomeAlterContextData` にユーザーの「目的」を入れるフィールドがない。Alter はクエリのテキストから推測するしかないが、目的は明示されないことが多い。

### 捕捉すべき変数

- **interaction_purpose**: apologize / reconnect / set_boundary / ask_help / inform / test_relationship / maintain / deepen / end
- **purpose_clarity**: ユーザー自身がこの目的を自覚しているか (0.0-1.0)
- **hidden_purpose_risk**: 表面的な目的と本当の目的がズレている可能性

---

## 10. Temporal Dynamics -- 関係の歴史と軌道が「今」の判断を規定する

### 発見事項

Eastwick ら (2019) の **Relationship Trajectories Framework** は、関係を「2人が出会った瞬間から始まる評価の弧（arc）」として概念化する。情熱や満足度は平均的には時間とともに低下するが、個人差が大きい。

Schilke, Reimann, & Cook (2013) の神経画像研究は特に重要:
- **信頼違反が早期の関係で起きた場合**: 制御的な社会認知（C-system）が活性化 → 慎重な再評価
- **信頼違反が後期の関係で起きた場合**: 自動的な社会認知（X-system）が活性化 → 既存の信頼パターンに依拠

つまり、**関係の長さが信頼回復のメカニズムそのものを変える**。

Kim, Dirks, & Cooper (2009) の trust repair モデルでは、信頼修復が **inter-temporal elaboration** を含むことが示された -- 過去の責任を認めつつ、修正可能だと主張するトレードオフ。

### 「連絡するべき？」への影響

- 10年の友人が3ヶ月疎遠 → 「久しぶり」で回復可能。X-system（自動的信頼パターン）が機能する。
- 3ヶ月の恋人が1週間音信不通 → 深刻な信号。C-system（制御的再評価）が必要。関係の軌道が下降中。
- 上司との関係が良好→最近ミスした → 信頼修復の文脈。早期の連絡が有効。
- かつて裏切られた相手から連絡が来た → 関係履歴が risk perception を支配。Alter は慎重な observe_first を推奨すべき。

**現行の問題**: `temporalDelta` は存在するが、「関係全体の軌道」ではなく「ユーザーの心理変化」を追跡している。関係そのものの temporal arc が未モデリング。

### 捕捉すべき変数

- **relationship_duration**: 関係の長さ（日/月/年）
- **relationship_trajectory**: 上昇中 / 安定 / 下降中 / 断絶後
- **last_interaction_gap**: 最後のやり取りからの時間
- **trust_breach_history**: 信頼違反の履歴（回数、深刻度、修復状況）
- **relationship_stage**: formation / deepening / maintenance / decline / repair / termination

---

## 統合インサイト: 現行 Alter の構造的限界と拡張アーキテクチャ

### 現行システムの分析

現行の `alterHomeAdapter.ts` は以下の構造:

```
ユーザー質問 → JudgmentFramework (personality + context)
  → ForceBalance (7連続変数)
  → ActionShape (6離散形)
  → 応答生成
```

**構造的限界**:
1. **1者モデル**: 「自分はどういう人間か」しか見ていない
2. **relation_value の貧困さ**: low/medium/high の1次元
3. **目的の不在**: なぜこの行動をしたいのかが構造化されていない
4. **文化コンテクストの不在**: uchi/soto、敬語水準が完全ブラインド
5. **時間軸の不在**: 関係の歴史と軌道がない
6. **環境の不在**: いつ・どこで・誰といるときの判断かが不明
7. **リスクの質的区別の不在**: すべてのリスクが同じスカラー値

### 提案: Relational Context Layer

ForceBalance と ActionShape の間に **Relational Context Layer** を挿入する。

```
ユーザー質問
  → JudgmentFramework (personality + context)
  → ForceBalance (7変数: 本人の内部状態)
  → ★ RelationalContext (新規: 関係性の構造) ★
  → AdjustedForceBalance (関係性で調整された内部状態)
  → ActionShape (6離散形)
  → CommunicationGuidance (新規: どう伝えるか)
  → 応答生成
```

### RelationalContext の構造案

```typescript
interface RelationalContext {
  // 1. Relational Frame (Section 1)
  relationship_frame: 'dominance' | 'equivalence' | 'caregiving' | 'rivalry' | 'ambiguous';
  frame_stability: 'stable' | 'transitioning' | 'unstable';

  // 2. Social Context (Section 2)
  audience_presence: string[];  // この判断を知る第三者
  social_norm_pressure: number; // -1.0 (やるべきでない) ~ +1.0 (やるべき)
  power_differential: number;   // -1.0 ~ +1.0

  // 3. Attachment Dynamics (Section 3)
  user_attachment_toward_target: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
  attachment_interaction_risk: number; // 0.0-1.0

  // 4. Situated Context (Section 4)
  temporal_context: 'morning' | 'daytime' | 'evening' | 'late_night';
  cognitive_impairment_risk: number; // 0.0-1.0 (飲酒、疲労、感情的高揚)

  // 5. Risk Profile (Section 5)
  risk_type_if_do: 'reputation' | 'emotional' | 'relational' | 'career' | 'none';
  risk_type_if_skip: 'reputation' | 'emotional' | 'relational' | 'career' | 'none';
  risk_asymmetry: number; // -1.0 (do が危険) ~ +1.0 (skip が危険)

  // 6. Cultural Frame (Section 6)
  uchi_soto_position: 'uchi' | 'uchi_yori' | 'chuukan' | 'soto_yori' | 'soto';
  uchi_soto_trajectory: 'toward_uchi' | 'stable' | 'toward_soto';
  amae_allowance: number;  // 0.0-1.0
  enryo_expectation: number; // 0.0-1.0

  // 7. Dyadic Structure (Section 7)
  decision_type: 'solo' | 'involves_other' | 'joint';
  outcome_interdependence: number; // 0.0-1.0

  // 8. Communication (Section 8)
  appropriate_register: 'casual' | 'neutral' | 'formal' | 'strategic';

  // 9. Purpose (Section 9)
  interaction_purpose: 'apologize' | 'reconnect' | 'set_boundary' | 'ask_help'
    | 'inform' | 'test_relationship' | 'maintain' | 'deepen' | 'end';
  purpose_clarity: number; // 0.0-1.0

  // 10. Temporal (Section 10)
  relationship_duration_months: number;
  relationship_trajectory: 'ascending' | 'stable' | 'descending' | 'post_breach';
  last_interaction_gap_days: number;
  relationship_stage: 'formation' | 'deepening' | 'maintenance' | 'decline' | 'repair' | 'termination';
}
```

### ForceBalance 調整ルールの例

```
IF uchi_soto_position === 'soto' AND interaction_purpose === 'reconnect'
  THEN increase enryo_expectation → increase cost_load → shift toward prepare_then_go

IF user_attachment_toward_target === 'anxious' AND late_night
  THEN flag cognitive_impairment_risk → recommend defer_with_trigger("明日の朝もう一度考えて")

IF relationship_trajectory === 'descending' AND purpose === 'maintain'
  THEN decrease opportunity_value (表面的なメンテナンスは逆効果の可能性)
  AND suggest purpose reassessment ("本当に維持したいのか、それとも形だけか")

IF power_differential < -0.5 AND purpose === 'set_boundary'
  THEN increase cost_load BUT also increase regret_if_skip
  AND add communication_guidance: "立場は弱いが言うべきことは言う"形式を提案
```

### 実装ロードマップ提案

| Phase | 内容 | 捕捉方法 | 影響 |
|-------|------|---------|------|
| Phase 1 | interaction_purpose + uchi_soto_position | LLM がクエリから推定 | 最小コストで最大改善。目的と文化的距離感が判断を最も変える |
| Phase 2 | relationship_frame + power_differential + appropriate_register | LLM推定 + ユーザー明示 | コミュニケーション具体案を出せるようになる |
| Phase 3 | relationship_trajectory + last_interaction_gap + relationship_stage | Stargazer 観測データ蓄積 | 時間軸を持つ判断が可能に |
| Phase 4 | user_attachment_toward_target + attachment_interaction_risk | Stargazer の長期観測から推定 | 愛着パターンを考慮した安全な判断 |
| Phase 5 | temporal_context + cognitive_impairment_risk | デバイス情報 + 時刻 + ユーザー自己申告 | 深夜・飲酒時の判断ガード |

---

## 推奨アクション

1. **即時（Phase 1）**: `HomeAlterContextData` に `interaction_purpose` と `uchi_soto_hint` を追加。LLM プロンプトに「この質問の目的は何か」「相手との距離感はどこか」を判定させる指示を追加する。コードゼロでプロンプト変更のみで開始可能。

2. **短期（Phase 2）**: `RelationalContext` インターフェースを定義し、`computeForceBalance` に関係性調整ロジックを組み込む。relation_value の low/medium/high を廃止し、多次元に置き換える。

3. **中期（Phase 3-4）**: Stargazer の観測データから関係性プロファイルを蓄積する仕組みを構築。ユーザーが繰り返し言及する相手について、relationship_frame / trajectory / attachment を推定する「対人マップ」機能。

4. **長期（Phase 5）**: Genome Card や Rendezvous のデータと連携し、双方向の関係性理解を実現。相手も Aneurasync ユーザーの場合、双方の性格データを掛け合わせた dyadic judgment が可能に。

5. **設計原則**: 関係性データの捕捉は **暗黙的推定を優先** し、ユーザーに明示的な入力を求めない。「前回の会話で『上司に...』と言っていた」レベルの蓄積から始める。Aneurasync の設計思想（自分で気づいていなかったパターンを映し出す）と一致する。

---

## 情報ソース

### 学術論文・書籍
- [Relational Frame Theory - Wikipedia](https://en.wikipedia.org/wiki/Relational_frame_theory)
- [Latest RFT Model: MDML to HDML (2024)](https://jps.ecnu.edu.cn/EN/10.16719/j.cnki.1671-6981.20240525)
- [Follow, Flex, and Flout: RFT and Rule-Governed Behavior (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12190053/)
- [How Social Cognition Can Inform Social Decision Making (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3872305/)
- [Individualized Models of Social Judgments - Nature (2025)](https://www.nature.com/articles/s41598-025-86056-1)
- [Decision-Making Processes in Social Contexts (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5543983/)
- [Adult Attachment, Stress, and Romantic Relationships (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4845754/)
- [Ecological Rationality Framework - Gigerenzer (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3278722/)
- [Two Types of Ecological Rationality (Taylor & Francis)](https://www.tandfonline.com/doi/full/10.1080/1350178X.2018.1560486)
- [Risk Regulation System in Relationships - Murray et al.](https://labs.psych.ucsb.edu/collins/nancy/UCSB_Close_Relationships_Lab/Publications_files/Murray%20et%20al.,%202006.pdf)
- [Risk Perception and Interpersonal Discussion (2024)](https://onlinelibrary.wiley.com/doi/10.1111/risa.14264)
- [Interdependence Theory (van Lange & Balliet)](https://amsterdamcooperationlab.com/wp-content/uploads/2015/11/van-lange_balliet-interdependence-theory-chapter.pdf)
- [Deciding with Others: Interdependent Decision Making (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9773484/)
- [Dyadic Decision Making (Springer)](https://link.springer.com/book/10.1007/978-1-4612-3516-3)
- [Communication Accommodation Theory - Wikipedia](https://en.wikipedia.org/wiki/Communication_accommodation_theory)
- [Self-Determination Theory - Deci & Ryan](https://selfdeterminationtheory.org/SDT/documents/2000_DeciRyan_PIWhatWhy.pdf)
- [Trust Repair: Dynamic Bilateral Perspective - Kim, Dirks, Cooper (2009)](https://journals.aom.org/doi/10.5465/amr.2009.40631887)
- [Effect of Relationship Experience on Trust Recovery (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3780904/)
- [Relationship Trajectories Framework - Eastwick et al. (2019)](https://www.tandfonline.com/doi/full/10.1080/1047840X.2019.1577072)

### 日本文化コンテクスト
- [Uchi-Soto: Linguistic, Social, and Societal Impacts (ResearchGate 2024)](https://www.researchgate.net/publication/384243348_Uchi_nei_Soto_wai_The_Linguistic_Social_and_Societal_Impacts_of_Ingroup_and_Outgroup_in_Japanese)
- [Kuuki-wo-yomu Conceptualization - Waseda University](https://waseda.elsevierpure.com/en/publications/toward-a-conceptualization-of-kuuki-wo-yomu-reading-the-air-in-th/)
- [空気を読む 社会心理学的研究](https://files01.core.ac.uk/download/pdf/35427095.pdf)
- [The Anatomy of Dependence - Takeo Doi](https://en.wikipedia.org/wiki/The_Anatomy_of_Dependence)
- [Amae: Understanding Japanese Relationships](https://www.tanukistories.jp/post/amae-in-japanese-relationships)
- [NTT R&D: 空気を読むAI対話技術](https://www.rd.ntt/research/JN202508_35364.html)
