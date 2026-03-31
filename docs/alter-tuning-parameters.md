# Alter Tuning Parameters 一覧

P0-P6 で追加された全ての重み・閾値・Gate 条件の網羅的一覧。
改善フェーズでの閾値調整用リファレンス。

最終更新: 2026-03-31

---

## 凡例

| 記号 | 意味 |
|------|------|
| 安全方向: 上 | 値を上げる方が安全（保守的）になる |
| 安全方向: 下 | 値を下げる方が安全（保守的）になる |

---

## A. 重み関連

### P0: Archetype 漸減

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A1 | archetype 減衰係数 | `0.08` | `alterHomeAdapter.ts:681` | 上げる: archetype が早く消える / 下げる: archetype が長く残る | 下 |
| A2 | archetype 最小重み | `0.05` | `alterHomeAdapter.ts:681` | 上げる: archetype が完全に消えない / 下げる: archetype がほぼゼロになりうる | 上 |
| A3 | archetype rank 除算の最小値 | `0.05` | `alterHomeAdapter.ts:1278` | archetype weight が小さい時の rank 計算の分母下限。A2 と同値 | 上 |

### P0: facts 構築・ランキング

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A4 | 軸スコア上位取得数 | `5` | `alterHomeAdapter.ts:1025` | 上げる: より多くの軸から fact 生成 / 下げる: 主要軸のみ | 下 |
| A5 | 軸スコア intensity 最小値 | `0.15` | `alterHomeAdapter.ts:1030` | 上げる: 弱い傾向を無視 / 下げる: 弱い傾向も fact 化 | 上 |
| A6 | 軸スコア分岐閾値（低） | `0.4` | `alterHomeAdapter.ts:1037 等` | この値未満で「低側」の fact を生成 | - |
| A7 | 軸スコア分岐閾値（高） | `0.6` | `alterHomeAdapter.ts:1039 等` | この値超で「高側」の fact を生成 | - |
| A8 | 高 intensity 分岐 | `0.3` | `alterHomeAdapter.ts:1072` | 上げる: 汎用 fact が減る / 下げる: 汎用 fact が増える | 上 |
| A9 | rankFactsForCategory maxFacts（デフォルト） | `4` | `alterHomeAdapter.ts:1258` | 上げる: プロンプトに入る fact 増加 / 下げる: 絞り込み | 下 |
| A10 | buildPersonalizedFactsWithDomain maxFacts | `5` | `alterHomeAdapter.ts:3220` | ドメイン付き時は +1 枠 | 下 |

### P2: 収束スコアの重み配分

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A11 | countScore 重み | `0.2` | `alterUnderstanding.ts:688` | シグナル数の重視度 | - |
| A12 | sessionScore 重み | `0.35` | `alterUnderstanding.ts:688` | セッション多様性の重視度 | - |
| A13 | spreadScore 重み | `0.3` | `alterUnderstanding.ts:688` | 時間的広がりの重視度 | - |
| A14 | typeScore 重み | `0.15` | `alterUnderstanding.ts:688` | シグナルタイプ多様性の重視度 | - |
| A15 | countScore 正規化分母 | `4` | `alterUnderstanding.ts:683` | 5件で countScore=1.0 になる | 上 |
| A16 | sessionScore 正規化分母 | `3` | `alterUnderstanding.ts:684` | 4セッションで sessionScore=1.0 | 上 |
| A17 | spreadScore 正規化分母 | `5` (日) | `alterUnderstanding.ts:685` | 5日で spreadScore=1.0 | 上 |
| A18 | typeScore 正規化分母 | `2` | `alterUnderstanding.ts:686` | 3タイプで typeScore=1.0 | 上 |

