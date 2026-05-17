# CoAlter Always-On Observer — Phase B Mirror Channel 設計

**ステータス**: 設計提案 (docs-only / CEO レビュー待ち、merge 禁止)
**起票日**: 2026-05-17
**前提**: Phase A 正式完了 (`docs/coalter-aoo-phase-a-completion.md`)
**学術基盤**: Mixed-initiative interaction (Horvitz, 1999) / Reflective listening (Rogers) / Expected Value of Information (decision theory) / OECD AI agent definition (2024)

---

## 0. Executive Summary

### 0.1 Phase B の位置づけ

Phase A (観測のみ) を完了し、観測結果が `RelationshipState` として静かに蓄積されている。Phase B は **その観測を「鏡 (Mirror)」として返す**チャネルを追加する。

**最上位原則** (Phase A から継承 + Phase B で深化):

1. **Always-On ≠ 自動発話** (Phase A から継承)
2. **Mirror = reflection, not proposal** (Phase B で確立)
3. **Default = STAY_SILENT** (Phase B で確立)
4. **発話判断は Expected Relationship Value (ERV) を基準とする** (Phase B で確立)

### 0.2 Mirror の定義

> **Mirror は、観測したことを「あなたはこう動いている」と静かに返す行為**。提案 (proposal) ではない、誘導 (nudge) でもない、解決 (solution) でもない。

提案・誘導・解決の自動発話は Phase B の scope 外（Phase C 以降、別途明示的設計）。

### 0.3 ゴール

- 観測結果のうち、**ユーザーの関係性理解に貢献するもの**を、**最小限の摩擦で**反射する
- 「CoAlter は何を見ているか」がユーザーに伝わる窓を作る
- ただし、それは **静かな鏡** であり、雄弁な助言者ではない

### 0.4 非ゴール

- Question / Proposal / Suggestion の自動発話（Phase C 以降）
- 既存 presence layer の改修（不可侵境界）
- Chat body への自動挿入（UI policy で明示禁止）
- 多弁な分析の表示（Mirror taxonomy の 5 種以外は禁止）

---

## 1. Mirror = Reflection, Not Proposal

### 1.1 反射と提案の境界

| Type | 例 | Phase B での扱い |
|------|----|----------------|
| **Reflection (反射)** | 「最近、決断のスピードが普段より遅いみたい」 | ✅ 許可 |
| **Description (記述)** | 「3 回連続でこの相手に長文返信している」 | ✅ 許可 |
| **Question (質問)** | 「これって何か理由がある？」 | ❌ Phase B 禁止 |
| **Proposal (提案)** | 「少し休んでみたら？」 | ❌ Phase B 禁止 |
| **Solution (解決)** | 「こう返信してみては？」 | ❌ Phase B 禁止 |
| **Nudge (誘導)** | 「今、声をかけるといい時間かも」 | ❌ Phase B 禁止 |

### 1.2 なぜ reflection 限定か

- 提案・誘導・解決は **「介入 (intervention)」** であり、関係性の自律性を侵食する
- 反射は **「観測のフィードバック」** であり、ユーザー自身が判断する余地を保つ
- Aneurasync 設計思想の中心問い「**この機能は、ユーザーの第二の自己として必要か？**」に照らして、第二の自己 = **観察と内省を補助するもの**であり、決定を代行するものではない

### 1.3 文体規約

- 一人称 (CoAlter) ではなく、観測事実の単純記述を優先
- 「〜だと思う」「〜したほうがいい」禁止
- 「〜している (ように見える)」「〜が続いている」許可
- 1 Mirror = 1 文 (最大 2 文)
- 14-40 文字目安（Alter 声の制約に準拠）

---

## 2. Default STAY_SILENT

### 2.1 デフォルト動作

Mirror Channel の **デフォルトは沈黙 (STAY_SILENT)**。

