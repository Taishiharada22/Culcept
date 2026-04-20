# Gap Fill Engine — Deep Research 統合設計書

> 日付: 2026-04-16
> ステータス: CEO レビュー待ち
> 対象ファイル: `lib/alter-morning/gapFillEngine.ts`

## 研究基盤

5 領域の行動科学・HCI 文献を調査し、Morning Protocol の gap fill 品質を改善するための知見を統合した。

| 領域 | 主要知見 | 効果量/根拠 |
|------|---------|-------------|
| Implementation Intentions | if-then 形式の計画は実行率を有意に向上 | d=0.65（94研究, 8,000人超） |
| MCII / WOOP | 障害の事前想定が計画実行を強化 | g=0.34（21研究, 15,907人） |
| Planning Fallacy | 所要時間は約40%過小評価される | 予測5.8日→実際10.7日 |
| 休憩・回復 | マイクロブレイク(≤10分)で活力回復 d=.36 | SNSは逆効果、自然・運動が最良 |
| 午後ディップ | 13-15時は生物学的パフォーマンス低下 | 10-20分仮眠が記憶に最適 |
| JITAI | 4要素フレーム: 決定点/介入/調整変数/決定ルール | 6+通知/日で応答率崩壊 |
| カレンダーAI | 文脈バンディット(Thompson Sampling)で30回で収束 | 2-3選択肢+理由+パスが最適 |
| Slack Time | 稼働率70-80%が最適、100%は逆効果 | DeMarco "Slack", Org Science 2018 |

---

## A. 提案候補 Taxonomy

### 設計原則
1. **circadian-aware**: 時間帯により最適な活動が異なる（午後ディップ対応）
2. **context-linked**: 前後の予定から自然に導出される活動のみ
3. **if-then reason**: 提案理由は「もし〜なら、〜するといい」形式（d=0.65）
4. **obstacle contrast**: 理由に障害想定を1文添える（MCII g=0.34）

### カテゴリ体系

```
gap_fill_taxonomy
├── recovery（回復系）
│   ├── micro_rest      … カフェで一息、仮眠 (10-20min)
│   ├── nature_walk     … 散歩・外の空気 (15-20min)
│   ├── stretch         … 軽いストレッチ (5-10min)
│   └── mindfulness     … 深呼吸・瞑想 (5-10min)
│
├── preparation（準備系）
│   ├── next_prep       … 次の予定の資料確認・準備
│   ├── meeting_prep    … 打ち合わせの論点整理・心の準備
│   ├── emotional_reset … 切り替え・気持ちの整理
│   └── commute_prep    … 持ち物確認・出発準備
│
├── maintenance（整理系）
│   ├── email_triage    … メール・連絡の仕分け
│   ├── task_review     … タスク確認・優先度整理
│   └── errand_quick    … 近場の用事（買い物等）
│
├── nourishment（栄養系）
│   ├── light_meal      … 軽い食事・間食
│   ├── hydration       … 水分補給・飲み物
│   └── post_meal_walk  … 食後の散歩 (15min)
│
└── enrichment（充実系）
    ├── reading         … 読書
    ├── explore         … 近くを散策・発見
    └── creative_free   … 自由な創作時間
```

### 時間帯別の推奨候補（circadian mapping）

| 時間帯 | 推奨 | 非推奨 | 根拠 |
|--------|------|--------|------|
| 6:00-9:00 (朝) | preparation, light_meal | mindfulness長時間 | 朝のコルチゾール覚醒反応 |
| 9:00-12:00 (午前) | maintenance, enrichment | micro_rest | 認知パフォーマンスのピーク |
| 12:00-13:00 (昼) | nourishment | high-cognitive work | 食事の自然なタイミング |
| 13:00-15:00 (午後ディップ) | recovery優先 | enrichment, maintenance | 生物学的パフォーマンス低下 |
| 15:00-18:00 (午後後半) | maintenance, preparation | heavy recovery | 二次覚醒期 |
| 18:00以降 (夕方) | explore, nourishment, recovery | intensive work | ウルトラディアンリズム終盤 |

### 提案理由テンプレート（if-then + obstacle contrast）

現状（v1）:
```
"空き時間に" / "リフレッシュに" / "隙間時間に"
```

改善後（v2 — evidence-based）:
```
# recovery 系
"会議が続くと集中が切れやすいから、ここで15分散歩すると午後もペース保てるよ"
"午後は誰でも集中力が落ちる時間帯。カフェで一息入れてリセットしよう"
"食後は眠くなりやすいから、軽く歩くと頭がスッキリするよ"

# preparation 系
"打ち合わせ前に論点を整理しておくと、発言しやすくなるよ"
"次の予定まで少し間があるから、資料をさっと見ておくと安心"

# maintenance 系
"移動の前にメール整理しておくと、着いてからすぐ本題に入れるよ"

# nourishment 系
"午前の作業でエネルギー使ってるから、ここで軽く食べておくと午後の集中が持つよ"

# enrichment 系
"予定の合間に読書を挟むと、頭の切り替えになるよ"
```

