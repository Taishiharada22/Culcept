# /my-style v2 最終実装仕様 — 移行・障害・計測

**作成日**: 2026-04-03
**ステータス**: CEO承認待ち
**前提**: `docs/spec-my-style-v2.md` の実装仕様に対する最終補完。UIや概念の話は増やさない。移行と障害耐性と計測の精度に絞る。

---

## 1. Migration Spec（移行計画）

### 1.1 原則

- **ゼロダウンタイム**: 移行途中でも /my-style は動き続ける
- **段階的置換**: 1ファイルずつ差し替え。全面書き換えの一括デプロイは禁止
- **localStorage互換**: 既存キー `culcept_my_style_v3` は読み書き両方を維持。新キーは追加しない
- **ロールバック可能**: 各Phaseの変更は `git revert` 1コミットで戻せる粒度でコミットする

### 1.2 Phase 1: Engine Ownership 統一

**削除対象**:
- `_lib/weatherOutfit.ts` — WeatherOutfitPanel.tsx から import されている
- `_lib/todaysMirror.ts` — TodaysMirror.tsx から import されている（提案生成部分のみ）

**移行手順**:

```
Step 1: lib/shared/outfitEngine/ を作成（Calendar からコピー+リファクタ）
  ├── Calendar の outfitEngine.ts → scoreCandidate, buildCombo を抽出
  ├── satisfactionLearner.ts, rotationTracker.ts, comboGraph.ts, materialWeather.ts を移動
  ├── generateTodayProposal() を新規実装
  └── ビルド確認（tsc --noEmit）

Step 2: Calendar の outfitEngine.ts を shared への re-export に差し替え
  ├── import { generateDayProposal } from "@/lib/shared/outfitEngine"
  ├── Calendar の全テスト（tests/unit/calendar/）を実行して既存動作確認
  └── ビルド確認

Step 3: weatherOutfit.ts の利用箇所を置換
  ├── WeatherOutfitPanel.tsx: weatherOutfit の関数呼び出しを
  │   generateTodayProposal() に差し替え
  ├── weatherOutfit.ts 内の WEATHER_BACKOFF_KEY ロジックは
  │   lib/shared/outfitEngine/ 内に吸収
  └── weatherOutfit.ts を削除

Step 4: todaysMirror.ts の提案生成部分を分離
  ├── mood→outfit 予測は MoodPicker + outfitEngine に吸収
  ├── wear log 記録・weekly pattern は TodaysMirror.tsx 内にインライン化
  ├── STORAGE_KEY_MIRROR (culcept_todays_mirror_v1) は TodaysMirror 内で直接参照
  └── todaysMirror.ts を削除

Step 5: grep 検証
  └── grep -r "weatherOutfit\|todaysMirror" app/ lib/ → 0件を確認
```

**互換レイヤー**: なし。weatherOutfit/todaysMirror は My Style 内部でのみ使用。外部依存なし。

### 1.3 Phase 2: Photo Onboarding 置換

**削除対象**:
- `_components/OnboardingWizard.tsx` — page.tsx から dynamic import（line 50）

**移行手順**:

```
Step 1: PhotoOnboarding.tsx を新規作成
  └── OnboardingWizard.tsx と並行して存在可能（別ファイル）

Step 2: page.tsx の dynamic import を差し替え
  ├── Before: const OnboardingWizard = dynamic(() => import("./OnboardingWizard"))
  ├── After:  const PhotoOnboarding = dynamic(() => import("./PhotoOnboarding"))
  └── showOnboarding 条件はそのまま維持（wardrobe.length === 0）

Step 3: OnboardingWizard.tsx を削除
  └── grep -r "OnboardingWizard" → 0件を確認

Step 4: inferItemHints.ts をルールベース推論に更新
  └── 既存の stub (return null) を置換。呼び出し側は変更なし
```

**互換レイヤー**: なし。OnboardingWizard は page.tsx からのみ参照。

### 1.4 Phase 3: Today Hero + コンポーネント削除

**削除対象**（全て page.tsx または EngagementHub.tsx からのみ参照）:

| ファイル | import元 | 削除順 |
|----------|----------|--------|
| `FormationLine.tsx` | EngagementHub.tsx | EngagementHub置換と同時 |
| `SparkleEffect.tsx` | page.tsx (line 26) | page.tsx 編集と同時 |
| `ResonanceFeed.tsx` | page.tsx (line 76) + InsightsTab.tsx | InsightsTab 編集と同時 |
| `EcosystemInsightsPanel.tsx` | page.tsx (line 80) + InsightsTab.tsx | InsightsTab 編集と同時 |
| `ecosystem.ts` | EcosystemInsightsPanel.tsx | EcosystemInsightsPanel 削除後 |

**移行手順**:

```
Step 1: TodayHero.tsx + SmartEmptyState.tsx + MoodPicker.tsx を新規作成

Step 2: page.tsx の today タブ部分を差し替え
  ├── Before: <EngagementHub ... />
  ├── After:  <TodayHero ... />
  └── EngagementHub の import を削除

Step 3: page.tsx から削除対象の import を1つずつ除去
  ├── SparkleEffect → import 削除 + useSparkle 呼び出し削除
  ├── ResonanceFeed → dynamic import 削除（page.tsx line 76）
  ├── EcosystemInsightsPanel → dynamic import 削除（page.tsx line 80）
  └── 各削除後にビルド確認

Step 4: InsightsTab.tsx から ResonanceFeed, EcosystemInsightsPanel を除去
  └── InsightsTab 内の import と JSX を削除

Step 5: コンポーネントファイル削除
  ├── FormationLine.tsx
  ├── SparkleEffect.tsx
  ├── ResonanceFeed.tsx
  ├── EcosystemInsightsPanel.tsx
  └── ecosystem.ts

Step 6: grep 検証
  └── grep -r "FormationLine\|SparkleEffect\|ResonanceFeed\|EcosystemInsight\|ecosystem" app/ → 0件
```

**注意**: `CrossFeaturePanel.tsx` は IdentityTab.tsx が import している。IdentityTab 改修（Phase 6）まで削除しない。型 import（pageUtils.ts）は Phase 6 で処理。

### 1.5 Phase 6: IdentityTab 統合

**変更対象**:
- `IdentityTab.tsx` — iam/iseek/ibecome 3モードを「わたしの軸」に統合
- `CrossFeaturePanel.tsx` — IdentityTab 内で使用
- `_lib/pageUtils.ts` — `CrossFeatureData` 型 import

**移行手順**:

```
Step 1: StyleEvolution.tsx を新規作成（IdentityTab の機能を吸収）
  ├── iam/iseek/ibecome のデータは内部で参照（表出しない）
  ├── CrossFeatureData 型は StyleEvolution 内で直接定義
  └── PersonaPanel は折りたたみ内に配置

Step 2: page.tsx の me タブ部分を差し替え
  ├── Before: <StylesTab .../> + <IdentityTab .../> + <InsightsTab .../>
  ├── After:  <StyleEvolution .../> + 折りたたみ群
  └── IdentityTab, CrossFeaturePanel の import を削除

Step 3: pageUtils.ts から CrossFeatureData import を削除
  └── BridgePayload 型は crossFeature フィールドを jsonb に変更

Step 4: コンポーネントファイル削除（Phase 6 完了時のみ）
  ├── CrossFeaturePanel.tsx
  ├── DnaRarityBadge.tsx
  ├── StyleJourneyMap.tsx
  └── stargazerBridge.ts

Step 5: grep 検証
```

### 1.6 localStorage キー移行マトリクス

