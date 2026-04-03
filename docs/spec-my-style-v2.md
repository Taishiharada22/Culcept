# /my-style v2 実装仕様書

**作成日**: 2026-04-03
**ステータス**: CEO承認待ち
**前提**: `docs/audit-my-style-redesign.md` の監査結果を反映。GPT評価の6点の指摘を全て解決。

---

## 1. Product Promise

> **手持ちの服から、今日の正解を最速で出す。使うほど、自分の軸も見えてくる。**

これが /my-style の唯一の約束。全画面設計の最上位制約。
- 先に「今日の正解」。自己理解は副産物として育つ。
- 「概念として正しい」は不合格。「毎朝30秒で判断が終わる」が合格。
- ECではない。SNSではない。「手持ち服の判断OS」。

---

## 2. North Star & Sub Metrics

### North Star Metric
**DAU のうち「今日タブで提案を見た」ユーザーの割合**
= `today_tab_proposal_viewed / DAU`

### Sub Metrics

| 指標 | 定義 | 目標（β） |
|------|------|-----------|
| **Onboarding 完走率** | 写真3着登録完了 / 初回起動 | 60% |
| **朝提案閲覧率** | 今日タブHERO表示 / DAU | 80% |
| **着用記録率** | 「これ着た」タップ / 提案閲覧 | 40% |
| **D7 リテンション** | 7日後に再訪問 / 初回起動 | 30% |
| **クローゼット登録数中央値** | ユーザーあたりアイテム数 | 10着（4週後） |
| **提案満足度** | 着用記録時の👍率 | 65% |

### 計測しない（今は）
- わたしタブ閲覧率（7日後から意味を持つ）
- Rendezvous遷移率（導線構築後）
- 購買転換（購買機能なし）

---

## 3. Canonical Data Model

### 3.1 正本テーブル

```
┌─────────────────────────────────────────────────────┐
│ wardrobe_items (正本: My Style が書く)               │
│ ──────────────────────────────────────────────────── │
│ id: UUID                                             │
│ user_id: UUID (FK → profiles)                        │
│ name: string                                         │
│ category: "tops"|"bottoms"|"outerwear"|"shoes"       │
│           |"accessories"|"hat"|"other"                │
│ subcategory?: string                                 │
│ color: string                                        │
│ color_name?: string                                  │
│ color_hex?: string                                   │
│ image_url?: string (base64 data URL → 将来 Storage)  │
│ season?: "ss"|"aw"|"all"                             │
│ thickness?: "thin"|"mid"|"thick"                     │
│ formality?: "casual"|"smart"|"dress"                 │
│ material_family?: string[]                           │
│ silhouette?: string                                  │
│ quality_score?: number                               │
│ ai_inferred: boolean (AI推論済みか)                   │
│ added_at: timestamptz                                │
│ updated_at: timestamptz                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ wear_events (正本: Calendar + My Style が書く)       │
│ ──────────────────────────────────────────────────── │
│ id: UUID                                             │
│ user_id: UUID                                        │
│ date: date (YYYY-MM-DD)                              │
│ item_ids: UUID[]                                     │
│ satisfaction?: 1-5                                   │
│ mood_tag?: string                                    │
│ note?: string                                        │
│ weather_snapshot?: jsonb                              │
│ source: "calendar"|"my-style"|"auto"                 │
│ created_at: timestamptz                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ outfit_proposals (正本: Engine が書く)               │
│ ──────────────────────────────────────────────────── │
│ id: UUID                                             │
│ user_id: UUID                                        │
│ date: date                                           │
│ variant: "main"|"casual"|"dressy"|"rain"|"cold"      │
│ item_ids: UUID[]                                     │
│ sync_score: number (0-100)                           │
│ reason: string                                       │
│ weather_context: jsonb                               │
│ events_context: jsonb                                │
│ feedback?: "accepted"|"rejected"|"ignored"           │
│ created_at: timestamptz                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ style_signals (正本: Engine が書く、わたしタブが読む)│
│ ──────────────────────────────────────────────────── │
│ id: UUID                                             │
│ user_id: UUID                                        │
│ signal_type: "axis_shift"|"pattern"|"gap"|"insight"  │
│ payload: jsonb                                       │
│ confidence: number (0-1)                             │
│ period_start: date                                   │
│ period_end: date                                     │
│ created_at: timestamptz                              │
└─────────────────────────────────────────────────────┘
```

### 3.2 責務分離

