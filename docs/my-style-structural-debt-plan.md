# My Style v2 構造負債解消計画

**日付**: 2026-04-04
**原則**: 体験を変えずに構造だけを正す
**前提**: 機能追加は行わない。RC後の安定化フェーズとして実施。

---

## 達成率見積もり

| フェーズ | 解消対象 | 現在 | 完了後 | 差分 |
|----------|---------|------|--------|------|
| 現在 | — | 58% | — | — |
| Phase A | D5 + D1 Phase1 | 58% | **63%** | +5pt |
| Phase B | D1 Phase2 + D2 | 63% | **68%** | +5pt |
| Phase C | D3（WeeklyInsight + WearFeedbackButton） | 68% | **72%** | +4pt |
| Phase D | D4 段階的抽出 | 72% | **78%** | +6pt |
| 全完了 | D1-D5 全解消 | 58% | **78%** | +20pt |

> 残り22%は spec'd コンポーネントの新規作成（StyleEvolution, MoodPicker, WardrobeGrid）と outfitEngine の完全統合。これらは「体験を変える」ため本計画のスコープ外。

---

## 修正順と手順

### Phase A: D5 + D1-Phase1（最優先・低リスク）

**目的**: 直接 localStorage 読み取りを排除し、最も孤立した wear 系統を統合する

#### A-1: D5 — WeatherOutfitPanel の直接 localStorage 排除

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `lib/shared/wearEvents.ts`, `_components/WeatherOutfitPanel.tsx` |
| **変更量** | wearEvents に 2 ヘルパー追加（10行）、WeatherOutfitPanel の初期化を書き換え（3行） |
| **UI影響** | なし — 読み取り経路の変更のみ |
| **リスク** | 極めて低 — read-only リファクタ |

手順:
1. `wearEvents.ts` に `hasWearEventForDate(date): boolean` と `hasSatisfactionForDate(date): boolean` を追加
2. `WeatherOutfitPanel.tsx` lines 108-124 の `localStorage.getItem("culcept_calendar_worn_v1")` を上記ヘルパーに置換
3. テスト追加 + 既存テスト PASS 確認

#### A-2: D1-Phase1 — culcept_wear_log_v1 の廃止

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `_components/TodaysMirror.tsx`, `_lib/costPerWear.ts` |
| **変更量** | TodaysMirror の独自 wear log を `costPerWear.recordWear()` に統合（30行変更） |
| **UI影響** | なし — 「今日着た」チェックマークは同じ挙動を維持 |
| **リスク** | 低 — TodaysMirror の wear log は他で参照されていない孤立系統 |

手順:
1. `TodaysMirror.tsx` の `addWearLogEntry()` を `recordWear()` + `getWearRecords()` に置換
2. 「今日着た」判定を `culcept_wear_records_v1` から読み取るように変更
3. `getWearLog()`, `addWearLogEntry()`, `getDaysSinceWorn()`, `WEAR_LOG_KEY` を削除
4. 既存の `culcept_wear_log_v1` データはマイグレーション不要（UI表示のみに使用、永続的な意味なし）

---

### Phase B: D1-Phase2 + D2（中程度リスク）

**目的**: 全 wear 読み取りを wearEvents.ts 経由にし、todaysMirror.ts の位置づけを確定する

#### B-1: D1-Phase2 — 直接 localStorage 読み取りの全排除

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `_components/StyleLogicPanel.tsx`, `_lib/calendarBridge.ts`, `lib/shared/wearEvents.ts` |
| **変更量** | StyleLogicPanel の `WORN_KEY` 直接読み取りを wearEvents ヘルパーに置換。calendarBridge の直接読み取りを wearEvents 経由に変更 |
| **UI影響** | なし |
| **リスク** | 中 — calendarBridge は Calendar→My-Style 同期パスに影響するため、Calendar 側の動作確認が必要 |

手順:
1. `wearEvents.ts` に `getWearEventsForDateRange(from, to)` を追加
2. `StyleLogicPanel.tsx` の `WORN_KEY` + 直接読み取りを wearEvents ヘルパーに置換
3. `calendarBridge.ts` の直接 localStorage 読み取りを `loadAllWearEvents()` に置換
4. Calendar タブの動作確認

