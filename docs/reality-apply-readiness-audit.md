# Reality Control OS — Apply Readiness Deep Audit / Preview Operation Hardening

> 2026-06-09 / Build Unit / CEO 指示「R5-4 apply / PlanClient / notification / production へ進む前に、dev preview で見えている envelope が apply 判断に耐えるかを監査し、preview 運用の安全性を固定する」。
> **read-only / docs / tests / source-contract のみ**。apply / write / PlanClient / route write / DB write / notification / production には一切踏み込まない。
> 監査対象 commit: P-A `d96fa482` / P-B/P-C `ef63f045` / P-E `aecceead`。本監査の hardening commit は本 doc 末尾に追記。

---

## 0. 結論（先に）

- **Preview 運用は安全に固定できる**（guard 全分岐 + redaction + no-write を test/source-contract で恒久ロック）。
- **しかし現在の ChangeSet draft は「そのまま apply」には足りない**。draft は *観測用候補*であり、apply 取引ではない。最低 7 条件（§3）を満たすまで apply に進めてはならない。
- **最重要発見**: envelope の `permission.verdict = allowed` は **`propose`（提案）の許可**であって **apply（plan 書き込み）の許可ではない**。apply は別 ActionKind（`draft`/`adjust_plan`）で **再評価必須**。level 2 では apply 相当は allowed にならない（test で証明）。
- **hardening 実施**: envelope の `changeSetDraft` を **opCount のみ**に型レベルで固定（draft id を client へ渡さない）。no-apply / 不変条件 / permission 再評価を pure test で固定。

---

## 1. Preview guard audit（✅ 固定済み）

| 監査項目 | 実装 | 固定 test |
|---|---|---|
| flag OFF で読まない | `page.tsx`: `if (!PLAN_FLAGS.realityPipelinePreview) return <Disabled/>`（read/run しない） | realityPipelinePreviewPage（flag gate 配線）+ P-E smoke |
| non-operator で読まない | `if (!user) return <Disabled/>`（`auth.getUser()` で user 無→停止） | 同上（auth gate 配線）+ P-E smoke |
| production で notFound | host 三重ガード `isCandidateActionsPreviewHostAllowed`（production ref deny→`notFound()`） | guard 三重 test + P-E smoke（production URL→false） |
| service_role 不使用 | `supabaseServer()`（anon+auth client・owner-RLS） | source-contract（service_role 不在）+ P-E（anon key に service_role 混入→fatal） |
| host allowlist / production deny | staging `hjcrvndumgiovyfdacwc` allowlist ∧ production `aljav…` deny | guard test（staging→true / prod→false / dormant→false） |
| route 内 write path 0 | page に insert/update/delete/upsert/apply/seed/PlanClient なし | source-contract（page 実コード）+ realityApplyReadiness ② |

→ **Preview guard は green**。flag は server default OFF（`REALITY_PIPELINE_PREVIEW` 未設定で dormant）・NEXT_PUBLIC なし・production hard block。

## 2. Envelope contract audit（✅ 固定済み・hardening 反映）

- **client へ渡るのは `RealityPipelineEnvelope`（redacted summary）+ numeric `meta`（4 count）のみ**。MemoryItem / WorldState / 生 row / full ChangeSet は渡さない（page source-contract で固定）。
- **redaction**: envelope は構造的に raw を持たない（recommended=tier+分量+strain / reasoning=fits+confidence / trigger=kind+template headline / permission=verdict+risk+短文 reason）。P-E real staging で `FORBIDDEN`（seedRef/utterance/personality/title/location/PII）不一致を実データ確認済み。
- **trigger headline は template 固定文**（`trigger-content.ts`：「そろそろ次の予定の準備を始められます」等）。raw を埋め込まない。
- **★ hardening**: `changeSetDraft` を従来 `{ id, opCount }` → **`{ opCount }`** に変更。
  - 理由: draft id（`draft:emptyday:{date}:{tier}`）は date+tier＝既に `envelope.date` / `recommended.tier` に存在する冗長値。client へ draft identity を渡す必要がない（CEO 契約「ChangeSet は opCount のみ」に literally 適合）。
  - 実 apply 用の draft identity / baseVersion は **観測 envelope と別経路**で carry する前提（§5 next gate）。
  - 反映: `reality-pipeline.ts`（型 + 構築）/ unit 2 件 / P-D fixture / shadow script 5 件の assertion を opCount-only に更新。