```
My Style が所有するデータ:
  ├── wardrobe_items (CRUD)
  ├── style_selections (レーン選択)
  ├── style_profile (自動算出)
  └── photo assets

Calendar が所有するデータ:
  ├── calendar_events (予定)
  ├── weather_forecasts (天気キャッシュ)
  └── calendar_outfits (日別記録 — wear_events に統合予定)

Engine（共有）が所有するデータ:
  ├── wear_events (統合正本)
  ├── outfit_proposals (提案ログ)
  ├── combo_graph (ペア親和性)
  ├── rotation_profiles (着用頻度)
  ├── satisfaction_profiles (満足度学習)
  └── style_signals (自動検出インサイト)

二重実装の禁止:
  ├── outfitEngine は1箇所（lib/shared/outfitEngine/）
  ├── wear_events は1テーブル（source列で区別）
  ├── wardrobe は1箇所（lib/shared/wardrobe.ts 経由）
  └── scoring は1関数（scoreCandidate を共有）
```

### 3.3 localStorage → Server 移行計画

**Phase 1-3（今回）**: localStorage を正本のまま維持。Server は非同期バックアップ。
**Phase 4 以降**: wear_events / outfit_proposals を Supabase テーブルに昇格。localStorage はキャッシュに降格。

理由: 今はオフライン対応と即時応答が優先。マルチデバイス対応は MAU 100 超えてから。

---

## 4. Engine Ownership（エンジン所有権）

### 4.1 統一エンジン: `lib/shared/outfitEngine/`

```
lib/shared/outfitEngine/
├── index.ts              — public API: generateTodayProposal()
├── scoreCandidate.ts     — 12因子スコアリング（Calendar から移植）
├── buildCombo.ts         — カテゴリ横断コンボ生成
├── syncScore.ts          — 5軸品質スコア(climate/tpo/visual/mobility/personalFit)
├── comboGraph.ts         — ペア親和性グラフ（Calendar から移植）
├── rotationTracker.ts    — 着用頻度最適化（Calendar から移植）
├── satisfactionLearner.ts — 満足度学習（Calendar から移植）
├── materialWeather.ts    — 素材×天気マトリクス（Calendar から移植）
├── temporalPatterns.ts   — 曜日×天気×満足度3Dパターン
└── types.ts              — 共有型定義
```

**Public API:**
```typescript
export function generateTodayProposal(params: {
  wardrobe: WardrobeItem[];
  date: string;
  weather: WeatherDaily | null;
  events?: Array<{ event_type: string; event_name: string }>;
  mood?: string;
  persona?: CalendarPersonaProfile | null;
}): TodayProposal | null;

export interface TodayProposal {
  main: OutfitProposal;
  alternatives: OutfitProposal[];   // max 2
  reason: string;                   // 日本語1行
  weatherSummary: string;           // "26°C 晴れ"
  syncScore: number;                // 0-100
  confidence: number;               // 0-1
}
```

### 4.2 呼び出し元

| 画面 | 呼び出し | 追加コンテキスト |
|------|----------|-----------------|
| My Style 今日タブ | `generateTodayProposal()` | mood（気分ピッカー） |
| Calendar 日別詳細 | `generateTodayProposal()` | events（予定リスト） |
| Calendar 週間ビュー | 同上を日数分バッチ | — |

Calendar 専用ロジック（日別レイアウト、週間グリッド表示）は Calendar 側に残す。
**提案生成ロジックは一切 Calendar/My Style 個別に持たない。**

---

## 5. Photo Onboarding — 認識修正込み完全設計

### 5.1 理想フロー（30秒）

```
Step 1: カメラ起動（3秒）
  └── 「クローゼットの一角を撮ってください」
  └── ファインダーに3着分のガイド枠表示
  └── シャッターボタン1つ

Step 2: AI分割 + 一次分類（3秒以内）
  └── 撮影後即座にローディング開始
  └── スケルトンで3枠表示（「分析中...」）
  └── 一次分類完了で各枠にサムネイル + カテゴリラベル表示
  └── 例: [白シャツ → トップス] [デニム → ボトムス] [黒スニーカー → 靴]

Step 3: 確認 + 修正（10秒）
  └── 各アイテムカードに:
       ├── サムネイル（タップで拡大）
       ├── カテゴリ（タップで変更ドロップダウン: 7項目）
       ├── 色（自動検出済み、タップで変更: 22色グリッド）
       └── ✓ ボタン（確定）
  └── 全体に「すべて正しい」ボタン（一括確定）
  └── 誤分割なら「× これは服じゃない」で除外

Step 4: 完了（2秒）
  └── 「3着登録しました。明日からここにおすすめが届きます」
  └── 今日タブへ自動遷移
```

### 5.2 AI誤認識時の例外フロー