- Speak Decision Engine が **明示的に SPEAK と判断したときのみ** Mirror を出力
- それ以外はすべて STAY_SILENT（観測蓄積は継続、表示なし）
- ユーザー操作が必要な場合は Mirror Channel を経由しない（既存 Question UI は Phase B 範囲外）

### 2.2 STAY_SILENT を優先する根拠

| 根拠 | 内容 |
|------|------|
| Horvitz mixed-initiative principle | エージェントの介入は **expected value > expected cost** が成立するときのみ |
| Reflective listening 原則 | 沈黙は最も強力な反射手段の一つ |
| CoAlter 既存原則 | Question 系統で「自動発火禁止」が確立済 (Phase A 継承) |
| 観測の信頼性 | Mirror が安易に出るとユーザーは「監視されている」感を強める |

### 2.3 SPEAK 判断の頻度上限

- 1 セッション内で Mirror 出現は **最大 2 回**（hard cap）
- 連続 Mirror 禁止（最低 5 ターン間隔）
- ユーザーが Mirror を sleep にしている場合 (§8 参照) は **常に STAY_SILENT**

---

## 3. Expected Relationship Value (ERV) Speak Decision Engine

### 3.1 ERV の定義

> **ERV (Expected Relationship Value)** = Mirror を 1 回返すことで、ユーザーの**関係性理解**が改善する期待値。コストは「ユーザーの注意 (attention) 消費」「介入による関係性自律性の侵食」「false-positive 時の信頼毀損」。

$$
\text{ERV} = \mathbb{E}[\Delta \text{Understanding}] - \mathbb{E}[\text{AttentionCost}] - \mathbb{E}[\text{AutonomyCost}] - \mathbb{E}[\text{TrustRisk}]
$$

### 3.2 判定式

```
if ERV > SPEAK_THRESHOLD AND Three-Gate Mirror ALL PASS:
    decision = SPEAK
else:
    decision = STAY_SILENT
```

### 3.3 SPEAK_THRESHOLD のキャリブレーション

- 初期値: ERV ≥ 0.65 (0.0-1.0 normalized)
- Phase B 観測 6 週間で **false-positive 率 < 5%** を目標
- 達成できない場合は閾値を 0.75 まで引き上げ
- ユーザーごとの **silence_preference**（§8）で個別調整可能

### 3.4 ERV 計算の入力軸

§5 で詳述する 9 軸を ERV 計算に投入。各軸の重みは Phase B 観測期間中に Bayesian update。

---

## 4. Three-Gate Mirror (Observe / Worth / Safe)

ERV しきい値だけでは不十分。**3 つの独立 Gate を全て通過しないと SPEAK しない**。

### 4.1 Gate 1: Observe Gate（観測の十分性）

**目的**: 反射する根拠となる観測が十分に蓄積されているか。

| 条件 | 説明 |
|------|------|
| `observationCount ≥ MIN_OBS` | 最小観測数（初期値 3） |
| `lastObservationAt` が直近 30 分以内 | 古い観測に基づく反射は禁止 |
| `matchedPatternCategory` が確定している | unknown_category のみでは SPEAK しない |
| 観測の **diversity_score** が一定以上 | 同じ signal の繰り返しだけでは弱い |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。

### 4.2 Gate 2: Worth Gate（反射する価値）

**目的**: その反射がユーザーにとって新規 (novel) かつ意味がある (meaningful) か。

| 条件 | 説明 |
|------|------|
| `observation_novelty ≥ 0.5` | 既知パターンの再表示は禁止 |
| `silence_budget < 0.7` | 既に十分発話している会話では追加しない |
| `conversation_phase` が反射受容可能 | 会話の入口 (greeting) や緊急時は不可 |
| `time_since_last_speak ≥ 5 turn` | 連続 Mirror 防止 |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。

### 4.3 Gate 3: Safe Gate（安全性）

**目的**: 反射がユーザーを傷つけない、関係性を悪化させない、誤解を生まないか。