- **meta** は number のみ（hardConstraints / availableWindows / usableContexts / memoryItem の count）。実体非搬送。
- **apply button なし**: client は presentational（`<button>` / fetch / onClick / useState なし）。P-D source-contract で固定。

## 3. Apply readiness audit（⚠️ 現状では apply 不可・不足条件あり）

### 現在の ChangeSet draft が持つもの（`proposalToChangeSetDraft`）
- ✅ deterministic id + itemId（`draft:emptyday:{date}:{tier}:{startMin}`・Date.now/random なし）
- ✅ **add の draft のみ**（remove/update を作らない）→ 既存予定を壊さない
- ✅ governance = **proposed / droppable / tentative**（未確定の候補）
- ✅ after snapshot に startMin/endMin → `validateUndoability` = ok（add は復元可）
- ✅ `changeSetRequiresConfirmation` = false（immovable/hard_external を触らない）
- ✅ reason 文字列

### 実 apply に不足しているもの（ギャップ）
| # | ギャップ | 影響 | 必要対応 |
|---|---|---|---|
| G1 | `sourceTraces` が **空配列** | INV-24 reversibility の provenance（なぜこの変更か）が無い | apply 時に source trace を注入（観測根拠 → change-set 監査証跡） |
| G2 | itemId が **synthetic（`draft:` prefix）** | real plan item / calendar の id でない | apply 時に real id を mint し、draft→real を map（undo 可逆性を保ったまま） |
| G3 | **baseVersion / computedAtMs / worldStateHash が無い** | preview と apply の間に schedule が変わると **stale apply / conflict** | apply 入力に「draft が前提とした WorldState の版」を持たせ、apply 直前に **再取得して一致検証**（stale なら中止） |
| G4 | **idempotency ledger が無い** | 同じ draft の二重 apply で重複追加 | deterministic id を applied-set と照合（既適用なら no-op） |
| G5 | **live conflict 再チェックが無い** | 提案窓が apply 時には埋まっている可能性 | apply 直前に live schedule を再取得し、対象 window が空きか検証 |
| G6 | **permission が `propose` 基準** | envelope の allowed は提案許可（§4） | apply の ActionKind（`draft`/`adjust_plan`）+ 実 flags + 実 level で **再評価** |
| G7 | **user confirmation 経路が無い** | verdict=confirm_required の取り扱い未定義 | apply UI で明示確認を取得（高リスク/immovable は必ず確認） |

### allowed verdict でも即 apply してよいか → **NO**
- envelope の `verdict=allowed` は **`propose`@level の許可**。apply（plan write）は別 action。
- 実装証明（test）: `evaluatePermission(propose, level2)=allowed` だが `evaluatePermission(adjust_plan, level2)≠allowed` / `evaluatePermission(draft, level2)≠allowed`。
- たとえ apply を再評価して allowed でも、**G3 stale / G5 conflict / undoability / G4 idempotency が全て pass して初めて apply 可**。

### high risk / insufficient context / hard external の扱い
- **high risk**（book/purchase/contact/long_travel、または high-risk flag）→ level に関わらず **allowed にしない**（confirm_required か blocked）。test 固定。
- **insufficient context**（readiness=insufficient）→ `insufficient_context`・recommended=null・**捏造して進めない**。
- **hard_external / immovable**（他人/予約/支払い/外部固定）→ `adjust_plan` は **blocked**。draft はそもそもこれらに触れない（add only）が、apply の conflict 再チェックで対象窓に hard_external が無いことを確認。

## 4. Preview operation policy（運用方針）

- **flag 運用**: `REALITY_PIPELINE_PREVIEW` は **dev/staging host でのみ ON**。production は host 三重ガードで構造的に notFound（flag ON でも production では表示不可）。常用する場合も **operator-only**・read-only に限定。
- **誰が見られるか**: host 三重ガード（dev host flag + staging allowlist + production deny）∧ operator auth（owner-RLS で自分のデータのみ）。一般 user は不可（dev host flag 未設定で dormant）。
- **seed 方針**: preview 自体は **seed しない**（既存データを read するのみ）。seeded smoke が要る場合は **別 GO**（controlled seed → cleanup → count 0）。
- **logs に出してよいもの**: count（hardConstraints/windows/memory items/usableContexts）・readiness・tier・verdict・risk・opCount・trigger kind。**出してはいけないもの**: raw row / title / location / seedRef / utterance / personality / PII / MemoryItem 実体 / full ChangeSet payload。shadow script は `FORBIDDEN` 正規表現で自己検査。
- **preview から apply へ絶対進ませない制約**: client は presentational（button/fetch/onClick/useState なし）・apply button 不在（P-D test）・page に write/apply/PlanClient 不在（source-contract）・envelope は opCount のみ（draft identity を渡さない）。**preview には apply への導線が構造的に存在しない**。

