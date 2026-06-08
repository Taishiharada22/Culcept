# Later / Deferred Learning Event Policy（A1-7-18・**pure helper + tests + docs**）

設計: `docs/prm-learning-event-insert-path-design.md`（A1-7-13）/ `lib/plan/reality/learning/dry-run-learning-event.ts`（A1-7-0）/ §10.17（route connection）/ §10.18
状態: **pure policy helper + tests + 本 docs のみ**。**glue/route 変更・DB apply・Supabase apply・env・flag ON・remote・production・M2/M3 は一切しない**（route 変更は §6 で design-only 提出）。

> A1-7-17 の v1 は「status transition 成功後のみ」ゆえ **later(deferred) を learning event 非対象**にしていた。A1-7 の目的（accept/dismiss/**later** を学習素材化）に対し不整合。DB apply 前に later の意味論を確定する。

---

## 1. later を保存すべきか — **結論: 保存する**
**保存しない場合の理由（検討した上で却下）**: later は最弱証拠（busy / 回避 / 弱い興味の多義）・status 遷移なしで反復しノイズになりうる。
**保存する価値（採用理由）**:
- A1-7-0 が既に later→`deferral`（hypotheses `[postpone_signal, timing_uncertain]`）をモデル化済。route だけ落とすのは恣意的不整合。
- **保留（hesitation）は最も深い観測素材**。Aneurasync 哲学「迷い時の優先軸」「崩れやすい条件」= 決定の境界に性格が出る。accept/dismiss が捉えられない **timing 次元**。
- 「何を先送りするか」は二次的自己モデルにとって adopt/reject 以上に行動傾向を語る（例: 夕方の高負荷を defer する energy パターン / 社交提案を defer する接近回避）。
- 多義性は **複数仮説保持**（A1-7-0 済）+ **dedup grain**（§3）で非断定を担保。

## 2. later の意味（hypotheses・潰さない）
A1-7-0 通り later = `deferral` signal・primary `postpone_signal` + `timing_uncertain`。読み:
- **not_now**: 今は選ばない（タイミング）。**timing_uncertain**: いつが良いか不確実。**postpone_signal**: 先送り意思。**意思決定保留**: adopt/reject を保留。
- いずれも断定でなく **保留方向の仮説束**。単一 later で性格断定しない（certainty=low・assertsPreference=false 維持）。

## 3. repeated later の扱い — **dedup grain = handle+action+acted_date（日粒度・aggregation 側）**
- 問題: accept/dismiss は status 遷移で候補が surface から消え反復不能。**later は status 遷移なし→候補が残り同日連打可能**→deferral 信号を過大計上（非断定違反）。
- 解: **events は raw 源（append-only・全 tap 記録）**。**dedup は aggregation（A1-7-1）側で `handle+action+acted_date`**:
  - **同日（UTC）反復 → 1 信号に collapse**（同一決定の連打を過大計上しない）。
  - **異日反復 → 別 key=慢性 deferral として蓄積**（同日ノイズ抑制・異日信号保存）。
  - accept/dismiss は反復不能ゆえ日粒度でも衝突せず安全。
- pure helper: `learningEventDedupKey(handle, action, actedAtISO)` = `handle::action::YYYY-MM-DD`（UTC 日・local 日精緻化は将来）。
- **write 時 dedup はしない**（read-before-write を避け append-only を保つ）。raw 蓄積は TTL 180 日 + 低 volume + user 削除可ゆえ許容。signal 整合は aggregation dedup が担保。
- **acted_at 別 event**: 保存粒度は acted_at（raw）。**dedup 粒度のみ日**（保存と信号の分離）。

## 4. A1-7-0 dry-run event との整合 — **route 側でも扱う**
- later は既に A1-7-0 で `deferral`/`[postpone_signal, timing_uncertain]` を持つ。dev-report（dry-run）は later を含めて集計できる。
- 不整合は **route connection（A1-7-17）だけ** が later を落としていた点。route も later を扱い、dry-run と live を一致させる（A1-7-13 原則「同一 helper・同一 event 形」）。

## 5. route connection への影響 — **gate を「status 成功 only」→「accepted」に是正**
- 現状 glue（A1-7-17）: `if (!response.accepted || response.deferred) return;`（later=deferred を除外）。
- 是正: `decideLearningWrite(action, response).write` で gate（**accepted=true なら write・later も対象**）。later は status 遷移を持たないが `accepted=true`（valid 処理）ゆえ書く。
- 「status transition 成功後 only」は **不採用**: later に status 遷移はないが学習対象。正しい gate は「action が validly processed（accepted）」。
- これは **route connection 変更**ゆえ **§6 で design-only 提出**（実装は CEO 判断）。
- **重み**: later は accept/dismiss より弱い証拠。aggregation で deferral を低重み化するのは将来 enhancement（本 slice では grain dedup のみ）。

## 6. DB apply 前に変更すべきか — **policy は先に確定（本 slice）。route wiring は flag ON 前に着地**
- **M1 schema は変更不要**: `action IN ('accept','dismiss','later')` / `signal IN ('adoption','non_adoption','deferral')` を既に含む（later/deferral apply 可）。→ **later は DB apply を block しない**。
- **順序**: ①A1-7-18 で policy 確定（本 slice・helper+tests+docs）→ ②glue gate 是正 + aggregation dedup（design-only・CEO 承認後）→ ③DB apply（schema は later-ready）→ ④flag ON。
- **DB apply 自体は進行可**（schema が 3 action 全対応）。ただし **flag ON で later を取りこぼさない**ため、glue gate 是正（②）は **flag ON 前**に着地させる。

---

## 実装（本 slice）
- `lib/plan/reality/learning/learning-event-write-policy.ts`（新・pure）: `decideLearningWrite(action, outcome)` / `learningEventDedupKey(handle, action, actedAtISO)`。
- `tests/unit/reality/realityLearningEventWritePolicy.test.ts`（9 tests）。
- **glue/route は未変更**（prod 未参照）。

## 後続（design-only・CEO 承認 gate）
- **A1-7-19 候補**: glue gate を `decideLearningWrite().write` に是正（later を write）。route connection 変更ゆえ stop gate。
- **aggregation dedup**: A1-7-1 に `learningEventDedupKey` 適用（同日反復 collapse）。
- **DB apply（slice ⑤）/ flag ON**: 別 CEO gate。

## しない（A1-7-18 の境界）
glue/route 変更 / DB apply / Supabase apply / env / flag ON / remote / production / M2 / M3 / aggregation 実変更。