### P6: 人物マップ influence_score の役割別基礎重み

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A19 | partner | `0.8` | `alterUnderstanding.ts:1270` | パートナーの影響度ベース | - |
| A20 | parent | `0.7` | `alterUnderstanding.ts:1270` | 親の影響度ベース | - |
| A21 | sibling | `0.5` | `alterUnderstanding.ts:1270` | きょうだいの影響度ベース | - |
| A22 | ex | `0.4` | `alterUnderstanding.ts:1270` | 元恋人の影響度ベース | - |
| A23 | crush | `0.5` | `alterUnderstanding.ts:1270` | 気になる人の影響度ベース | - |
| A24 | close_friend | `0.6` | `alterUnderstanding.ts:1271` | 親友の影響度ベース | - |
| A25 | friend | `0.4` | `alterUnderstanding.ts:1271` | 友人の影響度ベース | - |
| A26 | acquaintance | `0.2` | `alterUnderstanding.ts:1271` | 知人の影響度ベース | - |
| A27 | boss | `0.6` | `alterUnderstanding.ts:1272` | 上司の影響度ベース | - |
| A28 | senior | `0.4` | `alterUnderstanding.ts:1272` | 先輩の影響度ベース | - |
| A29 | colleague | `0.3` | `alterUnderstanding.ts:1272` | 同僚の影響度ベース | - |
| A30 | subordinate | `0.3` | `alterUnderstanding.ts:1272` | 後輩の影響度ベース | - |
| A31 | client | `0.3` | `alterUnderstanding.ts:1272` | 取引先の影響度ベース | - |
| A32 | other | `0.2` | `alterUnderstanding.ts:1273` | その他の影響度ベース | - |
| A33 | 言及頻度ボーナス上限 | `0.2` | `alterUnderstanding.ts:1279` | 上げる: 言及が多い人の影響度が上がりやすい | 下 |
| A34 | 言及頻度ボーナス係数 | `0.05` | `alterUnderstanding.ts:1279` | log2(count+1) * この値 | 下 |
| A35 | negative sentiment ボーナス | `0.1` | `alterUnderstanding.ts:1282` | ネガティブ感情時の追加影響度 | 下 |
| A36 | mixed sentiment ボーナス | `0.05` | `alterUnderstanding.ts:1282` | 複雑な感情時の追加影響度 | 下 |

### P2: State Pattern のベイズ統合

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A37 | ルールベース推定の重み | `0.7` | `route.ts:919` | 上げる: 今回の推定を重視 / 下げる: 蓄積パターンを重視 | 上 |
| A38 | 蓄積パターンの重み | `0.3` | `route.ts:919` | A37 の補数 | 下 |

### P4: 仮説ステータス遷移

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| A39 | strengthening 閾値（evidence direction） | `+0.15` | `alterUnderstanding.ts:1888` | 上げる: 強化しにくい / 下げる: 強化しやすい | 上 |
| A40 | weakening 閾値（evidence direction） | `-0.2` | `alterUnderstanding.ts:1892` | 上げる(絶対値): 弱化しにくい / 下げる: 弱化しやすい | 下(絶対値) |
| A41 | stable 閾値（変動幅） | `0.1` | `alterUnderstanding.ts:1902` | 上げる: 安定しやすい / 下げる: 安定しにくい | 下 |
| A42 | 仮説弱体化の confidence 乗数 | `0.6` | `route.ts:3733` | 上げる: 弱体化が緩やか / 下げる: 弱体化が急激 | 下 |
| A43 | 弱体化 confidence 下限 | `0.1` | `route.ts:3733` | 上げる: 完全には消えない / 下げる: ほぼゼロまで落ちる | 上 |

---

## B. 閾値関連

### P1: Life Context 品質

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B1 | 環境文脈の confidence 下限（facts 注入） | `0.4` | `alterHomeAdapter.ts:1147` | 上げる: 低確信の文脈を除外 / 下げる: 多く注入 | 上 |
| B2 | 仮説の confidence 下限（facts 注入） | `0.5` | `alterHomeAdapter.ts:1172` | 上げる: 確度の低い仮説を除外 / 下げる: 多く注入 | 上 |
| B3 | Life Context アクティブ判定 confidence | `0.4` | `alterUnderstanding.ts:1068` | 上げる: より確信が必要 / 下げる: 低確信も活用 | 上 |
| B4 | evidence 蓄積 increment（count < 3） | `+0.1` | `alterUnderstanding.ts:1058` | confidence の上昇速度（初期） | 下 |
| B5 | evidence 蓄積 increment（count >= 3） | `+0.05` | `alterUnderstanding.ts:1058` | confidence の上昇速度（安定期） | 下 |
| B6 | evidence 蓄積 confidence 上限 | `0.9` | `alterUnderstanding.ts:1059` | 上げる: より高い確信度まで到達可能 | 下 |
| B7 | 過去文脈 confidence 上限 | `0.3` | `alterUnderstanding.ts:1339` | 「昔」「以前」の文脈の confidence を抑制 | 上 |

### P2: 仮説注入の confidence 閾値

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B8 | emerging 仮説の注入 confidence 下限 | `0.5` | `alterUnderstanding.ts:1941, 1978` | 上げる: 初期仮説がプロンプトに乗りにくい | 上 |
| B9 | retired 判定 confidence | `< 0.2` | `alterUnderstanding.ts:1907` | 上げる: 仮説が retire しやすい | 上 |
| B10 | stable 判定の最小 confidence | `0.5` | `alterUnderstanding.ts:1902` | 上げる: 安定しにくい | 上 |

