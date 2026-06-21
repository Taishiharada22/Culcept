# C0〜C2 Canonical Task Pure Kernel Carry-Forward — Closeout Audit

- **作成日**: 2026-06-21
- **branch**: `claude/task-store-migration-rebase-20260621`（base = local main `bcf84157c`）
- **source / reference**: 旧RO branch `claude/xenodochial-chatelet-0023b2` @ `42ab074bc`（温存）
- **状態**: docs-only。canonical task pure kernel + test の carry-forward は完了。DB/migration/CoAlter/UI は未着手（別GO）。
- **目的**: 新base `bcf84157c` 上に戻した canonical task pure kernel の範囲を固定し、旧RO 残成果物・DB gate・次GOを整理する。

---

## 1. C0/C1/C2 commit 一覧

| 段階 | SHA | 種別 | 内容 |
|---|---|---|---|
| C0-a | `032dc81cd` | docs-only | RO-8〜10 Canonical Task carry-forward manifest（path単位選別） |
| C0-b | `adc226df1` | docs-only | 旧RO branch 全体 carry-forward manifest（C0-wide） |
| C1 | `e7088f3cb` | code（pure） | realityCore **11本** closure 取込（旧RO byte一致・tsc55） |
| C2 | `cc004b56f` | code（pure+test） | pure source **2本** + test **4本**（closure 13本で閉・72 tests PASS） |

backup push（origin・backup branch のみ・origin/main 不触）:
- `origin/backup/task-store-migration-rebase-c1-20260621` = `e7088f3cb`
- `origin/backup/task-store-migration-rebase-c2-20260621` = `cc004b56f`

---

## 2. carry-forward 済み path 一覧（base `bcf84157c` 以降の追加）

### code: realityCore pure kernel 13本（C1=11 + C2=2）
```
canonicalTask  taskRealityNode  eventRealityNode  realityAttribute  leaveByComputation
leaveByLines   leaveByAdapter   routeEtaCapability  routeEtaDurationValue
routeEtaProviderAdapter  routeEtaSafety                              … C1(11)
compileEventRealityNodes  scheduledWorkBlock                         … C2(+2)
```
- 全13本：旧RO `42ab074bc` と **byte 完全一致**・main 不在の純新規・外部依存は全て main 在。

### test: 4本（C2）
```
tests/unit/canonicalTask.test.ts          tests/unit/eventRealityNodeCompile.test.ts
tests/unit/taskRealityFoundation.test.ts  tests/unit/leaveByComputation.test.ts
```

### docs: manifest 2本（C0）
```
docs/reality-os-ro8-10-carry-forward-manifest.md
docs/reality-os-ro-branch-carry-forward-manifest.md
```

---

## 3. tsc / vitest 結果

| 検証 | 結果 |
|---|---|
| tsc（`--max-old-space-size=8192`） | **55 errors = baseline 完全一致**。carry 13本/4test 起因 error **ゼロ** |
| vitest（C2対象4 test） | **Test Files 4 passed / Tests 72 passed** |
| import closure | **13本で閉じ・未carry依存ゼロ**（tsc が実証） |

> 残 55 error は既存 baseline（stargazer conversationQualityAudit / perspectiveEngine / voiRefutation 等）。本 carry とは無関係・S5 baseline 凍結対象。

---

## 4. 不触確認（差分ゼロ）

| 対象 | 状態 |
|---|---|
| `docs/decision-log.md` | 🟢 差分0（main 側採用・CEO固定） |
| `supabase/migrations/` | 🟢 差分0件 |
| SQL / seed / DB write（INSERT/UPDATE/DELETE） | 🟢 ゼロ |
| `app/(culcept)/plan/PlanClient.tsx` | 🟢 差分0 |
| `app/(culcept)/plan/page.tsx` | 🟢 差分0 |
| `lib/plan/featureFlags.ts` | 🟢 差分0 |
| root `Culcept` asset dirty | 🟢 不触（別worktree・本worktree変更は realityCore/tests/docs のみ） |
| Supabase remote / production | 🟢 非接続（C1/C2 期間に Supabase command なし） |

---

## 5. 旧RO branch に残る未carry成果物（温存・別GO）