```
Case A: カテゴリ誤認識（最頻出）
  ── AI: 「トップス」 → ユーザー: タップ → ドロップダウンで「アウター」選択
  ── 修正は1タップ（ドロップダウン7項目、アイコン付き）
  ── 修正データは学習に還元（将来: 個人モデル fine-tune）

Case B: 色誤認識
  ── AI: 「グレー」 → ユーザー: 色サークルをタップ → 22色グリッドから「ネイビー」選択
  ── 色グリッドは写真から抽出した上位3色 + 全22色

Case C: 写真が不鮮明 / 背景と区別不能
  ── 背景除去の confidence < 50% → 黄色バッジ「認識精度が低い」表示
  ── 「撮り直す」ボタン + 「このまま使う」ボタン
  ── 「このまま使う」→ 手動でカテゴリ・色を指定

Case D: 1着しか認識できなかった
  ── 「もう2着追加しましょう」+ 再撮影ボタン + 「1着で始める」
  ── 1着でも進行可能（強制しない）

Case E: 服以外を認識した（バッグ、帽子など）
  ── 正しくカテゴリ「アクセサリー」「帽子」に分類できていればOK
  ── 「× これは除外」ボタンで削除

修正にかかる時間の上限: 各アイテム5秒以内。
3着で最悪ケース: 30秒（撮影3秒 + AI 3秒 + 修正15秒 + 確認2秒）。
```

### 5.3 技術実装

**現在のAI推論**: `inferItemHints.ts` は **stub（return null）**。未実装。

**Phase 1 実装**:
- Canvas client-side 処理を維持（背景除去、色抽出）
- カテゴリ推論: **画像のアスペクト比 + 色分布 + 位置ヒューリスティック**でルールベース分類
  - 横長 + 上部 → トップス
  - 縦長 + 下部 → ボトムス
  - 小面積 + 下部 → 靴
  - これだけで60-70%は正しい
- 残りはユーザー修正（1タップ）

**Phase 2 実装（MAU 50超えてから）**:
- Claude Vision API によるアイテム分類
- `POST /api/my-style/classify-image` → `{ category, subcategory, color, material, season, formality }`
- confidence 付き返却。confidence < 0.7 は黄色バッジ
- 修正データを蓄積して分類精度を向上

---

## 6. Screen-by-Screen Final Spec

### 6.1 今日タブ（☀️）— 絶対主役

**責務**: 朝30秒で「今日何着る」を終わらせる。

**レイアウト（上から）**:

```
[0px] ━━━ Weather Header ━━━━━━━━━━━━━━━━━━
      ☀️ 26°C 晴れ  東京
      14:00 ミーティング / 19:00 食事会

[80px] ━━━ Proposal Hero Card ━━━━━━━━━━━━━━
      ┌────────────────────────────────┐
      │  [アイテム写真 横並び]          │
      │   白シャツ × ネイビーパンツ     │
      │   × レザーシューズ              │
      │                                │
      │  「午後のミーティングに合わせて  │
      │   きれいめに」                  │
      │                                │
      │  ┌──────────┐  ┌──────────┐   │
      │  │ これ着る 👍│  │ 別の案 →  │   │
      │  └──────────┘  └──────────┘   │
      └────────────────────────────────┘

[400px] ━━━ Alt Proposal (横スワイプ) ━━━━━━
      カジュアル版: [コーデ] + 理由1行
      (最大2案。スワイプで切替)

[550px] ━━━ Mood Picker (任意) ━━━━━━━━━━━━
      今日の気分: [元気] [ふつう] [ゆったり]
      (選択するとProposalが気分反映版に更新)

[620px] ━━━ Weekly Insight (1行) ━━━━━━━━━━━
      💡 今週はカジュアル寄り。2日ぶりにきれいめを
         おすすめしました。
```

**Critical Rules**:
- 0スクロールで Weather + Proposal Hero が見える（ファーストビュー完結）
- Hero Card の理由は**1行**。2行以上禁止
- 「これ着る」ボタンは Hero Card 内。外に出さない
- Mood Picker は任意。選択しなくても提案は出る
- Weekly Insight は7日分のデータが貯まるまで非表示

**データフロー**:
```
起動 → lib/shared/outfitEngine/generateTodayProposal({
  wardrobe: loadWardrobeFromLocal(),
  date: today,
  weather: cachedWeather ?? fetchWeather(),
  events: fetchCalendarEvents(today),
  mood: selectedMood ?? undefined,
}) → TodayProposal → 表示
```

### 6.2 クローゼットタブ（👔）— 二番手

**責務**: 手持ちの把握と活用。「使える持ち物OS」。

**レイアウト**:

```
[0px] ━━━ Summary Bar ━━━━━━━━━━━━━━━━━━━━
      32着 / よく着る: 8着 / 眠ってる: 6着

[40px] ━━━ よく着る服 (横スクロール) ━━━━━━━
      着用回数Top5。写真カード + 着用回数バッジ

[180px] ━━━ 最近着てない服 ━━━━━━━━━━━━━━
      2週間以上未着用。「出番かも」ラベル
      (0着なら非表示)

[320px] ━━━ カテゴリ別 (折りたたみグリッド) ━━
      ▶ トップス (12)
      ▶ ボトムス (8)
      ▶ アウター (4)
      ▶ 靴 (6)
      ▶ その他 (2)
      (展開時: 写真グリッド 3列)

[500px] ━━━ 定番の組み合わせ (自動検出) ━━━━━
      「白T × デニム」12回着用 / 「紺ジャケ × グレーパンツ」8回着用
      (3回以上同時着用したペアを自動表示)
      (wear_events < 10件なら非表示)

[640px] ━━━ 足りない1点 ━━━━━━━━━━━━━━━━━
      「薄手のカーディガンがあると
       春の気温変化に対応しやすくなります」
      (Gap Analysis 結果。wardrobe < 5着なら非表示)
```

**FAB**: 右下に 📷 1つ。タップ → カメラ起動 → PhotoAddWizard。

**詳細編集**: アイテムカードをタップ → 詳細シート。ここで素材・ドレープ・シルエット等の詳細属性を編集可能。**表のグリッドには出さない**。

### 6.3 わたしタブ（🪞）— 三番手（7日後に立ち上がる）

**責務**: スタイルの自己理解が育つ面。

**7日未満（データ不足）のレイアウト**:
```
[0px] ━━━ Quiet State ━━━━━━━━━━━━━━━━━━━
      あなたのスタイルを学習中です。
      あと4日分の着用記録で、
      あなたの軸が見えてきます。

      ┌─────────────────────┐
      │  [進捗: ●●●○○○○]    │
      │  3/7日分の記録あり    │
      └─────────────────────┘

      パーソナルカラー: Spring
      (body-color連携データがあれば表示)
```

**7日以上のレイアウト**:
```
[0px] ━━━ あなたの主軸 ━━━━━━━━━━━━━━━━━━
      ミニマル × クリーン
      [Style DNA レーダー（コンパクト）]
      着用データから: 87%の服がこの軸に集中

[120px] ━━━ 最近の変化 ━━━━━━━━━━━━━━━━━━
      カジュアル方向に +12%
      スニーカー着用率が60%に上昇
      (2週間の差分。差分がなければ「安定しています」)

[220px] ━━━ 広げたい方向 ━━━━━━━━━━━━━━━━
      ストリートの小物を足すと
      幅が広がりそうです
      (足りない1点と連動)

[320px] ━━━ 気づき ━━━━━━━━━━━━━━━━━━━━━
      仕事の日は黒が増え、
      休日は青系を選ぶ傾向があります。
      (Assertion Engine の結果を日本語1文に)

[420px] ━━━ もっと見る (折りたたみ) ━━━━━━━
      ▶ 場面別のわたし (PersonaPanel)
      ▶ スタイルルール (StyleLogicPanel)
      ▶ コスパ分析 (CostPerWearDashboard)
      ▶ AI分析 (AIInsightPanel)
```

**Critical Rules**:
- 7日未満では「学習中」を正直に見せる。空のレーダーは出さない。
- 全てのラベルは日本語。英語の概念名を一切使わない。
- 根拠は常に着用データ。「診断結果」「AIの判断」とは言わない。

---

## 7. Empty State Spec

### 原則
空でも次の価値を予告する。「データがありません」は全面禁止。

### 具体

| 状態 | 表示 |
|------|------|
| **wardrobe = 0, 初回起動** | PhotoOnboarding 起動。「クローゼットの一角を撮ってください。30秒で始められます」 |
| **wardrobe = 0, 今日タブ** | 天気は表示（データ不要）。提案枠に「3着登録すると、明日からここにおすすめが届きます」+ 📷ボタン |
| **wardrobe = 0, クローゼットタブ** | 中央に大きな📷ボタン + 「写真で追加」。周囲にうっすらプレースホルダーカード3枚（形だけ見せる） |
| **wardrobe 1-2着** | 今日タブ: 天気 + 「あと1着で提案が始まります」。クローゼット: 登録済みアイテム + 「もう1着追加」 |
| **wardrobe 3着以上, wear_events = 0** | 今日タブ: 提案表示開始。「これ着た」を押すと精度が上がると説明 |
| **wardrobe 3着以上, wear_events < 7** | わたしタブ: 「学習中。あとX日分の記録で軸が見えます」+ 進捗バー |
| **わたしタブ, 7日以上** | 完全表示。折りたたみ内も含めて全セクション |

---

## 8. Performance Budget

### 必達基準