### P3: ベースライン・ズレ検出

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B11 | 判断傾向ズレの magnitude 下限 | `0.3` (30%) | `alterUnderstanding.ts:2198` | 上げる: 弱いズレを無視 / 下げる: 敏感に検出 | 上 |
| B12 | 感情負荷ズレの z-score 閾値 | `1.5` (σ) | `alterUnderstanding.ts:2216` | 上げる: より大きいズレのみ検出 / 下げる: 敏感 | 上 |
| B13 | 分散の最小値（ゼロ除算防止） | `0.01` | `alterUnderstanding.ts:2214` | 分散がこれ以下なら感情ズレ検出をスキップ | - |
| B14 | magnitude 正規化係数（z-score → magnitude） | `1/3` | `alterUnderstanding.ts:2221` | z=3 で magnitude=1.0 | - |
| B15 | カテゴリ異常の ratio 閾値 | `0.05` (5%) | `alterUnderstanding.ts:2235` | 上げる: 珍しいカテゴリの検出が鈍る | 上 |
| B16 | カテゴリ異常の最小質問数 | `10` | `alterUnderstanding.ts:2235` | 上げる: より多くのデータが必要 | 上 |
| B17 | 時間帯エネルギーズレの load 差分閾値 | `0.25` | `alterUnderstanding.ts:2250` | 上げる: 大きなズレのみ検出 | 上 |
| B18 | baselineDeviation facts 注入の magnitude 下限 | `0.3` | `alterHomeAdapter.ts:1193` | 上げる: 弱いズレを注入しない | 上 |
| B19 | baselineDeviation MI 昇格の magnitude 下限 | `0.5` | `alterUnderstanding.ts:3481` | 上げる: 強いズレのみ MI に昇格 | 上 |

### P4: 反復パターン仮説

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B20 | recurring pattern goRatio 閾値（積極側） | `0.7` (70%) | `alterUnderstanding.ts:1712` | 上げる: 仮説生成が厳しくなる | 上 |
| B21 | recurring pattern goRatio 閾値（慎重側） | `0.3` (30%) | `alterUnderstanding.ts:1723` | 下げる: 仮説生成が厳しくなる | 下 |
| B22 | cross-context split goRatio 差分閾値 | `0.4` | `alterUnderstanding.ts:1793` | 上げる: ドメイン間の差がないと split にならない | 上 |
| B23 | cross-context consistency goRatio 差分閾値 | `0.15` | `alterUnderstanding.ts:1805` | 下げる: より一致していないと consistency にならない | 下 |
| B24 | growth signal goRatio shift 閾値 | `0.2` | `alterUnderstanding.ts:2568` | 上げる: より大きな変化のみ検出 | 上 |

### P6: 人物マップ

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B25 | person_map facts 注入の influence_score 下限 | `0.5` | `alterHomeAdapter.ts:1210` | 上げる: 影響度の高い人物のみ注入 | 上 |
| B26 | person_map facts 注入の mention_count 下限 | `2` | `alterHomeAdapter.ts:1210` | 上げる: より多く言及された人物のみ | 上 |

### P2: State Layer

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B27 | estimateUserState デフォルト capacity | `0.6` | `alterUnderstanding.ts:254` | 上げる: 楽観推定 / 下げる: 悲観推定 | - |
| B28 | estimateUserState デフォルト emotional_load | `0.3` | `alterUnderstanding.ts:255` | 上げる: 負荷高め推定 / 下げる: 負荷低め推定 | - |
| B29 | estimateUserState デフォルト cognitive_fatigue | `0.3` | `alterUnderstanding.ts:256` | 同上 | - |
| B30 | capacity 下限クランプ | `0.15` | `alterUnderstanding.ts:353` | 上げる: 完全枯渇を許さない | 上 |
| B31 | emotional_load / cognitive_fatigue 上限クランプ | `0.85` | `alterUnderstanding.ts:354-355` | 上げる: より高い負荷を表現可能 / 下げる: 飽和が早い | 下 |

### P3: 段階的開示

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| B32 | silent 判定の confidence 下限 | `0.4` | `alterUnderstanding.ts:1467` | 上げる: より多くが silent | 上 |
| B33 | reference 判定の confidence（T2） | `0.7` | `alterUnderstanding.ts:1485` | 上げる: reference がより厳しい | 上 |
| B34 | reference 判定の evidence_count（T2） | `3` | `alterUnderstanding.ts:1485` | 上げる: より多くの裏付けが必要 | 上 |
| B35 | explicit 判定の confidence（T3+） | `0.8` | `alterUnderstanding.ts:1491` | 上げる: explicit がより厳しい | 上 |
| B36 | explicit 判定の evidence_count（T3+） | `5` | `alterUnderstanding.ts:1491` | 上げる: より多くの裏付けが必要 | 上 |

