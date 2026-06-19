# RO-0 — Reality OS Scope Audit / Session Mainline Reset（docs-only・実装ではない）

- **status**: 確定（docs-only）。**code 変更ゼロ・DB write なし・production gate 未通過**
- **CEO GO**: RO-0 Scope Audit / Mainline Reset（2026-06-20）
- **本書の役割**: leaveBy/Mobility 枝（RD3x→RD3g）に偏った本セッションを、元構想（Personal Reality OS / Reality IR / 統合判断エンジン）の全体へ**棚卸し・再接続**する。実装 GO ではない。
- **失敗の総括（CEO 指摘）**: 極端に安全に進み slice を分けすぎた。1 つの departure HH:MM に 6 フェーズ費やし、判断エンジンの「広さ」を進めなかった。
- **是正方針（CEO 2026-06-20）**: 設計は**大枠（各 RO）の中で小さく割り詳細かつ完璧に**。実装は**本当に必要でない限り RO 単位**で。GOAL 明確化 → loop 監査 → 完璧実装。
- **証跡基準**: 本書の全分類は実コード検証済み（file:line 併記）。鵜呑み禁止・断定には根拠。

---

## 0. 北極星（Reality OS GOAL）

> ユーザーの現実（予定・場所・移動・体力・天気・関係・記憶）を**そのまま LLM に投げず、一度 Reality IR（内部状態）にコンパイル**し、**未来予測 → 介入判断 → 提案 → 許可 → 結果学習**まで回す Personal Reality OS（外部前頭葉 / 現実管制塔）。

設計原則（不変）: **AI に判断させるのではなく、判断できる状態を作る。LLM=意味処理 / Engine=現実制御。推定は必ず「仮説」（推測値+根拠+確信度+本人補正）として扱い、確定値に見せない。**

到達定義（production 前に全実装を終える対象）: 下表 L0〜L4 の **① を全て ③ にし、② を ③ に育てる**。⊘（notification/push/位置/外部送信/自動変更）は別 gate・本 OS 完成の対象外。

---

## 1. 全構想 × 分類（実コード検証）

凡例: **③完璧**（kernel+test）/ **②ベースあり進化要** / **①完全未** / **⊘意図的後段（gate 別）**

### L0 — Reality IR / 状態基盤

| 構想 | 分類 | 証拠 / 欠落 |
|---|---|---|
| RealityGraphSnapshot（現実を内部状態として持つ） | ③ | `realityGraphSnapshot.ts:108`（2層 identity+InputRevisionSet+derivationVersionSet） |
| RealityAttribute（推測値+根拠+確信度+本人補正の汎用器） | ③ | `realityAttribute.ts:30`・**56+ 使用**（疲労専用でない） |
| EventRealityNode（10 属性） | ③ | `eventRealityNode.ts:60` |
| MovementReality / CommitmentSignal / DecisionDebt / MomentState(14) | ③ | v0 全実装・`deriveMomentState.ts:52` |
| DayStateRecord（estimates+frozen+nightCheck） | ③ | `dayStateTypes.ts:152`（3バッテリー+recoveryNeed・本人補正最優先） |
| **Reality Graph EDGES（制約グラフ）** | **①** | typed edge **無し**・node 中心 ID 参照のみ |
| **RealityDiff（snapshot 比較）** | **①** | 差分計算 **無し**（grep 0） |
| **snapshot 永続化（学習用）** | **①** | 毎分 derive・保存せず（「保存される blob でなく毎回 derive」明言） |

### L1 — 判断エンジン RJ