| 条件 | 説明 |
|------|------|
| `rupture_flag` が立っていない | 関係性断裂兆候時は Mirror 禁止（沈黙が安全） |
| `matchedPatternCategory ≠ safety_concern` | 安全関心 bucket は Mirror 範囲外（別チャネル） |
| `uncertainty ≤ 0.4` | 高不確実性の観測を断定的に反射しない |
| `user_override.sleep` が false | ユーザー sleep 設定遵守 |
| PII firewall PASS | raw pairStateId 等が Mirror 文面に混入しない |

**Fail 時動作**: STAY_SILENT, ERV 計算しない。ログには `gate_fail_reason` を記録。

### 4.4 Three-Gate の論理積

```
SPEAK iff (Observe Gate PASS) AND (Worth Gate PASS) AND (Safe Gate PASS) AND (ERV > SPEAK_THRESHOLD)
```

**いずれか 1 つでも Fail なら STAY_SILENT**。AND 条件で fail-closed.

---

## 5. Input Axes (Speak Decision Engine 入力 9 軸)

Speak Decision Engine と Three-Gate Mirror が共通参照する 9 軸。

| # | 軸 | 範囲 | 由来 | 用途 |
|---|----|------|------|------|
| 1 | `silence_budget` | 0.0-1.0 | 会話内発話量比率 | Worth Gate |
| 2 | `observation_novelty` | 0.0-1.0 | 既知パターン差分 | Worth Gate, ERV |
| 3 | `rupture_flag` | bool | Phase A `RelationshipState` 由来 | Safe Gate |
| 4 | `alignment_signal` | 0.0-1.0 | 観測と既知パターンの整合度 | ERV |
| 5 | `uncertainty` | 0.0-1.0 | 観測信頼度の補数 | Safe Gate |
| 6 | `modeContext` | "normal" \| "daily" \| "travel" | 既存 PresenceMode | ERV, Worth Gate |
| 7 | `conversation_phase` | "greeting" \| "in_progress" \| "closing" \| "emergent" | チャット会話状態 | Worth Gate |
| 8 | `time_since_last_speak` | turn 数 | Mirror 履歴 | Worth Gate |
| 9 | `user_override.sleep` | bool | ユーザー設定 | Safe Gate（最優先） |

### 5.1 各軸の供給元

- 1, 2, 4, 5: `RelationshipState` から派生（Phase A 観測由来）
- 3: `recentReasonCodes[]` に rupture-related code が含まれるか
- 6: 既存 `lib/coalter/presence/types.ts` の `PresenceMode`
- 7: チャット session の最新 N ターンから推定
- 8: Mirror 出力履歴（新規 store, §9.1 参照）
- 9: ユーザー設定（新規 UI, §8 参照）

### 5.2 軸の永続化と整合性

- 1〜5, 8 はセッション内 in-memory（既存 `RelationshipState` への追加検討は §9.1）
- 6 は既存 presence layer から read-only 参照（**書き込み禁止**）
- 7 は推定エンジン側で都度算出
- 9 は localStorage + 将来的に Supabase ユーザー設定テーブル（Phase B では localStorage のみ）

---

## 6. Mirror Taxonomy (5 種)

Mirror として返してよい型は **5 種類のみ**。それ以外は出力禁止。

### 6.1 State Mirror（状態の反射）

**定義**: ユーザーの現在の判断モードや状態を反射する

**例**:
- 「最近、決断のスピードが普段より遅いみたい」
- 「いつもより慎重な選び方が続いている」

**Trigger 条件**:
- `observation_novelty ≥ 0.6` （明確な変化）
- `state_drift_score` が閾値超過

### 6.2 Difference Mirror（差分の反射）

**定義**: 普段のパターンとの差分を反射する

**例**:
- 「この相手にだけ、いつもより返信が長い」
- 「今週は normal mode の利用が多い」