| 指標 | 予算 | 実現手段 |
|------|------|----------|
| **今日タブ Hero Card 初期表示** | 1.5秒以内 | Weather: IndexedDB キャッシュ（5分TTL）。Proposal: 前回結果を optimistic 表示 → バックグラウンドで再計算。スケルトンは500ms以内にHeroサイズで表示 |
| **写真撮影 → 一次分類表示** | 3秒以内 | 背景除去: 200x200 ダウンサンプルで処理（現在はフル解像度）。色抽出: 50x50 K-means（現状維持、<500ms）。カテゴリ推論: ルールベース（<100ms）。合計: 背景除去2s + 色抽出0.5s + 推論0.1s = 2.6s |
| **「これ着る」記録反応** | 300ms以内 | Optimistic update: UIを即座に更新 → localStorage に書き込み → Server sync を非同期キュー |
| **タブ切替** | 200ms以内 | 現行の Framer Motion 200ms transition を維持。lazy load は初回のみ |
| **クローゼット初期表示** | 1秒以内 | wardrobe は localStorage から同期読込（<50ms）。画像は base64 data URL（ネットワーク不要） |

### Skeleton / Optimistic / Prefetch 設計

```
[起動時]
├── localStorage から wardrobe + wear_events を即座読込（同期）
├── 天気: IndexedDB キャッシュ → cache hit ならそのまま使用
│         cache miss → fetch + skeleton 表示（Heroサイズ固定、レイアウトシフトなし）
├── 提案: 前回の TodayProposal を IndexedDB からロード → 即表示
│         バックグラウンドで再計算 → 差分あれば静かに更新（フラッシュ禁止）
└── Calendar events: /api/calendar/today → 提案再計算トリガー

[写真追加時]
├── カメラ → File 取得（即座）
├── 背景除去: 200x200 リサイズ → canvas 処理 → 進捗バー
│   (フル解像度版は バックグラウンドで並行処理 → 後差し替え)
├── 色抽出: 50x50 → K-means → 即表示
├── カテゴリ推論: ルールベース → 即表示
└── 全完了で確認画面へ遷移

[「これ着る」タップ時]
├── UI: 即座にボタンを ✓ に変更 + haptic feedback
├── localStorage: wear_event を同期書込
├── Server: enqueueSync → 非同期
└── IndexedDB: 提案キャッシュを invalidate → 次回起動で再計算
```

---

## 9. Design Audit — ビジュアルルール

### 9.1 現状の未完成感の原因

1. **主役カードが存在しない**: 全てが同サイズのGlassCardで並ぶ。視覚的ヒエラルキーがない
2. **余白が均一**: section間のspaceが全てspace-y-4/6。緊張感がない
3. **色の階層がない**: 全てslate系の淡い色。どこに目を向ければいいか分からない
4. **FABが常に浮いている**: 使わない時も視界に入り、画面の静けさを壊す
5. **テキスト密度が高い**: SectionHeading + sub + Badge + 本文が全セクションにあり、読む前に疲れる
6. **空状態がスカスカ**: animate-pulse のスケルトンが「壊れている」印象を与える

### 9.2 ビジュアルルール（断定）

```
Rule 1: 主役カードは他の2倍の視覚重量
  今日タブ: Proposal Hero は高さ280px以上、角丸24px、影あり
  クローゼット: よく着る服レールは高さ120px、他セクションは高さ80px
  わたし: 主軸カードは高さ200px以上

Rule 2: 余白の緊張
  主役カードの上: 16px
  主役カードの下: 32px（他セクションとの距離を開ける）
  セクション間: 24px
  折りたたみ内: 12px
  → 「主役の周りだけ息ができる」レイアウト

Rule 3: 色の階層は3段
  Level 1 (主役): アクセントカラー（今日=amber-500、クローゼット=stone-600、わたし=teal-500）
  Level 2 (補助): slate-600 テキスト + slate-200 ボーダー
  Level 3 (背景): white/50 ~ slate-50/30 のグラデーション
  → 各タブでLevel 1の色が1箇所だけ使われる

Rule 4: FABの存在感制御
  スクロール静止時: 表示（opacity 1）
  スクロール中: フェードアウト（opacity 0.3）
  今日タブ: FAB非表示（主アクションはHero内の「これ着る」）
  クローゼットタブのみFAB表示

Rule 5: テキスト密度の制限
  1画面に見出しは最大2つ
  見出し直下のsub説明は禁止（見出しが自明なら不要）
  バッジは1セクション最大3つ
  本文は3行以内

Rule 6: 空状態は「完成品の予告」
  animate-pulse禁止。代わりに:
  ├── 天気データ（リアル）+ 提案枠（プレースホルダーだが形は完成形）
  ├── 「3着で始まります」のテキスト
  └── 📷 ボタン（目立つが落ち着いたトーン）
```

---

## 10. Component File Map

### 新規作成