---

## C. Gate / 制限関連

### P0: Trust Gate

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C1 | T4: continuousTrust 閾値 | `0.85` | `alterUnderstanding.ts:209` | 上げる: T4 到達が困難に | 上 |
| C2 | T4: sessionsCompleted 閾値 | `40` | `alterUnderstanding.ts:209` | 上げる: T4 到達が困難に | 上 |
| C3 | T3: continuousTrust 閾値 | `0.7` | `alterUnderstanding.ts:210` | 上げる: T3 到達が困難に | 上 |
| C4 | T3: sessionsCompleted 閾値 | `20` | `alterUnderstanding.ts:210` | 上げる: T3 到達が困難に | 上 |
| C5 | T2: continuousTrust 閾値 | `0.4` | `alterUnderstanding.ts:211` | 上げる: T2 到達が困難に | 上 |
| C6 | T2: sessionsCompleted 閾値 | `8` | `alterUnderstanding.ts:211` | 上げる: T2 到達が困難に | 上 |
| C7 | T1: sessionsCompleted 閾値 | `3` | `alterUnderstanding.ts:212` | 上げる: T1 到達が困難に | 上 |

### P0: Trust Gate（calculateTrustLevel — 将来移行版）

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C8 | T4: session_count | `40` | `alterUnderstanding.ts:112` | - | 上 |
| C9 | T4: deep_disclosure_count | `10` | `alterUnderstanding.ts:113` | - | 上 |
| C10 | T4: insight_acceptance_rate | `0.6` | `alterUnderstanding.ts:114` | - | 上 |
| C11 | T4: correction_count | `3` | `alterUnderstanding.ts:115` | - | - |
| C12 | T3: session_count | `20` | `alterUnderstanding.ts:122` | - | 上 |
| C13 | T3: deep_disclosure_count | `5` | `alterUnderstanding.ts:123` | - | 上 |
| C14 | T3: insight_acceptance_rate | `0.5` | `alterUnderstanding.ts:124` | - | 上 |
| C15 | T2: session_count | `8` | `alterUnderstanding.ts:131` | - | 上 |
| C16 | T2: deep_disclosure_count | `2` | `alterUnderstanding.ts:132` | - | 上 |
| C17 | T2: insight_acceptance_rate | `0.3` | `alterUnderstanding.ts:133` | - | 上 |
| C18 | T1: session_count | `3` | `alterUnderstanding.ts:139` | - | 上 |

### P5: Micro Insight Gate（evaluateMIGate）

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C19 | 1セッション MI 上限 | `1` | `alterUnderstanding.ts:3336` | 上げる: セッション内で複数 MI 可能 | 下 |
| C20 | global deny rate 閾値（failsafe） | `0.3` (30%) | `alterUnderstanding.ts:3365` | 上げる: failsafe が緩い / 下げる: 厳しい | 下 |
| C21 | global deny rate 最小サンプル数 | `5` | `alterUnderstanding.ts:3317` | 上げる: サンプル不足での誤発動防止 | 上 |
| C22 | 連続 denied 停止閾値 | `3` | `alterUnderstanding.ts:3319` | 上げる: 連続 denied に対して寛容 | 下 |
| C23 | 連続 denied 後の停止期間 | `30` (日) | `alterUnderstanding.ts:3390` | 上げる: 長期間停止 / 下げる: 早期復帰 | 上 |
| C24 | セッション間クールダウン（時間ベース） | `72` (h) | `alterUnderstanding.ts:3407` | 上げる: MI が出にくい / 下げる: 頻度上昇 | 上 |
| C25 | セッション間クールダウンの最小セッション数 | `3` | `alterUnderstanding.ts:3405` | 上げる: 初期ユーザーのクールダウンが発動しない | 上 |
| C26 | type 別 suppress の最小サンプル数 | `3` | `alterUnderstanding.ts:3318` | 上げる: タイプ別抑制が発動しにくい | 上 |
| C27 | type 別 suppress の denied 率閾値 | `0.5` (50%) | `alterUnderstanding.ts:3273` | 上げる: タイプ別抑制が厳しくなる | 下 |
| C28 | MI 提示時の emotional_load 上限 | `0.75` | `route.ts:2120` | 上げる: 負荷が高くても MI 提示 / 下げる: 控えめ | 下 |

