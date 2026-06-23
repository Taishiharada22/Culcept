# P2-4 Future Simulator — Scope 判定（正式保留 / DEFER）

- **作成日**: 2026-06-23
- **branch**: `claude/task-store-migration-on-a9eedce69-20260623`（base = `a9eedce69`）
- **判定**: **正式保留（DEFER）**。最小 pure simulator を「今」作るのは、責務重複 or hollow seam のどちらかになるため不可。コードは追加しない（docs-only）。
- **方針根拠**: CEO「既存資産を小さく束ねられるなら minimal sim を作る。足りなければ正式保留 doc にして止める」。read-only 調査の結果、足りない（下記）。

---

## 1. read-only 調査結果（実体）

| 部品 | 所在 | 責務 | Future Sim から見た関係 |
|---|---|---|---|
| `lib/plan/dayRehearsal/` (`rehearseDay`/`inverseWhatIf`/`dayRepairCandidates`/`dayRepairSimulation`/`dayRepairPreview`) | **a9ee 既存(mainline)** | 1 日を前から走らせ 6 計算(成立/friction/buffer/strain/recovery/convergence)を simulation + 修復候補生成・修復 simulation。「最適化でなく simulation・予定を動かさない」 | **「このままだと何が起きるか」+ 修復 scenario を既に担う** → 重複リスク（即停止条件） |
| `realityDiff` (`diffSnapshots`) | **on-base** | RealityFrame A-vs-B の 5 バケット差分 | 状態差分の素材。**未来 scenario 生成はしない** |
| `workOverrunRisk` | **on-base(P2-3)** | 単一 block の時間超過リスク | overrun shift の素材 |
| `taskMinimalProgress` | **on-base(P2-2)** | 最小前進の validation | scenario の「最小行動」素材 |
| `feasibilityJudgment` | 🔴 **on-base 不在(42ab)** | per-event/task 成立性 4-bucket | **feasibility shift に必須** → 無いと出せない |
| `proposalRoute` | 🔴 **on-base 不在(42ab)** | 守る/楽/攻める route 生成 | **protect/easy/push scenario の意味づけに必須**（P2-4 改造禁止） |
| `collapseRisk` | 🔴 **on-base 不在(42ab)** | 日の崩れ方 factor map | **collapse/risk factor summary に必須** |

---

## 2. なぜ「今」最小実装が不可か（CEO 即停止条件に該当）

CEO 希望の per-scenario 出力は ①feasibility shift ②overrun risk shift ③collapse/risk factor summary ④permission boundary ⑤reasonCodes ⑥confidence ⑦evidence ⑧honest-unknown。

- **①③ は on-base 不在ファイル（feasibilityJudgment / collapseRisk）に依存** → これらを landing するのは P2-4 scope 外（判断層着地＝P3 相当）。
- **scenario(protect/easy/push)の意味は `proposalRoute` が正本**。それ無しで protect/easy/push を名乗ると hollow（中身がない）→ 即停止条件「proposalRoute に接続しないと意味が出ない」。
- **「このままだと何が起きるか」+ 修復 scenario は `dayRehearsal` が a9ee に既存** → realityCore 側に同責務を新設すると即停止条件「dayRehearsal と責務重複」。
- 残る on-base 素材だけ（workOverrunRisk + realityDiff）で組むと、入力 fixture をほぼ echo するだけの hollow seam になり、CEO の「未来を確定予言のように扱わない / 数字コスプレ禁止」の精神に反する。

→ **「足りない」が確定**。よって正式保留。

---

## 3. Future Simulator の責務境界（保留中も固定）

| 主体 | 担う | 担わない |
|---|---|---|
| **Future Simulator（将来）** | 複数 scenario を **risk 軸で比較**し、現状(current)からの shift（feasibility/overrun/collapse）+ permission boundary + reasonCodes/confidence/evidence/honest-unknown を返す | 予定を動かす / 提案文生成 / 通知配信 / DB 保存 / LLM 予測 / scenario の**生成**（生成は proposalRoute） |
| dayRehearsal(既存) | 1 日 timeline の forward simulation + 修復候補 | scenario 横断の RJ 判断統合（realityCore 軸） |
| proposalRoute | 守る/楽/攻める route の**生成** | risk 比較 |
| RealityDiff | A-vs-B 状態差分 | 未来 scenario 評価 |
| OverrunRisk | 単一 block 超過 | scenario 比較 |
| minimalProgress | 最小行動 validation | scenario 比較 |
| feasibilityJudgment | per-node 成立性 | shift 比較 |

→ Future Simulator は**新しい計算器ではなく「既存判断器の scenario 横断アグリゲータ」**。だから前提（判断器の on-base 化）が要る。

---

## 4. 保留解除の前提条件（これが揃えば minimal 実装可）

1. **判断層の on-base 着地**（P3 相当）: `feasibilityJudgment` / `collapseRisk` / `proposalRoute` を per-file landing（IR スパインと同じ規律）。
2. **dayRehearsal との境界 CEO 決定**: realityCore-native Future Sim を新設するか、dayRehearsal を realityCore から呼ぶ adapter にするか（二重正本回避）。
3. 上記後、Future Sim は **deterministic fixture scenario(current/protect/easy/push)** を入力に、各 scenario へ feasibilityJudgment/workOverrunRisk/collapseRisk を適用 → current からの shift を比較する **pure aggregator** として最小実装可能。

---

## 5. 解除後に作る最小 seam の形（先に固定・実装しない）

```
input(fixture): {
  current: ScenarioStateV0,
  scenarios: { kind: "protect"|"easy"|"push", state: ScenarioStateV0 }[]
}  // ScenarioState は既存判断器の入力束（RealityJudgmentInput 部分集合）

output(pure): ScenarioComparisonV0 {
  per scenario: {
    feasibilityShift: RealityAttribute<"better"|"same"|"worse"|"unknown">,
    overrunRiskShift: RealityAttribute<...>,   // workOverrunRisk(current) vs (scenario)
    riskFactorSummary: ReadonlyArray<string>,  // collapseRisk 由来
    permissionBoundary: PermissionLevel,
    reasonCodes, confidence, evidence, honestUnknown
  }
}
```
- 提案文/通知/UI/DB なし。LLM なし。current は確定予言でなく比較基準。入力不足 → honest-unknown。

---

## 6. non-goals（保留中も厳守）

LLM 未来予測 / 実カレンダー・実ユーザー資産読込 / DB 保存 / UI 配線 / notification / proposalRoute 全面改造 / RealityDiff 作り直し / Future Simulator の巨大 OS 化 — **いずれもしない**。

---

## 7. P2 全体の到達点

| slice | 状態 |
|---|---|
| P2-1 RJ6 PredictionLedger runtime | ✅ 完了（`b4848163f`） |
| P2-2 RJ5 minimalProgress producer | ✅ 完了（`509a47729`） |
| P2-3 OverrunRisk module | ✅ 完了（`01807a48d`） |
| **P2-4 Future Simulator** | **正式保留（本 doc）— 前提=判断層 on-base 着地 + dayRehearsal 境界決定** |

→ **P2 の kernel-buildable-now 部分は完了**。Future Simulator は「穴」ではなく、**判断層着地（P3）後に解除する sequenced precondition**。

---

## 8. 停止

本 scope 判定（docs-only・正式保留）で停止。コード追加・既存改変ゼロ。実装は前提条件充足 + CEO GO 後。
