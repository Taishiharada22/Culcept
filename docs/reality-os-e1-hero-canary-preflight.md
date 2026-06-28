# RO E1 — Hero 体験 1 スライス canary preflight（本番接続前・plan のみ）

**目的**: Reality Judgment Engine（実在・test green・ユーザー体験到達 0%）を、**実予定 1 件 → 成立判定 → 理由 → ユーザー表示**まで、最小 1 canary で貫く。本書は **preflight（接続前の精密プラン）**。コード変更・本番接続・DB・deploy は**まだしない**。

baseline=`922d437f2` / branch=`claude/reality-os-next-on-922d437f2-20260628`。

---

## 0. preflight で判明した構造的ブロッカー 2 点（実コード接地・最重要）

### B-1: 実 anchor の「raw 直読み」は Reality OS privacy 規律で禁止
- 実 anchor read は `createSupabaseExternalAnchorRepository.listAnchors`（`external-anchor-repository-supabase.ts:640`）だが **`select("*")`＝raw（title/location_text 含む）**。
- Reality OS の Stage 4-B-1A 規律（`lib/plan/reality/integration/dev-runtime-adapter.ts`）は明確に：
  - **ALLOWED 列**: `id / start_time / end_time / rigidity / sensitive_category`
  - **FORBIDDEN 列**: `title / location_text / location_category / external_uid / source_id / notes`
  - 「既存 `listAnchors` は raw を読むので**使わない**」「そもそも読まない（column-restricted read）」
- → **私の `RealityOsAssetSourceV0.anchors: ExternalAnchor[]`（raw 型）を engine に流すのは privacy 規律違反**。live provider は **column-restricted DataSource**（Stage 4-B-1A skeleton）経由でなければならない。その skeleton は **「実 Supabase 未接続」**＝実 client 注入は CEO GO 案件。

### B-2: 現 pipeline は proposalTask 中心 → hero の種類で実データ要件が分岐
- `composeRealityOsFixturePipeline` / `assembleRealityOsPipelineInput` は **anchors + proposalTask + current の 3 点を必須**（proposalTask 欠落→fail-closed）。
- つまり現 composer が出すのは **「task 配置 3案（守る/楽/攻める）」hero**。これは**実 task が要る → `canonical_tasks` migration（未適用・DB apply=CEO GO）**。
- 一方 **「成立判定 + leaveBy」hero（anchor 中心）**は task 不要だが、現 composer が直接出さない（最小 anchor-feasibility 経路が要る）。

→ **どちらの hero でも、現状のまま「実データを差すだけ」では出ない。** これが preflight で先に出すべき事実。

---

## 1. 推奨する最小 hero（B-1/B-2 を回避する形）

**「実予定 1 件の成立判定 + 理由」**（leaveBy・3案・場所名は出さない初手）:
- 入力 = **column-restricted の実 anchor**（id/start/end/rigidity のみ・**title/location 読まない**）+ 実 now（instant）。
- 出力 = 「この予定は〔成立/注意/不明〕。理由：前後の予定と時間的に〔余裕/タイト〕。**出発目安は場所・経路が未接続のため出さない（honest-unknown）**」。
- **task なし・3案なし・DB write なし・Maps なし**。feasibility は時刻・rigidity・隣接予定だけで出る。

> 正直な制約: privacy 規律（B-1）ゆえ初手 hero は **「成田のスタバ→9:05 出発」ではなく「時間的成立 + 理由」**。場所名・出発時刻まで出すには (a) 場所列を engine に読む privacy 判断 (b) route ETA(Maps) 接続 が要る＝**別 GO**。

---

## 2. 分類（DB / API / env / write / 外部API / LLM）

| 項目 | 最小 hero（推奨） | 場所/leaveBy 込み hero（後続） | 3案 hero（後続） |
|---|---|---|---|
| DB read | 実 anchor（**column-restricted**） | + 場所列 | + canonical_tasks |
| DB write | **なし** | なし | task 永続=あり |
| migration apply | **なし** | なし | **canonical_tasks 必須** |
| API route | 既存 read 経路の再利用（新規なし） | 同左 | 同左 |
| env / flag | 新 canary flag + 既存 `realityCanaryUserIds` | 同左 | 同左 |
| 外部 API | **なし** | **Maps（route ETA）** | なし |
| LLM | **なし**（理由は presenter の決定的写像） | なし | なし |
| 本番接続 | **要**（実 anchor read=実データ） | 要 | 要 |

→ 最小 hero は **DB write 0・migration 0・外部API 0・LLM 0**。残るのは「実 anchor を read する」一点＝**本番（または canary user）接続**のみ。

---

## 3. flag / guard / rollback / smoke（canary 必須要件）

- **flag**: 新 `REALITY_OS_HERO_CANARY`（server-only・default OFF）∧ 既存 `realityCanaryUserIds`（auth UUID allowlist）。両方該当時のみ実 read。
- **接続先 guard**: `realityWriteConnectionGuard` と同型の **read guard**（staging/canary ref のみ許可・production ref 構造 deny の二重防御）を read 経路にも適用。
- **column guard**: ALLOWED 列以外を SELECT に含めない（Stage 4-B-1A の allowlist を実 client に適用）。raw を**読まない**。
- **rollback**: `REALITY_OS_HERO_CANARY=false` で即時・完全に従来へ（read のみ＝データ変更なし）。
- **smoke**: canary 1 user で「実予定 1 件→成立+理由が出る／flag OFF で完全非表示／他 user に出ない／raw 列が surface に出ない」を手動確認（CEO 環境・私は authed 実機不可）。

---

## 4. STOP 条件 / production-GO ライン

- **本セッションで止める線**: 実 Supabase client を column-restricted DataSource に注入する瞬間＝**実データ read 開始＝本番接続**。ここは **CEO GO 必須**（このセッションの no-production 制約に抵触）。
- preflight が本セッションで安全に積めるもの（GO 後の実装を trivial にする readiness・flag OFF）:
  1. **新 flag `REALITY_OS_HERO_CANARY`**（default OFF・dormant）
  2. **read 用 connection guard**（pure・staging/canary 許可・production deny）+ unit test
  3. **column-restricted 実 anchor → RealityJudgmentInput の最小 composer**（mock client で test・実 client は注入点だけ用意）
  4. **surface の fixture→live 分岐**（flag OFF=従来 fixture・ON+canary=live composer。実 client 注入は GO 後）
- **GO 後（別承認）**: 実 Supabase client 注入 / canary user 指定 / smoke / 段階拡大。

---

## 5. CEO 判断が要る点（preflight 出力）

1. **privacy スコープ**: 初手 hero を **column-restricted（場所名なし・時間的成立のみ）**で始めるか、最初から**場所列を engine に読む**（B-1 を緩める privacy 判断）か。
2. **hero の種類**: 最小（成立+理由）か、leaveBy 込み（Maps 接続要）か、3案（canonical_tasks DB apply 要）か。
3. **本セッションの範囲**: preflight が積む §4-1..4 の **flag-OFF readiness（実 read なし）までを本セッションで実装**してよいか、それとも preflight プランの確定（docs）のみで止めるか。
