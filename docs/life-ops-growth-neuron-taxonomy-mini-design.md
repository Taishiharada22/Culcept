# Life Ops — Growth Neuron Taxonomy / Personalized Rationale Context mini-design【pure 契約・UI/DB/通知/本番/LLM分類は禁止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: habit-growth-mini-design（neuron 枝の申し送り）/ category-model(growth 5) / habit-model / candidate-types / card-presenter。
> **CEO 指示**: growth を habit category で終わらせず、将来 Aneurasync がユーザーの状態・性格・能力・目的を認知して**根拠付きで提案**できるための neuron-like branch taxonomy を pure 契約として設計。free text 分類・LLM 分類・実データ接続は禁止。

---

## 0. 一行
growth 5 カテゴリに **dimension（軸）× closed vocabulary（管理語彙）** の枝を定義し、「将来、構造化入力や観測から安全に入ってきた情報を**どの neuron branch に置けるか**」の pure 契約（型・定数・validator）を作る。habit 候補へは **3 slot（approach/unit/evidence）だけ**安全に最小接続し、根拠付き低圧文言を実証する。

## 1. 上位カテゴリと branch dimension の関係（設計整理 #1）
- **上位カテゴリ**（workout/study/reading/weekly_review/skill_practice）＝「行動の種類」。habit model（いつ出すか）と permission の単位。
- **branch dimension**＝「同じ行動の**中身**」（何を/何のため/どうやる/どの量/何が障害/何が根拠）。カテゴリごとに dimension 集合を持ち、各 dimension は **closed vocabulary**（id+日本語 label の定数）。
- neuron 像: カテゴリ＝ニューロン本体、dimension＝樹状突起、value＝シナプス。将来の入力は **valueId 参照**でのみ枝に置ける。

## 2. category を増やす / dimension で扱う の境界（#2）
- **カテゴリを増やす**のは「行動の性質・時間構造・permission が変わる」とき（例: 筋トレ vs 勉強）。
- **dimension で扱う**のは「同じ行動の what/why/how/how-much/friction/evidence の違い」（例: 英語の勉強 vs 資格の勉強 → study×domain）。
- → カテゴリの爆発を防ぎ、組合せは dimension の直積で表現（CEO「無限に増やすのではなく軸で広げる」）。

## 3. taxonomy（5 カテゴリの branch schema）
**共通 vocabulary**: level=入門/中級/上級、evidence=最近できた/最近詰まった/続けられている/しばらく空いている（→ §5 evidence slots）。
| category | dimensions |
|---|---|
| **study** | domain(英語/資格/プログラミング/仕事の知識/受験/語学/専門知識) / purpose(試験合格/実務/昇進/趣味/収入/健康/自己理解) / target(教材を終える/試験合格/目標点/習慣化/1テーマ理解) / **current_level・goal_level**(共通level) / method(読解/演習/暗記/書き取り/リスニング/説明/復習) / unit(5分/15分/1章/10問/動画1本/1ページ) / friction(疲労/苦手意識/時間不足/集中切れ/準備不足) / evidence |
| **workout** | goal(筋力/体力/減量/姿勢/健康維持/メンタル安定) / mode(自重/ジム/ラン/ストレッチ/体幹) / intensity(かなり軽め/軽め/ふつう/しっかり) / body_state(疲労気味/睡眠不足/痛みあり/余力あり) / unit(5分/10分/1セット/1km) / evidence |
| **reading** | purpose(知識/仕事/教養/思考整理/娯楽) / material_type(本/記事/論文/ドキュメント) / mode(流し読み/精読/要約/実践) / unit(1ページ/10分/1章) / evidence |
| **weekly_review** | scope(生活/仕事/学習/お金/人間関係/健康) / output(振り返り/来週の方針/問題整理/予定調整) / depth(さっと/ふつう/じっくり) / evidence |
| **skill_practice** | skill(デザイン/コーディング/文章/スピーキング/音楽/操縦/分析) / practice_type(反復練習/制作/振り返り/模写/アウトプット) / level / unit(10分/1作品/1問/1投稿) / evidence |
※ method/mode/practice_type の label は**名詞形**（「復習を軽めに1回」と合成可能＝低圧文言変換 #5 の素）。

