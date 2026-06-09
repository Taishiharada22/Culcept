# Reality Gradient Engine 構想 — 評価レポート（CEO 諮問への回答）

- 日付: 2026-06-10
- 作成: Claude（AI Executive Office）
- ステータス: **CEO 判断材料（本文書は決定ではない）**
- 諮問内容: 「AI が要 = 誰でも到達できる。違う次元のものを作るしかない。その次元とは何か。新技術を作れないか」＋ GPT 提案「Reality Gradient Engine / Reality IR / Personal Reality Compiler」＋「Alter を /plan に常駐させる」案の評価
- 調査体制: 外部リサーチ 3 系統（介入科学 / 技術ランドスケープ / 競合 18 プロダクト）+ 内部調査 2 系統（コード資産インベントリ / 戦略文書整合）

---

## 0. 結論（5 点）

1. **GPT 案は方向として正しいが「未知の発明」ではない。** 学術では JITAI（2014〜）・Active Inference・Dialogue State Tracking として要素は全て先行例がある。引用された arXiv 5 本は全て実在（捏造ゼロ）、ただし 3 本はエンタープライズ/産業ドメインの論文を個人文脈に引き寄せたもの。
2. **構想の約 6 割は、このリポジトリに既に存在する。** ForceBalance / DailyGuidanceFrame / HDM 気候・季節・天気 / P4 反実仮想 / P5 Reality Anchoring / weightCalibration / plan_drift_events / PRG（Phase A dogfood 運用 2 日目）。GPT が「発明すべき」と言ったものを、我々は別の名前で 4 ヶ月作ってきた。
3. **世界で本当に空いている白地は 2 つ**: ①状態依存の戦略 3 分岐（守る/楽/攻める — 出荷例ゼロ）②**崩壊予測の答え合わせループ（完全空白）**。①は A3 What-if comparison として既に dogfood 中。②が最優先の新規投資先。
4. **「別次元」の正体は単一技術ではなく 4 要素の複合**: 人格が物理定数になる × 毎晩採点される AI × 信頼で増える介入権限 × Alter がセンサーになる。各要素単体はコピー可能、複合は困難。モデルが賢くなるほどこの複合の価値は上がる。
5. **Alter /plan 常駐は賛成。** ただし新トラック新設ではなく PRM⇄Alter Bridge（A1-7-36、stop gate 中）の解錠 + N-3「開いた時だけ・見立て/下書き」決定の発展形として。push 型常駐は CEO+GPT 合議で確定済みの N-3 決定と正面衝突する。

---

## 1. 最重要事実: 構想の約 6 割は既に存在する

GPT はコードベースを知らずに提案している。対応表:

| GPT の概念 | 既存資産 | 状態 |
|---|---|---|
| Reality Field（状態場の内部変数） | `ForceBalance`（8 次元連続量）`lib/stargazer/alterHomeAdapter.ts:158` / `DailyGuidanceFrame`（time_budget・energy_level・hard_constraints・desire_direction 等）同 :8048 / `ObservationStateInput`（energy/emotion/social/timeOfDay）`lib/stargazer/stateWeighting.ts:17` | 🟢 実装済（ただし per-day 永続化なし） |
| Collapse Predictor | Human OS **Layer 4: Early Warning System**（設計済・DRAFT）/ PRG「今日のあなたなら」補正（decision-log L200、dogfood 中）/ Reality Control OS Phase 0 設計 | 🟡 設計あり・計算ロジック未実装 |
| Intervention Vector | `ActionShape` 8 離散形 + `resolveActionShape()` / P5 `realityAnchoring.ts`（ゲート + after-action loop）/ 横エンジン R4 Moment Trigger（silence-by-default cap1） | 🟢 語彙・ゲートは実装済 |
| Counterfactual Simulator | P4 `counterfactualSimulation.ts` + `STARGAZER_COUNTERFACTUAL_LIVE`（実装完了・未ロールアウト）/ A3 What-if（inverse + comparison、dogfood ON） | 🟢 対話領域は実装済・plan 領域は A3 が前線 |
| Correction Gradient | `weightCalibration.ts`（axisWeightMultiplier 0.3–1.5）/ `predictionLearningLoop.ts` / Reaction Learning（W5） | 🟡 部分実装 |
| Permission Boundary | HDM Phase 0-5 + TrustLevel + `hdmPhaseToTrustLevel()`（phase が信頼上限を規定）`lib/stargazer/hdmPhase.ts` | 🟢 実装済（CEO 承認済の北極星文書） |
| Intention Mass | `identityFit` 言語化 + Stargazer 45 軸（深層意図の観測そのもの） | 🟡 軸は存在・plan への接続が未配線（= PRM⇄Alter Bridge の領域） |
| Reality Diff | A3 What-if reason-only UI（数字なし・断定なしの定性差分）= dogfood 有効 | 🟡 v0 が走っている |
| 予測 vs 実績の記録 | `alter_morning_plan_history`（plan_date PK）+ `plan_drift_events`（predicted/actual フィールド定義済）+ Self vs Oracle テーブル群 | 🔴 **テーブルはあるがループが閉じていない**（actual を誰がいつ記入するか未定義） |

