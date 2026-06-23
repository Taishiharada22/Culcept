# P3-0b — Future Simulator 境界設計 / DEFER 解除設計（docs-only・runtime 実装なし）

- **作成日**: 2026-06-23
- **branch**: `claude/task-store-migration-on-a9eedce69-20260623` @ `e6272b0ff`（判断層5本 on-base 完了後）
- **CEO 境界判断**: Future Simulator は新規巨大エンジンにしない / dayRehearsal を置換しない / proposalRoute を作り直さない / **scenario 比較 adapter・aggregator（薄い集約層）**とする。
- **本書の範囲**: 配置・責務境界・循環回避・最小 seam を**設計固定するのみ**。runtime 実装は次 GO（P3-0c）。

---

## 1. read-only 調査結果（import 方向）

| 観点 | 結果 |
|---|---|
| realityCore → dayRehearsal を import するか | 🟢 **import ゼロ** |
| dayRehearsal → realityCore を import するか | 🟢 **import ゼロ** |
| → 2 レーンの現状 | **完全 decoupled（循環なし）** |
| 判断層6本（proposalRoute/feasibilityJudgment/collapseRisk/workOverrunRisk/realityDiff/realityLearningSignal）の realityCore 外依存 | ほぼ無し（`feasibilityJudgment → @/lib/plan/dayState/timeOfDay` のみ）。realityCore はほぼ pure leaf レーン |

**含意**: realityCore は mainline（dayRehearsal 等）に依存しない leaf。**この向きを壊さないことが循環回避の絶対条件**。Future Simulator が dayRehearsal を import すると `realityCore → dayRehearsal` が生まれ、将来 dayRehearsal が realityCore を読めば循環。→ **依存逆転（injection）で回避する。**

---

## 2. Future Simulator の配置判断

**配置 = `lib/plan/realityCore/futureSimulation.ts`（realityCore-native・薄い aggregator）。**

理由（goal-backward + 循環回避）:
- Future Simulator は realityCore の判断器群（feasibility/collapse/overrun/diff）を**横断集約する判断概念**＝realityCore に属するのが自然。
- ただし **dayRehearsal / proposalRoute を import しない**。両者の出力は **injected input（fixture/呼び出し側が渡す）**として受ける（依存逆転）。これで realityCore→mainline 結合を作らず、循環不能を構造保証。
- 判断器の **再実行はしない**（薄い集約層を保つ）。各 scenario の feasibility/collapse/overrun は**上流（呼び出し側）が既存判断器で算出した summary**を inject。Future Simulator は **shift（current 比）と diff と permission 集約だけ**を行う。

### 配置の代替案と却下理由
| 案 | 判定 |
|---|---|
| realityCore 内・判断器を import し各 scenario で**再実行** | ❌ 薄い層でなくなる（巨大化）/ 各 scenario に full RealityJudgmentInput 構築が要る |
| dayRehearsal 側 adapter に置く | ❌ realityCore 判断器を mainline から逆 import＝向き逆転・結合増 |
| **realityCore 内・summary injection の薄い aggregator** | ✅ **採用**（循環なし・薄い・既存判断器を作り直さない） |

### import 規則（不変条件）
- ✅ 許可 import: `realityAttribute`（型）/ `permission-model`（PermissionLevel 型）/ `realityDiff`（型のみ・diffSnapshots は呼び出し側で実行し summary を inject）。すべて realityCore 内 or 型のみ。
- 🚫 禁止 import: `dayRehearsal/*`（mainline）/ `proposalRoute`（生成ロジック）/ feasibility/collapse/overrun の**実行**（再実行しない・summary を受ける）。

---

## 3. dayRehearsal との責務境界

| | dayRehearsal | Future Simulator |
|---|---|---|
| 何を | **1 日の forward simulation / repair simulation**（timeline を前から走らせ 6 計算・修復候補） | **複数 scenario の current 比 shift を集約比較** |
| 入力 | DayGraph + feasibility(slack) + transport（mainline） | current/protect/easy/push の**判断 summary（injected）** |
| 出力 | 1 日の rehearsal / repair 候補 | scenario 比較表（shift/diff/permission） |
| 関係 | Future Simulator は dayRehearsal を **import しない**。dayRehearsal 要約が要る場合は **injected fixture summary** として受ける（依存逆転） |

→ 責務重複なし。dayRehearsal は「1 日を回す」、Future Simulator は「複数案を横並べて比べる」。

---