## 4. user profile / state / ability の将来接続（#3）
- 将来の `GrowthProfile`（per-user）: カテゴリごとの **NeuronSelection[]**（domain/purpose/target/current_level/goal_level/friction…）を構造化保持（収集は CEO ゲート）。
- **state**（疲労/予定密度）は横エンジンの energy/density を読む将来接続（本 slice 非接続）。body_state/friction はその受け皿 dimension。
- **ability** = current_level/goal_level の差分 + evidence 蓄積 → 「この人にはこのやり方」の根拠（北極星）。本 slice は**置き場（契約）**まで。

## 5. 根拠付き提案の evidence slots（#4）
`GrowthEvidenceKind = recent_success | recent_struggle | sustained_streak | long_pause`（全カテゴリ共通 evidence dimension の valueId と一致）。
presenter が**低圧の根拠文**に変換: 最近できた→「最近うまくいった流れがあります」/ 詰まった→「最近は詰まりやすかったので、軽くで十分です」/ 続いている→「これまでの積み重ねがあります」/ 空いている→「間が空くのは自然なことです」。

## 6. habit model と neuron taxonomy の関係（#6）
- **habit model = いつ出すか**（週目標ペース・連続性 → ease_in/restart/gentle_restart）。
- **neuron taxonomy = 何を・どうやるかの内容文脈**（候補の metadata・根拠の素）。
- 接続: `HabitObservation.neuronSelections?`（valueId 参照）→ sanitize → `HabitDueReason.neuron?: HabitNeuronContext` → presenter が文言精緻化。**判定ロジック（phase）には影響しない**（混同しない）。

## 7. candidate に載せる / 載せない（#7）
- **載せる（3 slot のみ・全て taxonomy 定数由来 label/enum）**: `approachLabel`（method/mode/practice_type/output）・`unitLabel`（unit）・`evidenceKind`。
- **載せない**: domain/purpose/target/level/friction（→将来 GrowthProfile 側）・自由記述・メモ・user_id/DB id・スコア。候補は軽く、内容詳細はプロファイルに留める。

## 8. PII / free text / raw note を持たない方針（#8）
**closed vocabulary 契約**: 入力は valueId **参照のみ**。taxonomy に無い dimension/valueId は **sanitize で drop**（fail-safe）。表示 label は**定数からのみ**引く（入力文字列は一切表示経路に乗らない）。→ 自由記述・PII・raw note は構造的に流入不可能。

## 9. collector / presenter への最小接続（#9）
- collector: 変更なし（HabitObservation 経由で自然に流れる）。
- presenter: habit 文言を neuron で精緻化（approach→「復習を軽めに1回…」/ unit→「今日は1セットだけでも…」）+ evidence 根拠文を timingHint 行（補足行）に表示。**neuron 無しは従来文言のまま**（後方互換）。

## 10. 将来 UI / DB に進む前の gate（#10）
- **禁止のまま**: GrowthProfile の実収集/保存（DB・CEO ゲート）・free text/LLM 分類・UI での dimension 選択画面（L-8 拡張・世界観 gate）・横 energy/density 接続（本流）・通知。
- 本 slice の出口 = pure 契約 + habit 候補の根拠付き低圧文言まで。

## 11. 実装ファイル / テスト
- `lib/lifeops/growth-neuron.ts`（taxonomy 定数・validator・sanitize・label・HabitNeuronContext builder）/ `candidate-types.ts`（GrowthEvidenceKind・HabitNeuronContext・HabitDueReason.neuron?）/ `habit-model.ts`（neuronSelections 受け）/ `card-presenter.ts`（精緻化文言）/ tests / 本 doc。
- テスト（CEO 12 項目）: 5 カテゴリ branch valid / unknown dimension invalid / free text・user_id drop / habit と neuron metadata 非混同 / evidence→根拠文 / 低圧維持 / import 監査 / tsc baseline。