**Trigger 条件**:
- 同一文脈内でのベースライン差分が統計的に有意
- 観測サンプル数 ≥ 10

### 6.3 Tempo Mirror（テンポの反射）

**定義**: 会話・行動のテンポの変化を反射する

**例**:
- 「返信間隔が、いつもの 2 倍くらいになっている」
- 「今日は決めるのが早い」

**Trigger 条件**:
- `tempo_delta` 絶対値が一定以上
- 直前 5 ターンの平均と比較

### 6.4 Fairness Mirror（公平性の反射）

**定義**: ユーザーが自分自身に対して公平でない振る舞いをしているときの反射

**例**:
- 「自分の都合は後回しが続いている」
- 「相手の希望を優先する選択が多い」

**Trigger 条件**:
- `self_priority_score` が低い状態が連続
- 関係性データ複数件で同パターン

**注意**: 押し付けがましくならないよう、文体を最も慎重にする

### 6.5 Repair Mirror（修復の反射）

**定義**: ユーザーが既に修復行動を取っていることへの静かな確認

**例**:
- 「昨日の続きを取り戻している」
- 「言葉を選び直しているのが伝わる」

**Trigger 条件**:
- `rupture_flag` から `repair_signal` への遷移を検出
- 内省的応答を妨げないタイミング

### 6.6 5 種以外を出さない理由

| 出さない型 | 理由 |
|------------|------|
| Diagnosis Mirror (診断) | 医療・心理的判定の自動化は scope 外 |
| Prediction Mirror (予測) | 「未来の判断」を断定するのは介入 |
| Comparison Mirror (他者比較) | 他者プライバシー + 競争原理導入は禁止 |
| Praise Mirror (称賛) | 行動強化 (operant conditioning) は介入 |
| Warning Mirror (警告) | 警告は別チャネル（Phase C 以降） |

---

## 7. Safety Provisions

### 7.1 Fail-Closed 原則

- Three-Gate のいずれか 1 つでも Fail → STAY_SILENT
- ERV 計算で NaN / Infinity / undefined → STAY_SILENT
- Mirror 文生成で例外 → STAY_SILENT
- PII firewall 検証で fail → STAY_SILENT + telemetry

### 7.2 Kill Switch

- `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` (default `false`)
- フラグ OFF 時は Speak Decision Engine 自体が初期化されない
- フラグ削除でも残留しないよう module-level guard

### 7.3 Post-Speak Verification

Mirror が SPEAK と判断された直後（出力前）に追加 4 検証:

1. **PII 検証**: 出力文字列に `pairStateId` / `userId` / email / phone 等が含まれないか
2. **文体検証**: 「提案」「疑問」「指示」表現が混入していないか（正規表現 + キーワード）
3. **長さ検証**: 1 文 14-40 文字、最大 2 文
4. **重複検証**: 直近 24 時間で同一 Mirror テンプレートを出していないか

検証 fail → STAY_SILENT + telemetry。

### 7.4 ユーザー操作による即時無効化

- Mirror 出力に「これは要らない」ボタン
- 1 タップで現セッション以降 7 日間 Mirror を完全停止
- ユーザーが設定画面で sleep を有効化すれば即時無効化（§8）

### 7.5 監査ログ

- 全 SPEAK / STAY_SILENT 判断を内部 telemetry に記録
- 記録項目: `decision`, `erv_value`, `gate_fail_reason`, `mirror_kind`, `timestamp`
- PII 含まないよう **redacted snapshot 形式**で記録（Phase A 同様）

### 7.6 ロールバック条件

以下のいずれかで Mirror Channel を即時 disable:

- false-positive 率 > 10%
- ユーザーから「監視されている」フィードバック > 5 件
- Mirror 文に PII 混入が 1 件でも観測
- Three-Gate を bypass する経路が発見

---

## 8. UI Policy

