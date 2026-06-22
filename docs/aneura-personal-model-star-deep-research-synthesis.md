# 評価OS／個人モデルを「中核」に据える — CEO 意思決定レポート

日付: 2026-06-22 ／ Chief of Staff（25-agent deep research・実 WebSearch + 一次資料・コード接地検証）／ 全体ステータス: 🟢（戦略は整合・実装順序が唯一の論点）

CEO の拡張ビジョン（評価OS/個人モデルを Lens/Travel/Location Notes の中核に・glanceable な「Aneurasync の星」・「その瞬間その人に最適」を全領域で・最終的に user-as-API）を、先行2統合（purpose-fit lens + 評価OS）と突き合わせ、前提を疑い再構成。5案は全て同じアーキに収束し、4つの敵対検証が中核主張を生き残らせた。**結論：CEO の方向は正しく、形式（星・export）が間違っており、世界トップへの道は1つに絞れる。**

---

## 1. 核心の緊張を解く: 正直さ vs 一目了解性

CEO は正しい。純粋な不確実性表示はコンバージョンもリテンションも殺す（anchoring・affect heuristic・選択過負荷・Netflix が星→thumbs で評価データ2倍の実データ）。一目で決められる affordance の需要は実在。

**しかし CEO が欲しいのは「星」ではなく「即断アフォーダンス」。** これを分離するのが解。星の本質＝「他者の平均品質」で de Langhe (JCR 2016) 一致57%（乱数50%）。Aneurasync が星を出せば①57%天井継承②moat（個人適合 I_{u,p}）放棄③false precision。Netflix が答えを実証済み：星 → **% Match（あなたの予測適合）**。これは捏造でなく「過去選択にどれだけ似ているか」という観測可能な相対量。

**Aneura-star = 正直な分布の glanceable な「レンダリング」**（confidence を隠さず符号化）:
- **適合アーク（Fit-Arc）**: 既存 `ProgressRing`(glassmorphism-design.tsx:748) 流用。充填量 = **I_{u,p}（個人適合＝勝つ）** を表示、Q_p（絶対品質＝量で負ける）は出さない。θ·state（当日補正）を従。
- **confidence を「アークの形」に直交符号化**（別 glyph を足さない）: 確信=solid 連続／手応え=dashed 破線＋tier に「?」／観測前=アーク非描画・点線の空リング・中央「—」。wide-uncertainty が confident と一目で別物に。
- **3つの不変式**（false precision を UI 構造として不可能に）: ①観測前→アーク非描画・「推測しません」明示 ②全アークに **evidence 件数チップ必須** ③連続% 単独表示禁止・tier+件数の従属のみ。

**prior の「no false precision」と矛盾しない—むしろ強化。** 1点だけ prior 修正: 「credible interval の**幅を主役 glyph に**」は**却下**（CHI 2024「Are You Really Sure?」：interval 幅前面化は decisiveness を削る）。正解＝**ordinal（2-3段）confidence をアークの形に埋め、interval 幅は詳細展開へ降格**。

> 残留リスク（未証明）: 自己認識の高揚は**反省的**で**一目**か未確定。glance 満足が「数字が上がるドーパミン」を要求するなら残留緊張あり→ユーザーテストでのみ settle。

---

## 2. これは別物でなく中核

Aneura-star + 個人モデルは Lens/Travel/Location Notes の**機能でなく背骨**。prior の COMBINE 決定が直接要請。
- **Lens(P5)**: 適合アークは ①捲る ②✓なぜ ③比較表 + place card 左60px に座り、lens 出力を**可視化する器**（置換せず載る）。
- **Travel/Location Notes**: 同じアークが各ドメインで別個の I_{u,p} を出すが、確信の「形」(solid/dashed/無)は同一文法 = **UI レベルの世界観一貫**（CEO success condition「世界観の確立」直結）。
- **計算正本**: 階層ベイズ `rating = α + Q_p + B_u + Σθ_k·state_k + I_{u,p}` の I 項を読み、confidence は `bayesianAxisUpdater` の precision/credibleInterval を読む = **既存エンジンの消費のみ・新エンジンゼロ**。