| ファイル | 責務 | Phase |
|----------|------|-------|
| `lib/shared/outfitEngine/index.ts` | 統一提案API | P1 |
| `lib/shared/outfitEngine/scoreCandidate.ts` | 12因子スコアリング | P1 |
| `lib/shared/outfitEngine/buildCombo.ts` | コンボ生成 | P1 |
| `lib/shared/outfitEngine/syncScore.ts` | 5軸品質スコア | P1 |
| `lib/shared/outfitEngine/types.ts` | 共有型定義 | P1 |
| `_components/PhotoOnboarding.tsx` | 初回3着写真登録（修正フロー込み） | P2 |
| `_components/TodayHero.tsx` | 今日タブ主役カード | P3 |
| `_components/WearFeedbackButton.tsx` | 1タップ着用記録 | P4 |
| `_components/WardrobeGrid.tsx` | よく着る/眠ってる/カテゴリ一覧 | P5 |
| `_components/StyleEvolution.tsx` | 主軸+変化+広げたい方向 | P6 |
| `_components/SmartEmptyState.tsx` | 価値予告型空状態 | P3 |
| `_components/MoodPicker.tsx` | 3択気分ピッカー | P3 |
| `_components/WeeklyInsight.tsx` | 1行週次インサイト | P6 |

### 大幅改修

| ファイル | 改修内容 | Phase |
|----------|----------|-------|
| `page.tsx` | EngagementHub → TodayHero。WardrobeOverviewTab → WardrobeGrid。me タブ簡素化 | P3-P6 |
| `FloatingActions.tsx` | 3アクション → 📷 1つ。今日タブでは非表示 | P4 |
| `_lib/inferItemHints.ts` | stub → ルールベース推論（Phase 1）→ Claude Vision（Phase 2） | P2 |
| `EmptyStateCards.tsx` | → SmartEmptyState に統合 | P3 |
| `MyStyleHero.tsx` | sync表示削除。タブ別に最小限のヘッダーに | P5 |
| `WorkspaceBand.tsx` | ラベル確認（今日/クローゼット/わたし） | P3 |

### 削除

| ファイル | 理由 | Phase |
|----------|------|-------|
| `FormationLine.tsx` | ステージ進行不要 | P3 |
| `ResonanceFeed.tsx` | ユーザーベースゼロ | P3 |
| `EcosystemInsightsPanel.tsx` | 開発者メタ情報 | P3 |
| `CrossFeaturePanel.tsx` | 同上 | P3 |
| `DnaRarityBadge.tsx` | 行動に繋がらない | P6 |
| `StyleJourneyMap.tsx` | データ不足で空 | P6 |
| `OnboardingWizard.tsx` | PhotoOnboarding に置換 | P2 |
| `SparkleEffect.tsx` | 装飾過剰 | P3 |
| `_lib/weatherOutfit.ts` | outfitEngine に統一 | P1 |
| `_lib/todaysMirror.ts` | outfitEngine + MoodPicker に統一 | P1 |
| `_lib/ecosystem.ts` | 不要 | P3 |
| `_lib/stargazerBridge.ts` | 裏で動けばよい | P6 |

### 維持（変更なし）

| ファイル | 理由 |
|----------|------|
| `WardrobeCard.tsx` | アイテム表示の基盤 |
| `Primitives.tsx` | UI基盤 |
| `ErrorBoundary.tsx` | エラーハンドリング基盤 |
| `BackgroundRemover.tsx` | 写真処理基盤 |
| `_lib/colorHarmony.ts` | スコアリング基盤 |
| `_lib/outfitIntelligence.ts` | 折りたたみ内で使用 |
| `_lib/swipeLearningEngine.ts` | 学習データとして参照 |

---

## 11. API Ownership Map

| エンドポイント | 所有者 | 変更 |
|---------------|--------|------|
| `GET /api/my-style/bridge` | My Style | 維持 |
| `POST /api/my-style/bridge` | My Style | 維持 |
| `GET /api/my-style/diagnosis` | My Style | 維持（わたしタブ折りたたみ内） |
| `POST /api/my-style/ai-insight` | My Style | 維持（わたしタブ折りたたみ内） |
| **新規** `GET /api/outfit/today` | Engine (shared) | 新規: generateTodayProposal の HTTP ラッパー |
| **新規** `POST /api/outfit/feedback` | Engine (shared) | 新規: 着用記録 + 満足度の統一エンドポイント |
| **新規** `POST /api/my-style/classify-image` | My Style | 新規 Phase 2: Claude Vision による分類 |
| `GET /api/weather/subscription` | Calendar | 維持（My Style から参照） |
| `GET /api/calendar/events` | Calendar | 維持（My Style の今日タブから参照） |

---

## 12. Phase 1–7 ロードマップ

### 依存関係

```
P1 Engine Ownership
 ↓
P2 Photo Onboarding ──→ P3 Today Hero
                          ↓
                        P4 Wear Feedback
                          ↓
                        P5 Closet Summary
                          ↓
                        P6 Self View
                          ↓
                        P7 Rendezvous Bridge
```