### 8.1 既存 Presence Layer + Chat Layer 不可侵境界（Mirror mount 例外あり）

**Phase A から継承する不変境界**:

| 対象 | 取り扱い | 備考 |
|------|---------|------|
| `lib/coalter/presence/` (30+ files) | **一切 touch しない** | Presence Layer 全体 |
| `app/components/chat/` (17 files) | **一切 touch しない** | Chat Layer 既存ファイル群 |
| 既存 `PresenceState` S0-S8 の遷移 | **改変しない** | Presence 状態機械 |
| 既存 `ModeSwitcher.tsx` | **改変しない** | mode tabs UI |
| `app/(culcept)/talk/[threadId]/ChatClient.tsx` | **mount 1 箇所のみ最小追加可** | §8.2 mount 規約に従う / 既存 logic は touch しない |

**新規実装の置き場所** (Phase B 実装段階で作成):

- すべての Mirror UI コンポーネントは **`components/coalter/mirror/*`** に新規ディレクトリを作って配置する
- `components/coalter/observer/`（Phase A で新設）と並列の sibling として独立
- Speak Decision Engine / ERV / Three-Gate のロジックは **`lib/coalter/mirror/*`** に新規ディレクトリを作って配置する（`lib/coalter/presence/` ではない、`lib/coalter/observer/` ではない）
- `app/components/chat/` 配下に Mirror 用ファイルを **新設しない** （chat layer と物理的に分離）

### 8.2 Mirror の表示位置と mount 規約

**禁止**:
- チャット本文 (user message bubble / assistant message bubble) への自動挿入
- 既存 PresenceState ピル UI への融合
- 既存 `ModeSwitcher` / `CoAlterButton` 内部 DOM への差し込み
- ヘッダー固定表示
- フルスクリーンモーダル
- `app/components/chat/` 既存 17 files のいずれかへの新規 import 追加（`ChatClient.tsx` の mount 例外を除く）

**許可** (どちらか):
- **Option A (推奨)**: チャット下部に独立した **Mirror surface**（低彩度、低高さ、ユーザー閉鎖可能）
- **Option B**: CoAlter ボタン (`CoAlterButton.tsx`) 近傍の**サブテキスト**（最大 1 行）

CEO レビューで Option A / B 決定。

**`ChatClient.tsx` mount 規約** (Phase A `ObserverHost` mount 前例に準拠):

1. **追加できるのは mount line のみ**:
   - import: `import MirrorHost from "@/components/coalter/mirror/MirrorHost";` （1 行）
   - JSX: `<MirrorHost />` 相当の null-render wrapper コンポーネント mount（1 〜 2 行 + 任意 comment 行）
2. **既存 logic / hook / state は一切改変しない**
3. **既存 import / JSX 構造を maintain**（既存行の編集禁止、追加のみ）
4. **diff は合計 5 行以下**を目安とする（Phase A `ObserverHost` mount = 5 行 と同等）
5. mount コンポーネント自体（`MirrorHost`）は `components/coalter/mirror/MirrorHost.tsx` に配置し、内部で feature flag を確認、OFF なら null-render
6. 上記以外の `app/components/chat/` 16 files は **diff 0 行**

この規約により、**既存 chat layer の logic は zero diff**、Mirror UI は新規ディレクトリで完結、mount は ChatClient.tsx の最小 1 点に限定される。

### 8.3 Sleep Control

- 設定画面に「**CoAlter Mirror を sleep する**」トグル
- ON にすると Mirror が完全停止（観測継続、出力のみ停止）
- セッション内即時反映
- localStorage persist + 将来 Supabase ユーザー設定テーブル
- デフォルト: **OFF** (Mirror 動作中)

### 8.4 Mirror Surface のインタラクション

- 自動表示後 30 秒で fade-out（消去ではなく薄くする）
- 「これは要らない」ボタン（§7.4）
- タップで詳細展開 → 「何を見てこう言ったか」を redacted snapshot 形式で開示
- 詳細展開での開示は raw PII を含まない (PII firewall)