「中核に据える」＝新規開発でなく、**散在する判断（decision-engine/oracle/judgment/profile が各々車輪を再発明）を Aneura-star という単一出力フォーマットに収斂**させること。

---

## 3. 感情の扱い

3つの硬い結論は同じ帰結：**「心を読む」のでなく「予測誤差を観測する」**。

| | 観測してよい | やってはいけない |
|---|---|---|
| 粒度 | 粗い valence×arousal を本人申告 | 離散感情を顔・テキストから自動分類 |
| 持続 | mood（θ·state covariate 化） | 瞬間 emotion の精密追跡 |
| 取得 | μEMA 1タップ・revealed preference | センサ/カメラ/表情/音声推定 |
| 予測 | 事後の実感を観測→予測誤差で学習 | 本人の感情予測（「楽しめる?」）を信じる |

根拠: ①離散感情は顔から読めない（**Barrett et al. 2019, PSPI**）→カメラ/表情分類は科学・privacy・哲学の三重却下 ②人は未来感情を体系的に誤予測（**impact bias / Wilson & Gilbert**）③体験と記憶は乖離（**peak-end / Kahneman**）。

**affect が正直に rec に入る3経路**: ①**state covariate**（候補を消すな・fit を補正しろ。「疲れ気味のあなたが選びがちな型」が最も感情を動かす aha）②**preference axis**（state 感受性軸を state ゲート）③**affective-forecasting correction**（予測 vs 実感の差を記録→本人の感情予測を de-weight。「あなたは疲労時の楽しさを過小予測する傾向」＝本人が内省できないパターン＝第二の自己固有の言い当て）。感情の star 化（😊😐😞）は Barrett の読心誤謬を UI 固定化ゆえ却下。既存 `stateWeighting.ts`/`innerWeather.ts`(Russell円環・表情分類なし)で半分実装済み。

---

## 4. 統一個人モデル / クロスドメイン

**単一万能ベクトルは横断しない。「共有 invariant core + ドメイン特化 surface」の二層なら横断する**（推薦業界の標準解 DPG-Diff/EXIT/SDSP）。Stargazer 47軸ベイズ＝**偶然でなくこの invariant core そのもの**。

```
LAYER 1 INVARIANT CORE（転移する）  47軸ベイズ belief + 価値観 + 矛盾マップ … surface を bias（determine しない）
LAYER 2 STATE GATE（最強の転移コア） daily_state × context … コアが各ドメインにどの向きで効くか
LAYER 3 DOMAIN SURFACE（転移しない） food/travel/shopping の revealed-preference … 軸経由でのみ間接波及
```
**転移する**: 判断軸の向き・状態反応・価値観・矛盾パターン。**転移しない**: 具体的選好（味≠旅≠購買）。personality/values はカテゴリ横断で**説明力**を上げるが**予測力**は上げない。

**negative transfer は実故障**: 「体調不良で薬注文→定常興味と誤解→健康時に薬を大量推薦」型。実測—統合下で専門モデル Recall@10 **−10.6%**、勝つ時も **+2.3%**（非対称）。防御: ①転移は判断軸層に限定（協調層では混ぜない）②型レベル一方向契約（surface→core read-only）③矛盾マップで SDSP gap test、逆転検出時は転移遮断。既存 `relationship_mode_split` は文献的に正しい構造。
**構造的優位**: 競合の共有コアは行動ログ由来の解釈不能 latent vector。Aneurasync のコアは**直接観測した判断原理**（observed>inferred）＝皆が苦労して抽出する domain-invariant component を最初から保有。

---

## 5. user-as-API ムーンショット — 正直な実現性

**CEO の Amazon 例は「方向は正しいがベクトルが逆」。**

| 実現性 | 内容 | 根拠 |
|---|---|---|
| **今すぐ** | 内部版: 外部商品プールを内部 I_{u,p} で再ランク・答え合わせ | 役割分離。**外部 API ゼロで moonshot 価値の80%** |
| **近い将来（設計のみ）** | thin MCP server: purpose-fit サマリ+interval+source tag を read-only/用途限定/本人主導で貸出。実行は相手側 | MCP=Linux Foundation 標準。深層 belief は留置 |
| **ファンタジー（却下）** | Amazon に好みモデルを渡して動かす | Amazon が2026-03 Perplexity 差止勝訴・walled garden。GDPR Art.20 限定・**日本 APPI に一般 portability 権なし**。哲学が export を INCOMPATIBLE と明示 |