#### B-2: D2 — todaysMirror.ts の位置づけ確定

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `_lib/todaysMirror.ts`（リネーム検討のみ） |
| **変更量** | 最小限 — ファイルをプライベートモジュールとして維持、JSDoc でスコープを明記 |
| **UI影響** | なし |
| **リスク** | なし |

判断:
- `todaysMirror.ts` は TodaysMirror.tsx からのみ import される**プライベートモジュール**
- 413行、mood 永続化 + パターン検出 + 予測ロジックを含む
- **削除や移動は不要** — shared 層に移す必要が生じるのは MoodPicker 実装時のみ
- ファイル先頭に `@internal TodaysMirror.tsx 専用` の JSDoc を追加して明示

---

### Phase C: D3 部分解消（低リスク）

**目的**: 既存ロジックの抽出で作れる spec'd コンポーネントだけ作成する

#### C-1: WeeklyInsight.tsx の作成

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `_components/WeeklyInsight.tsx`（新規）, `_components/InsightsTab.tsx` |
| **変更量** | `getWeeklyMoodDots()` + `getMoodPatterns()` の結果を表示するラッパー（50行程度） |
| **UI影響** | なし — InsightsTab 内に既にある mood dot + パターンテキストの構造化のみ |
| **リスク** | なし — 表示の整理 |

#### C-2: WearFeedbackButton.tsx の抽出

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `_components/WearFeedbackButton.tsx`（新規）, `_components/WeatherOutfitPanel.tsx` |
| **変更量** | WeatherOutfitPanel lines 296-344 の accept/satisfaction UI を独立コンポーネントに抽出（80行程度） |
| **UI影響** | なし — 純粋なコンポーネント抽出 |
| **リスク** | なし — ロジック変更ゼロ |

#### C-3: 作らないもの（理由付き）

| コンポーネント | 見送り理由 |
|---------------|-----------|
| **MoodPicker** | CEO判断で後回し。作ると proposal 生成パスに新しい信号が入り「体験を変える」ため本計画のスコープ外 |
| **WardrobeGrid** | WardrobeTab + WardrobeCard で既に機能している。別コンポーネントに分離する実益がない |
| **StyleEvolution** | 新規可視化が必要で「体験を変えずに構造を正す」原則に反する。別フェーズで検討 |

---

### Phase D: D4 段階的抽出（慎重に）

**目的**: outfitEngine の re-export facade を実体のある共有モジュールに段階的に移行する

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `lib/shared/outfitEngine/syncScoring.ts`（新規）, Calendar 側の import パス変更 |
| **変更量** | Calendar の `_lib/syncScoring.ts`（350行）を shared に移動。Calendar 側の import を書き換え |
| **UI影響** | なし |
| **リスク** | **中〜高** — Calendar のコア計算ロジックの移動。Calendar テスト全パスが必要条件 |

手順（段階的）:
1. **Step 1**: `syncScoring.ts` を `lib/shared/outfitEngine/` にコピー
2. **Step 2**: Calendar の `outfitEngine.ts` で import パスを shared に変更
3. **Step 3**: Calendar テスト全実行 — PASS が確認条件
4. **Step 4**: Calendar 側の旧 `syncScoring.ts` を削除
5. **Step 5**: 同様に `comboGraph.ts` を移行（ただし依存関係が深いため、RC安定後）
6. **scoreCandidate.ts / buildCombo.ts** はスタブのまま維持（Calendar エンジンが実体を持つため無理に分離しない）

---

## まとめ

| Phase | 期間目安 | 達成率変化 | 原則適合 |
|-------|---------|-----------|---------|
| A（D5 + D1-P1） | 1日 | 58→63% | 体験変更なし |
| B（D1-P2 + D2） | 1日 | 63→68% | 体験変更なし |
| C（D3部分） | 1日 | 68→72% | 体験変更なし（抽出のみ） |
| D（D4段階的） | 2-3日 | 72→78% | 体験変更なし（import 移動のみ） |

**全 Phase 完了後: 78%**

残り 22% は「体験を変える」領域（MoodPicker / StyleEvolution / WardrobeGrid / outfitEngine 完全統合）であり、本計画のスコープ外。