### 8.5 Mirror が出ているときの presence UI 状態

- 既存 PresenceState は通常通り遷移（Mirror は presence と独立）
- presence executor は Mirror を knowledge として参照しない（情報漏洩防止）
- 既存 Question / Proposal UI とは完全に独立した surface

---

## 9. A+ Unresolved Points（Phase A から持ち越し）

Phase A 完了時点で「Phase B 設計時に再評価」と整理した 3 件。

### 9.1 observerActivationState semantics

**論点**: Phase A で導入した `observerActivationState` と既存 `ExecutorAvailability` の関係。

**Phase B での扱い**:
- Mirror Channel は両方を参照する
- `observerActivationState = "active"` AND `ExecutorAvailability = "available"` のときのみ Mirror 候補生成
- 両者の状態遷移整合性は別途 observability runbook で監視
- **構造変更は Phase B でも行わない**（Phase A 完了の不変境界）

**未解決**: 両者が乖離した場合の reconciliation 戦略。Phase B 観測で乖離パターン蓄積 → Phase C で reconciler 設計。

### 9.2 modeContext を Speak Decision Engine 入力としてどう扱うか

**論点**: `modeContext` (normal / daily / travel) は Speak 判断に影響すべきか。

**Phase B での暫定方針**:
- `modeContext = "travel"`: Mirror 頻度を 0.5x に減衰（旅行中は内省より体験を優先）
- `modeContext = "daily"`: 通常頻度（1.0x）
- `modeContext = "normal"`: 通常頻度（1.0x）
- 重み変更は ERV 計算の coefficient で実施、Three-Gate には影響しない

**未解決**: ユーザー個別のモード別嗜好（個別 Bayesian update）は Phase C 以降。

### 9.3 matchedPatternCategory bucket の使い分け

**論点**: bucket (safety_concern / rupture_signal / unknown_category / null) を Mirror taxonomy にどう連結するか。

**Phase B での暫定方針**:

| bucket | Mirror Channel 動作 |
|--------|---------------------|
| `safety_concern` | Mirror **禁止**（Safe Gate Fail）。安全関心は別チャネル要設計（Phase C 以降） |
| `rupture_signal` | Mirror **禁止**（Safe Gate Fail）。Phase B 範囲外、沈黙が安全 |
| `unknown_category` | Mirror **禁止**（Observe Gate Fail）。観測不十分とみなす |
| `null` | 通常評価（Three-Gate 全評価へ進む） |

**未解決**: `safety_concern` / `rupture_signal` 系統への適切な応答チャネルは Phase C 以降の別設計。Phase B では「沈黙で安全」を維持。

---

## 10. Implementation Stop Conditions

### 10.1 Phase B 設計確定までの絶対禁止事項

**この設計書がレビュー通過するまで、以下のコード変更を一切行わない**:

- Mirror Channel の実装着手
- Speak Decision Engine の実装着手
- Three-Gate Mirror の実装着手
- ERV 計算ロジックの実装着手
- 新規 UI surface の作成（`components/coalter/mirror/*` の作成含む）
- 新規 logic ディレクトリの作成（`lib/coalter/mirror/*` の作成含む）
- `ChatClient.tsx` への mount 追加（§8.2 mount 規約に従う場合でも、設計確定後に限る）
- 新規 telemetry 経路の追加
- `RelationshipState` schema の変更
- `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` flag の追加
- 既存 presence layer / 既存 chat layer 16 files への一切の touch

### 10.2 設計レビュー Stop Condition

以下のいずれかが未確定の段階で実装フェーズに進まない:

| # | Stop Condition | 確定者 |
|---|-----------------|--------|
| 1 | Mirror UI surface (Option A / B) 選定 | CEO |
| 2 | SPEAK_THRESHOLD 初期値 (0.65 / 0.75) | CEO |
| 3 | Mirror taxonomy 5 種の文体テンプレート | CEO + Product |
| 4 | `safety_concern` / `rupture_signal` 系統の取り扱い (Phase B 禁止で OK か) | CEO |
| 5 | sleep control デフォルト値 (OFF で OK か) | CEO |
| 6 | session 内 Mirror 頻度上限 (2 回 hard cap) | CEO |
| 7 | rollback 条件 (false-positive 10% / フィードバック 5 件 / PII 1 件) | CEO |
| 8 | A+ 3 unresolved points (§9) の Phase B 範囲 | CEO |
| 9 | Phase B 実装スコープ分割（マイクロ PR 案） | Build |
| 10 | Phase B 完了基準 | CEO + Build |

### 10.3 実装段階に進む場合の Pre-Implementation Gate

設計確定後に実装フェーズに進む場合の preflight 条件:

1. 本設計書が main に merge 済
2. CEO 承認の `docs/decision-log.md` entry が追加済
3. Phase B 実装スコープを `docs/coalter-aoo-phase-b-implementation-plan.md` に切り出し
4. 第 1 マイクロ PR の scope は **UI shell のみ** (Speak Decision Engine / ERV / Three-Gate ロジックを含まない):
   - `components/coalter/mirror/MirrorHost.tsx` 新規作成（feature flag OFF なら null-render）
   - `components/coalter/mirror/MirrorSurface.tsx` 新規作成（後続 PR で中身追加、第 1 PR では空 shell でも可）
   - `app/(culcept)/talk/[threadId]/ChatClient.tsx` への mount 追加（§8.2 規約 5 行以下）
5. Kill switch flag `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` が **default `false`** で起票されること
6. 既存 presence layer (`lib/coalter/presence/` 30+ files) に diff が **0 行** であること
7. 既存 chat layer (`app/components/chat/` 17 files) に diff が **0 行** であること
8. 既存 `app/(culcept)/talk/[threadId]/ChatClient.tsx` への diff は **§8.2 mount 規約に従う 5 行以下** であること（既存 logic への改変ゼロ）
9. 新規ディレクトリは `components/coalter/mirror/*` と `lib/coalter/mirror/*` のみ。既存ディレクトリ配下に Mirror 関連の新規ファイルを置かない
10. 第 1 マイクロ PR は **flag OFF preview** で mount 動作確認のみ、Speak は発火しないことを smoke で確認

---

## Appendix A: 参考文献

- Horvitz, E. (1999). *Principles of Mixed-Initiative User Interfaces*. CHI '99.
- Rogers, C. R. (1957). *The Necessary and Sufficient Conditions of Therapeutic Personality Change*. Journal of Consulting Psychology.
- OECD (2024). *Updated definition of an AI system*.
- Anthropic Claude Code documentation: agentic system design principles.
- Aneurasync 設計思想（`memory/aneurasync-philosophy.md`）

## Appendix B: 関連 Phase A docs

- `docs/coalter-aoo-phase-a-completion.md` — Phase A 完了正本
- `docs/coalter-always-on-observer-design.md` — AOO 設計（Phase A 完了通知 banner あり）
- `docs/coalter-aoo-presence-reconciliation.md` — Presence Layer 並走基準
- `docs/coalter-aoo-a2e-state-observation-preflight.md` — A-2e 観測手順
- `docs/decision-log.md` — Phase A 完了 entry (2026-05-17)

## Appendix C: 設計者注

- 本設計書は **docs-only**。1 行のコード変更も含まない
- CEO レビューを経ない限り **merge 禁止**
- レビューで scope 縮小・型分割の指示が出た場合は実装 PR 起票前に再起票
- 「Always-On ≠ 自動発話」原則を Phase B でも厳格に維持する
- Mirror = reflection 限定。Question / Proposal / Suggestion は Phase B scope 外