### P2: State-driven Gate

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C29 | State 注入の最小 trustLevel（continuous） | `0.15` | `route.ts:1747` | 上げる: 初期ユーザーに状態推定を適用しない | 上 |
| C30 | State 注入の最小 sessionsCompleted | `2` | `route.ts:1747` | 上げる: より多くのセッションが必要 | 上 |
| C31 | capacity 低下で守り方向シフト閾値 | `0.4` | `route.ts:1748, 1750` | 上げる: 発動しやすい / 下げる: 発動しにくい | - |
| C32 | emotional_load でやさしいモードシフト閾値 | `0.6` | `route.ts:1748, 1754` | 上げる: 発動しにくい / 下げる: 発動しやすい | - |
| C33 | cognitive_fatigue でシンプル化閾値 | `0.6` | `route.ts:1758` | 上げる: 発動しにくい / 下げる: 発動しやすい | - |
| C34 | branch → conclude 降格: cognitive_fatigue | `0.6` | `route.ts:937` | 上げる: 降格しにくい | - |
| C35 | branch → conclude 降格: emotional_load | `0.7` | `route.ts:937` | 上げる: 降格しにくい | - |

### P2: State → ForceBalance 調整

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C36 | capacity 低 → protect_pressure delta | `+0.15` | `alterUnderstanding.ts:374` | 上げる: より守り寄り | 上 |
| C37 | capacity 低 → expand_pressure delta | `-0.1` | `alterUnderstanding.ts:375` | 下げる(絶対値): より攻め抑制 | - |
| C38 | capacity 低の閾値 | `0.35` | `alterUnderstanding.ts:373` | 上げる: 発動しやすい | - |
| C39 | emotional_load 高 → protect_pressure delta | `+0.1` | `alterUnderstanding.ts:382` | 上げる: より守り寄り | 上 |
| C40 | emotional_load 高の閾値 | `0.65` | `alterUnderstanding.ts:380` | 下げる: 発動しやすい | - |
| C41 | cognitive_fatigue 高の閾値 | `0.6` | `alterUnderstanding.ts:386` | 下げる: 発動しやすい | - |

### P3: 最小サンプル数

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C42 | MIN_BASELINE_SESSIONS | `5` | `alterUnderstanding.ts:1999` | 上げる: ベースライン構築に時間がかかる / 下げる: 早期に構築 | 上 |
| C43 | 時間帯ベースラインの最小サンプル数 | `3` | `alterUnderstanding.ts:2152` | 上げる: 時間帯パターンに時間がかかる | 上 |
| C44 | State Pattern ベイズ統合の最小 sample_count | `3` | `route.ts:917` | 上げる: パターン統合に時間がかかる | 上 |
| C45 | decision pattern 最小 observation_count | `5` | `alterUnderstanding.ts:1699, route.ts:1790` | 上げる: パターン利用に時間がかかる | 上 |
| C46 | decision pattern 最小 confidence | `0.3` | `alterUnderstanding.ts:1699, route.ts:1791` | 上げる: 低確信パターンを除外 | 上 |

### P4: 深掘りプローブ（selectDeepeningProbe）

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C47 | 深掘りプローブの最小 trustLevel | `2` | `alterUnderstanding.ts:2322` | 上げる: プローブ発火に高い信頼が必要 | 上 |
| C48 | narrative_recurring の最小 mention_count | `3` | `alterUnderstanding.ts:2329` | 上げる: より繰り返されないと発火しない | 上 |
| C49 | hypothesis_needs_evidence の最大 evidence_count | `3` | `alterUnderstanding.ts:2350` | 上げる: 証拠不足判定が緩くなる | - |
| C50 | baseline_deviation_cause の magnitude 下限 | `0.4` | `alterUnderstanding.ts:2370` | 上げる: 弱いズレではプローブ不発火 | 上 |