## 4. proposalRoute との責務境界

| | proposalRoute | Future Simulator |
|---|---|---|
| 何を | 守る/楽/攻める scenario 候補の**生成（正本）** | 生成済 scenario の**比較**（生成しない） |
| 関係 | Future Simulator は proposalRoute を **改造しない・生成を呼ばない**。proposalRoute 出力を **scenario input** として受ける |

→ 生成（proposalRoute）と比較（Future Simulator）を分離。混ぜない＝巨大化回避。

---

## 5. 最小 runtime の入力 / 出力案（次 GO で実装・本書では作らない）

```ts
// 入力（すべて injected・FutureSimulator は判断器を再実行しない）
interface FutureScenarioInputV0 {
  readonly scenarioId: string;
  readonly kind: "current" | "protect" | "easy" | "push";
  // 上流で既存判断器が算出した summary（裸値でなく RealityAttribute / enum）
  readonly feasibilityStatus: RealityAttribute<"feasible"|"feasible_with_risk"|"infeasible"|"unknown">;
  readonly collapseRiskLevel: RealityAttribute<"low"|"elevated"|"high"|"unknown">;
  readonly overrunRiskLevel: RealityAttribute<"low"|"medium"|"high"|"unknown">;
  readonly permissionBoundary: PermissionLevel;          // permission-model 由来
  readonly realityDiffSummary?: { added:number; removed:number; changed:number; resolved:number; collapsed:number } | null; // diffSnapshots 出力の要約（injected）
  readonly dayRehearsalSummary?: string | null;          // dayRehearsal 要約（injected・任意）
  readonly evidenceRefs: ReadonlyArray<string>;
}

interface FutureSimulationInputV0 {
  readonly current: FutureScenarioInputV0;               // kind="current"
  readonly scenarios: ReadonlyArray<FutureScenarioInputV0>; // protect/easy/push
}

// 出力（current 比の shift・pure 集約のみ）
type Shift = "better" | "same" | "worse" | "unknown";
interface FutureScenarioComparisonV0 {
  readonly scenarioId: string;
  readonly kind: "protect" | "easy" | "push";
  readonly feasibilityShift: RealityAttribute<Shift>;
  readonly overrunRiskShift: RealityAttribute<Shift>;
  readonly collapseRiskShift: RealityAttribute<Shift>;
  readonly realityDiffSummary: FutureScenarioInputV0["realityDiffSummary"];
  readonly permissionBoundary: PermissionLevel;          // current より厳しい側を保持
  readonly reasonCodes: ReadonlyArray<string>;
  readonly evidence: ReadonlyArray<string>;
  readonly confidence: number;
  readonly honestUnknown: boolean;                       // 入力 summary に unknown が混じる時 true
}
interface FutureSimulationResultV0 {
  readonly comparisons: ReadonlyArray<FutureScenarioComparisonV0>;
}
```

### runtime 不変条件（次 GO で守る）
- 判断器を**再実行しない**（summary を受けて shift を出すだけ）。
- shift は current 比の**離散**（better/same/worse/unknown）・数字コスプレ禁止。
- 入力 summary に unknown があれば該当 shift は unknown・`honestUnknown=true`（断定しない）。
- 提案文生成・通知・UI・DB なし。LLM なし。scenario を**生成しない**（proposalRoute が正本）。
- permissionBoundary は current/ scenario の**厳しい側**を保持（緩めない）。
- 裸スコア禁止（RealityAttribute）。

---

## 6. DEFER 解除できるか

🟢 **設計上は解除可能（前提が揃った）**:
- 判断層5本 on-base 完了（`feasibilityJudgment`/`collapseRisk`/`proposalRoute`/`realityLearningSignal`/`correctionGradient`・`e6272b0ff`）。
- dayRehearsal 境界 = **置換せず・import せず・summary injection**で確定（本書）。
- 配置 = realityCore 内・依存逆転で**循環不能**を構造保証。

→ **P2-4 DEFER の解除前提（判断層 on-base + dayRehearsal 境界決定）は本書で充足。** ただし runtime 実装は次 GO（P3-0c: Future Simulator minimal aggregator runtime）。本書では実装しない。

---

## 7. 停止

本境界設計（docs-only）で停止。runtime 実装・dayRehearsal/proposalRoute 改造・RealityDiff 全面改造・P3 fixture E2E・UI/DB いずれもしない。次 GO で §5 の最小 aggregator を per-file 実装（pure・summary injection・循環なし）。