| キー | 現在の所有者 | 移行後 | 変更内容 |
|------|-------------|--------|----------|
| `culcept_my_style_v3` | state.ts | state.ts | **変更なし** |
| `culcept_my_style_v3_backup` | state.ts | state.ts | **変更なし** |
| `culcept_my_style_v2` | state.ts (legacy) | state.ts | **変更なし**（Calendar が読む） |
| `culcept_todays_mirror_v1` | todaysMirror.ts | TodaysMirror.tsx 直接 | ファイル移動のみ |
| `culcept_calendar_worn_v1` | calendarBridge.ts | lib/shared/outfitEngine/ | 移動（read先を変更） |
| `culcept_wear_records_v1` | costPerWear.ts | costPerWear.ts | **変更なし** |
| `culcept_wear_log_v1` | TodaysMirror.tsx | TodaysMirror.tsx | **変更なし** |
| `culcept_swipe_learning_v1` | constants.ts | constants.ts | **変更なし** |
| `culcept_swipe_stats_v1` | constants.ts | constants.ts | **変更なし** |
| `culcept_weather_backoff_v1` | weatherOutfit.ts | **削除** | outfitEngine 内でインライン化 |
| `culcept_style_quiz_result_v1` | constants.ts | constants.ts | **変更なし** |

**IndexedDB**: `culcept_mystyle` DB / `state_cache` store → **変更なし**。

### 1.7 ロールバック手順

各Phaseは独立したブランチで作業し、main にマージ。

```
ロールバック手順:
1. git log --oneline で対象Phase のマージコミットを特定
2. git revert <merge-commit> で逆マージ
3. ビルド確認 → デプロイ
4. localStorage は既存キーを維持しているため、ユーザーデータへの影響なし
```

**ロールバック不可能な変更**: なし。全Phaseで既存 localStorage キーを破壊しない。

---

## 2. Failure Mode Matrix（障害仕様）

### 2.1 マトリクス

| # | 障害 | 発生頻度 | UI表示 | 復帰方法 | 実装箇所 |
|---|------|----------|--------|----------|----------|
| F1 | **Weather API 取得失敗** | 中（ネットワーク依存） | 天気ヘッダー: 「天気を取得できません」+ 前回キャッシュの気温表示。Proposal Hero: **天気なし版の提案を表示**（季節+曜日ベース） | 5分後に自動リトライ。手動: プルダウンリフレッシュ | TodayHero.tsx |
| F2 | **Calendar Events 取得失敗** | 低（内部API） | 予定欄: 非表示（空ではなく完全非表示）。提案: **予定なし版**（formality をデフォルト casual に） | 起動時1回リトライ。失敗なら予定なしで進行 | TodayHero.tsx |
| F3 | **写真 AI 分類失敗（背景除去失敗）** | 中（画像品質依存） | confidence バッジ黄色 + 「認識精度が低い」。「撮り直す」+ 「このまま使う」ボタン | 「このまま使う」→ 手動カテゴリ・色選択。再撮影 | PhotoOnboarding.tsx |
| F4 | **写真処理タイムアウト（3秒超過）** | 低（端末性能依存） | 3秒経過 → スケルトンを「手動で入力」ボタンに差し替え | QuickAddWizard へフォールバック | PhotoOnboarding.tsx |
| F5 | **localStorage 破損 / quota 超過** | 低 | トースト:「データの読み込みに問題がありました」。IndexedDB フォールバック → Server フォールバック | 復旧順: IndexedDB → Server (/api/my-style/bridge GET) → 空状態で再スタート | state.ts (既存の loadStateBundle) |
| F6 | **Server sync 失敗** | 中（ネットワーク依存） | **ユーザーには見せない**。バックグラウンドでキューに積む | offlineManager.ts の既存キュー機構。オンライン復帰時に自動処理 | offlineManager.ts |
| F7 | **wardrobe 0件 + Weather 失敗** | 低 | SmartEmptyState: 天気欄を「お住まいの地域の天気を取得中...」に。📷 ボタンは常に表示。「3着登録すると〜」のメッセージは天気に依存しない文言に切替 | Weather リトライは別途。オンボーディングフローは天気不要で進行可能 | SmartEmptyState.tsx |
| F8 | **outfitEngine が提案を生成できない**（wardrobe 不足 / カテゴリ偏り） | 中（初期ユーザー） | Proposal Hero の代わりに「あと1着で提案が始まります」+ 不足カテゴリのヒント（「ボトムスを追加すると提案できます」） | wardrobe に該当カテゴリが追加されたら自動復帰 | TodayHero.tsx |
| F9 | **IndexedDB 使用不可**（プライベートブラウジング等） | 低 | **ユーザーには見せない**。localStorage のみで動作 | stateCache.ts の既存フォールバック。全 IndexedDB 操作は try-catch 済み | stateCache.ts |
| F10 | **image resize / base64 変換失敗** | 極低 | 「画像の処理に失敗しました。もう一度お試しください」+ 再撮影ボタン | 再撮影。3回連続失敗 → QuickAddWizard（写真なし）へ誘導 | PhotoOnboarding.tsx |