**含意**: 「Reality Gradient Engine」は新エンジンの発明ではなく、**既存トラック（PRG + A3 + Phase B gate + 横 R3/R4 + HDM）の束ね直しと命名**である。戦略文書上も Human OS Layer 2→3→4 を 1 日の時間軸で貫く実装形に過ぎず、`docs/prm-alter-bridge-design.md` が既に同じ座標を宣言している。

---

## 2. 外部リサーチ要約

### 2.1 介入科学（JITAI / wearables）— 「先回り介入」には 40 年分の先行知見がある

- 「状態の脆弱性（vulnerability）/ 好機（opportunity）/ 受容性（receptivity）」は JITAI として学術定義済み（Nahum-Shani 2018）。**GPT の Collapse Predictor / Intervention Window はこの再発見**。
- **HeartSteps の決定的事実**: 文脈適応の介入効果は初日 +66% → 2%/日で減衰 → **28 日目に統計的ゼロ**。「2〜4 週間で退屈」。先回り介入を単独機能にすると 1 ヶ月で価値が消える。
- 受容性予測は**生理センサーなしで +40% 改善可能**（時間帯・曜日・活動・デバイス文脈のみ）。バイオセンサーがないことは弱点ではない。
- EMA（状態自己申告）は 1 日 1 回なら遵守率 91%、複数回で 77%。**負担の低下が離脱に先行する**。
- 合成スコア（Whoop/Oura readiness）は全社算出非開示・体感と乖離・**orthosomnia（スコア不安）を生む**ことが査読研究で示されている。「体力スコア 65」を出した瞬間、WHOOP への批判を全部継承する。
- アラート疲労: 臨床 CDS の override 率 90-96%。文脈化して 3 割を抑制したら override が半減。**「黙る判断の精度」が「出す判断の精度」より重要**。
- JITAI のメンタルヘルス効果量は g=0.15（小）。「劇的に変わる」という期待値設定は失望→離脱を生む。

**導かれる設計法則**: ①沈黙 > タイミング > 内容 ②介入予算（1 日 1 回以下）③不確実性は task-aligned に提示・断定しない（交渉形）④スコア化禁止 ⑤初期は high-precision / low-recall。— **この 5 つは全て、我々の既存決定（N-3 / A3 / R4 cap1 / 沈黙原則）と一致している。** 我々は文献を読まずに文献どおりの結論に到達済み。

### 2.2 技術ランドスケープ — 「メモリは主流、現実状態エンジンは稀」はおおむね真