**Amazon 例の正直な reframe**: 「外部が私のモデルで動く」でなく「**Amazon の商品プールを Aneurasync 内に取り込み内部モデルで再ランク・答え合わせ**」。candidates outside, judgment inside; **the model is lent, never given**。
**moat か → YES、ただし API 形式でなく観測が moat**。MCP/Solid は配管をコモディティ化。差は中身—47軸 Bayesian × revealed pref × 当日 state × 矛盾検出は購買ログ/LLM 履歴から**復元不能な潜在変数**（data processing inequality）。「user-as-API 競争で勝つ」＝「最良の API 仕様」でなく「**最も深い観測を最も honest に持つ**」に還元。
**最初の橋頭堡＝内部の答え合わせ**（prior が名指しした急所「post-visit 1問観測」。外部 API ゼロで moonshot 核心価値）。

---

## 6. 定着 + cold-start

**個別化はリテンションの必要条件であって十分条件でない**（CEO の不安は正しい）。リピートを生む3ループ（全て SDT 情報的フィードバック型・ダークパターン不使用）:
1. **複利**: 使うほど「この1人のモデル」精度↑（bayesian precision の本物の複利）。「先月のあなた vs 今」を CI 収束差分で情報的に提示。
2. **保有効果（IKEA効果・最大63%過大評価）**: 「あなたの観測N件がこのモデルを作った」＝哲学非違反の唯一のスイッチングコスト。
3. **自己発見 aha（Loewenstein information-gap）**: 数回に1回、盲点を surface。反復(satiation)を避け新 gap を開け続ける。

**felt value を薄いうちに届ける＝「観測の鏡」**: cold-start の死を埋めるのは推薦精度でなく**回答そのものを仮説トーンで言語化して返す**こと。「迷ったとき○を優先する傾向が見えました—まだ仮説です」は精度ゼロでも information gap を埋め aha を前借り。鏡は observation #1 から機能。

> **敵対検証の決定的指摘**: このリテンション論は**仮説であって証明済みでない**。生死は1問に還元—「**recurring・external・involuntary な trigger が fresh prediction-error fuel を emit するか**」。Oura は睡眠（毎晩自動）で満たす。Aneurasync の trigger は実世界の決定/訪問だが**volitional・低頻度**がリスク。これが post-visit 観測器官が「cold-start の生死を分ける単一の急所」である理由。**最初のコホートで post-decision-observation rate を計測すれば、Oura か 16Personalities か1コホートで分かる。**

---

## 7. moat と なぜ世界トップ

**THE BET: 「Consent-Owned Judgment Layer（合意所有の判断レイヤー）」を、エージェント時代の Trust Boundary 標準として握る。** どのエージェント（ChatGPT/Siri/WeChat/Visa agent）が代わりに動こうと「私の判断軸で動いているか」を保証する中立・本人所有の層を Aneurasync が持つ。

**un-copyable な理由**（競合の構造的盲点を反転）:
1. vs Apple/Google: モデルが**薄い**（surface context 最適化）。判断原理を作る動機がなくプライバシー方針上むしろ作らない＝空白地。
2. vs Netflix/Amazon: **revealed preference の天井**（行動から推定し「学んだ/変えた/教え込んだ」を区別不能・自社収益で汚染・横断不能）。目的関数 ≠ ユーザーの自己統治（信頼の利益相反）。
3. vs Personal.ai/Limitless: **memory ≠ model**（ログはあるが軸・確信度・矛盾・状態依存への構造化なし。Limitless は B2C 失敗）。
4. vs WeChat/Alipay: 横断するが**浅い**＋利益相反最大＋geo-locked。