### 2.2 障害時の原則

```
1. ユーザーの作業を止めない
   - 天気が取れなくても提案は出す（精度は下がる）
   - 写真AIが失敗しても手動入力で進める
   - syncが失敗してもローカルで完結する

2. エラーメッセージは行動を示す
   ❌ 「エラーが発生しました」
   ✅ 「天気を取得できません。季節に合わせておすすめしています」

3. 裏の障害はユーザーに見せない
   - Server sync失敗 → 黙ってキューに積む
   - IndexedDB不可 → 黙ってlocalStorageフォールバック
   - NetworkStatusBar は削除済み（エラー時のみ最小トースト）

4. 3回失敗したらフォールバック先を示す
   - 写真処理3回失敗 → 手動入力へ
   - Weather 3回失敗 → 前回キャッシュ → 季節ベース
```

---

## 3. Metrics Implementation Spec（計測仕様）

### 3.1 Analytics Table

既存の `stargazer_analytics` テーブルを使用。feature = `'my-style'` で区分。

```sql
-- 既存テーブル stargazer_analytics に feature='my-style' で記録
-- スキーマ変更不要
INSERT INTO stargazer_analytics (id, user_id, event, feature, metadata, created_at)
VALUES (gen_random_uuid(), $1, $2, 'my-style', $3, now());
```

### 3.2 Client-Side Tracker

```typescript
// lib/myStyle/trackClient.ts（新規作成）
// 既存の lib/stargazer/trackClient.ts と同じ fire-and-forget パターン

export function trackMyStyleEvent(
  event: MyStyleEvent,
  metadata?: Record<string, unknown>,
): void {
  const body = JSON.stringify({ event, feature: "my-style", metadata });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/stargazer/analytics", body);
  } else {
    fetch("/api/stargazer/analytics", {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }
}
```

### 3.3 Event Catalog

| Event Name | 発火条件 | 必須 Payload | Success 判定 |
|------------|----------|-------------|-------------|
| `mystyle_onboarding_start` | PhotoOnboarding が表示された | `{ item_count: 0 }` | — |
| `mystyle_onboarding_photo_taken` | カメラシャッター押下 | `{ attempt: number }` | — |
| `mystyle_onboarding_item_confirmed` | 1着の分類を確定 | `{ category, color, ai_corrected: boolean }` | — |
| `mystyle_onboarding_complete` | 全着の登録が完了 | `{ item_count, duration_ms, corrections: number }` | `item_count >= 1` |
| `mystyle_today_view` | 今日タブが表示された | `{ has_proposal: boolean, wardrobe_count }` | — |
| `mystyle_proposal_shown` | Proposal Hero Card がビューポートに入った | `{ sync_score, variant, item_count }` | — |
| `mystyle_proposal_accepted` | 「これ着る」タップ | `{ item_ids, sync_score, mood?, weather_temp? }` | **North Star の分子** |
| `mystyle_proposal_rejected` | 「別の案」で別提案に切替 | `{ rejected_item_ids, alternative_variant }` | — |
| `mystyle_satisfaction_recorded` | 満足度ピッカーで👍 or 👎 | `{ satisfaction: "positive"\|"negative", item_ids }` | — |
| `mystyle_mood_selected` | Mood Picker で気分を選択 | `{ mood: string }` | — |
| `mystyle_item_added` | ワードローブにアイテム追加 | `{ category, source: "photo"\|"quick", has_image }` | — |
| `mystyle_closet_view` | クローゼットタブ表示 | `{ wardrobe_count }` | — |
| `mystyle_self_view` | わたしタブ表示 | `{ wear_events_count, has_axis: boolean }` | — |
| `mystyle_weekly_insight_shown` | 週次インサイトが表示された | `{ insight_type, confidence }` | — |
| `mystyle_gap_shown` | 「足りない1点」が表示された | `{ gap_category }` | — |
| `mystyle_rendezvous_bridge` | Rendezvous導線をタップ | `{}` | — |
| `mystyle_photo_ai_correction` | AI分類をユーザーが修正した | `{ field: "category"\|"color", from, to }` | — |
| `mystyle_failure` | F1-F10 の障害発生 | `{ failure_code: "F1"-"F10", detail? }` | — |

