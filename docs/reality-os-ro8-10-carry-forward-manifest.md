# RO-8〜RO-10 Canonical Task Store — Carry-Forward Manifest (C0)

- **作成日**: 2026-06-21
- **方式**: B案（path単位・意味単位の選別再構成。commit単位 cherry-pick / whole branch merge は不採用）
- **新base**: local main `bcf84157c`（UX-1〜6 統合済み）
- **作業branch**: `claude/task-store-migration-rebase-20260621`
- **source / reference（温存・適用しない）**: 旧branch `claude/xenodochial-chatelet-0023b2` @ `42ab074bc`
- **分岐点**: merge-base `533be2e51`（旧branchは bcf84157c より古い main から分岐）
- **状態**: docs-only。実コード未取込。C1 以降は **CEO GO 待ち**。

---

## 0. 結論（先出し）

RO-8〜10 の未完タスク本体（Canonical Task Store）の **code-only carry-forward は極めて小さく、安全**。

- **持ってくる実コード = 5 source + 4 test**（全て pure kernel / types / tests・DB/UI/save 接続ゼロ）
- **手merge = 0**（main の `dayGraphTypes.ts` / `external-anchor.ts` が必要 symbol を全て保持。RO差分は別作業由来で不使用）
- **DB/migration = 全て gate 分離**（sql.draft + 永続化設計は docs-only・apply 禁止）
- **重要な正直さ**: 「RO-8〜10 だけ」では閉じない。canonicalTask は **RC1a-1c / RD2e-a / RO-1 由来の 4 kernel ファイル**に hard 依存する。これらは全て pure・additive・production state ゼロなので安全に同梱できるが、scope は «RO-8 canonicalTask + その pure-kernel 依存tail» と理解する。

---

## 1. 持ってくる path（CARRY / code-only）

| # | path | 由来 | 種別 | main状態 | 根拠 |
|---|------|------|------|----------|------|
| S1 | `lib/plan/realityCore/canonicalTask.ts` | RO-8 `ace7a1968` | pure kernel 本体 | 不在 | 未完タスク本体 |
| S2 | `lib/plan/realityCore/taskRealityNode.ts` | RO-1 `78625b48e` | pure kernel/types | 不在 | canonicalTask が import（buildTaskRealityNode / TaskRealityNodeV0 / TaskCompletionStatus） |
| S3 | `lib/plan/realityCore/eventRealityNode.ts` | RC1a-1c `c16a1e28a` | pure kernel/types | 不在 | canonicalTask/taskRealityNode が import（ChangeEligibilityValue 他） |
| S4 | `lib/plan/realityCore/realityAttribute.ts` | RC1a-1c `c16a1e28a` | pure types | 不在 | unknownAttribute / inferredAttribute / RealityAttribute |
| S5 | `lib/plan/realityCore/leaveByComputation.ts` | RD2e-a `1eab29000` | pure schema/types | 不在 | eventRealityNode が import（LeaveByComputationV0） |

**全 5 ファイルの性質**: 各commitで明示「pure 只・新規 read/保存/UI 接続ゼロ・既存ファイル不接触・tsc55」。**production state を一切持たない**。

### tests（CARRY / pure）

| # | path | 対象 | main状態 |
|---|------|------|----------|
| T1 | `tests/unit/canonicalTask.test.ts` | S1 | 不在 |
| T2 | `tests/unit/eventRealityNodeCompile.test.ts` | S3 | 不在 |
| T3 | `tests/unit/taskRealityFoundation.test.ts` | S2 | 不在 |
| T4 | `tests/unit/leaveByComputation.test.ts` | S5 | 不在 |

- S4 `realityAttribute.ts` に専用 test は無い（T2/T1 が間接被覆）。
- T1〜T4 の import 閉包は C2 着手時に「5 carry + main同一ファイルのみ」で閉じることを vitest で実証する（新規の未carry依存が出たら報告）。

### docs（CARRY as reference / 非DB）

| path | 内容 | 備考 |
|------|------|------|
| `docs/reality-os-ro8-task-source-rehome-orbittask-salvage-contract-design.md` | RO-8 設計（pure kernel 契約） | reference |

---

## 2. 持ってこない path（EXCLUDE）