| 区分 | 残数 | 内容 |
|---|---|---|
| **realityCore 残り** | **55本**（全68 − carry13） | leaveBy/movement・routeEta周辺・proposal/surface・intervention・reality graph/frame・operator/dogfood・place/prep・duration 等（各別トラック） |
| **docs（reality-*）** | **70本** | RO-1〜10 + RC/RD/RJ 設計・closeout。reference 価値、コード非依存 |
| **dev pages** | **7本** | `app/(culcept)/` preview/dev pages |
| **migration 2本** | 2 | `20260615…external_anchors_start_time_provenance.sql` / `20260616…duration_confirmations.sql`（§6） |
| **RO-9/10 schema draft** | 3 docs | `ro9-task-store-persistence-design.md` / `ro10-…-migration-readiness.md` / `ro10-…-migration.sql.draft` |

→ いずれも **RO branch（+ origin backup）に温存**。canonical task pure kernel の動作には不要（kernel は in-memory 投影で自己完結）。

---

## 6. DB / migration gate 待ち一覧（apply 全面禁止・別GO）

| path | gate 条件 |
|---|---|
| `supabase/migrations/20260615100000_external_anchors_start_time_provenance.sql` | staging 適用済・main 不在。**file-restore は CoAlter C2-a worktree 側で完了済**（CEO 既報）。本 rebase では不取込 |
| `supabase/migrations/20260616100000_duration_confirmations.sql` | 同上 |
| `docs/reality-os-ro10-canonical-task-migration.sql.draft` | **.draft のまま**。実 migration 化は staging検証+backup+link二重確認+CEO明示承認 |
| canonical task 永続化（RO-9/10） | DB gate。pure kernel は DB 無しで自己完結のため、永続化は完全に後フェーズへ分離可能 |

共通禁止（維持）: `db push` / `migration up` / `repair` / `db pull` / direct SQL / seed / service_role / SECURITY DEFINER。

---

## 7. C3 / UI 配線の必要性評価

**結論: C3/UI 配線は今すぐ不要。**

- canonical task kernel は **UI/route/API 未接続の dormant 状態**で、それ自体が正しい着地点（pure 投影は consumer なしで成立）。
- PlanClient / plan/page / featureFlags いずれも差分ゼロのまま、kernel は tsc/test 上で完結している。
- UI 露出は「canonical task を実際に画面で使う」意思決定（= 別 product GO）が出てから着手すべきで、現時点で配線すると flag/consent/RLS 未整備のまま dormant コードを表に出すリスクのみ増える。
- → **C3 は明示的に「今は不要・保留」**。owning feature が canonical task を必要とした時に、その文脈で配線する。

---

## 8. 次の候補

| 候補 | 種別 | gate |
|---|---|---|
| (A) CoAlter C2-a migration file-restore | DB drift 解消 | **既に CoAlter resume worktree 側で完了済**（CEO 既報）。本 rebase での重複不要 |
| (B) DB gate: canonical task 永続化（RO-9/10） | DB/migration | staging検証+backup+CEO承認。pure kernel 完了後の自然な次相だが重 gate |
| (C) RO 残り pure kernel carry-forward（realityCore 55本ほか） | code（pure） | 各トラックの owning GO 待ち。canonical task には不要 |
| (D) root `Culcept` asset audit（D 204件の意図確認） | 調査 | State Safety 観点。コード非依存・低優先だが未解決 |
| (E) C3/UI 配線 | UI | §7 より **不要・保留** |

---

## 9. 推奨順

1. **（停止・現状維持）** canonical task pure kernel carry-forward は完了。これ以上 rebase branch に積まない。
2. **(D) root asset audit** — 軽量・read-only で、204件削除が意図的か事故かを早めに確定（State Safety リスクの棚卸し）。コードに無害だが放置は危険。
3. **(B) DB gate 永続化** — canonical task を実際に保存する段階に入る時。staging 検証ゲート必須・CEO 承認案件。
4. **(C) RO 残り pure kernel** — それぞれの product トラックが再開する時に、本 closeout と同じ「manifest → closure 監査 → path単位 carry → tsc/vitest」手順で個別 GO。
5. **(A) CoAlter C2-a / (E) UI** — (A)は完了済・重複不要、(E)は不要・保留。

---

## 10. 停止

本 closeout audit（docs-only）で停止。canonical task pure kernel carry-forward（C0〜C2）を**完了として固定**。次相（B/C/D）はいずれも個別 CEO GO 待ち。新規コード取込・UI 配線・migration・SQL・Supabase 操作は行わない。