P1 が全ての土台。P2 と P3 は P1 完了後に並行可能。P4 以降は直列。

---

### Phase 1: Engine Ownership 統一（3日）

**目的**: 提案ロジックの二重実装を消す。

**タスク**:
1. `lib/shared/outfitEngine/` ディレクトリ作成
2. Calendar の `scoreCandidate`, `buildCombo`, `computeSyncScore` を移植
3. `satisfactionLearner`, `rotationTracker`, `comboGraph`, `materialWeather` を移植
4. `generateTodayProposal()` public API を実装
5. Calendar の `outfitEngine.ts` を shared への re-export に変更
6. My Style の `weatherOutfit.ts`, `todaysMirror.ts`（提案生成部分）を削除
7. `GET /api/outfit/today` エンドポイント作成

**Acceptance Criteria**:
- [ ] `generateTodayProposal()` が wardrobe + weather + events を受け取り TodayProposal を返す
- [ ] Calendar の日別提案が shared engine 経由で生成される（既存動作が壊れない）
- [ ] My Style から `generateTodayProposal()` を呼び出せる
- [ ] `weatherOutfit.ts` の import が 0 件（grep で確認）
- [ ] 既存の Calendar テスト（あれば）がパスする

---

### Phase 2: Photo Onboarding + Correction Loop（3日）

**目的**: 初回30秒で3着登録。AI誤認識を即修正可能。

**タスク**:
1. `PhotoOnboarding.tsx` 新規作成（5.1 / 5.2 の仕様通り）
2. `inferItemHints.ts` にルールベース推論を実装（アスペクト比+色分布+位置ヒューリスティック）
3. `backgroundRemoval.ts` に 200x200 ダウンサンプル高速モードを追加
4. 修正UI: カテゴリ（7択ドロップダウン）+ 色（22色グリッド+検出上位3色）
5. `OnboardingWizard.tsx` を `PhotoOnboarding` に置換
6. 初回起動判定: wardrobe.length === 0 → PhotoOnboarding 表示

**Acceptance Criteria**:
- [ ] 初回起動で PhotoOnboarding が表示される
- [ ] カメラ撮影 → 3秒以内に一次分類が表示される
- [ ] カテゴリをタップ → ドロップダウンで修正可能
- [ ] 色をタップ → グリッドで修正可能
- [ ] 「すべて正しい」で一括確定 → wardrobe に保存
- [ ] 完了後に今日タブへ自動遷移
- [ ] 1着しか認識できなかった場合、「1着で始める」が選べる

---

### Phase 3: Today Hero（2日）

**目的**: 今日タブを開いて1.5秒で提案が見える。

**タスク**:
1. `TodayHero.tsx` 新規作成（6.1 の仕様通り）
2. `SmartEmptyState.tsx` 新規作成（天気+価値予告）
3. `MoodPicker.tsx` 新規作成（3択: 元気/ふつう/ゆったり）
4. `EngagementHub.tsx` の代わりに TodayHero を今日タブに配置
5. IndexedDB キャッシュ: 前回 TodayProposal を保持 → 起動時 optimistic 表示
6. Weather キャッシュ: IndexedDB 5分TTL
7. `FormationLine`, `ResonanceFeed`, `EcosystemInsightsPanel`, `CrossFeaturePanel`, `SparkleEffect` を page.tsx の import から削除
8. 内部概念語の全面日本語化（見出し・ラベル）

**Acceptance Criteria**:
- [ ] 今日タブ起動 → 1.5秒以内に Weather + Proposal Hero が表示
- [ ] Proposal Hero に天気・予定・コーデ写真・理由1行が含まれる
- [ ] 空状態（wardrobe=0）で「3着登録すると〜」の価値予告が表示
- [ ] 画面上に "Self-forming", "Formation", "Assertion", "Core/Rare/Secret" 等の英語概念語がゼロ
- [ ] Mood Picker 選択 → 提案が更新される
- [ ] FormationLine, ResonanceFeed 等の削除コンポーネントがビルドに含まれない

---

### Phase 4: One-tap Wear Feedback（1日）

**目的**: 「これ着た」を300ms以内に記録。

**タスク**:
1. `WearFeedbackButton.tsx` 新規作成
2. TodayHero 内に「これ着る」ボタンを配置
3. Optimistic update: タップ → 即 UI 更新（✓ + haptic）→ localStorage → Server 非同期
4. `POST /api/outfit/feedback` エンドポイント作成
5. 記録後に satisfaction ピッカー（👍👎）を表示（任意、スキップ可能）
6. `FloatingActions.tsx` を 📷 1アクションに修正。今日タブでは非表示

