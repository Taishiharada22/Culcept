# M2 prm_review_decisions — Design + Static Audit（A1-7-27・**migration draft・apply しない**）

対象: `supabase/migrations/20260609120000_create_prm_review_decisions.sql`（A1-7-27・draft）
設計基盤: `docs/prm-persistence-schema-design.md` §3.2（A1-7-5）/ `review-flow-contract.ts`（A1-7-7）/ `review-decision-dry-run.ts`（A1-7-8）
状態: **schema draft + 静的監査のみ**。**apply / db push / local reset はしない**（別 GO・M1 と同じ段階手順）。

---

## A. 役割
人間が proposal（A1-7-3 candidate）を review した **決定（approve/reject/defer）を append-only で永続化**。**PRM model（M3）への唯一の入口**＝review なしに PRM entry は生まれない（reviewRequired の実体）。proposal 自体は派生（events から再導出）ゆえ保存せず、保存するのは「人間が review した」新事実 + 再現用 snapshot。

## B. schema 設計の根拠
- **proposal_fingerprint**（text）= A1-7-7 `proposalFingerprint` = `sourceDimension:sourceValue:dominantAction`。派生 proposal の参照（FK でない・proposal は保存しないため）。
- **decision** CHECK in (approve, reject, defer) = A1-7-7 `ReviewDecisionKind`（契約と一致・§3.2 sketch の過去形は contract に合わせ動詞形に統一）。
- **reviewer** CHECK in (operator, user) = A1-7-7 `ReviewerKind`。
- **snapshot を flat 列**（jsonb 不使用）: source_dimension（CHECK 4 値）/ source_value / dominant_action（CHECK 3 値）/ favored_hypothesis（code）/ still_possible（TEXT[]・code 配列）/ evidence_count / counter_count / certainty。
  - jsonb を避けた理由: jsonb は「任意」を許し raw 混入の余地がある。flat 列なら **CHECK で型/enum/certainty を強制**でき structured-only を構造的に担保。
- **certainty** CHECK in (low, tentative) = **過断定防止の構造的 gate を persistence 層で担保**（high を DB で不可能化）。A1-7-8 snapshot の `certainty: "low"|"tentative"` と一致。
- **effect は列に持たない**: A1-7-7 `decisionEffect(decision)` の純関数で再導出可（events=source 原則・派生は保存しない）。

## C. 過断定防止 5 重 gate（M2 が担う層）
1. **certainty CHECK no high**（本 table・DB 構造）— review 決定の確からしさは最大 tentative。
2. **reviewRequired**: decision は人間が入れる（自動 approve 禁止）。M3 entry は本 table の review_decision を NOT NULL 参照（M3 で担保）。
3. **counter-evidence**: counter_count を snapshot 保持。
4. **stillPossible**: still_possible[] で代替仮説を保持（潰さない）。
5. **tendency-not-trait**: personality/trait 列なし。proposal_fingerprint は傾向の参照。

## D. append-only / RLS / privacy
- **append-only**: SELECT/INSERT/DELETE のみ・**UPDATE policy 不在**＝決定は更新不能（再 review は新 row・latest が有効）。
- **RLS owner-only**（auth.uid()=user_id）・service_role 非前提・cross-user 不可。
- **structured-only**: raw/seedRef/source_ref/発話/personality 列なし。still_possible は code 配列（raw でない）。
- **GDPR**: user 起点 DELETE（owner）+ auth.users CASCADE。

## E. 静的監査（A1-7-12 M1 と同手法）
### E.1 Correctness
- ✅ `CREATE TABLE IF NOT EXISTS`・id uuid pk・user_id FK auth.users ON DELETE CASCADE。
- ✅ CHECK: decision(approve/reject/defer)・reviewer(operator/user)・source_dimension(4)・dominant_action(3)・certainty(low/tentative)・evidence_count/counter_count ≥0。
- ✅ index: (user_id, proposal_fingerprint, reviewed_at DESC)＝fingerprint ごと latest 照会 / (user_id, reviewed_at DESC)＝recency。
- ✅ RLS enabled + SELECT/INSERT/DELETE owner policy・**UPDATE policy なし**。

### E.2 Completeness（A1-7-5/7-7/7-8 整合）
| 要件 | 充足 |
|---|---|
| review 決定 = PRM への唯一入口 | ✅ approve/reject/defer + reviewer・自動禁止 |
| 再現 snapshot | ✅ flat 列で dimension/value/action/favored/stillPossible/counts/certainty |
| certainty high 不可 | ✅ **DB CHECK**（M1 になかった構造 gate を M2 で導入） |
| append-only / owner-only / structured-only | ✅ UPDATE policy 不在・RLS・flat 列 |
| personality/trait なし | ✅ 列なし |

### E.3 Edge cases（**全て非 blocker**）
1. **proposal_fingerprint に unique なし** → **正しい**（append-only・再 review は新 row・latest by reviewed_at）。issue でない。
2. **favored_hypothesis / source_value に enum CHECK なし** → app/contract が controlled code を入れる（enum 化は code 集合と結合するため避ける）。raw でない。**非 blocker**。
3. **reviewed_at 範囲制約なし** → client/operator 由来。app validate。**非 blocker**。
4. **self-poisoning**（user が自分用に偽 review）→ RLS owner-only ゆえ自分の model のみ・cross-user 不可。reviewRequired は「人間（本人/operator）が gate」という設計そのもの（第二の自己はユーザーが所有）。**非 blocker**。
5. **still_possible TEXT[]** → Postgres array・code のみ・empty default '{}'。structured。**非 blocker**。
6. **down は comment**（separate revert file）→ Supabase CLI native down なし。新規 table ゆえ clean DROP（header に revert SQL）。**非 blocker**。

### E.4 Verdict
**M2 SQL は correct / complete / safe**（用途=human review 決定ログ）。finding 6 件は全て非 blocker。**certainty CHECK no high を persistence 層に導入**し過断定防止を強化。**apply 可否は CEO**（実行は別 GO・M1 と同段階手順: local smoke → CEO SQL review → staging apply）。

## F. 次段階（M2 の続き）
- M2 **apply**（local smoke → staging db push）= 別 CEO gate（M1 と同手順）。
- M2 **repository**（review decision の insert adapter・server-only・A1-7-8 ReviewDecisionRecord → insert row mapper）= pure mapper + reader/writer。
- **review UI/route**（人間が proposal を review し decision を入れる）= 別設計。
- M3 **prm_model_entries**（review 済 tendency = 実 PRM・review_decision_id NOT NULL）design。

## G. しない（A1-7-27 の境界）
apply / db push / local reset / migration 編集後の apply / M3 / route / Home / persistence repository 実装 / production / env / remote / PR。
