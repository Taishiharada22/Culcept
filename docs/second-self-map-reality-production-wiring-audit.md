# Reality production wiring audit（read-only・実装しない）

> 2026-06-07 / **read-only 監査 + 次 bundle 判定・実装しない** / main HEAD `46a153e2`（A1-6-4）。Reality セッションが A1-5（capture）/ A1-6（candidate surface/action）で活発進行中。
> 目的: Reality 生成 kernel を将来どこから production 体験に繋げるかを監査し、protectedGaps plumbing を今やるべきか再判定する。

---

## 0. 結論（先に）
- ★**精度補正**: 以前「Reality kernel は完全 unwired」と述べたが**不正確**。正しくは **「candidate SURFACE（read-only preview）は production route に配線済だが flag で二重 dormant + prod block」**。
- **read-only preview の機構は既に存在**（capture surface が morning response に「候補があります」DTO を additive 合成）。だが `REALITY_CAPTURE_SURFACE`（server・default off）+ `realityCaptureSurfaceClient`（client・default off）+ production block で **現在ゼロ露出**。
- **act-on（accept→apply→予定変更）は no-write skeleton・未配線**（A1-6-4 は「将来 route がどう実行するか」の contract のみ・実 DB write なし）。
- ★**protectedGaps plumbing を今やるのは NO-GO（GPT-B 支持・私の独立判定も一致）**。消費先（capture surface の generateComplete）は **存在するが二重 dormant** + Day Rehearsal(client/CalendarTab) → capture surface(server/route) の **cross-context 接続が別途必要** → 今 plumbing を積んでも **両方が揃うまで inert**。
- **最短 live 価値は Day Rehearsal の bridge ではない**。①Reality capture surface の flag 前進（Reality セッション所有）or ②Day Rehearsal-native 体験（banner は既に live）の深化。Repair→Reality bridge は **最も遠い**（capture surface ON + cross-context + refinement の 3 条件待ち）。

## 1. Reality 生成 kernel の production 接続状態（audit）
| 経路 | 状態 |
|---|---|
| **capture SURFACE（read-only preview）** | `app/api/alter-morning/plan/route.ts` → `buildMorningCaptureSurface`（generateComplete 経由）→ `appendCaptureCandidateToMorningResult`。**配線済**。だが `evaluateCaptureGate`（`REALITY_CAPTURE_SURFACE` default off）+ kill switch + **prod/非 staging/非 canary は block** + client flag（`realityCaptureSurfaceClient` default off）→ **二重 dormant・現在ゼロ露出**・fail-open（null→候補付けない） |
| **act-on（accept/dismiss→apply）** | `candidate-action`(A1-6-3 decision) + `candidate-action-executor`(A1-6-4 **no-write skeleton・未配線**)。実 DB write / status update / external_anchor write は **未実装（live GO 別 slice）**。app/ route に **未配線** |
| generateComplete 実 caller | capture surface 経路（flag-gated）+ shadow orchestration（observe-only）。**実体験露出は capture surface flag ON 時のみ** |
| applyChangeSet | **pure simulation のみ**（新 node を返すだけ・persist なし）。実 plan 反映は executor 注入 contract で **未実装** |
- ★誤検出補正: `lib/ui/primaryActionEngine`・`lib/alter-morning/proactiveSuggestions` の `generateCandidates` は **local 関数**（Reality と無関係）。

## 2. read-only preview の可否（CEO Q3/Q4）
- ✅ **apply/save なしの read-only preview は既に出せる**。capture surface DTO は「候補があります」level（status=has_candidate/none・raw/source_ref/UUID drop 済・prose 生成しない・apply なし）。
- ただし **flag dormant**（server+client 両 off + prod block）→ 現状ユーザーには見えない。**flag を canary で前進**すれば read-only preview が live になる（Reality セッション所有のトラック）。

## 3. Day Rehearsal Repair × Reality kernel の最小 live 価値（CEO Q5）
- 既存 capture surface は **seed 駆動**（morning-captured intention → generateComplete fill）。Day Rehearsal Repair は **diagnosis 駆動**（別入力）。両者は同じ kernel を使うが入力が違う。
- protectedGaps の live 価値 = 「capture surface が gap を埋める候補を出すとき、Day Rehearsal が flag した recovery gap を埋めない」= **既存 surface の refinement**。
- ★だが成立条件が 3 つ揃う必要: ①capture surface flag ON（canary）②Day Rehearsal の GapRecoveryAssertion が **server 側 surface 経路に届く**（client CalendarTab → server route の cross-context 接続・非自明）③その日に capture 候補と recovery gap が重なる。→ **今は遠い**。

## 4. protectedGaps plumbing を今やるべきかの再判定（CEO Q6）
- **NO-GO（今やらない）**。理由:
  - 消費先（capture surface の generateComplete CompleteInput）は存在するが **二重 dormant**（flag off）。
  - Day Rehearsal(client) → capture surface(server) の **cross-context 接続が未設計**（rehearsal/dayGraph を server で得る or assertion を server 計算する設計が要る）。
  - → plumbing を積んでも **flag ON + cross-context 接続**が揃うまで inert。**自分で指摘した「inert 在庫を増やす」に該当**。
- **やるべきタイミング**: capture surface が canary 前進 **かつ** Day-Rehearsal→server 接続の設計が決まった時に **まとめて**。

## 5. 次の最小 bundle 案（CEO Q7・honest options）
| 案 | 内容 | live 距離 | 所有 |
|---|---|---|---|
| **A. Reality capture surface flag 前進** | `REALITY_CAPTURE_SURFACE` を staging/canary で ON → read-only「候補があります」preview を live 検証 | **最短**（配線済・flag のみ） | **Reality セッション**（capture path 所有） |
| **B. Day Rehearsal-native 体験の深化** | 既に live な banner（outlook/なぜ?/どうするとよさそう?）の体験を磨く（diagnosis 価値の増分・Reality 不要） | 近い（既に live） | 本系 |
| C. Repair→Reality bridge（protectedGaps 接続） | A+cross-context 接続後にまとめて | **最も遠い**（3 条件待ち） | 本系+Reality coordination |
| D. 別トラックへ pivot | Place Affinity 等（task #1-5）他の本流 | 別軸 | 別 |
- ★**推奨**: 「Reality kernel を live にする」が目的なら **A（Reality セッションと capture surface flag 前進を coordinate）**。「Day Rehearsal の user 価値を増やす」が目的なら **B**。**C（protectedGaps plumbing）は今やらない**。

## 6. GO / NO-GO + CEO 判断点
- **NO-GO（確定）**: GapRecoveryAssertion → protectedGaps pure plumbing（消費先 dormant + cross-context 未設計 → inert 在庫増）。
- **GO 候補（CEO 選択）**: A（capture surface flag 前進・Reality 所有）/ B（Day Rehearsal-native 深化・本系）/ D（pivot）。
- **CEO 判断点**:
  1. 当面の北極星は **「Reality kernel を live 化」**（→A）か **「Day Rehearsal の体験価値増」**（→B）か **別トラック**（→D）か。
  2. A の場合: capture surface flag 前進は **Reality セッション所有**で良いか（本系は観測 coordinate）。
  3. protectedGaps plumbing は **C のタイミング（A 完了 + cross-context 設計後）まで保留**で良いか。
  4. B の場合: Day Rehearsal-native で次に磨く対象（outlook 精度 / full-path 定量 / What-if 再考 等）。