### 3.4 North Star 計算

**定義の修正**: GPT指摘を受け、「見た」から「判断が終わった」に変更。

```sql
-- North Star: 判断完了率
-- = 「これ着る」を押したユーザー / DAU
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(DISTINCT CASE WHEN event = 'mystyle_proposal_accepted' THEN user_id END)::float
  / NULLIF(COUNT(DISTINCT CASE WHEN event = 'mystyle_today_view' THEN user_id END), 0)
  AS decision_completion_rate
FROM stargazer_analytics
WHERE feature = 'my-style'
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

**Sub Metrics SQL**:

```sql
-- Onboarding 完走率
SELECT
  COUNT(DISTINCT CASE WHEN event = 'mystyle_onboarding_complete' THEN user_id END)::float
  / NULLIF(COUNT(DISTINCT CASE WHEN event = 'mystyle_onboarding_start' THEN user_id END), 0)
  AS onboarding_completion_rate
FROM stargazer_analytics
WHERE feature = 'my-style'
  AND created_at >= now() - interval '30 days';

-- 提案満足度
SELECT
  COUNT(CASE WHEN metadata->>'satisfaction' = 'positive' THEN 1 END)::float
  / NULLIF(COUNT(*), 0) AS satisfaction_rate
FROM stargazer_analytics
WHERE feature = 'my-style'
  AND event = 'mystyle_satisfaction_recorded'
  AND created_at >= now() - interval '30 days';

-- D7 リテンション
WITH first_seen AS (
  SELECT user_id, MIN(date_trunc('day', created_at)) AS first_day
  FROM stargazer_analytics
  WHERE feature = 'my-style' AND event = 'mystyle_today_view'
  GROUP BY user_id
),
day7_active AS (
  SELECT DISTINCT a.user_id
  FROM stargazer_analytics a
  JOIN first_seen f ON a.user_id = f.user_id
  WHERE a.feature = 'my-style'
    AND a.event = 'mystyle_today_view'
    AND date_trunc('day', a.created_at) = f.first_day + interval '7 days'
)
SELECT
  COUNT(DISTINCT d.user_id)::float / NULLIF(COUNT(DISTINCT f.user_id), 0)
  AS d7_retention
FROM first_seen f
LEFT JOIN day7_active d ON f.user_id = d.user_id;

-- AI修正率（Photo Onboarding精度の指標）
SELECT
  COUNT(CASE WHEN event = 'mystyle_photo_ai_correction' THEN 1 END)::float
  / NULLIF(COUNT(CASE WHEN event = 'mystyle_onboarding_item_confirmed' THEN 1 END), 0)
  AS ai_correction_rate
FROM stargazer_analytics
WHERE feature = 'my-style'
  AND created_at >= now() - interval '30 days';