### P5: 罠検知

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C51 | 監視罠 silence_rate warning | `0.2` | `alterUnderstanding.ts:2901` | 下げる: 敏感に検知 | 下 |
| C52 | 監視罠 avoidance_rate critical | `0.4` | `alterUnderstanding.ts:2902` | 下げる: 敏感に検知 | 下 |
| C53 | 負荷罠 overall no_response_rate warning | `0.3` | `alterUnderstanding.ts:2947` | 下げる: 敏感に検知 | 下 |
| C54 | 負荷罠 deep no_response_rate critical | `0.5` | `alterUnderstanding.ts:2948` | 下げる: 敏感に検知 | 下 |
| C55 | 停滞罠 execution_rate warning | `< 0.3` | `alterUnderstanding.ts:3001` | 上げる: 停滞の検知が敏感に | 上(値自体) |
| C56 | 停滞罠 execution_rate critical | `< 0.2` | `alterUnderstanding.ts:3006` | 上げる: critical の検知が敏感に | 上(値自体) |
| C57 | 停滞罠 avg_satisfaction warning | `< 2.5` | `alterUnderstanding.ts:3002` | 上げる: 満足度低下の検知が敏感に | 上(値自体) |
| C58 | 停滞罠 satisfaction_trend warning | `< -0.5` | `alterUnderstanding.ts:3003` | 上げる(絶対値): トレンド低下に鈍感 | - |
| C59 | 物語罠 low_confidence_hypothesis_rate | `0.5` | `alterUnderstanding.ts:3050` | 下げる: 敏感に検知 | 下 |
| C60 | 物語罠 hypothesis_denial_rate critical | `0.5` | `alterUnderstanding.ts:3051` | 下げる: 敏感に検知 | 下 |
| C61 | 物語罠 hypothesis_denial_rate warning | `0.3` | `alterUnderstanding.ts:3063` | 下げる: 敏感に検知 | 下 |
| C62 | 固定化罠 stale_persistent_rate critical | `0.5` | `alterUnderstanding.ts:3101` | 下げる: 敏感に検知 | 下 |
| C63 | 固定化罠 stale_inferred_rate warning | `0.3` | `alterUnderstanding.ts:3102` | 下げる: 敏感に検知 | 下 |
| C64 | 固定化罠 stale_count critical | `5` | `alterUnderstanding.ts:3103` | 下げる: 敏感に検知 | 下 |
| C65 | 固定化罠の stale 判定日数 | `60` (日) | `alterUnderstanding.ts:3092` | 下げる: より新しい情報でも stale | 下 |

### P5: Trust 閾値調整推奨

| # | 名前 | 現在値 | 場所 | 調整の影響 | 安全方向 |
|---|------|--------|------|-----------|---------|
| C66 | denial rate → raise 推奨 | `0.3` (30%) | `alterUnderstanding.ts:2765` | 下げる: 引き上げ推奨が敏感に | 下 |
| C67 | ignored rate → raise 推奨 | `0.5` (50%) | `alterUnderstanding.ts:2774` | 下げる: 引き上げ推奨が敏感に | 下 |
| C68 | accepted rate → maintain 推奨 | `0.6` (60%) | `alterUnderstanding.ts:2783` | 上げる: 現状維持の基準が厳しい | 上 |
| C69 | 推奨計算の最小サンプル数 | `10` | `alterUnderstanding.ts:2754` | 上げる: サンプル不足での誤推奨防止 | 上 |

---

## D. 定数・マジックナンバー

### 全般

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D1 | MAX_MESSAGE_LENGTH | `2000` | `route.ts:173` | ユーザーメッセージの最大文字数 |
| D2 | MAX_RESPONSE_LENGTH | `4000` | `route.ts:174` | Alter 応答の最大文字数 |
| D3 | Daily rally limit | `5` | `route.ts:525` | 1日あたりの Alter 相談回数上限（JST リセット） |
| D4 | Micro Insight suggested_prompt 上限 | `100` (文字) | `route.ts:2127` | MI プロンプトのサニタイズ上限 |
| D5 | 直近シグナルの有効期間 | `7` (日) | `alterUnderstanding.ts:726` | 収束判定に使うシグナルの有効日数 |
| D6 | 収束判定の最小シグナル数 | `2` | `alterUnderstanding.ts:722, 729` | 収束判定に必要な最低シグナル数 |
| D7 | 仮説プロンプト注入の最大件数 | `2` | `alterUnderstanding.ts:1989` | 1応答に注入する仮説の上限 |
| D8 | person_map facts の最大件数 | `2` | `alterHomeAdapter.ts:1212` | 1応答に注入する人物 fact の上限 |
| D9 | baselineDeviation facts の最大件数 | `1` | `alterHomeAdapter.ts:1191` | ベースラインズレ fact の上限 |
| D10 | Life Context プロンプト注入の最大件数 | `5` | `route.ts:1828` | 段階的開示でプロンプトに入れる最大件数 |
| D11 | decision pattern プロンプト注入の最大件数 | `3` | `route.ts:1793` | 判断傾向をプロンプトに入れる最大件数 |