**全競合は revealed preference から推定。Aneurasync だけが considered preference（熟慮された判断原理）を本人観測から構築**（arXiv 2410.12123: 行動は熟慮選好の信頼できない代理で、データを増やすほど自社目的への汚染が増える＝量で勝つ陣営の構造的呪い）。Aneurasync はその呪いの外側。
moat 3層: ①判断原理の深さ ②状態分離（絶対品質は負け受容・個人適合で勝つ）③訪問後の答え合わせ（誰も持たない観測器官）。honesty firewall（本人専用・非公開）が逆説的に **anti-gaming moat**（誇張する観客が居ない＝Yelp/Tabelog/Google の腐敗源を設計で消す）。**format はコモディティ、観測こそ防御線。**

---

## 8. 段階ロードマップ（moonshot から逆算・depth-before-portability が非交渉）

| Stage | 最小の正直なステップ | flag/cost/privacy/rollback | 前提 |
|---|---|---|---|
| **0（今すぐ・自律可）** | **post-visit 1-tap 答え合わせ器官 + 観測の鏡（obs #1 から）**。cold-start の急所＝Stargazer 深層観測の完成 | localStorage/fixture・production state ゼロ・flag OFF・DB 変更ゼロ（profile API の belief 読取で I_{u,p} 近似） | なし。今月 success condition 直結 |
| **1（自律可）** | 適合アーク3状態＋ordinal confidence＋件数チップを1カードに | 既存 ProgressRing+profile API・flag OFF | Stage 0（**アーク単独リリース不可**・答え合わせと COMBINE 必須） |
| **2（自律可）** | State Covariate を placeAffinity.rerank に注入＋アークを Lens/Travel/Location Notes へ配線 | pure helper・flag OFF | Stage 1 |
| **3（CEO/DB承認）** | `/api/me/query` 統一＋portable `PersonalModel` 型を**内部正本**化（散在 route 収斂） | **内部のみ・外部露出なし**。consent enforcement を全 read path 配線 | Stage 0-2 + consent |
| **4（CEO/DB承認）** | 実 I_{u,state,p} 永続化＋mood 軸 migration。staging 検証 | **migration=CEO 承認。CLI が production link 中→staging re-link + backup 二重確認必須** | Stage 3 |
| **5（CEO承認・次フェーズ北極星）** | thin MCP「preference provider」server（サマリ read-only・実行 merchant 側・各ステップ本人確認） | 対外公開/API発行=CEO 承認。flag OFF・production hard-block | Stage 4 + 観測の深さ |

**Stage 0-3 が「Stargazer 深層観測の完成」+「世界観の一貫」+「デプロイ可能」= 今月の成功条件に完全内包**。Stage 4-5 のみ繰延・CEO gate。

---

## 9. 棄却した道 / 生き残るリスク

**やってはいけない（NO）**: ❌単一の精密品質スカラー星 ❌credible interval の**幅を主役 glyph 化**（CHI 2024・prior のこの部分を却下）❌Amazon/Netflix への OAuth/軸 export/data broker（哲学 INCOMPATIBLE・法的に閉じる）❌Solid 標準を「待つ」❌streak/変動報酬/社会的証明/人気ランキング（内発動機を焼く・EU 不公正商慣行）❌アイテム協調層での横断混合（−10.6%）❌**アーク単独リリース**（答え合わせなしでは凍結し「死んだ glyph」）。

**生き残るリスク**:
1. **🔴 cold-start value vacuum（最高確率の killer）**: 3ループと I_{u,p} が観測~10件まで凍結→招待制小N で Google/Apple との差を体感できず churn→今月の「初期ユーザーフィードバック」を脅かす。唯一の橋「観測の鏡」が未実装かつ最も未仕様。**1コホートで loop-closure rate を計測して判定。**
2. 🟡 glanceability-vs-honesty 退化: 件数が tier から削られると即 de Langhe の件数無視アンカーへ→**件数同伴を型強制必須**。
3. 🟡 cross-domain negative transfer: 一方向契約・矛盾マップ gap test が未実装→「薬の誤推薦」型事故で trust 永久破壊。
4. 🟡 user-as-API scope creep: 「sign in with Aneurasync」を retailer に開くのが最も高価値に見え最も哲学違反→borrow-not-own の hard NEVER line。
5. 🟡 DB/consent drift: migration が scoring_engine_upgrade に触れ CLI が production link 中→staging re-link + CEO 承認前は DB 作業不可。
6. 未証明: 自己認識満足が glance か reflection か（観測器官 live まで確認不能）。