形式: `[状況の説明/障害想定] + [行動] + [効果]`

---

## B. 禁止ルール Taxonomy

### 現状の禁止ルール（v1 — 3ルール）
1. duration overflow: 候補の所要時間 > gap の長さ
2. high intensity before meeting: 会議前に高負荷運動
3. meal near meal: 食事の前後に食事提案

### 拡張禁止ルール（v2 — evidence-based）

```
prohibition_rules
├── temporal_rules（時間ベース）
│   ├── T1: duration_overflow      … 候補 > gap（既存）
│   ├── T2: short_gap_complex      … gap < 30min に高認知タスクは禁止
│   │                                 根拠: 高認知は10min+休憩が必要(研究)
│   ├── T3: buffer_violation       … gap の前後5分はバッファ（planning fallacy対策）
│   │                                 候補の実質利用可能時間 = gap - 10min
│   └── T4: circadian_mismatch     … 13-15時に enrichment/maintenance（午後ディップ）
│                                     この時間帯は recovery 系のみ推奨
│
├── context_rules（文脈ベース）
│   ├── C1: high_intensity_before_meeting   … 会議前に高負荷運動（既存）
│   ├── C2: meal_near_meal                  … 食事前後に食事（既存）
│   ├── C3: duplicate_activity              … 同じカテゴリの活動が直前直後に存在
│   ├── C4: sns_never                       … SNS/ソーシャルメディアは提案しない
│   │                                         根拠: 回復効果が負(研究)
│   ├── C5: high_cognitive_after_meal       … 食後に高認知タスクは非推奨
│   │                                         根拠: 食後の眠気で効果低下
│   └── C6: intense_before_travel           … 移動直前の高負荷活動は禁止
│                                             根拠: 移動に疲労を持ち越さない
│
├── load_rules（負荷ベース）
│   ├── L1: overload_guard         … 1日のアイテム数 ≥ 7 なら gap fill スキップ
│   │                                 根拠: 稼働率80%超は逆効果(Slack)
│   ├── L2: max_proposals          … 1プランにつき最大2件（既存、6+/日で疲労）
│   └── L3: consecutive_proposals  … 連続する gap に両方提案しない（最低1つは空白保護）
│                                     根拠: 意図的スラック時間の確保
│
└── respect_rules（ユーザー意思尊重）
    ├── R1: rejected_category      … ユーザーが過去に却下したカテゴリは優先度を下げる
    │                                 将来: contextual bandit で学習（30回で収束）
    └── R2: explicit_free_time     … ユーザーが「休み」「フリー」と明言した gap は埋めない
```

### 優先度
- **HARD（絶対禁止）**: T1, C1, C2, C4, L2, **R2**
- **SOFT（原則禁止、例外あり）**: T2, T3, T4, C3, C5, C6, L1, L3
- **LEARN（将来学習で調整）**: R1

> R2 昇格理由 (2026-04-16 CEO方針): R2 は「学習対象」ではなく「明示意図の尊重」。
> ユーザーが「休み」「フリー」と言ったものは、過去データがなくても絶対に埋めない。

---

## C. Tailoring Variables 一覧

JITAI フレームワークに基づき、Gap Fill の個人化に使う変数を整理。

### Tier 1: パッシブ取得（追加 UX コストなし）

| 変数 | 取得方法 | 使用場面 | 根拠 |
|------|----------|----------|------|
| `time_of_day` | システム時刻 | circadian mapping | 午後ディップ研究 |
| `gap_duration` | gap 検出 | 候補フィルタ | duration 制約 |
| `before_context` | 前アイテムのカテゴリ | 候補プール選択 | 文脈連続性 |
| `after_context` | 後アイテムのカテゴリ | 候補プール選択 | 準備ニーズ |
| `total_items` | プラン全体 | 過密検出 (L1) | Slack研究 |
| `day_mode` | 予定の構成 | work_day / off_day 判定 | 候補プール切替 |
| `existing_proposals` | 既存提案数 | L2 制限 | 通知疲労研究 |

### Tier 2: セミパッシブ（ユーザー入力から推論）

| 変数 | 取得方法 | 使用場面 | 根拠 |
|------|----------|----------|------|
| `energy_hint` | Alter会話から推定 | recovery 優先度 | MCII障害想定 |
| `weather` | 天気API（shared/location.ts）| 散歩/屋外提案の可否 | JITAI tailoring |
| `commute_distance` | 移動時間から推定 | 移動前後の提案調整 | planning fallacy |

### Tier 3: アクティブ学習（将来実装）

| 変数 | 取得方法 | 使用場面 | 根拠 |
|------|----------|----------|------|
| `accept_history` | 提案の採用/却下ログ | R1 学習 | contextual bandit |
| `preferred_recovery` | 過去の傾向 | recovery候補の順位調整 | Thompson Sampling |
| `personality_overlay` | Stargazer profile | 提案トーン調整 | Alter統合 |