```

### 3.5 API Endpoint

`/api/stargazer/analytics` の既存バリデーション whitelist に以下を追加:

```typescript
const VALID_EVENTS = [
  // 既存
  "feature_view", "feature_interact", "prophecy_verify",
  "alter_turn", "whisper_shown", "whisper_clicked",
  "phase_advance", "session_complete",
  // 新規: my-style
  "mystyle_onboarding_start", "mystyle_onboarding_photo_taken",
  "mystyle_onboarding_item_confirmed", "mystyle_onboarding_complete",
  "mystyle_today_view", "mystyle_proposal_shown",
  "mystyle_proposal_accepted", "mystyle_proposal_rejected",
  "mystyle_satisfaction_recorded", "mystyle_mood_selected",
  "mystyle_item_added", "mystyle_closet_view", "mystyle_self_view",
  "mystyle_weekly_insight_shown", "mystyle_gap_shown",
  "mystyle_rendezvous_bridge", "mystyle_photo_ai_correction",
  "mystyle_failure",
];
```

---

## 4. Self View 表示閾値テーブル

### 4.1 わたしタブ セクション別表示条件

| セクション | 表示条件 | 閾値根拠 |
|-----------|----------|----------|
| **「学習中」quiet state** | `wear_events < 7` | 7日分 = 1週間の着用パターン最小単位 |
| **あなたの主軸** | `wear_events >= 7` AND `wardrobe >= 5` AND `style_dna の最大軸 abs(value) >= 0.4` | 既存 styleDna.ts の trait adjective trigger が `abs >= 0.4`。これ未満は「まだ軸が見えない」 |
| **最近の変化** | `wear_events >= 14` AND 2週間前のスナップショットが存在 AND `差分の絶対値 >= 0.15` | 0.15 = DNA軸の-1〜+1レンジで7.5%変動。これ未満は「安定しています」を表示 |
| **広げたい方向** | `wardrobe >= 10` AND Gap Analysis の confidence `>= 0.5` | progressiveReveal.ts の「color tendency」閾値（7 items + 3 days）より厳しく。10着あれば偏りが検出可能 |
| **気づき（Assertion）** | assertion 数 `>= 3` AND 上位 assertion の confidence `>= 0.55` | 既存 assertionEngine.ts は min 3 assertions to display。confidence 0.55 は hidden pulls の base（0.55）以上 |
| **場面別のわたし（折りたたみ）** | `wardrobe >= 10` AND 2つ以上のコンテキストで style selection が存在 | PersonaPanel は複数コンテキスト比較が主機能 |
| **スタイルルール（折りたたみ）** | `wear_events >= 14` AND rule 数 `>= 2` | StyleLogicPanel は wear 履歴からルール抽出。14日 = 最低2週間分 |
| **コスパ分析（折りたたみ）** | `wardrobe >= 5` AND `wear_events >= 7` | CostPerWear は着用回数が必要 |
| **AI分析（折りたたみ）** | `wardrobe >= 3` | AIInsightPanel の最低入力 |

### 4.2 Style DNA 表示精度条件

| DNA 次元 | 最低データ要件 | 表示条件 |
|----------|---------------|----------|
| casual_mode 等 7軸 | swipe learning confidence `>= 0.3` | 既存 contradictionDetector.ts の閾値 |
| identity_depth | liked + disliked + worldview tags `>= 6` | max score の50%（12の半分） |
| wardrobe_diversity | unique categories `>= 3` | max score の60%（5の60%） |
| color_richness | unique colors `>= 4` | max score の50%（8の半分） |
| unexpected_pull | pulls `>= 1` | 1つでもあれば表示 |
| style_depth | weighted score `>= 4` | max score の33%（12の33%） |

**レーダーチャート表示判定**: 12次元のうち `>= 6次元` が表示条件を満たす場合のみ表示。それ以下は「データ収集中」。

### 4.3 「変化」検出の定義

```
変化あり = |current_axis_value - previous_axis_value| >= 0.15
  かつ previous のデータが 7日以上前

変化の方向:
  diff > 0 → 「+X% 方向に」
  diff < 0 → 「-X% 方向に」
  表示: 「カジュアル方向に +12%」（diff * 100 を四捨五入）

変化なし（全軸 diff < 0.15）:
  → 「安定しています」を1行表示

大きな変化 = |diff| >= 0.3:
  → 強調表示（太字 + アクセントカラー）
  → 理由候補を assertionEngine から取得
```

### 4.4 進捗バー計算

```
「学習中」の進捗:
  progress = min(1.0, wear_events / 7)
  表示: ●●●○○○○ (7ドット、wear_events 数分が塗りつぶし)
  テキスト: 「3/7日分の記録あり」