### LLM パラメータ

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D12 | conclude モードの temperature | `0.6` | `route.ts:2192` | 結論モード |
| D13 | clarify モードの temperature | `0.3` | `route.ts:2192` | 確認モード（安全側に低温） |
| D14 | 安全再生成の temperature | `0.3` | `route.ts:2337` | 不気味ライン違反時の再生成 |
| D15 | daily guidance の temperature | `0.5` | `route.ts:791` | 日次ガイダンス |
| D16 | daily guidance（retryの場合）の temperature | `0.4` | `route.ts:828` | 日次ガイダンスリトライ |
| D17 | 通常モードの temperature | `0.85` | `route.ts:2522` | 挨拶・通常応答 |
| D18 | 通常モード retry の temperature 加算 | `+0.05` | `route.ts:2576` | リトライ時に微調整 |
| D19 | clarify の maxOutputTokens | `512` | `route.ts:2193` | 確認モード |
| D20 | branch の maxOutputTokens | `3072` | `route.ts:2193` | 分岐モード |
| D21 | conclude の maxOutputTokens | `2048` | `route.ts:2193` | 結論モード |
| D22 | 通常モードの maxOutputTokens | `900` | `route.ts:2523` | 挨拶・通常応答 |

### P5: 品質検証

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D23 | generic_response_score 閾値 | `0.5` | `route.ts:2288` | この値以上で「汎用的すぎる応答」と判定 |
| D24 | clarify 応答の最大文字数 | `200` | `alterHomeAdapter.ts:3362` | clarify バリデーション |
| D25 | clarify 応答の最小文字数 | `5` | `alterHomeAdapter.ts:3361` | clarify バリデーション |
| D26 | clarify の最大質問マーク数 | `2` | `alterHomeAdapter.ts:3367` | 質問の数制限 |

### P5: ActionShape 偏差検出

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D27 | ActionShape 偏差の ratio 閾値 | `0.1` (10%) | `route.ts:2947` | ドメイン内でこの出現率未満だと偏差とみなす |
| D28 | ActionShape 偏差の最小 observation_count | `5` | `route.ts:2940` | パターンデータの最小件数 |

### P5: followup 精度メトリクス

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D29 | regret_rate 警告閾値 | `0.3` (30%) | `route.ts:3164` | この値超で警告ログ出力 |
| D30 | execution_rate 警告閾値 | `0.3` (30%) | `route.ts:3167` | この値未満で警告ログ出力 |

### P2: 環境パターン baseConfidence

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D31 | user_stated 環境パターン baseConfidence | `0.7` | `alterUnderstanding.ts:1301-1306` | 明示的発言の環境情報 |
| D32 | user_implied 環境パターン baseConfidence | `0.5` | `alterUnderstanding.ts:1305,1309,1311,1317` | 推定的発言の環境情報 |
| D33 | 出産・育児期 baseConfidence | `0.8` | `alterUnderstanding.ts:1316` | 最も確信度が高い環境情報 |
| D34 | 睡眠の問題 baseConfidence | `0.6` | `alterUnderstanding.ts:1310` | 中程度の確信度 |
| D35 | 介護・看護 baseConfidence | `0.6` | `alterUnderstanding.ts:1318` | 中程度の確信度 |

### P4: 深掘りプローブ優先度の構成

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D36 | narrative_recurring base priority | `0.5` | `alterUnderstanding.ts:2334` | 繰り返しテーマの基本優先度 |
| D37 | ドメイン一致ボーナス | `+0.15` | `alterUnderstanding.ts:2334` | ドメインが一致した場合の加算 |
| D38 | mention_count ボーナス係数 | `0.03` | `alterUnderstanding.ts:2334` | mention_count * この値（上限 0.2） |
| D39 | mention_count ボーナス上限 | `0.2` | `alterUnderstanding.ts:2334` | Math.min(0.2, ...) |
| D40 | hypothesis_needs_evidence base priority | `0.4` | `alterUnderstanding.ts:2359` | 仮説検証の基本優先度 |
| D41 | baseline_deviation_cause base priority | `0.55` | `alterUnderstanding.ts:2376` | ズレ原因探索の基本優先度 |
| D42 | baseline_deviation_cause magnitude 係数 | `0.2` | `alterUnderstanding.ts:2376` | magnitude * この値で加算 |
| D43 | cross_domain_split base priority | `0.6` | `alterUnderstanding.ts:2412` | 領域間違い深掘りの基本優先度 |
| D44 | cross_domain_split confidence 係数 | `0.15` | `alterUnderstanding.ts:2412` | confidence * この値で加算 |