**Acceptance Criteria**:
- [ ] 「これ着る」タップ → 300ms以内にUI反応（✓ 表示 + haptic）
- [ ] wear_events に記録が保存される（date, item_ids, source: "my-style"）
- [ ] 満足度ピッカーはスキップ可能
- [ ] FABが今日タブで非表示、クローゼットタブで 📷 のみ表示

---

### Phase 5: Closet Summary（2日）

**目的**: クローゼットを「使える持ち物OS」に。

**タスク**:
1. `WardrobeGrid.tsx` 新規作成（6.2 の仕様通り）
2. よく着る服: wear_events から着用回数 Top5 を算出
3. 眠ってる服: 2週間以上未着用を抽出
4. カテゴリ別折りたたみグリッド
5. 定番の組み合わせ: combo_graph から wearCount >= 3 のペアを表示
6. 足りない1点: Gap Analysis の結果を1文で表示
7. WardrobeOverviewTab の Self-forming Items / Intelligence/Materials トグルを削除
8. `MyStyleHero.tsx` 簡素化（sync 表示削除）

**Acceptance Criteria**:
- [ ] クローゼットタブにサマリーバー（X着 / よく着る: Y / 眠ってる: Z）
- [ ] よく着る服が横スクロールで表示
- [ ] カテゴリ別に折りたたみ可能
- [ ] "Self-forming Items" の見出しが消えている
- [ ] "着回し分析" "素材図鑑" トグルボタンが消えている

---

### Phase 6: Self View（2日）

**目的**: わたしタブを「育つ自己像」に。

**タスク**:
1. `StyleEvolution.tsx` 新規作成（6.3 の仕様通り）
2. `WeeklyInsight.tsx` 新規作成（1行インサイト）
3. 7日未満の quiet state 実装
4. 7日以上: 主軸 + 変化 + 広げたい方向 + 気づき
5. 折りたたみ: PersonaPanel / StyleLogicPanel / CostPerWearDashboard / AIInsightPanel
6. IdentityTab の iam/iseek/ibecome 3モードを「わたしの軸」に統合
7. 不要コンポーネント削除: DnaRarityBadge, StyleJourneyMap, ecosystem.ts, stargazerBridge.ts

**Acceptance Criteria**:
- [ ] 7日未満: 「学習中」+ 進捗バー表示。空のレーダーチャートがない
- [ ] 7日以上: 主軸が日本語1行で表示（例: 「ミニマル × クリーン」）
- [ ] 変化が2週間差分で表示
- [ ] 折りたたみ内に詳細パネルが収納されている
- [ ] iam/iseek/ibecome のタブ切替UIが消えている

---

### Phase 7: Rendezvous Bridge（1日）

**目的**: わたしタブからRendezvousへの導線。

**タスク**:
1. わたしタブの主軸カード下に「Rendezvousで使う →」ボタン
2. スタイルプロフィール（主軸・DNA）を Rendezvous API が参照できるよう export
3. Genome Card のスタイルセクションにMy Styleデータを反映

**Acceptance Criteria**:
- [ ] わたしタブから Rendezvous プロフィールへ1タップで遷移
- [ ] Rendezvous 側でスタイル情報が表示可能
- [ ] Genome Card にスタイルDNA情報が含まれる

---

## 13. 全体タイムライン

```
Day 1-3:   Phase 1 — Engine Ownership 統一
Day 4-6:   Phase 2 — Photo Onboarding + Correction Loop
Day 5-6:   Phase 3 — Today Hero (P2と並行可能: P1完了後)
Day 7:     Phase 4 — One-tap Wear Feedback
Day 8-9:   Phase 5 — Closet Summary
Day 10-11: Phase 6 — Self View
Day 12:    Phase 7 — Rendezvous Bridge
Day 13-14: バッファ + 統合テスト + バグ修正
```

合計: 14日。バッファ込み。

---

## 14. 完成判定基準（最終版）

### 5秒テスト
初見ユーザーに今日タブを5秒見せる → 「今日着る服を提案してくれる」と答えられる。

### 30秒テスト
初回起動から30秒以内に3着の写真登録が完了し、今日タブに遷移して提案が見える。

### 3日連続テスト
3日間毎朝使ってもらい、4日目も自発的に開く。

### ゼロ概念語テスト
画面全体をgrep して、以下が0件:
Self-forming, Formation, Assertion, Contradiction, Resonance, Ecosystem, Cross-Feature, Core/Rare/Secret (UI上), iam/iseek/ibecome (UI上), DNA Rarity

### パフォーマンステスト
- 今日タブ初期表示: 1.5秒以内
- 写真→一次分類: 3秒以内
- 「これ着る」反応: 300ms以内

### 完成品テスト
空状態（wardrobe=0）のスクリーンショットを見て「壊れている」と感じない。天気が表示され、次のアクションが明確。
