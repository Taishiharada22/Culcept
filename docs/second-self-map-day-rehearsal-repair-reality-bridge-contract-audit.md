# Day Rehearsal Repair → Reality — Bridge Contract Audit（read-only・実装しない）

> 2026-06-07 / **read-only 監査 + contract 設計・実装しない** / 前提: protect signal v0 main live（`a8fe73a7`・pure・unwired）。Reality Control OS は別セッション A1-x 進行中。
> 目的: protect signal を Reality に将来どう渡すかの **contract を確定**（gap-vs-node を決める）。実注入はしない。

---

## 0. 結論（先に）— ★前回 mini design を補正する重大 finding
- **正しい対応先は node `recovery_core` ではなく gap-meaning `recovery`（INV-17）**。Reality は **GapNode を明示モデル化**し、**gap-meaning（「空白は埋めない・意味づけする」）**を持つ。use_recovery_window は **回復 gap** ⇒ gap-meaning `recovery`/`free_time` に **1:1 対応**。
- ★**recovery_core(node) は use_recovery_window の目的を達成しない**: evaluator の `recoveryProtected` は **node recovery_core の remove/update のみ**を弾き、**`add は recovery を cut しない`（add でgapを埋めるのは無害扱い）**と明記。use_recovery_window の本質「この gap を埋めるな」は add 抑止であり、recovery_core では効かない。→ **landed protect signal の `protectionHint:"recovery_core"` は誤り**（要・将来補正）。
- **gap-vs-node 推奨 = A（gap-level・GapNode の gap-meaning `recovery`）**。B（余白 node 化=recovery_core）は誤機構 + phantom（INV-4 緊張）。C（add-constraint bolt-on）は gap-meaning と重複。
- **共有キー = GapNode id**（Day Rehearsal も Reality も同一 DayGraph を読む）。
- ★**ブロッカー: gap-meaning は未 enforce**（classifyGap は contract・generator/evaluator/complete に未配線）。∴ contract は確定できるが **実保護は Reality 側の INV-17 enforcement 配線が前提**。
- **GO（限定）**: contract 確定（本書）+ 任意で pure adapter（protect signal + dayGraph → GapNode 参照の recovery assertion・**Reality 非接続**）。**NO-GO**: 実注入（enforcement 未配線 + coordination 前）。

## 1. Reality 現状 audit（read-only）
- **node モデル**: `RealityInput = { mode, dayNodes: DayNode[], anchors: Record<id, AnchorInput>, seedTraces }`。`DayNode = { id, startMin, endMin, importance, hard }`（EventNode 由来）。governance（origin/authority/flexibility/protectionReasons）は **per-anchor**（AnchorInput）で candidate-generator が dayNode と join。
- **gap モデル**: DayGraph に `GapNode`（kind:"gap"）が存在。`gapNodeToGapInput(gapNode, ctx) → GapInput`・`classifyGap(GapInput) → GapMeaning`（`recovery`/`free_time`/`travel_buffer`/`meal`/… ＝ INV-17「空白は埋めない・意味づけ」）。
- **enforcement 現状**:
  - candidate-generator: **trim-only（A1-3）+ Complete（A1-4）**。move/cascade/remove/Optimize は **未実装（別 slice）**。preserved=immovable ∪ recovery_core（決して触れない）。
  - candidate-evaluator: `recoveryProtected` = **remove/update が node recovery_core を触れば false→reject**。**add は recovery を cut しない（=add は無害扱い）**。
  - complete-generator: `freeGaps(region, busy)` で busy(既存 node)を除いた空きに add。**gap-meaning を見ていない**。
  - ★**classifyGap（gap-meaning）は generator/evaluator/complete に未配線**＝「live 実装前の契約」。
- ∴ 現状 enforce されている保護は **node recovery_core の remove/update 抑止のみ**。**gap を埋めない保護（INV-17）は未 enforce**。

## 2. 安定性確認（依存可否）
| 対象 | 安定性 | 依存可否 |
|---|---|---|
| `authority.ts` enum（recovery_core, flexibility 等） | 不可侵正本・安定 | doc 参照可 |
| `gap-meaning.ts`（GapMeaning 型・classifyGap） | 型は安定・**enforcement は未配線** | 型参照可・enforce 依存は不可（pending） |
| `DayGraph GapNode`（kind:"gap"・共有エンティティ） | 既存・安定 | **共有キーとして可** |
| `RealityInput`/`input-adapter`/`candidate-generator`/`evaluator` | **A1-x で in-flight** | code couple 不可（変化中） |

