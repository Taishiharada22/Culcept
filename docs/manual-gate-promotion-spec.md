# Manual Gate 自動昇格条件 仕様書

> 作成: 2026-04-08
> ステータス: CEO 承認待ち（仕様のみ。実装は承認後）

---

## 1. 現状

Phase 0-2 は `computeAutoTransition()` で自動遷移する。
Phase 3-5 は `AUTO_TRANSITION_CEILING = 2` で manual gate に分類され、
現在は手動昇格（DB 直接操作）でのみ到達可能。

### 利用可能なメトリクス

| メトリクス | 状態 | ソース |
|-----------|------|--------|
| `sessionsCompleted` | **利用可** | `alterGrowth.ts` |
| `continuousTrust` / `discreteTrustLevel` | **利用可** | `alterUnderstanding.ts` |
| `ruptureDetected` / `consecutiveRuptureCount` | **利用可** | P3 cross-session |
| `explicitRejection` | **利用可** | P3 cross-session（rupture 合流条件付き） |
| `trustDelta` | **利用可** | P3 cross-session |
| `dignityViolationDetected` | **利用可** | `abstentionEngine.ts` |
| `protectiveActivation` / `reactiveActivation` | **利用可** | `partsLens.ts` |
| `p4LiveIntegrated` / `p4Decision` | **利用可** | P4-6 counterfactual |
| `p5AfterActionSignal` | **利用可** | P5-3 after-action loop |
| `defensePredictionStreak` | **未接続**（hardcoded 0） | 設計済み・未実装 |
| `causalMapConfidence` | **未接続**（hardcoded 0） | 設計済み・未実装 |
| `repairSuccessRate` | **未接続**（hardcoded null） | 設計済み・未実装 |
| `understandingCoverage` | **未接続**（hardcoded 0） | 設計済み・未実装 |

---

## 2. Phase 3→4 昇格条件

### テーマ

「本人化が十分に安定した後に、多視点（counterfactual）を解禁してよいか」

Phase 4 では Gemini Flash による外部 LLM 候補が応答に混入する。
誤った候補がユーザーに到達するリスクがあるため、基盤の安定が前提。

### Floor 条件（最低量的要件）

| 条件 | 閾値（仮値） | 根拠 |
|------|-------------|------|
| セッション数 | ≥ 15 | Phase 2→3 の floor が 6。3→4 は十分な関係構築が必要 |
| 累計ターン数 | ≥ 100 | 1セッション平均8ターン × 15セッション弱 |
| Phase 3 滞在ターン数 | ≥ 30 | Phase 3 で最低 30 ターンの「本人化」体験が必要 |

### Metric 条件（全て AND）

| # | 条件 | 閾値（仮値） | 利用可能か | 根拠 |
|---|------|-------------|-----------|------|
| M1 | Trust Level | ≥ 3（TrustLevel discrete） | **可** | continuousTrust ≥ 0.7 + sessions ≥ 20 |
| M2 | 直近 N ターンで rupture なし | 直近 10 ターンで consecutive rupture 0 | **可** | recentRuptureFlags で判定 |
| M3 | 直近 N ターンで dignity 違反なし | 直近 10 ターンで dignity_violation 0 | **可**（要追跡追加） | abstention engine で検出済み |
| M4 | 直近 N ターンで trust 急落なし | 直近 10 ターンで trustDelta ≤ -0.2 が 0 回 | **可** | priorSessionTrust で判定 |
| M5 | Protective spike なし | 直近 5 ターンで protectiveActivation ≥ 0.8 が 0 回 | **可**（要追跡追加） | partsLens で検出済み |
| M6 | Abstention 適切 | 直近 10 ターンで不当な abstention なし | **可** | shouldAbstain フラグ |

### 未接続メトリクスへの対応

HDM v1 spec の「反応予測の総合的中率が閾値を超える」は `defensePredictionStreak` に対応するが、
現在 hardcoded 0 のため Phase 3→4 の条件には使えない。

**代替案**: 上記 M1-M6 の「安定性条件」で代替する。
予測的中系メトリクスは接続後に条件を強化（Phase 2 での代替パスと同じパターン）。

---

## 3. Phase 4→5 昇格条件

### テーマ

「多視点統合を経ても、現実返還を返してよいか」

Phase 5 では Alter が「現実の一手」を提案する。
多視点統合（P4）が安定し、ユーザーとの関係に悪影響を与えていないことが前提。

### Floor 条件

| 条件 | 閾値（仮値） | 根拠 |
|------|-------------|------|
| セッション数 | ≥ 40 | TrustLevel 4 の要件と一致 |
| Phase 4 滞在ターン数 | ≥ 20 | 多視点統合を十分に体験した後 |
| P4 counterfactual 発火回数 | ≥ 3 | 最低 3 回の counterfactual 統合経験が必要 |

### Metric 条件（全て AND）

