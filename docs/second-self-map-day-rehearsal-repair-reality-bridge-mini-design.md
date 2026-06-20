# Day Rehearsal Repair → Reality Control OS — bridge mini design（設計のみ・実装しない）

> 2026-06-07 / **設計のみ・実装しない** / 前提: Repair Disposition v0 main live（`3d12d26e`・分類のみ・unwired）。Reality Control OS（`lib/plan/reality/`）は別セッション活発進行中（main に A1-6-0）。

---

## 0. 結論（先に）
- **最初に橋渡しできるのは `protect`（use_recovery_window / protect_buffer）→ Reality `recovery_core` 保護シグナルのみ**。これは **governance 入力**（変更でなく「触るな」）で magnitude/move-mode 不要 ⇒ 最安全・最feasible・哲学整合（回復核の保全）。
- **`adjust`（leave_earlier）→ Reality `update`(move) は三重ブロック**（magnitude[full path] / Reality move-mode 未実装[現状 trim-only] / どの node を動かすか）。`reduce`（reduce_density）→ Reality `Optimize` も未実装+vague。`confirm` は Reality の変更領域外（確認タスク・INV-23 tentative）。
- ★**Reality は in-flight（A1-x 活発）。今は code couple しない**。bridge は **disposition → Reality 概念の pure mapping spec** に留め、実 RealityInput 注入は (a) Reality interface 安定 (b) Reality セッションと coordination (c) protect の gap-vs-node 設計解決 の後。
- **推奨 first layer（GO 時）= pure な「protect signal exporter」**（rehearsal + protect disposition → 保護区間/回復核の候補 list を **Reality 非 import の中立 shape** で返す）。adjust/reduce/confirm は橋渡ししない（blocked/領域外）。

## 1. Reality 境界の audit（read-only）
- `RealityInput = { mode: EngineMode, dayNodes, anchors: Record<id, AnchorInput>, seedTraces }`。
- **governance は入力**: `anchorGovernance(anchor, ctx)` が `{ origin, authority, flexibility, protectionReasons }` を構築（involvesOthers/reservation→hard_external 等）。`protectionReasons` は per-node の入力フィールド。
- candidate-generator は governance を**消費**して分類: **touchable=isRepairTouchable ∧ 非 recovery_core**（repairTouchOrder 順）/ **preserved=immovable ∪ recovery_core（決して触れない）**。
- candidate-evaluator: `recoveryProtected` gate = remove/update が recovery_core node を触れば **false→reject**（unknown も安全側 false）。
- ∴ **`recovery_core` を governance に立てる = Reality の Repair/Optimize がその対象を恒久的に触らない**。これが protect の橋渡し先。
- ★`recovery_core` の定義（authority.ts）= 「その人固有の回復核（食事/睡眠/**移動余白**/夜の自由 等）」→ use_recovery_window（一息余白）と概念一致。
- move/cascade/add/remove・Optimize/Complete/Build は **別 slice**（candidate-generator は現状 **trim-only**＝A1-3）。

## 2. disposition → Reality 対応表（bridge map）
| disposition | 元 kind | Reality 概念 | 統合点 | 現状 feasibility |
|---|---|---|---|---|
| **protect** | use_recovery_window / protect_buffer | `recovery_core`（保護） | **RealityInput governance**（変更でなく入力） | ★**最初に可能**（要: gap-vs-node 解決 + coordination） |
| adjust | leave_earlier | `update`(move) ChangeOp | candidate 生成（move mode） | ✗ 三重ブロック（magnitude / move-mode 未実装 / which-node） |
| reduce | reduce_density | `Optimize`(remove\|shorten・droppable 先) | candidate 生成（Optimize mode） | ✗ 未実装 + target vague |
| confirm | confirm_uncertain | 領域外（確認タスク・INV-23 tentative） | Reality 変更でない | ✗ Reality ChangeSet の外 |

## 3. protect bridge を最初にする理由 + 設計課題
- **理由**: ①変更でなく governance 入力（apply 不要・最安全）②magnitude/move-mode 不要 ③哲学整合（回復核の保全＝自己ケア・Aneurasync の中核「回復核」概念）④Reality 既存の recoveryProtected gate にそのまま乗る。
- ★**設計課題（gap-vs-node mismatch）**: Reality governance は **node 単位**。だが use_recovery_window は **gap（空き時間=余白）**。recovery_core は通常 node を「触るな」。gap の保護は「ここに **add しない**（Complete/Optimize の制約）」で、node 保護とは機構が違う。
  - 解法候補（coordination 要）: (A) Reality に **protected interval（区間保護）** 概念を additive 追加 / (B) gap 隣接の **buffer を recovery_core node 化**（明示的「余白」node）/ (C) Complete/add 生成に「この区間に add しない」制約を渡す。
  - protect_buffer は convergence 前後の node 保護（node 単位）なので mismatch は小さい（dormant だが）。