## 3. targetStepIndex → Reality 対応の整理
- Day Rehearsal: use_recovery_window の `targetStepIndex = i` = **event[i] の後の gap**（transition slack）。Day Rehearsal は events のみ filter（gap は時刻から暗黙計算）。
- Reality: 同一 DayGraph の **GapNode**（event[i] と event[i+1] の間）。
- ∴ **targetStepIndex i → DayGraph 上で event[i] の次の GapNode** に解決可能（両者が同じ DayGraph を共有）。**GapNode id = 共有キー**。解決は dayGraph を持つ側（Day Rehearsal）で行うのが自然。
- protect_buffer（dormant）= convergence の node 前後 → node 寄り（当面 Option D 不到達ゆえ defer）。

## 4. gap-vs-node 案の比較（grounded）
| 案 | 機構 | enforce 現状 | 評価 |
|---|---|---|---|
| **A: gap-level（GapNode の gap-meaning `recovery`）** | 既存 GapNode + gap-meaning（INV-17「埋めない」） | ★未配線（Reality が wiring 要） | ✅ **推奨**。意味的に正確（gap=gap）・既存概念・add 抑止が本質と一致 |
| B: 余白 node 化（recovery_core node） | node governance recovery_core | enforce 済だが **add 無害扱い** | ✗ 誤機構（recovery_core は remove/move 抑止・add でgap埋めるのを止めない）+ phantom node（INV-4 緊張） |
| C: add-constraint bolt-on（busy 注入） | complete の freeGaps busy に gap 追加 | 即時可だが局所 | △ gap-meaning と重複・将来 move/optimize に未対応。INV-17 の正道を迂回 |

- ★**A が最小で安全**: 新概念を作らず Reality 既存の GapNode + gap-meaning（INV-17）に乗る。recovery_core(B) は機構違い（add 無害）で目的不達。C は INV-17 の重複実装で技術的負債。
- 注: A は **Reality の gap-meaning enforcement 配線**（classifyGap 出力で complete add + 将来 move/optimize を gate）が前提。これは Reality 側の作業（coordination）。

## 5. protect signal → Reality input 対応表（contract 案）
| Day Rehearsal protect signal | → Reality | キー | enforce 主体 |
|---|---|---|---|
| use_recovery_window（targetStepIndex=i） | **GapNode（event[i] の次）の gap-meaning = `recovery`/`free_time`** | GapNode id（共有 DayGraph） | Reality（INV-17 gap-meaning 配線・pending） |
| protect_buffer（dormant） | （当面なし）convergence node 前後の保護は別途・Option D 不到達 | — | defer |
| evidence | gap-meaning assertion の trace（sourceTrace 相当・INV-4 No-Phantom 満たす） | — | — |
- ★contract 不変条件: **restrict-only / additive / reversible**（gap を「残す」方向のみ・Reality が触る範囲を狭めるだけ＝fail-safe）。

## 6. 実装するなら最初の pure adapter 案（GO 時のみ・今は実装しない）
- Day Rehearsal 側 pure adapter（Reality 非接続）:
  - `resolveProtectSignalsToGapMeaning(signals, dayGraph) → readonly GapRecoveryAssertion[]`
  - `GapRecoveryAssertion = { gapNodeId: string, meaning: "recovery", evidence }`（targetStepIndex → dayGraph 上の GapNode id に解決・use_recovery_window のみ）。
  - ★これは v0 protect signal（candidate-only）に **dayGraph を足す**新層（GapNode 解決に必要）。pure・unwired・Reality 非 import・neutral shape。Reality は後で gap-meaning enforcement で消費（their work）。
- ★landed protect signal の **`protectionHint:"recovery_core"` → `"recovery"`（gap-meaning）への補正**を、この adapter 実装時に同時に行う（surgical・1 リテラル + 型）。

## 7. GO / NO-GO 判断点
- **GO（契約確定・推奨）**: 本 audit で contract = 「use_recovery_window → GapNode gap-meaning `recovery`（共有 GapNode id・restrict-only）」を確定。
- **GO（任意・限定）**: Day Rehearsal 側 pure adapter（§6・dayGraph で GapNode 解決・Reality 非接続）+ protectionHint 補正（recovery_core→recovery）。
- **NO-GO**: ①実注入（Reality gap-meaning enforcement が未配線・coordination 前）②recovery_core(node) 経路（誤機構）③add-constraint bolt-on（INV-17 重複）④Reality code への couple（in-flight）⑤protect_buffer の橋渡し（dormant）⑥adjust/reduce（full path/mode 待ち）。
- **CEO 判断点**:
  1. contract を **A（gap-meaning `recovery`・GapNode 共有キー）** で確定して良いか。
  2. landed protect signal の hint を **recovery_core → recovery に補正**するか（次の小 slice）。
  3. pure adapter（dayGraph で GapNode 解決）を**今 作る**か / contract 確定だけに留め Reality enforcement を待つか。
  4. Reality 側の **gap-meaning enforcement（INV-17 配線）** を Reality セッションへ依頼する時期。