| path | 理由 |
|------|------|
| `docs/decision-log.md` | **CEO固定: main 側採用**。RO差分(1138行)は取り込まない |
| `supabase/migrations/20260615100000_external_anchors_start_time_provenance.sql` | 別ゲート（code-only carry に含めない・apply禁止） |
| `supabase/migrations/20260616100000_duration_confirmations.sql` | 同上 |
| 旧branchのその他 ~290 ファイル（RO-1〜7 の Mobility/Reality IR/Proposal 等、dev pages、battery周辺差分） | **今回scope外**。canonical task 閉包に不要。必要時に別manifestで個別評価 |

---

## 3. 手mergeが必要な path

**なし（0件）。**

- 候補だった `lib/plan/dayGraph/dayGraphTypes.ts` / `lib/plan/external-anchor.ts` は RO↔main で差分があるが、**その差分は RC2a-6A(snapshotId v2) / U1-EventNode(startTimeSource) という別作業由来**であり、canonical task 閉包は使用しない。
- 閉包が必要とする symbol（`AnchorRigidity` / `TimeBucket` / `DurationSource`）は **main `bcf84157c` に全て存在**（DurationSource = dayGraphTypes L142 ほか）。
- → **main 版を正のまま使用し、これら2ファイルには触れない**。

---

## 4. DB / migration gate 待ち path（docs-only 分離・apply 禁止）

| path | 内容 | gate |
|------|------|------|
| `docs/reality-os-ro9-task-store-persistence-design.md` | RO-9 永続化設計（schema DRAFT） | DB gate。docs-only で carry 可、**実装は別GO** |
| `docs/reality-os-ro10-canonical-task-migration-readiness.md` | RO-10 migration readiness pack（apply 未実行） | DB gate。docs-only |
| `docs/reality-os-ro10-canonical-task-migration.sql.draft` | migration SQL **草案**（.draft・未適用） | DB gate。**SQL変更/db push/migration up は全面禁止**。実 migration 化は staging検証+backup+link二重確認+CEO明示承認ゲート必須 |

> 注: 上記は全て `docs/` 配下の参考成果物であり、`supabase/migrations/` への追加は一切行わない。canonical task の **pure kernel は DB 無しで自己完結**（in-memory 投影）するため、DB gate は将来の永続化フェーズに完全分離できる。

---

## 5. 最初に実装してよい code-only 最小 scope

| scope | 内容 | 安全性 | 状態 |
|-------|------|--------|------|
| **C0** | 本manifest（docs-only） | 影響ゼロ | ← 今ここ |
| **C1** | S1〜S5 の path単位取込（pure types/kernel）+ tsc55 維持確認 | production state ゼロ・既存ファイル不接触・全 flag 無関係 | GO待ち |
| **C2** | T1〜T4 の取込 + `vitest run` で PASS & 閉包クリーン実証 | pure test のみ | GO待ち |
| **C3** | UI/PlanClient 配線 | **本scopeでは不要**（canonical task は UI 未接続・dormant） | 保留 |
| **C4** | migration/schema 永続化（§4） | DB gate | 別GO・禁止維持 |

**推奨初手 = C1（+C2）のみ。** 5 source + 4 test を path単位で取り込み、`tsc`(baseline 55 維持) と `vitest`(該当4 test PASS) を緑にして報告。UI・DB・flag は一切触らない。

---

## 6. リスク

| リスク | 評価 | 緩和 |
|--------|------|------|
| 依存tailが RO-8 外（RC1/RD2e/RO-1）に伸びる | **中（scope認識のズレ）** | 本manifest §1 で明示。4ファイルは全て pure・production state ゼロ |
| 取込後 tsc baseline が 55 から増える | **低** | C1 直後に `tsc --max-old-space-size=8192` で 55 維持を実証。増えたら停止・報告 |
| test 閉包に未carry依存が隠れる | **低** | C2 で vitest 実行し未解決importを検出。出たら停止・報告 |
| sql.draft を誤って migration 化 | **致命（だが手順で排除）** | §4 で DB gate 固定。`supabase/migrations/` 不接触・db push/migration up 全面禁止 |
| 旧branch差分の混入（decision-log / battery周辺） | **低** | path単位whitelist（§1）のみ取込。§2 を明示exclude |
| canonicalTask の UI 露出（意図せぬ有効化） | **低** | C3 保留。canonical task は dormant・UI/route 未接続のまま |

---

## 7. 停止

本manifest（C0）で停止。C1 着手は **CEO GO 待ち**。
C1 着手時も「取込 → tsc/test 緑 → commit前にCEO確認」の順で、追加commitはCEO確認後に行う。
