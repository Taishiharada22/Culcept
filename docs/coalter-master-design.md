# CoAlter Master Design Document

> 2人の関係・性格・履歴・今の会話・外部情報を統合して、2人に最適な次の一手を出す関係性支援OS

**作成日**: 2026-04-14
**ステータス**: CEO 承認済み（2026-04-15、v1.1）
**改訂**:
- v1.1 — CEO承認に基づく修正反映 (2026-04-15)
- **v1.2 — PR #120-#128 設計追加反映 (2026-05-15、本書)**

**スコープ**: Talk（友人DM）限定。Rendezvous は対象外

---

## 0. v1.2 重要明示 (CEO 補正 2026-05-15)

本 v1.2 update は、PR #120-#128 で正本化された設計追加を Master Design 本体に反映する。**ただし以下を厳守**:

- **design completion ≠ runtime completion**: 設計完了と実装完了を混同しない
- **audit completion ≠ CEO decision completion**: audit material 整理と CEO 採用判断を混同しない
- 各追加項目に **status tag** を attach (§13.1 legend 参照)
- 「実装済 (✅)」と書く部分は **main merge 済 PR / 実コード** 根拠を attach
- 未実装は **「📋 design completion」「⚠ proposal」「❌ not implemented / future」「🔵 frozen」** と明記

**詳細追加** は **§13 v1.2 Updates Summary** (本書末尾) に集約。**v1.1 本文 (§1-§12) は最小限の additive edits のみ**、philosophy / 設計原則 / 確定事項は **不変保持**。

---

## 1. 定義と位置づけ

### CoAlter とは

CoAlter は「二者間に存在するAI」である。要約AIでも推薦AIでもない。
2人の関係と文脈を前提に、現在の共同課題を前に進める**関係性支援OS**。

### 3つの並立するAlter

```
A専用 Alter — Aだけに見える片側補助（既存。手を加えない）
B専用 Alter — Bだけに見える片側補助（既存。手を加えない）
CoAlter    — A-B間の関係性レイヤー（新規。完全に別レイヤー）
```

片側Alter = Intent Translation Engine（意図翻訳エンジン）。
ロジック・技術の転用はOK。責務の混合はNG。

### CoAlter の対象領域

意思決定だけではない。**2人の関係を前に進めるための共同補助OS全般**:

- 共同意思決定（映画、食事、**旅行 [v1.2 詳細化: 1-2 泊国内 MVP、§13.3]**、**活動 / 暇つぶし [v1.2 追加: PR #126、§13.4]**、予定調整、プレゼント）
- すれ違い整理（論点の可視化、感情と事実の分離）
- 関係温度調整（気まずさの中立翻訳）
- 共同の振り返り（二人の会話パターンの長期観察）
- 折衷案の生成（食い違い時の第三案）

**v1.2 update note**: 対象領域に **活動 (activity)** を追加 (PR #126 設計、status: 📋 design completion、impl 未)。旅行は **1-2 泊国内 MVP** として scope 詳細化 (PR #124、status: 📋 design completion、impl 未)。海外旅行 / 任意期間 / API 予約連携は **future scope**。詳細は §13.3 / §13.4 参照。

---

## 2. 設計原則（学術的根拠付き）

### 原則1: 翻訳者であり、調停者ではない

CoAlterは「言葉にならなかったものを言葉にする手助け」に徹する。
関係を「良くしよう」と積極的に動くほど裏目に出る。

> **根拠**: Bowen家族システム理論 — 二者間の不安が高まると第三者が巻き込まれるが、
> 第三者が二者関係を改善しようとすると逆の結果が生じる。
> PMC研究 — セラピストの否定的暗示1つごとに離別確率が18%上昇。

**禁止事項**:
- 関係の予後判定をしない
- 「相手は〜なタイプだから」と性格ラベルを貼らない
- 「AはBに合わせるべき」と指示しない
- 「Bは本当はこう思ってる」と断定しない
- 「この選択が正しい」と結論を押し付けない

### 原則2: パイ拡大優先（Expand Before Divide）

「A案 vs B案」の二択ではなく、背後の利害を満たすC案を生成する。

> **根拠**: Harvard PON統合的交渉理論 — 「高い自己関心 + 高い他者関心」が
> 創造的問題解決を生む（Dual Concern Model, De Dreu 2014）。

**実装パターン**:
- 「イタリアンがいい」→「なぜ?」→「パスタが食べたい」→ パスタがある和食店も候補に
- 「静かな場所」vs「賑やかな場所」→ 本質は「リラックス」vs「刺激」→「活気があるけど個室がある店」

### 原則3: 時系列公平性（Sequential Fairness）

1回の決定で完璧な合意を目指さない。長期的に「二人とも同じくらい満足している」を追跡。

> **根拠**: Masthoff (2011, Recommender Systems Handbook) — 
> 逐次推薦では公平性原理が適用可能。1回の完璧より時系列での公平が現実的。
> Basu Roy et al. (VLDB 2010) — Sequential Dynamic Adaptation Aggregation。

**実装**: Fairness Ledger（公平性台帳）— 各決定の「誰寄りだったか」を永続化し、
連続して譲っている側の重みを自動引き上げ。

### 原則4: 個別チャネル + 統合提案（根回し構造）【Phase 2以降】

各人に個別に聞く → AI が統合 → 二人に提案。

> **根拠**: 日本の根回し文化（Nemawashi）— 正式な場での衝突を避けるために事前に個別合意を形成。
> 土居健郎「甘えの構造」— 建前を直接聞くと建前が強化される。

**Phase 1では使用しない**: decisionモード（映画・食事・旅行）では膠着の原因は
情報不足か選択肢過多であり、本音を引き出す個別チャネルは不要。
共有会話の中の発言 + Stargazerの蓄積プロフィールで十分に推薦できる。

**Phase 2以降での実装条件**:
- 個別チャネルは明示同意のある場面のみ
- 個別回答は相手に直接開示しない
- 提案への反映は抽象化された形のみ（「二人ともこういう傾向がある」レベル）
- 個別確認を踏まえて提案した事実は両者に表示（透明性）
- negotiate/clarify モードでのみ使用。重いテーマは慎重に

### 原則5: 退出シグナル必須

CoAlterは適材適所で動く。居座らない。

> **根拠**: CSCW 2023 — AI の不完全な介入がグループダイナミクスを歪める。
> Conflict Resolution Quarterly (2025) — AI の感情分析介入には抵抗あり、事実整理には受容あり。

**実装**:
- 提案後は「あとは二人で決めてね」で退出
- 1セッション内の介入回数に上限
- 使用回数の可視化（使いすぎ防止）

### 原則6: 意図的曖昧性の尊重

曖昧さは常に「修正すべき問題」ではない。意図的なコミュニケーション戦略でもある。

> **根拠**: ResearchGate (2025) "Strategic Ambiguity in Digital Communication" —
> 拒否の軟化、コミットメントの遅延、対人的調和の維持のために曖昧表現が使われる。
> Li & Gao (2025) — 日本語の「配慮表現」は曖昧化による負担軽減。

**実装**: 曖昧さがダメージを生みそうなときだけ介入。それ以外は尊重。

### 原則7: 反武器化（Anti-Weaponization）

CoAlterの分析を片方が相手への武器として使えない設計。

> **根拠**: Science and Engineering Ethics (Springer, 2025) —
> ユーザーがAIの「中立的批判」を相手への攻撃に転用するリスク。

**実装**:
- 仲介分析は両者に同時表示
- 「相手をこう操作しろ」型の回答生成を拒否
- 「CoAlter がこう言ったからあなたが間違い」を防ぐ — 常に「可能性」表現
- 片方だけの情報提供では仲介しない

---

## 3. 5層アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: 個人理解（A Alter / B Alter）                    │
│  性格、価値観、癖、好み、不安、対立スタイル、意思決定傾向   │
│  深層心理、コミュニケーションスタイル、趣味、好きなもの     │
│  ソース: AlterPersonality, axisScores, life_profile_entries │
├─────────────────────────────────────────────────────────┤
│ Layer 2: 関係理解（CoAlter固有）                          │
│  2人の温度差、合いやすい点、摩擦点、意思決定パターン       │
│  過去の摩擦、楽しかったパターン、公平性台帳               │
│  ソース: 過去のtalk_messages分析, coalter_sessions履歴     │
├─────────────────────────────────────────────────────────┤
│ Layer 3: 現在会話理解                                     │
│  今何を決めたいのか（意思決定 / 整理 / 翻訳 / 調整）      │
│  どこで詰まっているか、感情状態、テーマ                   │
│  ソース: 直近の会話履歴, 膠着パターン検出                  │
├─────────────────────────────────────────────────────────┤
│ Layer 4: 外部世界接続                                     │
│  Web検索（検索が必要な場合のみ。Adaptive RAG判断）        │
│  日時、場所、現在の候補、現実制約、天気、季節イベント      │
│  ソース: Web API, Morning Protocol天気エンジン転用         │
├─────────────────────────────────────────────────────────┤
│ Layer 5: 提案生成                                         │
│  要約 → 解釈 → 関係性に即した提案                        │
│  提案 + 理由構造 + 代替案                                 │
│  選び方の設計まで含む                                     │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: 個人理解 — データソース

各ユーザーについて、既存Alterが持つフルデプスのデータを使用:

| データ | ソース | 用途 |
|--------|--------|------|
| 性格特性（45軸スコア） | axisScores in AlterPersonality | コミュニケーションスタイル差分 |
| アーキタイプ（表層/影/ストレス） | archetypeCode, shadowCode | 意思決定パターン推定 |
| コアフィアー/コアデザイア | coreFear, coreDesire | 本音の推定 |
| 矛盾（表面/深層の不一致） | dominantContradictions | 言動と本心のズレ検出 |
| 抑圧された特性 | suppressedTraits | 「本当はやりたいけど言えない」検出 |
| 対立スタイル | conflict_style axis | すれ違い時の対処パターン |
| 直接的/外交的 | direct_vs_diplomatic axis | 提案の伝え方調整 |
| 甘え傾向 | attachment_style, reassurance_need | 「任せる」の真意推定 |
| 好み・趣味 | life_profile_entries | 意思決定の材料 |
| 価値観 | values from life_profile | 「何を大事にするか」 |

**重要**: これらのデータはCoAlterのプロンプトに注入されるが、
相手ユーザーには直接開示されない。CoAlterの提案の「裏側」として機能する。

### Layer 2: 関係理解 — 新規構築

| データ | 構築方法 | 用途 |
|--------|---------|------|
| 温度差 | 直近会話のVAD分析比較 | 感情的距離の検出 |
| 合いやすい点 | 45軸の高一致ペア抽出 | 共通基盤の特定 |
| 摩擦点 | 45軸の高不一致ペア抽出 | 地雷回避 |
| 意思決定パターン | 過去のCoAlterセッション分析 | 「いつもAが譲る」等のパターン |
| Fairness Ledger | 各決定の誰寄りスコア累積 | 時系列公平性の追跡 |
| Caring Intensity | 反応速度・修飾語の強さ・代替案への言及パターン | 「どれだけ気にしているか」推定 |

### Layer 3: 現在会話理解 — 膠着検出

CoAlter起動時に直近の会話を分析し、以下を判定:

| 判定項目 | 検出方法 |
|---------|---------|
| テーマ（何の話か） | ドメイン検出（alterHomeAdapter転用） |
| モード（何をしたいか） | decision / conflict / planning / reflection |
| 膠着点（どこで詰まっているか） | 繰り返しパターン、「どうする？」の反復、既読後の長い沈黙 |
| 感情状態 | VADVector推定（既存intent translation転用） |
| Caring Intensity差 | 片方の反応が薄い = 関心強度差 |

### Layer 4: 外部世界接続 — Adaptive RAG

**いつ検索するか / しないか（Self-RAG判断）:**

| 検索必須 | 検索不要 |
|---------|---------|
| 具体的な店名/場所/日時/価格に言及 | 性格特性・好み傾向の分析 |
| 「今やってる映画」等の現在情報要求 | 関係性ダイナミクスの解釈 |
| 「近くの〇〇」等の位置情報依存 | すれ違いの論点整理 |
| 予約可能性・営業時間の確認 | 感情の翻訳 |

**検索ソース（段階的拡張）:**

| Phase | ソース | 用途 | API |
|-------|--------|------|-----|
| **P1** | Web検索 | 映画・飲食・旅行の全般情報 | Perspective Engine転用 |
| P1.5 | + HotPepper | 飲食の構造化データ（予算・ジャンル・エリア） | 公式API（リクルート） |
| P2+ | + Google Places | 汎用POI、営業時間、混雑度 | 公式API |

**Phase 1はWeb検索のみ**で映画+飲食+旅行をカバー。検索品質が不足する領域を
特定してからHotPepperを追加する方が、何が足りないかが明確になる。

**検索結果の品質フィルタ:**
- 食べログスコア換算（3.0-3.2=普通, 3.3-3.5=良い, 3.5-3.8=とても良い, 3.8+=卓越）
- 「二人の好みフィルタ」を検索クエリに反映（一般RAGとの差別化）

**推論根拠の二層提示:**
```
[プロフィール由来] 二人とも和食好みで、特にAは辛いものが得意
[検索由来] 渋谷の「XX」は四川料理で食べログ3.8、今週末予約可能
[統合判断] Aの辛味好み + Bの和食好みの接点として...
```

### Layer 5: 提案生成 — 出力構造

### Phase 1 出力カード固定テンプレート

Phase 1（decision モード）の出力はこの5ブロックで固定。ブレさせない。

```
┌──────────────────────────────────────────────┐
│  ① ここまでの要点                              │
│  「○○を決めたいけど、△△で詰まってるみたいだね」   │
│  （会話の要約 + 膠着点の特定。2-3文）              │
├──────────────────────────────────────────────┤
│  ② 二人が重視している点                         │
│  A: 「新しいものを試したい、話題性がほしい」       │
│  B: 「ハズレを避けたい、安心して楽しめるもの」     │
│  共通: 「二人とも長すぎるのは避けたい」            │
│  （各人1-2行 + 共通点。深層心理からの推定含む）    │
├──────────────────────────────────────────────┤
│  ③ 候補 2〜3                                   │
│  🥇 候補A — 一言説明                            │
│  🥈 候補B — 一言説明                            │
│  🥉 候補C — 一言説明（冒険枠。ない場合は2候補）   │
│  （Web検索から取得した現実情報付き）               │
├──────────────────────────────────────────────┤
│  ④ なぜこの候補か                               │
│  「二人とも外したくない傾向があるから、             │
│   評価安定型を中心に。Aの新規性欲求も              │
│   大事にしたいので、1つは冒険枠を入れたよ」        │
│  （関係性文脈に基づく理由。2-3文）                 │
├──────────────────────────────────────────────┤
│  ⑤ あとは二人で決めてね                          │
│  「気になるのがあったら二人で話してみて！」        │
│  （退出シグナル。1文）                            │
└──────────────────────────────────────────────┘
```

**テンプレートのルール**:
- 全体で**200-400文字**に収める（長すぎるとチャットの流れを阻害）
- ①は必ず膠着点を特定する（何が決まらないかを明示）
- ②は「Aの発言から読み取れること」+「プロフィールからの推定」の混合。直接開示はしない
- ③は2-3候補。4つ以上は出さない。各候補に現実情報（評価・場所・時間等）を付与
- ④は「二人の関係性」を主語にする。「マッチング度」等の機械的表現禁止
- ⑤は必ず付ける。CoAlterが居座らないことを明示

**拡張出力要素（将来Phase用。Phase 1では使わない）**:
- 候補を絞る軸（選び方の設計）→ Phase 2 negotiate用
- 共通接点の深掘り → Phase 3 reflect用
- 感情/事実の分離 → Phase 2 clarify用

**不確実性の4段階表現:**
```
[確信度高] 「二人とも確実に楽しめそうなのは...」
[確信度中] 「レビューは分かれてるけど、二人の好みを考えると合いそう」
[確信度低] 「正直、二人にとって未知数だけど、冒険するなら...」
[検索不足] 「この辺りの情報がまだ少ないので、もう少し調べてみる？」
```

**出力トーンの固定原則:**

CoAlterの言い切りが強いとAI主役感が出る。以下のトーンを厳守:

```
○ 「〜が良さそう」「〜が合いそう」（推定表現）
○ 「二人の今の流れだと」（文脈言及）
○ 「候補としてはこの3つ」（選択肢提示）
○ 「あとは二人で決めてね」（退出シグナル）
○ 「二人ともこういう傾向があるから」（根拠の関係性言語化）

× 「これにすべきです」（指示）
× 「最適な選択は」（断定）
× 「Aさんは本当は」（本音の暴露）
× 「マッチング度85%」（機械的数値）
```

---

## 4. 推薦アルゴリズム

### Least Misery ベース + 関係性加重

```
joint_score(option) =
  min(score_A, score_B)                    // 最も不満な側の不満を最小化
  × compatibility_bonus(A, B, option)       // ペア相性ボーナス
  + novelty_factor(option, pair_history)    // 新規性（過去に行った/見たは減点）
  + fairness_adjustment(fairness_ledger)    // 公平性補正（前回譲った側を優遇）
  - disagreement_penalty(A, B, option)      // 不一致度ペナルティ（Amer-Yahia 2009）
```

### 新規性 vs 親しみの動的比率

HDM Phase（関係の深さ）と連動:
- 関係が浅い段階: 親しみ 80% / 新規 20%（安全な選択で信頼構築）
- 関係が深まる: 親しみ 50% / 新規 50%
- 関係が深い: 親しみ 30% / 新規 70%（冒険を楽しめる）

### 候補数の制約

> **根拠**: Schwartz「選択のパラドックス」— 選択肢が多いほど満足度が下がる

- 常に2-3候補。それ以上は出さない
- 「もっと見たい」と明示要求された場合のみ追加
- 低関与の日常決定 → 2候補（「これかこれ」）
- 高関与の決定 → 3候補（冒険案 + 安全案 + 中間案）

---

## 5. 起動・介入モデル

### 状態遷移図

```
[inactive] ペアにCoAlterが有効化されていない状態
    │
    │ 片方が「CoAlter使ってみない？」をタップ
    ▼
[pending_consent] 相手に同意リクエスト表示中
    │
    ├─ 相手が同意 ──────────────────────▶ [enabled] ペアでCoAlter有効化済み
    │                                         │
    └─ 相手が拒否 / 72h無応答 ──▶ [inactive]  │ どちらかがボタン or メンションで呼ぶ
                                              ▼
                                        [active] CoAlterセッション実行中
                                              │
                                              ├─ 提案完了 → 退出シグナル ──▶ [enabled]
                                              ├─ どちらかが「終了」 ──────▶ [enabled]
                                              └─ タイムアウト（10分無反応）▶ [enabled]

[enabled] からの離脱:
    ├─ どちらかが設定でopt-out ──▶ [disabled] 相手に通知
    └─ [disabled] から再有効化 ──▶ [pending_consent]（再度同意必要）
```

**状態のルール**:
- **pending_consent**: 片方が起動しても、相手の明示同意が必須。強制しない
- **enabled**: 有効期間は無期限（opt-outはいつでも可能）
- **active**: 1セッション = 1つの話題。提案完了で自動終了
- **disabled → enabled**: 再有効化には再度の相互同意が必要（一度切ったら戻すのにも合意）
- CoAlterがactiveの間も、通常のチャットメッセージは送受信可能

> **参照（統合契約 §2, 2026-04-24 rev 1 FIXED）**: 本節の 5 状態（inactive / pending_consent / enabled / active / disabled）は統合契約で **executor availability** として正式命名。Presence 状態（S0-S8、v1.1 §8）・Action Mode（decision/negotiate/clarify、Phase 2 凍結）と**直交する 3 レイヤー構造**の 1 つとして位置付け。availability が Presence の可動域を制約する（`enabled` = S0 常駐のみ / `active` = S1-S8 可動、統合契約 §2.2）。**本節の disabled 再有効化経路は統合契約 §2.1/§2.4 の正本**（統合契約 rev 1 で本節整合に修正済）。

### Phase 1 トリガー条件（decision モード）

Morning Protocol と同じ strong/soft/none の3段階判定。

**strong（即時起動）**: ユーザーが明示的にCoAlterを呼んでいる
```
// 明示メンション
/CoAlter|コオルター|こおるたー/i
// ボタンタップ（UI経由）
```

**soft（「CoAlter呼ぶ？」提案表示）**: 共同意思決定の膠着を検出
```
// 決定膠着パターン（「何にする？」「決まらない」系）
/何(に|を)(する|しよう|見る|見よう|食べる|食べよう)/
/(どこ|何)(行く|行こう|にする|にしよう)/
/決(まら|めら)ない/
/迷(う|って|ってる|い中)/
/候補.*(ある|ない|ほしい|出して)/
/おすすめ.*(ある|ない|教えて|出して)/

// 選択肢拡散パターン（列挙しすぎて収束しない）
/でも.*(もいい|もあり)/  // 「でもこっちもいいよね」
/う〜ん|うーん|んー/     // 逡巡の繰り返し（2ターン連続で検出時のみ）

// 明示的な助け要求
/誰か(決めて|選んで)/
/もう(決めて|選んで|任せる)/
```

**none**: 上記に該当しない → CoAlterは何もしない

**除外条件**（soft検出しても提案しない）:
- CoAlterが enabled でない（未同意）
- 直近5分以内に既にCoAlter提案を出した（連続提案防止）
- 片方しか発言していない（相手がまだ参加していない）
- 会話が2ターン未満（始まったばかり）

### 起動フロー

```
1. チャット内でどちらかがCoAlterを呼ぶ
   - ボタンタップ（strong）
   - メンション型（strong）
   - 膠着パターン検出 → 「CoAlter呼ぶ？」小さく提案（soft）

2. 初回: 相手に同意リクエスト → 同意 → CoAlter有効化
   以降: 即起動（opt-outはいつでも可能）

3. CoAlterが会話を分析 → 5層パイプライン実行 → 提案生成

4. チャット内にカード型で表示（両者に同じものが見える）

5. 退出シグナルで自然に退出
```

### CoAlter の4つのモード

| モード | トリガー | 動作 |
|--------|---------|------|
| **decision** | 「何にする？」「どこ行く？」系 | 要約 → 論点整理 → Web検索 → 候補提示 |
| **negotiate** | 好みが矛盾・膠着 | 利害分解 → パイ拡大 → 第三案生成 |
| **clarify** | すれ違い・誤解の兆候 | 論点の可視化 → 感情/事実分離 → 中立翻訳 |
| **reflect** | 「最近どうだっけ」振り返り | 過去の会話パターン要約 → 共有気づき |

### 既存 Ambiguity Engine の拡張

```
conclude → decision:  二人の好みが十分判明 → 推薦実行
branch   → decision:  方向性が2-3個に絞れる → 選択肢を提示
clarify  → clarify:   致命的情報が欠落 → 最小限の質問（1問まで）
新規     → negotiate: 二人の好みが矛盾 → 和集合から新提案
```

---

## 6. 安全設計

### 介入拒否ルール

以下の場合、CoAlterは仲介を拒否し、その旨を明示する:

- DV（身体的・精神的暴力）の兆候 → 専門機関への接続
- 一方が他方をコントロールしようとしている → 仲介ではなく安全確保
- 片方がCoAlterの使用を拒否している → 即時停止
- 操作的意図の検出（「相手にこう言わせたい」） → 回答生成拒否

### データプライバシー

- 個人の深層心理データはCoAlterの推論に使うが、**相手には直接開示しない**
- CoAlterの提案の中に間接的に反映される（「二人ともこういう傾向がある」レベル）
- 個別Alterの会話内容はCoAlterに流さない
- CoAlterの会話内容は個別Alterに流さない

### Therapy境界

- 「翻訳者」「ファシリテーター」の位置づけ。カウンセラーではない
- 診断的発言（「あなたは回避型です」）は禁止
- 感情の処理・深掘りは行わない。構造の翻訳のみ
- 危機検出時は専門機関への接続を自動提示

---

## 7. 日本文化への適応

### 甘え（Amae）検出

「任せる」「何でもいいよ」を以下に区別:
- **信頼の委任**: 関係が安定していて、本当に相手に任せたい → 委任された側の好みで決定
- **遠慮**: 本音があるが言い出せない → 蓄積プロフィール（Stargazer）から間接推定。Phase 2以降で個別チャネル
- **決定疲労**: 考える余力がない → 選択肢を2択に絞って負荷軽減
- **テスト**: 「本当に私のこと考えてくれる？」 → 相手の好みも考慮した提案

### 空気を読む代理

二人の会話パターン（返信速度、修飾語の変化、絵文字の変化）から「空気」を推定。
不一致が高い場合は第三案を生成。

### 建前と本音

直接的な質問を避け、**文脈からの推論**と**過去の行動パターン**で本音を推定。
Stargazerの深層観測パイプラインがここに接続。

### 季節・文化イベント

静的知識として組み込み（1月:初詣 〜 12月:クリスマス）。
Morning Protocol の天気エンジンと共有。

---

## 8. 既存資産の活用マップ

| 既存資産 | 場所 | CoAlterでの用途 |
|---------|------|----------------|
| AlterPersonality構築 | `alter.ts` buildAlterPersonality() | L1: 双方のフルプロフィール読み込み |
| 45軸スコア | axisScores | L1: コミュニケーションスタイル差分 |
| ドメイン検出 | alterHomeAdapter.ts QueryDomain | L3: 会話トピック分類 |
| ForceBalance/ActionShape | alterHomeAdapter.ts | L5: 推薦の力学分析 |
| Ambiguity Engine | alterHomeAdapter.ts | L3: モード判定（conclude/branch/clarify + negotiate） |
| Perspective Engine | perspectiveEngine.ts | L4: Web検索統合、CRAG品質ゲート |
| Intent Translation | lib/talk/intentTranslation/ | L3: 意図復元、誤読検出 |
| NVC分析 | nvcAnalysis.ts | L3: 四騎士検出、すれ違い構造化 |
| 日本語語用論辞書 | japanesePragmatics.ts | L3: 曖昧表現検出、敬語シフト |
| Reading Simulation | readingSimulation.ts | L3: 受信者の解釈シミュレーション |
| Morning Protocol天気 | travelTimeEngine.ts | L4: 天気コンテキスト |
| Supabase Realtime | Talk既存チャット | リアルタイム配信 |

### 転用しない（片側Alter固有）

| 既存資産 | 理由 |
|---------|------|
| HDM Phase進行 | 個別Alterの信頼関係であり、CoAlterには適用しない |
| coreWound開示ゲート | 個別Alterのみ。CoAlterで相手に開示は禁止 |
| Alter声のトーン制約 | CoAlterは中立的な翻訳者。Alterの個性は持たない |
| 個別Alterの会話履歴 | プライバシー分離。CoAlterには流さない |

---

## 9. MVPスコープ

**v1.2 status update note (2026-05-15)**: 各 Phase に **status tag** を attach。詳細は §13.5 参照。

### Phase 1: 共同意思決定支援（Talk限定）

**v1.2 status**: ✅ **decision mode 実装済 + production deploy 済** (PR で多数 merge、main 反映済)、ただし **Stage 2 Curate (PR #102 D-1) + provider foundation (PR #110-#119) は内部完了で production 接続未** (a3 wiring 凍結中、PR #127 Audit 1 で 5 段階 rollout 推奨)。

**対象**: 映画、食事、予定調整、旅行先
**起動**: 明示的（ボタン or メンション）
**モード**: decision のみ

**最小パイプライン**:
1. 双方の AlterPersonality ロード（L1）
2. 直近会話の分析（L3: テーマ・膠着点・Caring Intensity）
3. Web検索（L4: 候補の現実情報取得）
4. 提案生成（L5: 要約 + 論点整理 + 候補2-3 + 理由構造）
5. チャット内カード表示 + 退出

### Phase 1.5: HotPepper API統合

- 飲食ドメインの検索品質向上（構造化データ: 予算・ジャンル・エリア）
- Phase 1のWeb検索のみで不足が確認された領域に限定投入

### Phase 2: negotiate + clarify + 個別チャネル + 自動提案

**v1.2 status**: ✅ **Phase 2 3-mode body 完了 + 凍結** (CEO 6.D 合格 2026-04-19、modeRouter / negotiateBuilder / clarifyBuilder 実装済)。**Layout 系統 (PR #95、2026-05-10、3 旗 ON 反映) production deploy 済**、ただし **Gap 4 production-side context detection 未実装** (Layer 5 reach 薄、PR #123 設計済、status: 📋 design completion、impl 未)。

- negotiate モード: 好みが矛盾した時の第三案生成
- clarify モード: すれ違い検出 → 論点の可視化
  - **片側Alter（Intent Translation Engine）との棲み分け**:
    - 片側Alter: 「この文章が相手にどう読まれるか」（送信前の個人的推敲）
    - CoAlter clarify: 「二人の会話全体で何がズレているか」（構造的な論点整理）
- 個別チャネル: negotiate/clarifyでの本音引き出し（原則4の実装）
- 自動提案: パターン検出（「何にする？」系）→ 「CoAlter呼ぶ？」

### Phase 3: reflect + Rendezvous展開

**v1.2 status**: 🔵 **後送り (CEO directive 2026-05-15、CoAlter 全体完了優先)**。reflect mode は **CoAlterMode enum / lib / impl 全て不在** (PR #122 §1.1 grep 確認、設計のみ master design line 574-578)。Phase 3 開始 timing は CEO 戦略判断待ち。

- reflect モード: 二人の会話パターン長期観察
- Rendezvous チャットへの横展開
- Fairness Ledger の本格運用

### Phase 4: 関係性インテリジェンス

**v1.2 status**: ❌ **future、design 未着手**。

- Repair Attempt 検出と促進
- Bid-Response 比率の長期トラッキング
- 関係の健康度観察（両者に同じものを見せる）

### v1.2 追加: PresenceMode × CoAlterMode × Domain 3-Axes Orthogonal Architecture (PR #122)

**v1.2 status**: 📋 **design completion** (PR #122 §1)、impl は各 Phase に分散。

CoAlter は v1.1 で **CoAlterMode (decision/negotiate/clarify/reflect)** を core mode として明示してきたが、v1.2 で **3 直交軸** に再整理:

| Axis | 担当 type | 値 | v1.2 status |
|---|---|---|---|
| **A: Action Mode** (CoAlterMode) | 応答形式 | decision / negotiate / clarify / (reflect) | ✅ 3-mode 実装済 + 凍結、reflect 🔵 後送り |
| **B: Presence Mode** (PresenceMode) | 時間軸 / 文脈 | normal / daily / travel | ✅ UI / state machine 実装済 (PR #95)、daily/travel domain body 📋 未 |
| **C: Domain (Theme)** (ConversationTheme) | 話題 | movie / food / travel / activity / schedule / gift / general | movie ⚠ 部分完、food ✅ Phase B 完、travel 📋 design (PR #124)、activity 📋 design (PR #126) |

詳細 mapping + status は **§13.6** 参照。

### v1.2 追加: Daily × Domain Cross-Axis Dispatch (PR #125)

**v1.2 status**: 📋 **design completion** (PR #125 設計済、Alt D Hybrid 推奨)、**impl 未** (DD1-DD6 別 PR)。

Daily mode に user が "今夜何食べる" / "今日何しよう" 等と話したとき、**どの Domain orchestrator に dispatch するか** の logic を整理 (PR #125)。 詳細は **§13.7** 参照。

---

## 10. 技術構成

### 新規ファイル

```
lib/coalter/
  types.ts              — 型定義（5層の入出力型、CoAlterSession等）
  engine.ts             — 5層パイプライン統合エンジン
  profileLoader.ts      — L1: 双方のAlterPersonality + 拡張データロード
  relationshipLayer.ts  — L2: 関係性メタデータ構築、Fairness Ledger
  conversationParser.ts — L3: 会話解析（テーマ・膠着・Caring Intensity）
  modeRouter.ts         — L3: モード判定（decision/negotiate/clarify/reflect）
  webConnector.ts       — L4: Adaptive RAG（検索判断 + 実行 + 品質フィルタ）
  proposalGenerator.ts  — L5: プロンプト構築 + LLM + バリデーション
  recommendationEngine.ts — L5: least misery + 関係性加重アルゴリズム
  fairnessLedger.ts     — L2: 公平性台帳管理
  exitSignal.ts         — 退出タイミング判定
  safetyGate.ts         — 介入拒否ルール、反武器化チェック

app/api/coalter/
  activate/route.ts     — 起動（同意リクエスト発行）
  accept/route.ts       — 同意受理
  invoke/route.ts       — CoAlter呼び出し（5層パイプライン実行）
  end/route.ts          — セッション終了

hooks/useCoAlter.ts     — クライアント状態管理

components/coalter/
  CoAlterCard.tsx        — 提案カードUI（候補リスト + 理由構造）
  CoAlterButton.tsx      — 起動ボタン
  CoAlterBadge.tsx       — アクティブ表示
  CoAlterConsent.tsx     — 初回同意UI

supabase/migrations/
  YYYYMMDD_coalter.sql   — coalter_sessions + coalter_messages + fairness_ledger + RLS
```

### 既存ファイル修正（最小限）

```
app/(culcept)/talk/[threadId]/ChatClient.tsx
  — CoAlterButton追加、CoAlterCardメッセージ表示統合
```

---

## 11. 学術的情報ソース

### 共同意思決定
- Amer-Yahia et al. "Group Recommendation: Semantics and Efficiency" (VLDB 2009)
- Masthoff "Group Recommender Systems" (Springer Recommender Systems Handbook, 2011)
- De Dreu "Negotiating Deals and Settling Conflict Can Create Value" (2014)
- Schwartz "The Paradox of Choice" (2004)
- Thaler & Sunstein "Choice Architecture" (2008)

### 関係性支援
- Gottman (1994) "What Predicts Divorce?" — 四騎士モデル、Repair Attempts
- Bowen家族システム理論 — 三角関係の法則
- Malone & Crowston "The Interdisciplinary Study of Coordination" (1994)
- arxiv 2308.03326 "Generative AI trial for nonviolent communication mediation"

### テキスト誤読
- Kruger & Epley (2005) — テキスト意図伝達精度56%
- Byron (2008) — メール受信者のネガティビティバイアス
- ResearchGate (2025) "Strategic Ambiguity in Digital Communication"

### 日本文化
- 土居健郎「甘えの構造」(1971)
- Hall "Beyond Culture" (1976) — 高文脈文化論
- Li & Gao (2025) "Considerate Expressions" — 日本語ポライトネスの新概念

### 検索拡張推薦
- Self-RAG (ICLR 2024) — 検索判断の自律化
- Corrective RAG (CRAG) — 検索結果品質評価
- HotPepper API (リクルートWEBサービス)

### 既存プロダクト
- Maia (YC W24) — AI関係アプリ
- CoupleWork (BetterLabs AI) — AI関係コーチング
- YinYang AI — 議論分析

---

## 12. 確定事項（CEO承認 2026-04-15）

| 項目 | 決定 | 理由 |
|------|------|------|
| 個別チャネル | Phase 1では使わない。Phase 2以降 | decisionモードでは不要。膠着の原因は情報不足/選択肢過多 |
| Fairness Ledger | Phase 1は内部のみ。非表示 | 「今回はあなた寄り」表示は空気を悪くするリスク。Phase 3以降で自然言語間接開示を検討 |
| Phase 1 検索範囲 | Web検索のみ（Perspective Engine転用） | まず全領域をWeb検索でカバーし、不足を特定してからHotPepper追加（Phase 1.5） |
| clarifyモード | Phase 1に入れない | Intent Translation Engineとの棲み分けが必要。Phase 2で設計 |
| 出力トーン | 推定表現固定。言い切り禁止 | AI主役感を防ぐ |

### 未解決事項（将来判断）

1. **CoAlterのユーザー向け表示名**: 内部名はCoAlter固定。ユーザー表示名は後で検討
2. **Fairness Ledgerの段階的開示デザイン**: Phase 3で自然言語での間接開示を設計

---

## 13. v1.2 Updates Summary (2026-05-15)

本 §13 は **v1.2 update で追加された設計内容を集約** する。v1.1 本文の prose は **§1 / §9 で minimal additive edits** のみ、v1.1 哲学・確定事項は **不変保持**。本 §13 は **PR #120-#128 で追加された設計を、Master Design の正本構造に位置づけるための reflection layer** である。

### §13.1 Status Tag Legend (v1.2 必須 convention)

各 v1.2 追加項目に **必ず status tag を attach**:

| tag | 意味 | 根拠 |
|---|---|---|
| ✅ **implemented** | main merge 済 PR / 実コード ベース | PR # + commit SHA + date 記録 |
| 📋 **design completion** | audit / design doc 完了、impl 未 | design PR # 記録 |
| ⚠ **proposal** | claude 提案、CEO 採用判断待ち | proposal source PR # 記録、CEO 採用判断 timing 明示 |
| ❌ **not implemented / future** | 未着手 | future phase 明示 |
| 🔵 **frozen** | 凍結中、CEO 判断待ち | 凍結条件記録 |

**重要 rule**: 「implemented (✅)」と書く部分は **main merge 済 PR / 実コード 根拠を必須**。根拠なしで ✅ 書いてはいけない (CEO 補正 2026-05-15、PR #120 の「Step D-1 未着手」誤判定再発防止)。

### §13.2 PR #120-#128 反映 mapping

| PR | merged | v1.2 反映先 | status |
|---|---|---|---|
| **PR #120** (`0d925e0c`、audit v2) | 2026-05-15 | §0 v1.2 重要明示 (Source-of-truth hierarchy) | ✅ audit material 正本化 |
| **PR #121** (`df00a8f3`、runtime integration priority decision) | 2026-05-15 | §9 Phase 1 status note | ✅ decision-ready material 正本化 |
| **PR #122** (`a9f27d44`、normal/daily/travel audit + 3-Axes Orthogonal) | 2026-05-15 | §9 + §13.6 | 📋 design completion |
| **PR #123** (`78cf93b6`、Gap 4 design) | 2026-05-15 | §3 Layer 5 拡張 + §13.8 | 📋 design completion |
| **PR #124** (`fa8f301b`、Travel domain greenfield 1-2 泊国内 MVP) | 2026-05-15 | §1 対象領域 + §13.3 | 📋 design completion |
| **PR #125** (`3de29349`、Daily × Domain dispatch、Alt D Hybrid) | 2026-05-15 | §13.7 | 📋 design completion |
| **PR #126** (`27b6102d`、Activity 7 軸 Taxonomy) | 2026-05-15 | §1 対象領域 + §13.4 | 📋 design completion |
| **PR #127** (`31f0c7f4`、implementation unblock audits) | 2026-05-15 | §13.5 (impl rollout 順序) | ✅ audit material 正本化 |
| **PR #128** (`fe251049`、pre-impl readiness audits) | 2026-05-15 | §13.9 (mode enum 統一 + Step E generalization + v1.2 update audit) | ✅ audit material 正本化 |

### §13.3 Travel Domain Greenfield 1-2 泊国内 MVP (PR #124、status: 📋 design completion)

**v1.1 §1**: 「旅行」とのみ記載。
**v1.2 詳細化** (PR #124、design completion only、impl 未):

| 項目 | 含む (MVP) | 含まない (future) |
|---|---|---|
| 日数 | 1 泊 2 日 / 2 泊 3 日 | 日帰り / 3 泊以上 / 任意期間 |
| 地域 | 国内 | 海外旅行 |
| 行程詳細度 | ざっくり行程案 (時間 + 場所 + 活動) | 分単位精密 / 確定予約 |
| candidate 数 | 2-3 案 | 1 案 / N>3 |
| 比較軸 | 予算帯 / 移動負荷 / 体験タイプ | 詳細項目 |
| 外部 API | MVP では必須にしない | 楽天 / じゃらん / TripAdvisor 接続 |
| 予約 | しない (合意までの議論支援に専念) | API 予約連携 |

**candidate 表現**: Itinerary Graph (場所 + 移動 + 時間 + 活動の DAG)。
**Curate**: 2-3 candidate を **Pareto 最適集合** として提示、複数案比較。
**Resolve**: 議論を経た合意確定 (movie/food の Resolve と意味的に異なる)。
**Phase 分解**: T0 (design) → T1 (types) → T2 (intent) → T3 (generator) → T4 (comparator) → T5 (resolver) → T6 (UI) → T7 (Step E)。

詳細は `docs/coalter-travel-domain-greenfield-design.md` 参照。

### §13.4 Activity Domain 7 軸 Taxonomy (PR #126、status: 📋 design completion)

**v1.1 §1**: Activity は対象領域に含まれていなかった。
**v1.2 追加** (PR #126、design completion only、impl 未):

Activity = 「他 domain (food/movie/travel) にカテゴリ化されない、user の日常選択として重要な独自カテゴリ」。**残余カテゴリではなく独自定義**。

**7 軸 Taxonomy**:

| 軸 | 値 |
|---|---|
| A: indoor / outdoor | indoor / outdoor / hybrid |
| B: duration | short (1h 以下) / medium (1-3h) / half-day (3-6h) |
| C: cost | free / low / medium / high |
| D: weather dependency | weather-dependent / -independent |
| E: pair compatibility | solo-friendly / pair-compatible / explicitly-pair |
| F: novelty | routine / familiar / novelty |
| G: fatigue load | 1-5 |

**MVP scope**: Daily mode 内軽量 outing (1-3 時間、近距離、4 軸評価、2-3 案、予約しない、food/movie/travel に該当するものは各 domain 委譲)。

**Domain boundary 規則**: food/movie/travel 先勝ち、関係話題は Action Mode 任せ、ambiguous は activity default。

**Phase 分解**: AD0 (design) → AD1 (types) → AD2 (intent) → AD3 (generator) → AD4 (scorer) → AD5 (UI) → AD6 (Step E)。

詳細は `docs/coalter-activity-domain-mapping.md` 参照。

### §13.5 Implementation Rollout 順序 (PR #127、status: ✅ audit material 正本化)

PR #127 Audit 1 (Scaffold × Provider Foundation 関係) で **Path α と Path β は competing ではなく Layered architecture** と整理。**5 段階 rollout** が claude 整理推奨 (CEO 採用判断待ち):

| Step | 内容 | env / 影響 |
|---|---|---|
| **Step A** (低 risk) | `movieCuratorLiveEnabled` のみ ON | Stage 2 shadow 観測、本流影響 0 |
| **Step B** (中 risk) | `threeStageEnabled` ON | 三段式 pipeline 完全起動、retrieval は既存 |
| **Step C** (中 risk) | a1-impl-1c / a2 / a3 凍結解除 | provider 接続 (Path β 完成) |
| **Step D** (中 risk) | a4 citation UI | Product Unit 連携 |
| **Step E** | 観測 shadow → canary → 本番 flip | mode enum rollout 統合 |

詳細は `docs/coalter-scaffold-provider-foundation-relation-audit.md` 参照。

### §13.6 3-Axes Orthogonal Architecture 詳細 (PR #122、status: 📋 design completion)

**v1.1 §5** の 4 mode (decision/negotiate/clarify/reflect) は **Axis A: Action Mode** のみ明示。v1.2 で **3 軸全て** を明示:

| Axis | type | 値 | 既存実装 / 状態 |
|---|---|---|---|
| **A: Action Mode** | `CoAlterMode` | decision / negotiate / clarify / (reflect) | ✅ 3-mode 実装 + 凍結、reflect 🔵 後送り |
| **B: Presence Mode** | `PresenceMode` | normal / daily / travel | ✅ UI / state machine 実装 (PR #95)、daily/travel domain body 📋 未 |
| **C: Domain** | `ConversationTheme` | movie / food / travel / activity / schedule / gift / general | movie ⚠ 部分完、food ✅ Phase B、travel 📋、activity 📋 |

**3 軸交差全 63 組合せ**、ただし実用組合せは限定的。

詳細は `docs/coalter-normal-daily-travel-audit.md` 参照。

### §13.7 Daily × Domain Cross-Axis Dispatch (PR #125、status: 📋 design completion)

**v1.1 §5**: PresenceMode × Domain dispatch logic は未記述。
**v1.2 追加** (PR #125、Alt D Hybrid claude 推奨、CEO 採用判断待ち):

**3 層分離**: DailyPlanner / DomainRouter / Domain orchestrator
- **DailyPlanner**: domain infer + context build + graph composition + Memory continuity
- **DomainRouter**: 純関数 (DI 経由 orchestrator)、dispatch logic
- **Domain orchestrator**: 既存 movie/food/travel + future activity、Daily context を request 内で受領

**既存 coalterDispatch との非破壊統合**: `presenceMode === "daily"` 分岐、normal mode path 1 bit も touch しない。

**Phase 分解**: DD0 (design) → DD1 (DailyDomainRequest types) → DD2 (DomainRouter pure function) → DD3 (DailyPlanner) → DD4 (orchestrator integration) → DD5 (UI) → DD6 (Step E)。

詳細は `docs/coalter-daily-domain-dispatch-design.md` 参照。

### §13.8 Gap 4 Production-Side Context Flag Detection (PR #123、status: 📋 design completion)

**v1.1 §3 Layer 5**: 「提案生成」と書かれているが、**Pattern variant 発火機構** + **production-side context detection** は未記述。
**v1.2 追加** (PR #123、claude 推奨 Alt 5 Hybrid、CEO 採用判断待ち):

**Gap 4 の正体**: `PatternContext` 7 boolean fields (`infoMissing` / `uncertaintyHigh` / `needFraming` / `oneSidedFatigue` / `needTranslation` / `relationshipSignalsClear` / `relationshipNoiseHigh`) を production runtime で自動 infer する logic が不在 → Pattern variant 発火薄。

**設計推奨**: Server-side detector (純関数 library) + additive API response field (`patternContext?: Partial<PatternContext>`) + client side receive + smoke harness 互換維持 + confidence-graded firing + mode enum 3-stage rollout。

**Phase 分解**: D1 (design) → D2 (detector lib) → D3 (route) → D4 (client) → D5 (`observe`) → D6 (calibrate) → D7 (`live`)。

詳細は `docs/coalter-gap4-production-context-detection.md` 参照。

### §13.9 5 Mode Enum 統一 + Step E 5 Domain Generalization (PR #128 = Batch-B、status: ✅ audit material 正本化)

PR #128 Batch-B で 3 audit 完了:

#### B-2: Cross-PR Flag Consolidation (claude 推奨 Alt B + C ハイブリッド)
- 5 mode enum (`COALTER_GAP4_CONTEXT_DETECTION_MODE` / `COALTER_TRAVEL_DOMAIN_MODE` / `COALTER_DAILY_DISPATCH_MODE` / `COALTER_ACTIVITY_DOMAIN_MODE` / Step E movie 既存) を共通設計化
- 値: `off` / `observe` / `live` (exact match parser、whitelist + fail-closed)
- 共通型: `CoalterDomainMode` 提案
- telemetry tag 統一 schema (`coalter_domain` + `coalter_mode`)

#### B-3: Step E Pre-Checklist (claude 推奨 5 domain generalization)
- Step E pattern を 5 domain に generalize (E-0 / E-1 / E-2 / E-3)
- Gap 4 observe = Step E-1 shadow と同思想
- canary 段階 (canary-0/1/2/flip)、allowlist Option C (env-based)
- rollback trigger 5 条件、G1-G8 prereq gate

#### B-4: Master Design v1.2 Update Necessity (本書 v1.2 update の根拠)
- v1.2 update 必要性: claude 整理結論「必要」(6 根拠 vs 4 反対根拠)
- timing 推奨: Option A 即時 (本 v1.2 update PR)
- 本体更新を別 PR にする推奨: scope 分離 / review 効率 / rollback 容易 / 段階確認

詳細は以下を参照:
- `docs/coalter-cross-pr-flag-consolidation-audit.md` (B-2)
- `docs/coalter-step-e-pre-checklist-audit.md` (B-3)
- `docs/coalter-master-design-v12-update-audit.md` (B-4、本 v1.2 update の根拠 audit)

### §13.10 まだ反映しないもの (v1.2 で除外)

| 要素 | 理由 |
|---|---|
| Phase 3 (reflect mode) 詳細設計 | Phase 3 後送り、本 v1.2 では「🔵 後送り」と記載のみ |
| Phase 4 (関係性インテリジェンス) | 未着手、本 v1.2 では「❌ future」と記載のみ |
| 海外旅行 / 任意期間旅行 | future scope、§13.3 で除外明示 |
| API 予約連携 (楽天 / じゃらん / TripAdvisor) | future scope |
| Activity domain half-day 以上 / 遠出 | future scope、§13.4 で除外明示 |
| Daily mode × movie / travel chain の詳細 graph composition library | DD3 phase impl 後 |
| L4-m (legacy 物理削除) timing 確定 | PR #127 Audit 3 で「急がない推奨」、L4-l + 14 日後 + CEO 別審議が prereq |
| D-2-e3-b の正体最終確定 | PR #127 Audit 2 で「撤廃 or 再定義」CEO 判断請求中 |

### §13.11 古い docs との矛盾解決 (PR #120 §0.2 hierarchy 継承)

| 古い doc | 矛盾内容 | v1.2 での解決 |
|---|---|---|
| `coalter-handoff-2026-04-22.md` | Stage 4 L4-l 未着手と記述 | PR #95 (2026-05-10) で完了済、main merge 優先 |
| `coalter-implementation-plan-mainstream.md` | Step E movie 専用設計 | B-3 audit で 5 domain generalization 整理、mainstream plan 既存維持 |
| `coalter-d2e3a-implementation-design-review.md` | D-2-e3-b 詳細不明 | PR #127 Audit 2 + PR #103 で「curator (D-2-e3-b)」と整理 |

**衝突時の rule**: 古い doc が「未着手」と書いていても main merge 済 PR がある場合は **main 優先**。

---

## 14. Revision History

| Version | Date | 主な変更 |
|---|---|---|
| v1.0 | 2026-04-14 | 初版起草 |
| **v1.1** | 2026-04-15 | CEO 承認版、§1-§12 確定 |
| **v1.2** | **2026-05-15** | **PR #120-#128 反映**: 対象領域 Activity 追加 (§1)、Phase status update (§9)、§13 v1.2 Updates Summary 新規、§14 revision history 新規。**v1.1 哲学・確定事項は不変保持**。 |

### v1.2 change log (詳細)

- **header**: 改訂 list に v1.2 追加、status 行に v1.1 承認 timing 明示
- **§0 新規**: v1.2 重要明示 (CEO 補正 2026-05-15)、design/audit/CEO decision/implementation 4 段階分離
- **§1**: 対象領域に「活動 / 暇つぶし」追加 (PR #126)、旅行を「1-2 泊国内 MVP」として scope 詳細化 note (PR #124)
- **§9**: 各 Phase に **v1.2 status note** 追加 (Phase 1 / 2 / 3 / 4)、3-Axes Orthogonal + Daily × Domain dispatch の v1.2 追加 sub-section
- **§13 新規**: v1.2 Updates Summary (PR #120-#128 反映 mapping、status tag legend、各 PR の詳細位置づけ)
- **§14 新規**: Revision History
- **不変保持**: §2 設計原則 7 (CoAlter 哲学 core) / §3-§8 / §10 / §11 / §12 確定事項 (CEO 承認 2026-04-15)

### v1.2 status tag 集計

| status | 件数 | 主な領域 |
|---|---|---|
| ✅ implemented (production reach 済 / production-grade) | 5 | Phase 1 decision (production deploy 済) / Phase 2 3-mode body 完了 + 凍結 (CEO 6.D 合格 2026-04-19) / Layout L4-l (PR #95、2026-05-10、3 旗 ON 反映) / Step C Bug-1 (CEO Option α 2026-05-11) / Step B M0 Stage 1 Understand |
| ✅ implemented (code merged、production reach 0 / dormant) | 2 | PR #102 scaffold (D-1〜D-2-e2、code in main、`movieCuratorLiveEnabled` + `threeStageEnabled` 両方 default OFF、production behavior 0 変化) / PR #110-#119 provider foundation (a0 + a1-impl-1a〜1i、code in main、mock-only、real API 接続なし、a3 wiring 未) |
| 📋 design completion (claude 推奨整理結果、CEO 採用判断待ち、impl 未) | 7 | 3-Axes Orthogonal / Travel domain (1-2 泊国内 MVP) / Activity domain (7 軸 Taxonomy) / Daily × Domain Dispatch (Alt D Hybrid) / Gap 4 (Alt 5 Hybrid) / Cross-PR Flag Consolidation (Alt B+C) / Step E 5 domain generalization |
| ⚠ proposal (claude 推奨、CEO 採用判断待ち) | 多数 (各 design 内の claude 推奨案、別途 CEO 採用判断必要) | Alt B+C ハイブリッド / Travel-β / Alt D Hybrid / Alt 5 Hybrid / 5 段階 Step A-E rollout 順序 等 |
| 🔵 frozen (CEO 判断による解除待ち) | 2 | Phase 3 reflect / D-2-e3-a 内部 (a1-impl-1c / 2 / 3, a2, a3, a4) |
| ❌ not implemented / future (本 v1.2 範囲外) | 3 | Phase 4 (関係性インテリジェンス) / 海外旅行 / API 予約連携 / Activity half-day 以上 等 |

**重要 (CEO 2026-05-15 補正再確認、誤読防止)**:

- ✅ implemented でも「production reach 済」と「code merged but production reach 0 (dormant)」は **異なる状態**。本集計で 2 行に分離 (上 2 行)。
- 📋 design completion / ⚠ proposal の各項目 (Travel runtime / Activity runtime / Daily × Domain dispatch runtime / Gap 4 detector runtime / Step E 5-domain rollout / Mode enum implementation) は **全て runtime 未実装**。「CEO 採用済み」「実装方針確定」と読まれないよう、それぞれ「claude 推奨整理結果、CEO 採用判断待ち、impl 未」と明示。
- v1.2 merge = Master Design v1.2 の **正本化**、各 📋 / ⚠ 項目の CEO 採用判断 / runtime impl は **別 PR / 別判断**。

→ v1.2 = **CoAlter 設計の中間 snapshot**、implementation completion は別 phase。**proposal レベルの設計案 (Alt B+C / Travel-β / Alt D Hybrid / Alt 5 Hybrid 等) は CEO 採用判断待ち**、v1.2 merge で「採用済み」とはならない。