| 構想 | 分類 | 証拠 / 欠落 |
|---|---|---|
| 単一正本（全判断が同じ束から判断） | ③ | **graphSnapshot が単一正本**。全 RJ が同 snapshot を読む |
| RealityJudgmentInput（万能束として） | ② | **feasibility のみ消費**（`realityJudgmentInput.ts:33`・下流は別 input）。**前回 ③ は誤り→訂正** |
| RJ1 Feasibility（status/risk/4バケツ） | ③ | `feasibilityJudgment.ts:68` |
| CollapseRisk / Propagation / InterventionEligibility / InterventionDecision | ③ | pipeline 実走（`operatorDayPreview.ts:193-204`） |
| RJ2 leaveBy **単一値** compute | ③ | `leaveByComputation.ts:89`（**本 session が表面化**） |
| **RJ2 二段化（recommended/hard）+ wakeAt/prepareAt** | **①** | docs(RJ0 §5)のみ |
| **prepTime モデル（起動時刻）** | **①** | コード 0（RJ0 §4 契約のみ） |
| **RJ3 Intervention Ladder（時刻×強度の列）** | **①** | InterventionDecision とは別物 |
| RJ4 Proposal 守る/楽/攻める | ② | proposal 基盤あり・3-route 無し |
| **RJ5 TaskRealityNode（締切駆動の作業）** | **①** | RJ0 §2 placeholder のみ・第一級ノード不在 |
| **RJ5 Task 分解** | **①** | — |
| RJ6 Outcome Capture | ② | `gradeNightCheck.ts` driftSelections v0 |
| **overrunRisk** | **①** | — |

### L2 — 表面 / 配信

| 構想 | 分類 | 証拠 |
|---|---|---|
| SurfacePlan/Claim/Projection/Copy/Clarification/DeliveryGate | ③ | 実走（design status） |
| leaveBy presence/HH:MM dev 表面（**本 session**） | ③ | `dev-alter-tab/page.tsx`（dev 限定・三重 guard・3 flag OFF） |
| notification / push 配信 | ⊘ | 意図的 NO GO（B2/R6 gate） |

### L3 — 8 部署（docs RACI=③ / runtime object=意図的に作らず）

| 部署 | 実体 | 欠落 |
|---|---|---|
| Plan | 充実（dayGraph/feasibility/proposal） | Task/deadline |
| **Mobility** | leaveBy v0 のみ | 二段化・route options・origin 確認 |
| **Energy** | **推定層 ③**（3バッテリー+recoveryNeed・confidence/source） | **判断層 ①**（TaskPlacementFeasibility・prepTime） |
| Context | 薄（commitmentSignal のみ） | 目的・社会的重み・意味判断 |
| Memory | 充実（PRM/learning/correction） | 消費は後段（B1） |
| Risk | 充実（collapseRisk/feasibility） | overrunRisk |
| Permission | 強 | — |
| Communication | 薄（copy のみ） | 介入文選択・draft_only |

> GPT 監査の「Energy=ABSENT」は過剰。**Energy は測れる（推定層 ③）が判断できない（判断層 ①）**が正確。

### L4 — 学習ループ

| 構想 | 分類 | 証拠 |
|---|---|---|
| estimatesFrozen→NightCheck→carryOver→Reveal | ③ | v0 実走 |
| Correction 保存 / PredictionLedger | ③ | W4 / 6 ラウンド hardening |
| Correction の翌日 prior 還流 | ② | 後段（B1・観測≥14 日 gate） |
| Context 条件付き correction schema | ① | coarse contextKey のみ |

---

## 2. CEO 質問への回答（コード証拠・本書に固定）

### Q. Reality IR / graph は実装済みか？

CEO 定義 4 要素（持つ・比較・更新学習・介入判断）のうち **2 実装・2 未実装**。

| 要素 | 状態 |
|---|---|
| 現実を内部状態として**持つ** | ③（RealityGraphSnapshot） |
| **介入判断**に使う | ③（feasibility→risk→intervention pipeline 実走） |
| **比較**に使う | ①（RealityDiff 無し） |
| **更新・学習**に使う | ①（毎分 derive・永続なし・edge 無し） |

→ **「型・provenance・介入 pipeline」は実装済み。「学習システム（差分・永続・edge）」は未実装。** これが L0 の心臓部欠落であり RO-3 の対象。

### Q. 疲労以外も「推測値+根拠+確信度+本人補正」で実装済みか？

**YES・汎用基盤。** `RealityAttribute<T>` = value+confidence+source+evidence+status+displayPolicy が 56+ 箇所（movement/leaveBy/commitment/event/decisionDebt）で使用。本人補正最優先も実装（`manualLevels`/`applyUserCorrection` が inferred を上書き・source「本人」/`user_confirmed`）。

### Q. dayStateRecord の {value,confidence,source,evidence} は入っているか？