---

## 10. CEO 意思決定ポイント

**決定1: Aneura-star を「適合アーク」として採用するか** → ✅ **採用**。星の affordance を保ち、表示を「他者の平均品質」→「あなたへの適合」に差し替え。confidence をアークの形に符号化・件数チップ必須・ordinal confidence・interval 幅は降格。「needs a star」と「no false precision」を**トレードオフでなく reconcile** する唯一の形。

**決定2: 最初に何を作るか** → ✅ **post-visit 1-tap 答え合わせ器官を最優先（Stage 0）**。アークでも MCP でもない。prior が名指しした「cold-start の生死を分ける単一の急所」＝Stargazer 深層観測の完成。**アークはその readout として2番目**。★アーク先行で signal 要求に早く応えると、答え合わせループなしでアークが凍結し「生きて見えて inert な glyph」＝設計が禁じる false-aliveness を製造。**critical path は「答え合わせ→アーク」であって「アーク→答え合わせ」ではない。**

**決定3: moonshot をどう正直に frame するか** → ✅ **「ユーザー自身が API」を「合意所有の判断レイヤーを agent が borrow（lend, never give）」に再定義**。Amazon 例は「外部プールを内部で再ランク・答え合わせ」。「世界トップ share の北極星」と「今月やること」を時間軸で分離。

**決定4: 何が CEO/DB/privacy 承認を要するか** → ①`/api/me/query` の**外向き公開**（内部正本化は自律可）②mood 軸/I_{u,p} 永続化 migration（**staging re-link + backup 二重確認必須**・CLI prod link 事故源）③MCP server（対外公開/API発行）④consent enforcement の全 read path 配線を /api/me/query 露出の **hard prerequisite** に。

**決定5: glanceability honesty を invariant 固定するか** → ✅ **YES**。tier badge から evidence 件数を削ることを設計仕様で禁止（型強制）。A/B 圧力で件数が落ちると firewall 崩壊→moat 自壊。

**決定6: retention 仮説を計測でゲートするか** → ✅ **YES**。「ダークパターンなしで retain」は**仮説**。最初のコホートで **post-decision-observation rate** を単一判定指標に instrument。数字が出るまで streak 等の圧力に屈しない。loop が週次未満なら prediction-error stream が枯れる（Oura か 16Personalities かを分ける）。

---

**一行サマリ**: CEO の方向は正しく、形式（星・export）が間違っている。世界トップへの賭けは1つ—**最も深い観測を最も honest に持つ Consent-Owned Judgment Layer を Trust Boundary 標準として握る**。今月の最初の一手は post-visit 答え合わせ器官（外部 API ゼロで moonshot 価値の80%）。Aneura-star はその readout。

---

## 付録: 設計案の判定スコア（1-5・全5案 keep）

| 案 | glance | honesty | emotion | crossDomain | userAsApi | retention | moat | feasibility |
|---|---|---|---|---|---|---|---|---|
| **Aneura-star（適合アーク）** | **5** | 5 | 4 | 4 | 4 | 4 | 4 | 3 |
| Self Model（Consent-Owned Judgment Layer） | 4 | 5 | 5 | **5** | 4 | 4 | **5** | 4 |
| State Covariate Lens（今のあなたなら） | 4 | 5 | 5 | 4 | 4 | 3 | 4 | 4 |
| 育てる鏡（Cultivated Mirror） | 4 | 5 | 5 | 4 | **5** | 4 | 4 | 3 |
| Borrowed Self（Human OS Layer 5） | 4 | 5 | 5 | 4 | 4 | 3 | 4 | 4 |

**5案すべて同一アーキに収束**: 役割分離 + 階層ベイズ + honesty firewall + post-visit 答え合わせ + 内部 borrow-not-give。Aneura-star が glance=5、Self Model が moat=5。

> 本レポートは **research/設計勧告のみ**。実装・route・API・production・env・DB・origin/main push なし。次は CEO の §10 判断（特に D1 適合アーク採用・D2 post-visit 答え合わせ器官を最初に）待ち。