| # | 条件 | 閾値（仮値） | 利用可能か | 根拠 |
|---|------|-------------|-----------|------|
| M1 | Trust Level | ≥ 4（TrustLevel discrete） | **可** | continuousTrust ≥ 0.85 + sessions ≥ 40 |
| M2 | Counterfactual 尊厳安全 | 直近 3 回の P4 で dignity violation 0 | **可** | shadow_log テーブル |
| M3 | rejected_post_check 率 | 直近 5 回の P4 で rejection 率 ≤ 40% | **可** | shadow_log テーブル |
| M4 | P4 decision 分布 | 直近 5 回で adopted ≥ 2 回 | **可** | shadow_log テーブル |
| M5 | 直近 N ターンで rupture なし | 直近 10 ターンで consecutive rupture 0 | **可** | recentRuptureFlags |
| M6 | 直近 N ターンで trust 急落なし | 直近 10 ターンで trustDelta ≤ -0.2 が 0 回 | **可** | priorSessionTrust |

### HDM v1 spec との対応

spec の「多視点を加えた提案が尊厳フィルタに3回連続で抵触しない」は
M2（直近 3 回の P4 で dignity violation 0）に直接対応。

After-Action Loop の安定性（P5-3）は Phase 5 到達後の**継続条件**であり、
昇格条件には含めない（Phase 5 到達時点では After-Action Loop の実績がまだない）。
ただし Phase 5 到達後に `felt_bad` が連続した場合は regression で Phase 4 に戻る。

---

## 4. Manual-Assisted 運用モデル

完全自動化はしない。3段階で段階的に移行する。

### Stage 1: Shadow Recommendation（初期）

```
判定: 毎ターン、昇格条件を評価する
出力: analytics に `promotion_recommendation: true/false` を出力
実行: 昇格しない。CEO が dashboard / ログで確認し、手動で `manualOverride` を設定
```

**実装コスト**: 低（条件判定関数 + analytics 出力のみ）
**リスク**: 低（何も変えない。観測のみ）

### Stage 2: Manual Approval（中期）

```
判定: 毎ターン、昇格条件を評価する
出力: 条件充足時に CEO に通知（CEO dashboard / Slack 等）
実行: CEO が承認ボタンを押すと昇格
```

**実装コスト**: 中（通知機構 + 承認 API）
**リスク**: 低（CEO が最終判断）

### Stage 3: Eventual Auto（将来）

```
判定: 毎ターン、昇格条件を評価する
出力: 条件を N ターン連続で充足 → 自動昇格
実行: CEO は kill switch で無効化可能
```

**実装コスト**: 高（自動昇格ロジック + kill switch + モニタリング）
**リスク**: 中（false positive で未熟なユーザーが高 Phase に到達するリスク）

### 推奨

**Stage 1 から開始する。**

理由:
- Phase 4+ ユーザーがほぼ 0 人の現段階では、自動化の ROI が低い
- shadow recommendation でデータを蓄積し、閾値を実データでキャリブレーション
- Stage 1 の実装コストは極めて低い（条件判定関数 + analytics フィールド追加のみ）

---

## 5. 実装方針（Stage 1 のみ）

### やること

1. `lib/stargazer/hdmPhase.ts` に `evaluatePromotionReadiness()` 関数を追加
   - 入力: `HdmPhaseState`, `HdmPhaseInputs`, 追加メトリクス
   - 出力: `{ recommend: boolean, phase: 3→4 | 4→5, reasons: string[], missingConditions: string[] }`
2. `route.ts` の analytics に `promotion_recommendation` フィールドを追加
3. CEO dashboard で `promotion_recommendation: true` のユーザーを一覧表示可能にする（将来）

### やらないこと

- 自動遷移の本実装（Stage 2 以降）
- 新しい分析メトリクスの大量追加
- `defensePredictionStreak` 等の未接続メトリクスの接続
- `other_party` の再開

---

## 6. 追跡が必要な追加フィールド

現在の `HdmPhaseState` / `growthState` で追跡できていないもの:

| フィールド | 用途 | 追加先 | 優先度 |
|-----------|------|--------|--------|
| `recentDignityViolations: boolean[]` | M3: 直近 N ターンの dignity 違反履歴 | HdmPhaseState | Stage 1 で必要 |
| `recentProtectiveSpikes: boolean[]` | M5: 直近 N ターンの protective spike 履歴 | HdmPhaseState | Stage 1 で必要 |
| `phase3EnteredAt: string \| null` | Floor: Phase 3 滞在ターン数算出 | HdmPhaseState | Stage 1 で必要 |
| `phase4EnteredAt: string \| null` | Floor: Phase 4 滞在ターン数算出 | HdmPhaseState | Stage 1 で必要 |
| `p4FireCount: number` | Floor: counterfactual 発火回数 | HdmPhaseState | Stage 1 で必要 |

**注**: `recentRuptureFlags` は P3 cross-session で実装済み。同じパターンで追加可能。

---

## 7. 閾値キャリブレーション

全ての閾値は**仮値**。Stage 1 の shadow recommendation で以下を観測し、調整する:

- recommendation が true になる頻度
- true → CEO が承認する率
- 承認後に regression が発生する率
- Phase 3→4 で recommendation が出た時点の典型的なユーザープロフィール

閾値の固定は**実データ N ≥ 10** が揃ってから。