## 5. Next gate design（次に開くべき gate と最小 slice）

### R5-4 apply に進む場合の最小 slice（CEO gate・**pure 先行**）
1. **A-1 apply precondition checker（pure・no-write）**: `(draft, liveWorldState, level, flags) → { canApply, blockers[] }`。G3 stale / G5 conflict / G6 permission 再評価 / undoability / G4 idempotency / G7 confirmation を 1 関数で判定。**apply しない**（判定のみ）。fake で全 test。
2. **A-2 draft→real id mint + sourceTrace 注入（pure）**: G1/G2 を解消する pure mapper（synthetic draft → real-id ChangeSet + provenance）。**書かない**。
3. **A-3 apply transaction design（docs）**: 取引境界・undo entry 生成・idempotency ledger・rollback。route/DB write は **この後の別 gate**。
4. **A-4 server apply writer（server-only・要 CEO write gate）**: 初めて DB write が登場する gate。owner-RLS・single change-set・undo entry 同時生成・post-write 検証。

### PlanClient 接続に進む場合の最小 slice（別 gate）
- preview は接続しない。実 plan 本線接続は **apply writer（A-4）成立後**に、PlanClient 側の read-only 表示 → 1-tap confirm（user_owned 確定）の順で段階化。preview route とは別系統。

### notification / native に進む場合の stop 条件（進まない条件）
- 当日 live trigger（departure/linger/off_route）は **live GPS 依存＝未実装**。native/notification は **apply writer + user confirmation + 撤退判断**が固まるまで stop。silence-by-default を崩さない。

### production 公開までに必要な段階
1. apply precondition checker（A-1）green → 2. id mint + provenance（A-2）→ 3. apply writer（A-4・CEO write gate）+ undo + idempotency → 4. user confirmation UI（confirm_required 経路）→ 5. staging で apply→undo の閉ループ smoke → 6. operator dogfood → 7. 段階的 flag rollout（canary）→ 8. CEO production 承認。**各段は個別 CEO gate**。

---

## 6. Hardening 実施内容（本監査で変更）

- `lib/plan/reality/orchestration/reality-pipeline.ts`: `changeSetDraft` 型 + 構築を **opCount-only** に（draft id を client へ渡さない）。
- `tests/unit/reality/realityApplyReadiness.test.ts`（新・17 test）: envelope contract（opCount のみ・`@ts-expect-error` で id 不可）/ no-apply guarantee（add draft のみ・governance proposed・source-contract no-write）/ 不変条件（undoability ok・confirmation false・G1 sourceTraces 空・G2 synthetic id を lock）/ permission 再評価（propose allowed ≠ adjust_plan/draft allowed・high risk 非 allowed・insufficient_context・immovable blocked）。
- `tests/unit/reality/realityPipelineSmoke.test.ts` / `realityPipelinePreviewRender.test.tsx`: changeSetDraft 期待値を opCount-only に更新。
- `scripts/reality-*-shadow.ts` / `reality-pipeline-preview-smoke.ts`（5 件）: assertion を opCount-only に更新。

→ **本監査の green 条件**: preview guard 固定（§1）+ envelope opCount-only（§2）+ no-apply guarantee（§3 test）+ permission 再評価証明（§4）。**全て green。** apply（R5-4）は §3 の G1–G7 を満たすまで進めない。

---

## 7. A-1 Apply Precondition Checker 実装（2026-06-09・pure / no-write）

`lib/plan/reality/permission/apply-precondition.ts`：`evaluateApplyPrecondition(input) → result`。**判定のみ・書かない・適用しない**。