### 収束タイムライン
- Tier 1: **即時実装可能**（現在の gapFillEngine で大半カバー済み）
- Tier 2: **Phase 2**（天気連携・エネルギー推定は既存インフラ流用）
- Tier 3: **30回のインタラクション後**に有効化（contextual bandit 収束条件）

---

## D. Decision Rules

### フロー図

```
[Gap 検出]
    ↓
[L1: 過密チェック] ── アイテム≥7 or 稼働率≥80% → SKIP（空白保護）
    ↓
[L3: 連続提案チェック] ── 直前の gap にも提案済み → SKIP（交互保護）
    ↓
[Circadian Layer]
    ├── 13:00-15:00 → recovery 候補のみ（午後ディップ）
    ├── 6:00-9:00 → preparation / nourishment 優先
    ├── 9:00-12:00 → enrichment / maintenance 許可
    └── その他 → 全カテゴリ open
    ↓
[Context Layer]
    ├── after = meeting → PRE_MEETING 候補
    ├── after = return_travel → PRE_RETURN 候補
    ├── after = meal → PRE_MEAL 候補
    ├── before = meal → POST_MEAL 候補
    ├── before/after = work → WORK_DAY 候補
    └── else → DEFAULT 候補
    ↓
[Prohibition Filter] ── T1-T4, C1-C6 をチェック
    ↓
[Priority Sort]
    ├── 候補プール内の priority 値
    ├── circadian 適合ボーナス (-1)
    └── 過去採用カテゴリ ボーナス (将来)
    ↓
[Reason Generation] ── if-then + obstacle contrast テンプレート
    ↓
[Proposal 生成] ── proposal=true, proposalReason=[generated]
    ↓
[Buffer 適用] ── T3: 前後5分バッファ → startTime = gap.start + 5min
    ↓
[Insert]
```

### 決定ルール詳細

#### Rule 1: 過密ガード（L1）
```typescript
if (nonTravelItems.length >= 7) return items; // gap fill スキップ
```
根拠: Slack 研究（稼働率80%超は逆効果）、通知疲労（6+/日で応答率崩壊）

#### Rule 2: 午後ディップ強制（T4）
```typescript
if (gap.startMin >= 780 && gap.startMin < 900) { // 13:00-15:00
  pool = pool.filter(c => c.taxonomy === "recovery");
}
```
根拠: 生物学的パフォーマンス低下期。recovery のみ許可。

#### Rule 3: バッファ適用（T3）
```typescript
const usableGap = gap.durationMin - 10; // 前後5分バッファ
candidate.durationMin > usableGap → reject
```
根拠: Planning Fallacy（40%過小評価）への軽い補正。

#### Rule 4: 空白保護（L3）
```typescript
if (previousGapHadProposal) continue; // 連続gap は交互に空白保護
```
根拠: 意図的スラック時間は認知的柔軟性に必要（Org Science 2018）

#### Rule 5: if-then 理由生成
```typescript
// テンプレート: [状況/障害] + [行動] + [効果]
reason = buildIfThenReason(candidate, gap, circadianPhase);
```
根拠: Implementation Intentions d=0.65、MCII g=0.34

---

## 実装方針

### Phase 1（即時 — gapFillEngine.ts 改修）
1. **候補プールの if-then reason 書き換え**: 全6プールの reason を evidence-based テンプレートに
2. **午後ディップ強制フィルタ追加**: 13-15時は recovery 系のみ
3. **過密ガード (L1) 追加**: アイテム数チェック
4. **バッファ (T3) 適用**: gap 利用可能時間を -10min で計算
5. **連続提案防止 (L3)**: 交互空白保護

### Phase 2（次スプリント — tailoring 拡張）
6. 天気連携（shared/location.ts → 雨天時は散歩候補を下げる）
7. duplicate_activity チェック (C3)
8. 食後の高認知制限 (C5)

### Phase 3（将来 — 学習ループ）
9. 提案採用/却下ログ基盤
10. contextual bandit（Thompson Sampling）
11. Stargazer personality overlay

---

## 情報ソース

| 文献 | 知見 | 引用箇所 |
|------|------|----------|
| Gollwitzer & Sheeran (2006) | Implementation Intentions d=0.65 | A, D |
| 2024 Meta-Analysis (642 tests) | if-then + リハーサルで効果増強 | A |
| Wang et al. (2021) | MCII g=0.34, obstacle contrast | A, D |
| Aeon et al. (2021) | 時間管理 r=.25, wellbeing に強い | 全体設計根拠 |
| Buehler, Griffin & Ross (1994) | Planning Fallacy 40%過小評価 | B (T3) |
| DeMarco "Slack" / Org Science 2018 | 稼働率70-80%最適 | B (L1, L3) |
| マイクロブレイク研究 | ≤10min d=.36, SNS逆効果 | A (recovery) |
| 午後ディップ研究 | 13-15時生物学的低下 | B (T4), D |
| JITAI フレームワーク | 4要素: 決定点/介入/変数/ルール | C, D |
| 通知疲労研究 | 6+/日で応答率崩壊, 3-4日で onset | B (L2) |
| Contextual Bandit | Thompson Sampling, 30回収束 | C (Tier 3) |