### P3: 構造的補完の priority

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D45 | relationship_unknown priority | `0.7` | `alterUnderstanding.ts:1393` | 対人相談で相手不明 |
| D46 | work_style_unknown priority | `0.4` | `alterUnderstanding.ts:1405` | 仕事相談で働き方不明 |
| D47 | partner_status_unknown priority | `0.5` | `alterUnderstanding.ts:1417` | 恋愛相談でパートナー不明 |
| D48 | living_situation_unknown priority | `0.3` | `alterUnderstanding.ts:1429` | 生活相談で居住環境不明 |

### Micro Signal の strength

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D49 | energy_action_gap strength | `0.6` | `alterUnderstanding.ts:534` | エネルギー-行動ギャップ |
| D50 | behavior_mismatch（大丈夫+重い話）strength | `0.7` | `alterUnderstanding.ts:550` | 言動不一致 |
| D51 | behavior_mismatch（忙しい+長文）strength | `0.4` | `alterUnderstanding.ts:564` | 忙しいのに相談 |
| D52 | topic_repetition strength | `0.5` | `alterUnderstanding.ts:596` | 話題の繰り返し |
| D53 | sentiment_shift strength | `0.6` | `alterUnderstanding.ts:639` | 感情トーンの変化 |
| D54 | topic_repetition の最小出現数 | `3` | `alterUnderstanding.ts:585` | テーマが 3 回以上出現で検知 |

### 収束スコア → 提示タイプのマッピング

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D55 | connection: combined 閾値 | `0.7` + T3以上 | `alterUnderstanding.ts:712` | 最も深い提示 |
| D56 | gentle_inquiry: combined 閾値 | `0.5` + T2以上 | `alterUnderstanding.ts:713` | 問いとしての気づき |
| D57 | observation: combined 閾値 | `0.3` | `alterUnderstanding.ts:714` | 事実レベルの観察共有 |
| D58 | casual_check（T1 未満 or combined < 0.5）| `0.5` + T1以下 | `alterUnderstanding.ts:709` | さりげない確認 |

### Route.ts: followup 傾向判定

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D59 | skipRate → ハードル下げ推奨 | `> 0.5` | `route.ts:1401` | スキップ率 50% 超 |
| D60 | executionRate → 粒度下げ推奨 | `< 0.3` | `route.ts:1403` | 実行率 30% 未満 |
| D61 | executionRate + satisfaction → 挑戦可 | `> 0.7` + `>= 4` | `route.ts:1405` | 実行率 70% 超かつ満足度 4 以上 |
| D62 | satisfaction → 方向転換推奨 | `< 2.5` | `route.ts:1407` | 満足度 2.5 未満 |

### Route.ts: clarify ループ防止

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D63 | 前回 clarify 応答の最大文字数 | `200` | `route.ts:1427` | 前回応答がこれ以下で質問で終わっていれば clarify 判定 |
| D64 | clarify 回答判定の最大文字数 | `100` | `route.ts:1432` | ユーザー返答がこれ以下で質問でなければ回答判定 |

### Route.ts: 経済シグナル

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D65 | financial signal 記録閾値 | `0.2` | `route.ts:1258` | score がこの値以上で analytics に記録 |

### Route.ts: 最小間隔

| # | 名前 | 現在値 | 場所 | 説明 |
|---|------|--------|------|------|
| D66 | MI 最小提示間隔（legacy） | `1` (h) | `route.ts:2046` | 最後の MI から 1 時間未満なら抑制 |
| D67 | deny/ignore ストリーク抑制閾値 | `2` | `route.ts:2049` | 連続 2 回の deny/ignore で抑制 |

---

## Phase 横断マップ

| Phase | 主要パラメータ |
|-------|--------------|
| **P0** | A1-A3（archetype漸減）, A4-A10（facts構築）, C1-C7（Trust Gate） |
| **P1** | B1（環境文脈confidence）, D31-D35（環境baseConfidence） |
| **P2** | A11-A18（収束スコア重み）, A37-A38（ベイズ統合重み）, B8-B10（仮説注入）, B27-B31（State推定）, D49-D58（Microシグナル・収束） |
| **P3** | B11-B19（ベースラインズレ検出）, C42-C46（最小サンプル数）, B32-B36（段階的開示）, D45-D48（構造的補完priority） |
| **P4** | A39-A43（仮説ステータス遷移）, B20-B24（パターン仮説閾値）, C47-C50（深掘りプローブ）, D7（仮説最大件数）, D36-D44（プローブ優先度） |
| **P5** | C19-C28（MI Gate）, C51-C69（罠検知・Trust調整）, D23-D30（品質検証・followup精度） |
| **P6** | A19-A36（influence_score重み）, B25-B26（person_map注入閾値）, D8（人物facts最大件数） |