- **stop 条件**: gap-vs-node が未解決のまま node governance に無理に押し込むと誤保護 → **解決まで実注入しない**。

## 4. adjust / reduce / confirm の blockers（橋渡ししない理由）
- **adjust（leave_earlier→move）**: ①magnitude（Option D に shortfall 無し・full path 必須）②Reality move-mode 未実装（現状 trim-only）③「どの node を / どちらへ」動かす編集判断（end A 早める or start B 遅らせる）。→ full path + Reality move-mode + 編集 UX が揃うまで不可。
- **reduce（reduce_density→Optimize）**: Reality Optimize 未実装 + target 無し（どの予定を droppable とするかは governance 依存）。→ 不可。
- **confirm（confirm_uncertain）**: 予定変更でなく travel 確認タスク。Reality ChangeSet の外（INV-23 tentative/確認の系）。→ Reality bridge の対象外（別の「確認タスク」系で扱う）。

## 5. coordination（Reality in-flight）
- Reality は別セッションが A1-x で活発構築中（main に A1-5-x, A1-6-0）。candidate-generator/evaluator/input-adapter は変化しうる。
- ∴ **直接 import/couple は干渉リスク**。bridge は **authority.ts の安定 enum（recovery_core 等）を doc 参照に留め**、実 RealityInput 注入は Reality セッションとの **coordination 後**。
- coordination 項目: ①protect signal の受け口（RealityInput governance への注入経路 / protected interval 概念の要否）②gap-vs-node の解法選択（§3 A/B/C）③Day Rehearsal の recovery 判定（recoveryStepsFromFeasibilityRaw・slack≥60min）を recovery_core 根拠として採用してよいか。

## 6. GO / NO-GO + 最初の pure layer
- **GO（推奨・限定）**: **protect → 保護シグナル の pure exporter のみ**を first layer に。
  - 案: `lib/plan/dayRehearsal/repairProtectSignal.ts`（仮）— `extractProtectSignals(rehearsal, dispositions) → readonly ProtectSignal[]`。`ProtectSignal = { stepIndex, eventId|null, kind: "recovery_window"|"buffer", basis: "recovery_core", evidence }`。**Reality 非 import・中立 shape・予定変更/apply なし・unwired**。
  - これは「Reality が後で読める保護候補」を **Day Rehearsal 側で純粋に用意**するだけ（注入は coordination 後）。
- **NO-GO**: ①Reality candidate-generator/evaluator/input-adapter への直接 couple（in-flight）②adjust/reduce の ChangeOp 生成（blocked）③RealityInput への実注入（coordination 前）④gap-vs-node 未解決での node governance 改変⑤magnitude 捏造⑥apply/UI/予定変更/full path。
- **最初に実装するなら**: 上記 protect signal exporter **のみ**（pure・unwired・Reality 非 couple）。または **何も実装せず** mapping spec（本書）に留め、Reality セッションと coordination してから（より保守的）。CEO 判断。

## 7. 戦略 + CEO 判断点
- **architecture**: 本 bridge で「Day Rehearsal Repair（診断）→ Reality（governed 変更）」が初めて接続する。最初の接続を **protect（保護・非変更）** にすることで、最適化に寄らず哲学整合を保つ（変更でなく「守る」から始める）。
- **CEO 判断点**:
  1. bridge の first layer を **protect signal exporter（pure・unwired）** で作るか / **mapping spec だけ**に留め Reality coordination を待つか。
  2. gap-vs-node 解法（§3 A=区間保護 / B=余白 node 化 / C=add 制約）のどれを Reality と coordinate するか。
  3. Day Rehearsal の recovery 判定（slack≥60min）を **recovery_core 根拠**として採用してよいか。
  4. adjust/reduce/confirm は **当面橋渡ししない**（full path / Reality mode / 確認系を待つ）で良いか。
  5. Reality セッションとの coordination を**いつ・どの粒度**で行うか（先に spec 合意 → 後で実注入）。
