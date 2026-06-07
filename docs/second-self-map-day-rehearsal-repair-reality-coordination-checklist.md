# Day Rehearsal Repair → Reality Control OS — coordination checklist（実装前合意事項）

> 2026-06-07 / **checklist のみ・実装しない** / 前提: protect signal v0（`exportRepairProtectSignals`）main live（`a8fe73a7`・pure・unwired・Reality 非接続）。Reality Control OS（`lib/plan/reality/`）は別セッション A1-x 活発進行中。
> 目的: protect signal を Reality `recovery_core` 保護に**実注入する前**に、Reality セッションと合意・検証すべき項目を列挙する。各項目は ☐（未合意）。

---

## 0. 前提（現状）
- Day Rehearsal 側: protect signal v0 完成（pure・候補生成のみ・`{kind, targetStepIndex, protectionHint:"recovery_core", evidence}`）。**Reality に渡していない**。
- Reality 側: governance は `RealityInput.anchors[].governance.protectionReasons`（per-node 入力）。candidate-generator が recovery_core を「保全＝決して触れない」に分類・evaluator が recovery_core を触る変更を reject。move/Optimize は別 slice（現状 trim-only）。
- ★両者はまだ**疎結合**（Day Rehearsal は Reality を import しない）。

## A. インターフェース安定性（依存可否）
- ☐ A1. 依存してよい Reality の **安定 API** はどれか（`authority.ts` の enum=recovery_core 等は不可侵正本＝安定。`input-adapter`/`candidate-generator`/`candidate-evaluator` は A1-x で変化中＝不安定）。
- ☐ A2. protect signal を受ける **注入経路の API** を Reality 側が安定提供できるか（いつ freeze するか）。
- ☐ A3. どちらのセッションが **bridge コードを所有**するか（Day Rehearsal 側 exporter / Reality 側 importer / 中間 adapter）。

## B. 注入経路（per-node governance vs gap）— ★最重要
- ☐ B1. protect signal を **RealityInput.governance.protectionReasons に注入**する経路を確定（per-node 入力に recovery_core を足す形か）。
- ☐ B2. ★**gap-vs-node mismatch の解法選択**（bridge mini design §3）:
  - (A) Reality に **protected interval（区間保護）** 概念を additive 追加（gap を直接保護）。
  - (B) gap 隣接の **余白を recovery_core node 化**（明示「余白」node を作る）。
  - (C) Complete/add 生成に「**この区間に add しない**」制約を渡す（gap を埋めさせない）。
  - → use_recovery_window=gap なので A or C 寄り。protect_buffer=node 前後なので per-node 寄り（ただし dormant）。
- ☐ B3. targetStepIndex → **eventId/区間の解決責任**はどちら側か（Day Rehearsal は rehearsal[step].eventId を持つ／Reality は実 node を持つ）。解決タイミング（exporter で解決 or importer で解決）。

## C. recovery_core 適格性（意味論）
- ☐ C1. Day Rehearsal の recovery 判定（`recoveryStepsFromFeasibilityRaw`・**slack≥60min**）を **recovery_core の根拠**として採用してよいか。
- ☐ C2. 60min+ gap は **自動で recovery_core** か、それとも user_declared / 行動パターン由来の裏付けが要るか（recovery_core 定義=「その人固有の回復核」＝個人差あり）。誤保護リスクの許容度。
- ☐ C3. protect_buffer の hint は v0 で recovery_core だが、意味的には **cascade_guard** 寄り。Reality 側で区別したいか（dormant なので当面は問題小）。

## D. 競合・権限（conflict）
- ☐ D1. Day Rehearsal「この gap を守れ」と Reality「この node は droppable」が衝突した場合の**優先順位**（PROTECTION_PRIORITY: hard_external>user_declared>recovery_core>cascade_guard>tentative）。Day Rehearsal 由来の recovery_core は user_declared より弱い扱いで良いか。
- ☐ D2. protect signal は **additive・restrict only**（Reality が触る範囲を狭めるのみ）であることを確認＝**fail-safe**（過保護はあっても、誤って動かす方向には働かない）。これを不変条件として合意。
- ☐ D3. 過保護（守りすぎて Repair/Optimize が何もできない）の検出・上限をどうするか。

## E. 安全・検証（safety / validation）
- ☐ E1. bridge は **flag 裏 + canary**（default OFF）で段階導入するか。
- ☐ E2. 注入後の Reality 挙動（candidate-generator の preserved 集合が増える）を **回帰検証**する手順（Reality 側テスト + 統合テスト）。
- ☐ E3. Day Rehearsal 側 protect signal の変化が Reality を壊さないことの **契約テスト**（signal shape 固定・additive）。
- ☐ E4. read-only 原則の維持（実 persist は別 CEO 判断・この bridge は governance 入力までで apply しない）。

## F. 段取り（sequencing）
- ☐ F1. 合意順序: **spec 合意（本 checklist）→ 注入経路 API 確定（B）→ gap-vs-node 解法（B2）→ flag 裏で実注入（E1）→ canary 検証（E2）→ GO**。
- ☐ F2. adjust(move)/reduce(optimize) bridge は **本 protect bridge とは別 slice**（full path[magnitude] + Reality move/optimize mode 実装後）。本 checklist の対象外。
- ☐ F3. confirm(confirm_uncertain) は Reality 領域外（確認タスク系）＝本 checklist の対象外。

## G. CEO 判断点（coordination 開始前）
1. Reality セッションとの coordination を **いつ開始**するか（Reality interface が A1-x で安定してから / 並行で spec 合意を先行）。
2. bridge コードの **所有**（Day Rehearsal / Reality / 中間）。
3. gap-vs-node 解法の **方向性**（A 区間保護 / B 余白 node 化 / C add 制約）の初期選好。
4. recovery_core 適格性（slack≥60min を根拠に採用してよいか・誤保護許容度）。
5. 本 bridge を **protect のみ**に限定し、adjust/reduce/confirm は別 slice に切るで良いか。

---
**状態**: checklist 提出で停止。実注入・gap-vs-node 解決・Reality coordination 開始は CEO GO 後。
