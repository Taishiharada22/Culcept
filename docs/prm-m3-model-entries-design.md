# M3 prm_model_entries — Design + Static Audit（A1-7-29・**migration draft・apply しない**）

対象: `supabase/migrations/20260609130000_create_prm_model_entries.sql`（A1-7-29・draft）
設計基盤: `docs/prm-persistence-schema-design.md` §3.3（A1-7-5）/ M2 `prm_review_decisions`（A1-7-27・FK 先）/ M1 `prm_learning_events`（適用済）
状態: **schema draft + 静的監査のみ**。**apply / db push / local reset はしない**（別 GO・M2 を先に apply する FK 依存あり）。

---

## A. 役割
人間が **approve した tendency** の蓄積＝**「第二の自己」の PRM 本体**。events(M1)→proposal(派生)→人間 review(M2 approve)→**この entry**。自動学習は構造的に禁止（review_decision_id NOT NULL FK）。保持は **(context_dimension, context_value, tendency_direction)** の文脈束縛 tendency＝性格/trait でない。

## B. schema 設計の根拠
- **review_decision_id NOT NULL FK → prm_review_decisions**: **reviewRequired の構造的実体**。review 決定なしに entry は INSERT 不能＝自動学習を DB で不可能化。
- **certainty CHECK in (low, tentative)**: high を DB で不可能化（UPDATE でも CHECK 適用）。
- **context_dimension/value/tendency_direction**: 文脈束縛 tendency（CHECK で 4 次元 / 3 方向）。trait column なし。
- **still_possible TEXT[]**（jsonb 不使用・M2 と一貫・code のみ）/ **counter_count** / **decay_weight**（0..1 CHECK・recency 減衰）。
- **可逆**: supersedes_id（self FK・versioning）/ retracted_at（論理削除）/ user_correction（CHECK enum 'rejected'/'direction_adjusted'/'context_refined'・raw でない override）。
- **mutable model 層**: UPDATE policy + updated_at trigger（retracted_at/user_correction/decay_weight 更新）。CHECK が UPDATE でも certainty high を禁止。

## C. 過断定防止 5 重 gate（M3 が担う層・全 gate が schema で構造化）
1. **reviewRequired**: review_decision_id NOT NULL FK＝review なしに entry なし（**M3 が最終担保**）。
2. **certainty CHECK no high**（INSERT/UPDATE 両方）。
3. **counter-evidence**: counter_count（弱化）。
4. **stillPossible**: still_possible[]（代替仮説・潰さない）。
5. **tendency-not-trait**: personality/trait column なし・文脈束縛のみ。
（+ 可逆: supersedes/retracted/user_correction で完全 rollback・user override。+ decay で recency。）

## D. RLS / privacy / 可逆
- **RLS owner-only**（auth.uid()=user_id）・SELECT/INSERT/UPDATE/DELETE・service_role 非前提。
- **user_visible** default true（ユーザーが見て訂正できる＝第二の自己の所有）。
- **structured-only**: raw/seedRef/発話なし・jsonb 不使用・code/enum/数値のみ。
- **GDPR/rollback**: user DELETE（owner）+ auth.users CASCADE + review_decision CASCADE。retracted_at で論理削除・supersedes_id で version 復元。

## E. 静的監査（A1-7-12/27 同手法）
### E.1 Correctness
- ✅ table・id pk・user_id FK CASCADE・review_decision_id NOT NULL FK→prm_review_decisions CASCADE・supersedes_id self FK SET NULL。
- ✅ CHECK: context_dimension(4)・tendency_direction(3)・certainty(low/tentative)・evidence/counter ≥0・decay_weight 0..1・user_correction(null/3 enum)。
- ✅ index: (user_id, context_dimension, context_value)＝context 照会 / (user_id) WHERE retracted_at IS NULL＝active subset。
- ✅ updated_at trigger（BEFORE UPDATE）。RLS enabled + SELECT/INSERT/UPDATE/DELETE owner policy。

### E.2 Completeness（A1-7-5 §3.3 / 5-gate 整合）
| 要件 | 充足 |
|---|---|
| PRM 本体 = review 済 tendency のみ | ✅ review_decision_id NOT NULL FK |
| 自動学習禁止 | ✅ FK で review なし entry 不能 |
| certainty high 不可 | ✅ DB CHECK（INSERT/UPDATE） |
| counter/stillPossible/decay | ✅ 列あり |
| 可逆（version/retract/correction） | ✅ supersedes_id/retracted_at/user_correction |
| tendency-not-trait / structured-only | ✅ trait 列なし・jsonb 不使用 |
| user-visible / owner-only | ✅ user_visible・RLS |

### E.3 Edge cases（**全て非 blocker**）
1. **UPDATE 許可**（M1/M2 は append-only だが M3 は mutable）→ model 層は retract/correction/decay で更新が本質。CHECK が certainty high を UPDATE でも禁止・updated_at trigger で audit。**設計通り**。
2. **supersedes_id ON DELETE SET NULL** → superseded 元削除で pointer null（version chain 断のみ・entry は残る）。**非 blocker**。
3. **favored_hypothesis/context_value enum CHECK なし** → controlled code（app/contract）・raw でない。**非 blocker**。
4. **review_decision_id CASCADE** → review 決定削除で entry も削除（provenance 整合・GDPR）。**設計通り**。
5. **decay_weight 更新の責務** → app/cron が recency で更新（read-time 計算でも可）。schema は範囲 CHECK のみ。**非 blocker**。
6. **down は comment** → 新規 table clean DROP（trigger/function は table と共に or 別途 drop）。header に revert SQL。**非 blocker**。

### E.4 Verdict
**M3 SQL は correct / complete / safe**（用途=review 済 PRM 本体）。finding 6 件全て非 blocker。**過断定防止 5 重 gate を全て schema で構造化**（reviewRequired FK + certainty CHECK + counter + stillPossible + tendency-not-trait）。**apply 可否は CEO**（M2 を先に apply・M1 同段階手順）。

## F. 3-table アーキテクチャ完成（設計）
- **M1 prm_learning_events**（源泉 signal・適用済 staging・dogfood 蓄積中）。
- **M2 prm_review_decisions**（人間 review 決定・PRM への唯一入口・draft）。
- **M3 prm_model_entries**（review 済 tendency = PRM 本体・draft・M2 に FK）。
- events→aggregate→proposal(派生)→**review(M2)**→**model entry(M3)**→第二の自己 read。

## G. 次段階
- M2/M3 **apply**（M2→M3 順・local smoke→staging・別 CEO gate）。
- M2/M3 **repository**（ReviewDecisionRecord→M2 insert / approve→M3 entry insert mapper）。
- **review UI/route**（人間が proposal を review し decision 入力→M2→M3 反映）。

## H. しない（A1-7-29 の境界）
apply / db push / local reset / M1/M2 編集 / route / Home / persistence repository 実装 / production / env / remote / PR。