```

---

## 5. Final Launch Checklist

### Phase 1 完了時

- [ ] `lib/shared/outfitEngine/` が存在し、`generateTodayProposal()` が export されている
- [ ] Calendar の提案が shared engine 経由で生成される
- [ ] `grep -r "weatherOutfit" app/ lib/` → 0件
- [ ] `grep -r "from.*todaysMirror" app/ lib/` → 提案生成の import が0件
- [ ] 既存 Calendar テスト（`tests/unit/calendar/`）がパス
- [ ] `tsc --noEmit` パス

### Phase 2 完了時

- [ ] 初回起動（wardrobe=0）で PhotoOnboarding が表示される
- [ ] カメラ撮影 → 3秒以内に一次分類表示
- [ ] カテゴリ修正が1タップで可能
- [ ] 色修正が1タップで可能
- [ ] 3着登録 → 今日タブ自動遷移
- [ ] `grep -r "OnboardingWizard" app/` → 0件
- [ ] `mystyle_onboarding_start` / `mystyle_onboarding_complete` イベントが発火

### Phase 3 完了時

- [ ] 今日タブ起動 → 1.5秒以内に Hero Card 表示
- [ ] Hero Card に天気 + コーデ + 理由1行
- [ ] Weather 失敗時 → 「天気を取得できません」+ 季節ベース提案
- [ ] wardrobe=0 → SmartEmptyState（天気 + 価値予告 + 📷）
- [ ] `grep -ri "Self-forming\|Formation\|Assertion Insight\|Resonance Feed\|Ecosystem" app/(immersive)/my-style/_components/ app/(immersive)/my-style/page.tsx` → UI上の文字列として0件
- [ ] `mystyle_today_view` / `mystyle_proposal_shown` イベントが発火
- [ ] FormationLine.tsx, SparkleEffect.tsx, ResonanceFeed.tsx, EcosystemInsightsPanel.tsx, ecosystem.ts が削除済み

### Phase 4 完了時

- [ ] 「これ着る」タップ → 300ms以内にUI反応
- [ ] wear_events にレコードが保存される
- [ ] `mystyle_proposal_accepted` イベントが発火
- [ ] FABが今日タブで非表示、クローゼットタブで📷のみ

### Phase 5 完了時

- [ ] クローゼットにサマリーバー表示
- [ ] よく着る服が着用回数Top5で横スクロール
- [ ] カテゴリ別折りたたみが機能
- [ ] "Self-forming Items" の見出しが消えている
- [ ] "着回し分析" "素材図鑑" トグルが消えている

### Phase 6 完了時

- [ ] wear_events < 7 → 「学習中」+ 進捗バー。空レーダーなし
- [ ] wear_events >= 7 かつ 最大軸 abs >= 0.4 → 主軸表示（日本語1行）
- [ ] wear_events >= 14 かつ diff >= 0.15 → 「変化」セクション表示
- [ ] iam/iseek/ibecome のタブ切替UIが消えている
- [ ] CrossFeaturePanel.tsx, DnaRarityBadge.tsx, StyleJourneyMap.tsx が削除済み

### Phase 7 完了時

- [ ] わたしタブから Rendezvous へ1タップ遷移
- [ ] `mystyle_rendezvous_bridge` イベントが発火

### 全Phase 完了時

- [ ] **5秒テスト**: 今日タブを5秒見せて「今日着る服を提案してくれる」と答えられる
- [ ] **30秒テスト**: 初回起動30秒以内に3着登録 → 提案表示
- [ ] **ゼロ概念語テスト**: `grep -ri "Self-forming\|Core/Rare/Secret\|iam\|iseek\|ibecome\|DNA Rarity\|Formation Line\|Resonance Feed\|Ecosystem Insight\|Cross-Feature" app/(immersive)/my-style/` → UI上の表示文字列として0件
- [ ] **パフォーマンステスト**: 今日タブ 1.5秒 / 写真分類 3秒 / 記録反応 300ms
- [ ] **空状態テスト**: wardrobe=0 のスクリーンショットが「壊れている」と感じない
- [ ] **障害テスト**: Weather失敗 / Calendar失敗 / localStorage破損 の各シナリオで画面が白くならない
- [ ] **計測テスト**: 全イベント（18種）が stargazer_analytics に正しく記録される
- [ ] North Star SQL が正しい数値を返す