### 出力契約
```ts
{
  canApply: boolean;            // verdict === "can_apply"
  verdict: "can_apply" | "confirm_required" | "blocked" | "stale" | "conflict" | "insufficient_context";
  blockers: string[];           // 安定コード（redacted）
  warnings: string[];           // 非ブロック注意（redacted）
  requiredConfirmation?: boolean;
}
```
verdict 優先順位（単一）: **insufficient_context > stale > conflict > blocked > confirm_required > can_apply**。
- `stale`/`conflict` は「draft が現実から外れた」状態（canApply=false）。CEO の「stale→blocked / conflict→blocked」は *blocking（apply 不可）* の意で、本実装は union に従い **具体 verdict** を返す（より情報量が多い）。

### blocker コード一覧（redacted・raw 非搬送）
| コード | 意味 | 由来 |
|---|---|---|
| `missing_freshness_inputs` | baseVersion/computedAtMs/nowMs 欠落 → stale 判定不能 | insufficient_context |
| `missing_idempotency_snapshot` | applied-set snapshot 欠落 → 二重 apply 判定不能 | insufficient_context |
| `live_context_insufficient` | live readiness=insufficient（窓なし等） | insufficient_context |
| `stale_base_version` | draft 生成時 signature ≠ live signature | stale |
| `stale_draft_age` | nowMs − computedAtMs > 15 分 | stale |
| `conflict_window_occupied` | 対象 window が固定予定と重なる / 窓が消えた | conflict |
| `conflict_immovable` | 重なった予定が hard_external（最強保護） | conflict |
| `permission_blocked` | **apply ActionKind で再評価**して blocked | blocked |
| `undo_incomplete` | validateUndoability=false（復元不能） | blocked |
| `provenance_missing` | sourceTraces 空（G1） | blocked |
| `already_applied` | draft.id が applied-set に存在（G4） | blocked |

### 判定の要点（G1–G7 対応）
- **G6 permission 再評価**: `evaluatePermission({ action: applyAction, ... })`（**propose ではない**）。高リスクは **never auto can_apply**（confirm_required・confirmed でも A-1 は自動承認しない）。
- **G3 stale**: `worldStateApplySignature`（schedule/windows/date のみ・**label/title 非搬送**）で base ↔ live を照合 + age。
- **G5 conflict**: add 対象が live 固定予定と重なる / available window に収まらない。
- **G7 confirmation**: confirm_required / 高リスク / 確認 flag（他人/予約/購入/個人情報/連絡）/ immovable 衝突 → 未確認は confirm_required。
- **idempotency ledger は未実装**（CEO 指示）。snapshot interface で判定だけ。

## 8. A-2 設計提案（draft → real id mint + sourceTrace 注入・pure / no-write）

A-1 が「apply 可能か」を判定したが、現 draft は **synthetic itemId（G2）+ sourceTraces 空（G1）** のため、apply 可能判定を通しても **書ける形になっていない**。A-2 は**書かずに**この 2 ギャップを埋める pure mapper。

- **目的**: `(draft, idMintPort, provenance) → ChangeSet`（real-id 化 + provenance 付き）。**DB/route/PlanClient 非接触**。
- **id mint**: `draft:emptyday:{date}:{tier}:{startMin}` → real plan item id。**port 注入**（`mintId(): string`）で pure に保つ（実 id 採番は server-only port・A-2 では fake）。draft→real の **対応表**を返し、undo 可逆性（invertChangeSet）を保つ。
- **sourceTrace 注入**: 観測根拠（どの memory/anchor/PRM から組んだか）を `SourceTrace[]`（kind=prm/anchor/environment・ref 付き・**raw/PII なし**）で付与。`isAuditableTrace`（INV-23）を満たすこと。
- **A-2 を開く条件**: ① A-1 が green（本 commit 達成）② id mint は **port 注入で pure**（実採番は後続 server gate）③ provenance は **既存観測 id を参照するだけ**（新規 PII を作らない）④ 出力は依然 **draft（apply しない）**。
- **A-2 でも踏み込まない**: 実 id 採番の DB 採番 / route / PlanClient / apply / write。これらは **A-4 server apply writer = hard gate**。

→ **A-4 server apply writer は依然 hard gate**（初の DB write・CEO write gate）。A-1（判定）→ A-2（pure 整形）までは write ゼロで前進可能だが、A-3 transaction design を挟んでから A-4 に CEO 承認を取る。
