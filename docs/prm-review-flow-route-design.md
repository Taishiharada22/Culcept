# PRM Review Flow Route + UI — 詳細設計（A1-7-33・**設計のみ・stop gate**）

状態: **設計提出のみ**。実装は CEO 承認 stop gate（review UI/route 実装・PRM persistence 有効化）。前提: M1 live + M2/M3 staging apply 済（A1-7-32）+ M2/M3 write repository ready（A1-7-30・unwired）。

---

## 0. 目的
人間（**まず operator=CEO**）が proposal（candidate）を review し decision（approve/reject/defer）を入れる入口。decision → **M2 insert** → approve なら **M3 entry insert**（review_decision_id FK）。= PRM 本体への唯一入口を稼働させる。

## 1. route: `POST /api/reality/review-decision`（server-only・flag-gated）
- **request**: `{ proposalFingerprint: string, decision: "approve"|"reject"|"defer", reviewer: "operator"|"user" }`。**snapshot は client から受け取らない**（integrity）。
- **flow**:
  1. auth user（owner-RLS）。flag `REALITY_REVIEW_WRITE` OFF → no-op（200・既存不変）。
  2. **server で proposal を再導出**: reader（A1-7-26）→ aggregateDryRunEvents(dedupeSameDay) → projectPrmDryRun → proposals。
  3. `proposalFingerprint` で **candidate proposal** を探す。無 / blocked → fail-closed（accepted=false）。
  4. `validateReview`（A1-7-7）→ toReviewDecisionRecord（A1-7-8・**server snapshot**・reviewedAtISO=route now 注入）。
  5. `reviewDecisionRecordToInsertRow`（A1-7-30）→ M2 repo insert → **id 取得**。
  6. decision=approve なら `approvedReviewToModelEntryRow({reviewDecisionId: id, decision, snapshot})`（A1-7-30）→ M3 repo insert。
  7. redacted response `{ ok, reviewed: true, modelEntry: approve したか }`（raw/seedRef/id を出さない）。
- **integrity の要**: snapshot は **server 再導出**（client 注入を信用しない）。certainty は projection 由来（≤tentative）+ DB CHECK で high 不可能。

## 2. M2→M3 chaining の atomicity（★CEO 判断）
- M2 insert → M3 insert の 2 段。完全 atomic には **Postgres RPC（SECURITY INVOKER・1 tx で M2+M3）** が要る。
- **代替（推奨 v1）**: 逐次（M2 先・M2 が source of truth）+ M3 best-effort。M3 失敗時は **approved M2 から後で再導出**（sweep/retry）可能ゆえ整合は回復できる。M2 が入れば review 事実は確定。
- fail-open: M2/M3 insert 失敗は user action を壊さない（review は best-effort・status は別）。

## 3. UI: review buttons（dev-learning-observation 拡張 or operator dashboard）
- `/plan/dev-learning-observation`（A1-7-28・triple-guard）の **proposal candidate** に approve/reject/defer ボタンを足す（**operator-only・flag-gated**）。
- click → POST /api/reality/review-decision → 結果表示（reviewed / model entry 化）。
- **dev 限定**（triple-guard）。一般ユーザー非表示。

## 4. flag
- `REALITY_REVIEW_WRITE`（server・default OFF・staging only・production hard block）。M1/M2 同パターン。
- UI ボタンは `NEXT_PUBLIC_REALITY_REVIEW_UI`（client・default OFF・dev 限定）。

## 5. 安全契約（全維持）
- **reviewRequired**: M3 は M2 id（review_decision_id FK）経由のみ＝review なしに entry 不能（mapper + DB FK で二重）。
- **certainty no high**: projection ≤tentative + DB CHECK。
- **server 再導出 snapshot**: client が counts/certainty/fingerprint を偽造できない。
- **owner-RLS**: auth user の events/decisions/entries のみ。service_role 禁止。
- **no raw/seedRef/personality**: M2/M3 列 controlled。
- **tendency-not-trait**: tendency_direction のみ。可逆（supersedes/retracted/user_correction）。
- **fail-open / redacted return**。

## 6. 実装最小 slice（CEO 承認後）
1. flag `REALITY_REVIEW_WRITE` 追加（default OFF）。
2. route core（pure-ish testable: 再導出→validate→record→row）+ unit test（fake M2/M3 repo）。
3. route handler（/api/reality/review-decision・auth・flag・M2→M3 repo 配線）。
4. UI buttons（dev-learning-observation・flag-gated）。
5. staging controlled smoke（operator が 1 proposal を approve → M2 1 + M3 1 → cleanup）。

## 7. ★CEO 判断（実装前に確認）
- **(a)** reviewer scope: **operator-only 先行**（推奨・品質確認）か user も即か。
- **(b)** UI: dev-learning-observation 拡張（推奨・既存 dev-preview）か専用 dashboard か。
- **(c)** atomicity: 逐次 best-effort（推奨 v1）か RPC atomic か。
- **(d)** review flow を実装するか（= stop gate を越える判断）。

## 8. しない（次 stop gate）
review UI/route 実装本体（CEO 承認まで）・**第二の自己 surfacing（A1-7-34・実ユーザーに tendency を見せる＝最重要 gate）**・production・PRM user-facing 有効化。