**YES・実質的。差分 3 点**: ①evidence は record 単位（per-field でない）②energy は 3 バッテリー（体/脳/心）+recoveryNeed（physical/mental/social でない）③**dailyMode に「守る/protect」値が無い**（recover/reset/advance/maintenance/social/explore・"protect" は別型 EnergyAdjustment）→ **RJ4 の 守る/楽/攻める 語彙と未接続**（伏線）。

---

## 3. leaveBy 枝の全体での位置

**L1-RJ2 の単一属性 compute（③）+ L2 dev 表面化（③ dev 限定）。** 全構想 ~40 のうち約 2 構想。Mobility 部署の中の 1 枝。**judgment pipeline 自体は別途 ③ だが、leaveBy 枝はそこへ繋がっていない**（presence/HH:MM を dev に出しただけ）。→ **本枝はここで閉じる**（これ以上磨くのは轍の再現）。

---

## 4. 次に進める 3 本（最大解錠で選定）

GPT の「Mobility 偏重を繰り返すな・Task を上げろ」を採用。

1. **RO-1: Task & Work 基盤**（最優先・単独最大の unblocker）
 → Plan の deadline・**Energy の TaskPlacementFeasibility**・RJ4 の 3案 を一度に解錠。CEO 強化定義で「単なる型追加」でなく Plan/Energy/Risk/Memory を繋ぐ基盤にする。設計は別紙 `reality-os-ro1-task-work-foundation-design.md`。
2. **RO-2: Mobility 管制塔骨**（leaveBy 二段化 + wakeAt + prepTime + RJ3 Ladder・配信なし pure）
 → 現 delta 最短。4 つが連動（wakeAt = recommended − prepTime → ladder step）。leaveBy 枝を正しく閉じる地点。
3. **RO-3: Reality IR 学習化**（edges + RealityDiff + snapshot 比較 → correction 還流）
 → CEO 定義の Reality IR 後半（比較・更新・学習）を埋める。RO-1 が用意する edge 準備を materialize。

推奨順: **RO-1 → RO-2 → RO-3 → RO-4 → RO-5**。

---

## 5. フェーズ単位（過剰 slice 防止）

**フェーズは「部署/能力」単位に固定。** 設計は各 RO 内で小さく割るが、**実装は RO 単位**（micro-phase に割らない）。

| 単位 | スコープ | 完了条件（GOAL） |
|---|---|---|
| RO-1 | Task & Work 基盤 | TaskRealityNode 実体 + 1 task:N block + TaskPlacementFeasibility seam + TaskOutcome seam + edge 準備（§別紙で強化定義） |
| RO-2 | Mobility 管制塔骨 | leaveBy {recommended,hard,wakeAt,prepareAt} + Intervention Ladder pure 生成（配信せず） |
| RO-3 | Reality IR 学習化 | typed edges + RealityDiff + correction 還流の最小ループ |
| RO-4 | Proposal 3案 | 守る/楽/攻める = 制約グラフ上の異なる route（RO-1 依存） |
| RO-5 | Context & Communication | 目的/社会的重み + draft_only |

---

## 6. 規律（CEO 採用・各 RO 完了報告で必須）

1. **どの部署を進めたか**を明記
2. **本番配信 / push / 位置 / 外部送信 / 自動予定変更 / 予約・支払い**は触らない
3. **dev 表示だけで「ユーザー価値到達」と報告しない**
4. 各 RO は **GOAL（受け入れ基準）→ loop 監査（contract-audit / coverage-audit）→ 実装** の流れ
5. 設計は大枠内で小さく割る・**実装は RO 単位**（過剰 slice 禁止）

---

## 7. 決定

- **leaveBy/Mobility 枝はここで閉じる**（一段階完了・dev 表面化まで）。
- **自己訂正**: RealityJudgmentInput は ② に訂正（単一正本は graphSnapshot=③）。
- **Reality IR は「持つ・介入判断」=③ / 「比較・更新学習」=①** — RO-3 の対象。
- 次 = **RO-1（Task & Work 基盤）** の設計（別紙）→ 実装 GO は CEO 判断。
- コード 0・write 0・migration 0。