- エージェントメモリ（MemGPT/Mem0/Zep 等)は完全に成熟・商用化。ただしサーベイが明示する未解決 = **因果的検索・学習的忘却・記憶→行動の結合**。Reality IR が狙う層はこの未解決ゾーンに直撃。
- Anthropic の context engineering は**意図的に「無型ノート」を推奨**しており、「型付き生活状態レイヤー」は実務でほぼ未開拓。DST（対話状態追跡）の生活状態への一般化も未確認。あえて型付き IR を持つのは合理的な賭け。
- Apple（WWDC26 / Spotlight semantic index）・Google（Personal Intelligence / "Your Day"）は**横断検索 + proactive 提案止まり。「あなたの今日の状態を推定する状態エンジン」は持っていない**。レイヤーが違うため OS 勢と直接衝突しない。ただし降りてくる前に答え合わせデータを積むのが時間優位。
- 引用検証: GPT の arXiv 5 本は**全て実在・トピック一致（捏造ゼロ）**。ただし governed memory / Digital-Twin MDP / DT survey の 3 本は実体がエンタープライズ/産業向けで、個人向け先行例ではない。
- 個別要素（構造化人物像 = SensorPersona / 分岐反実仮想 = ライフシミュレーター系 / 予測誤差 = Active Inference）は全て先行例あり。**新規性は「個人の 1 日 × 型付き IR × 介入反実仮想 × Reality Diff × LLM は説明に限定」の 5 条件同時成立**にある。

### 2.3 競合 18 プロダクト — 5 能力ギャップマップ

| 能力 | 世界に存在するか | 最接近 |
|---|---|---|
| (1) 今日が成立するかの崩壊予測 | 部分（体力予測と時間量警告が**分裂**したまま） | Lifestack / Sunsama / rivva |
| (2) 介入単位の許可段階 | 概念のみ（Suggest/Auto/Off の global mode 止まり） | Temporal / Morgen / Reclaim |
| (3) 状態依存の 3 分岐（守る/楽/攻める） | **ほぼ無**（手動テンプレのみ） | 該当なし |
| (4) 採用時の差分プレビュー | 部分（preview はあるが因果差分の言語化なし） | Lifestack |
| (5) 予測の答え合わせ・崩れ方の学習 | **ほぼ無**（タスク所要時間の較正のみ） | Sunsama / Rise |

- Motion/Reclaim = 締切最適化（人間の状態は非モデル）。Clockwise は 2026/3 にサービス終了。
- コンシューマ・パーソナル AI は退潮: **Dot 終了（2025/10）・Pi 撤退・Limitless は Meta 傘下で新規販売停止**。「人格ある AI」単体では生き残れなかった。構造のループとデータの堀がなかったため。
- **「プランナーの中に住んで今日を読み、崩れ方ごと学ぶ存在」= 人格・観測・予測・較正の 4 点を兼ねた競合は存在しない。**

---

## 3. 本当に空いている白地は 2 つ — 最優先は「答え合わせループ」

**(3) 状態依存 3 分岐**は A3 What-if comparison（手堅い/現状/積極的）として既に dogfood 中。つまりもう走っている。

**(5) 答え合わせループ（Prediction Ledger / 予測台帳）**が最優先の新規投資先である理由:

1. **堀になる**: 「朝の読み → 夜の実際 → 較正」の蓄積データは買えない・移植できない。使うほどその人固有になる（GPT の言う Correction Gradient の上位形）。
2. **哲学に直結**: 予測誤差の提示 =「Alter は今日のあなたをこう読んでいた。実際はこうだった」=「自分って、そういう人間だったのか」の**日次版**。予測誤差からの自己理解は Active Inference の中核機構でもあり、HDM の存在論と数理的に同型。
3. **インフラが既にある**: `alter_morning_plan_history` + `plan_drift_events`（predicted/actual）+ SvO の答え合わせパターン。**閉じていないだけ**。
4. **Phase B の data gate を養う**: MobilityObservation ≥14 日等の gate 充足と同じ運動でデータが貯まる。
5. **habituation への唯一の防御**: HeartSteps 型の減衰を逃れる仮説 =「介入は消費される通知ではなく、自己理解という蓄積資産に接続する」。答え合わせがその接続装置。※この仮説は文献未検証 → **dogfood 30 日判断に「28 日目の介入価値減衰チェック」を追加すべき**。

---

## 4. 「別次元」の正体 — 4 要素の複合（私の答え）

CEO の問い「AI が要 = 誰でも到達できる」への正面回答。LLM はコモディティ。複製困難なのは以下の複合:

1. **人格が物理定数になる**: GPT の物理エンジンは変数が万人共通（time pressure, friction）。我々の版は **Stargazer 45 軸が力学の係数を決める** — 同じカレンダーでも崩れ方が人によって違い、その「なぜ」を知っているのは観測エンジンを持つ我々だけ。SensorPersona はセンサー由来、Lifestack は睡眠由来。深層の判断特性由来は世界に無い。= PRM⇄Alter Bridge の実体。
2. **毎晩採点される AI**: 競合は誰も自分の予測を採点されない。採点されるからこそ数値が「コスプレ」でなくなり、外れが信頼を壊さず学習に変わる（「外れたら較正される」ことの可視化は文献上も信頼を上げる）。
3. **信頼で増える介入権限**: HDM Phase/Trust = 介入権限の階段は承認済みで実装済。競合は global mode 止まり。権限は時間をかけて獲得するもので、後発が一足飛びにコピーできない。
4. **Alter がセンサーになる**: 状態は form でなく会話・チップで入る（EMA 負担問題の解）。/plan 常駐の本当の意味は UI ではなく**データ取得戦略**。CEO 自身が「状態の管理とか、ユーザーからの情報を全て楽に吸収できる」と言っているのはこれ。

**「ロジック依存ではない何か」への正直な回答**: 実装した瞬間、全てはロジックになる。「ロジックでない技術」は存在しない。複製困難性の正しい軸は「ロジックか否か」ではなく、**(a) 現実に採点されているか (b) 使うほど固有化するか (c) 権限が信頼で増えるか**。GPT の言う「現実の切り方（ontology）が発明部分」は正しい — そして切り方の設計は 4 ヶ月分すでに蓄積がある（ForceBalance の 8 力、DG Core4、HDM 5 レンズ、45 軸）。

---

## 5. GPT 案の採点

**採用すべき点**: 状態をプロンプトでなく構造で持つ / 推測値+根拠+確信度+本人補正のセット / 拒否理由を分解して学習する Correction Gradient / 軸の設計（切り方）こそ発明という整理 / 最初は 10 軸でなく粗い値で良いという段階論。

**危険な点（5 つ）**:

1. **数式コスプレ**: `collapseRisk = 0.25*timePressure + ...` は採点されない限り任意の数字。見せれば orthosomnia、内部でも誤学習の温床。→ 数式より先に答え合わせループ。decision-log L200 の PRG stop gate（偽数値禁止）が既に正しい。
2. **UI コピーが社内確定決定と衝突**: 「今日の現実は、少し右に倒れています」は断定 + 警告調 = A3 HARD 不変条件（数字/断定なし）+ N-3 禁止語彙（警告/リスク/おすすめ）に抵触。正しくは観測トーン: 「夜に負荷が寄って見えます。早めに出るか、夜を軽くする手もあります」。
3. **push 型常駐**: N-3 哲学的境界（2026-05-23、**CEO+GPT 合議で確定済**）=「AI が勝手にプッシュしない、user が開いた時だけ」。別チャットの GPT は自らの過去合議と矛盾する提案をしている — 社内記録と接続しない助言の構造的限界。
4. **「LLM は説明だけ」は行き過ぎ**: 会話→IR の抽出（`extractDailyGuidanceFrame` の進化形）こそ LLM が最強の場所。正しい分離は「**状態の保持・更新・採点は構造、解釈・抽出・対話は LLM**」。
5. **10 変数同時導入**: 拒否理由が分解できない器は学習を汚すという GPT 自身の警告と矛盾。3〜4 軸（予定密度・移動連鎖・回復余白 + 確信度）から。

---

## 6. Alter /plan 常駐 — 賛成、ただし実装の正道は決まっている

**評価**: 方向は正しい。「予定アプリの中に Alter が住む」は競合空白（§2.3）かつ Alter=センサー戦略（§4-4）の実装形。

**修正点と具体案**:

- **実装の正道**: 新規 UI トラック新設ではなく、(a) PRM⇄Alter Bridge（A1-7-36、設計済・stop gate 中）の解錠 + (b) N-3 empty-day ALTER 入口の発展形 + (c) alter-morning compose の常設化、の 3 既存資産の合流として設計する。`REALITY_ALTER_BRIDGE_LIVE` の enable は現在禁止リスト入りであることに注意（解錠は CEO 判断）。
- **配置**: List タブを host に Dock 3 段階（常駐 1 行 → ボトムシート → 全画面は大型再設計時のみ）を支持。タブは増やさない。「リスト = Alter の視界」は ExecutionLayerChip / TransitionChip で半分実装済み。
- **語彙**: 見立て / 下書き / 今日を組む / 空き日の観測（N-3 許可語彙）。禁止: おすすめ / 最適 / 警告 / リスク / 注意。
- **Dock の一言は沈黙原則に従う**: R4 の silence-by-default cap1 を dock にも適用。「常に何か言っている」は habituation で死ぬ（§2.1）。変化がない日は沈黙。
- **チップ入力**: 「今日はきつい / 攻めたい / 守りたい」のワンタップ = DailyGuidanceFrame への直接インテーク。タイピング不要・1 日 1 タップ以下（EMA 91% ライン）。キーボードがリストを覆うモバイル問題への解でもある。
- **Home の役割**: AskHero は入口・世界観として残す。/plan dock は運用面の存在。急に Home から剥がさない。

---

## 7. 推奨シーケンス（今月の成功条件と整合）

| 順 | 内容 | 種別 | gate |
|---|---|---|---|
| 0 | dogfood 運用継続（本日 2 日目 → 7 日判断 6/16 頃 → 14 日判断） | 運用 | 既存 runbook |
| 1 | 北極星ネーミング: 傘の名前で既存トラック（PRG / A3 / Phase B / 横 R3-R4 / drift）を一枚に再記述 | docs のみ・コード 0 行 | CEO 命名判断 |
| 2 | **答え合わせループ v0 mini-design**（夜に「今朝の読みはどうだった?」1 問 → plan_drift_events.actual 記入 → 朝の読みに反映） | 設計のみ | 実装は「新規データ保存」stop gate → CEO GO |
| 3 | Alter Dock mini-design（§6 の形） | 設計のみ | 実装 GO は 7 日判断後に判断 |
| 4 | dogfood 30 日判断に「28 日目の介入価値減衰チェック」を追加 | runbook 追記 | Chief of Staff 提案 → CEO |
| - | Metis / X Ops への汎化 | **今はやらない**（設計の分離だけ意識: shared 原則と同じ） | - |

**CEO 判断事項（3 点）**:
1. 傘ネーミングを採用するか（候補: Aneura Reality Engine / Reality Gradient Engine / 既存 PRG の昇格）。乱立回避のため PRG・Reality Control OS との関係図を 1 枚にすることを推奨。
2. 答え合わせ v0 の設計着手 GO（実装 GO は設計レビュー後に別途）。
3. Alter Dock の設計着手 GO（実装は dogfood 7 日判断と合流）。

---

## 8. 出典（主要）

- JITAI: Nahum-Shani 2018 (PMC5364076) / HeartSteps Klasnja 2019 / 受容性予測 Mishra 2021 (PMC8680205) / JITAI メタ分析 2024 g=0.15 / EMA 遵守 JMIR 2023 / orthosomnia Baron 2017 / composite score 評価 De Gruyter 2025
- 技術: arXiv 2603.07670（agent memory survey・実在確認済）/ 2603.17787 / 2601.01321 / 2506.14453（Active Inference DT）/ 2603.22083 / SensorPersona 2604.06204 / Anthropic effective context engineering / Apple WWDC26 / Google Personal Intelligence
- 競合: Lifestack / rivva / Temporal.day / Sunsama / Motion / Reclaim / Morgen / Rise Science / Bee (Amazon) / TimeTree / Dot 終了 (TechCrunch 2025-09) / Clockwise 終了 (2026-03)
- 内部: `lib/stargazer/alterHomeAdapter.ts:158,8048` / `lib/stargazer/hdmPhase.ts` / `lib/stargazer/weightCalibration.ts` / `supabase/migrations/20260430110100_plan_drift_events.sql` / `supabase/migrations/20260502100000_alter_morning_plan_history.sql` / `docs/decision-log.md:200` / `docs/a3-soft-connection-mini-design.md` / `docs/dogfood-operation-plan.md` / `docs/phase-b-readiness-gate.md` / `docs/prm-alter-bridge-design.md` / `docs/stargazer-human-os-design.md`（DRAFT・承認チェック未完に注意）
