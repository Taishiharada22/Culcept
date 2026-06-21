# 旧RO branch 全体 Carry-Forward Manifest（C0-wide）

- **作成日**: 2026-06-21
- **目的**: 旧RO branch `claude/xenodochial-chatelet-0023b2` @ `42ab074bc` の成果物を、最新 main `bcf84157c` base へ安全に持ち越すための全体棚卸し。
- **方式**: B案（path単位・意味単位の選別再構成。commit単位 cherry-pick / whole branch merge / 旧branch差分の丸ごと適用は不採用）。
- **位置づけ**: RO-8〜10 限定の [reality-os-ro8-10-carry-forward-manifest.md](reality-os-ro8-10-carry-forward-manifest.md)（C0）を内包し、RO branch 全体へ拡張したもの。
- **状態**: docs-only。実コード未取込。実取込・file-restore・migration 化は全て **CEO GO 待ち**。

---

## 1. 旧RO成果物の残存確認（消えていない）

| 項目 | 値 |
|---|---|
| 旧RO branch | `claude/xenodochial-chatelet-0023b2` @ `42ab074bc`（HEAD = RO-10 Migration Readiness Pack） |
| backup | `origin/backup/xenodochial-chatelet-0023b2-20260620` |
| 分岐点 merge-base(RO, main) | `533be2e51`（RO は `bcf84157c` より前の main から分岐） |
| `supabase unlink` の影響 | **branch / commits / migration files / RO成果物に一切影響なし**（local link config のみ解消） |

→ **RO成果物は完全に温存**。本manifestは「どれを・どこへ」だけを整理し、現時点で実体は動かさない。

---

## 2. RO vs main `bcf84157c` 全差分（783ファイル）

| status | 件数 | 意味 | 扱い |
|---|---|---|---|
| **A**（RO新規・main不在） | **230** | RO の net-new 成果物 | carry 候補（§3） |
| **M**（両在・差分） | **78** | RO と main が別々に進化 | **丸ごと適用禁止**。main を正とする（§5） |
| **D**（RO不在・main在） | **475** | main 側の前進（UX-1〜6 等） | **RO 非関与・触らない**（既に main にある） |

### A(230) の内訳
| バケット | 件数 | 中身 |
|---|---|---|
| `lib/plan/realityCore/` | **68** | Reality Orbit 純kernel（RO-1〜10 + RC/RD/RJ 由来） |
| `lib/plan/`(他) | 3 | `recurringDayResolver.ts` / `canonicalHash.ts` / `anchor-start-time-provenance.ts` |
| `lib/plan/reality/` | 3 | reality 補助 |
| `tests/unit/` | 74 | 上記 kernel の pure test |
| `app/(culcept)/` | 7 | dev/preview pages |
| `docs/reality-*` | ~40 | RO 設計・closeout docs |
| `supabase/migrations/` | **2** | DB gate（§6・§7） |

---

## 3. 持ってくる path（CARRY-NOW / code-only・pure）

**今 carry してよいのは canonical task の import 閉包のみ**（C0 §1 と同一。realityCore 68本の全持ち越しはしない）。

| # | path | 種別 | main |
|---|------|------|------|
| S1 | `lib/plan/realityCore/canonicalTask.ts` | pure kernel 本体（未完タスク本体） | 不在 |
| S2 | `lib/plan/realityCore/taskRealityNode.ts` | pure kernel/types | 不在 |
| S3 | `lib/plan/realityCore/eventRealityNode.ts` | pure kernel/types | 不在 |
| S4 | `lib/plan/realityCore/realityAttribute.ts` | pure types | 不在 |
| S5 | `lib/plan/realityCore/leaveByComputation.ts` | pure schema/types | 不在 |

tests（CARRY-NOW / pure）: `tests/unit/canonicalTask.test.ts` / `eventRealityNodeCompile.test.ts` / `taskRealityFoundation.test.ts` / `leaveByComputation.test.ts`

docs（reference）: `docs/reality-os-ro8-task-source-rehome-orbittask-salvage-contract-design.md`

- 全て **pure・production state ゼロ・既存ファイル不接触・tsc55**。
- 手merge **0件**（必要 symbol `AnchorRigidity`/`TimeBucket`/`DurationSource` は main `bcf84157c` に全在。`dayGraphTypes.ts`/`external-anchor.ts` は触らない）。
- 実装最小 scope: **C1**(S1〜S5 取込+tsc55維持) → **C2**(test取込+vitest PASS)。UI/DB/flag 不触。

---

## 4. 持ち越し範囲外（PRESERVE / 別manifest・今は carry しない）

RO の残り realityCore ~63本と周辺は、**それぞれ別トラックの成果物**。canonical task 閉包に不要なので今回 carry しない。RO branch に温存され、各トラック再開時に個別manifestで評価する。

| トラック | 代表ファイル | 状態 |
|---|---|---|
| leaveBy / movement | `leaveByAdapter` `leaveBySupply` `movementReality` `blockDepartureFeasibility` 他 ~12 | 温存・別GO |
| routeEta / transport | `routeEtaCapability` `routeEtaProviderAdapter` `transportCascadeRouteEtaProvider` 他 ~5 | 温存・別GO（外部provider gate 注意） |
| proposal / surface | `proposalSurface` `surfaceProjection` `judgmentSurfacePlan` `copySurface` 他 ~8 | 温存・別GO |
| intervention | `interventionDecision` `interventionLadder` `deliveryGate` `triggerCondition` 他 ~5 | 温存・別GO |
| reality graph/frame | `realityFrame` `realityDiff` `realityGraphSnapshot` `graphIdentity` 他 ~12 | 温存・別GO |
| operator / dogfood | `operator*` `dogfood*` 他 ~9 | 温存・別GO（operator_seed/staging 文脈） |
| place / prep | `placeResolution` `placeCandidateAdapter` `prepTimeModel` `originInference` 他 ~4 | 温存・別GO |
| duration | `durationConfirmation` `durationConfirmationAdapter` | 温存・§6 migration と対 |
| dev pages | `app/(culcept)/` 7 | 温存・必要時のみ |

---

## 5. 持ってこない path（EXCLUDE / 丸ごと適用禁止）

| path | 理由 |
|------|------|
| `docs/decision-log.md`（M） | **CEO固定: main 側採用**。RO差分は取り込まない |
| M(78) 全般: `PlanClient.tsx` / `plan/page.tsx` / `featureFlags.ts` / `app/layout.tsx` / 各 test・docs | **main を正**。canonical task は UI/flag 未接続(dormant)のため**配線手mergeは現時点で 0 件**。将来 UI 露出時に必要 props/flag のみ手 union（additive） |
| D(475) | main 側の前進。RO 非関与・触らない |

---

## 6. CoAlter C2-a blocker = migration 2本の扱い

| migration | 由来 commit / branch | 内容 | main | staging |
|---|---|---|---|---|
| `20260615100000_external_anchors_start_time_provenance.sql` | `87b2f07b4`（U1-minimal）/ xenodochial | `external_anchors` に4列 ADD COLUMN IF NOT EXISTS + `create_external_anchor_bundle` RPC `CREATE OR REPLACE`（**SECURITY INVOKER**・authenticated grant・service_role なし・冪等） | 不在 | **適用済** |
| `20260616100000_duration_confirmations.sql` | 導入 `d11237ea5`→改訂 `fc6cd124c`（RD3c）/ xenodochial | 新規 table `CREATE TABLE IF NOT EXISTS` + index + updated_at trigger + **RLS owner-only（service_role 非前提・production default deny）**・rollback は DROP TABLE で clean | 不在 | **適用済** |

→ 両方 **additive / idempotent / RLS健全 / SECURITY DEFINER なし / service_role なし**。staging にだけ適用済みで main 履歴に欠ける = **drift の正体**であり、C2-a の `db push --dry-run` が「staging に remote-only 2本」で止まる原因。

### どこに復元するのが正しいか
| 場所 | 判断 |
|---|---|
| **RO branch** | **既に存在（source of truth）**。復元不要・温存のまま |
| **CoAlter C2-a worktree（staging-linked）** | ✅ **正しい file-restore 先**。ローカル migration 履歴を staging と一致させ dry-run の divergence を解消する。**file 配置のみ・apply なし** |
| **main `bcf84157c` 直** | ❌ 今はしない。main直push 禁止。これらは owning feature（U1-minimal / RD3c）の正規統合経路で、**DB apply を gate した上で**入るべきもの。RO 経由で main に滑り込ませない |

### file-restore-only scope（提案・未実行）
```
CoAlter C2-a worktree の supabase/migrations/ へ、RO branch から内容コピーのみ:
  git show 42ab074bc:supabase/migrations/20260615100000_external_anchors_start_time_provenance.sql
  git show 42ab074bc:supabase/migrations/20260616100000_duration_confirmations.sql
やらないこと: db push / migration up / repair / db pull / SQL apply / seed（全て禁止維持）
```

---

## 7. DB / migration gate 待ち（docs-only 分離・apply 禁止）

| path | gate |
|------|------|
| `docs/reality-os-ro9-task-store-persistence-design.md`（schema DRAFT） | DB gate。docs-only carry 可・実装別GO |
| `docs/reality-os-ro10-canonical-task-migration-readiness.md` | DB gate。docs-only |
| `docs/reality-os-ro10-canonical-task-migration.sql.draft` | DB gate。**.draft のまま**。実 migration 化は staging検証+backup+link二重確認+CEO明示承認ゲート必須 |
| §6 migration 2本の **apply** | DB gate。file-restore（履歴整合）と apply（実行）は別物。apply は別GO |

> canonical task の pure kernel は **DB 無しで自己完結**（in-memory 投影）。DB gate は将来の永続化フェーズへ完全分離できる。

---

## 8. RO-11 dry-run 再開に必要な条件（現状チェック）

| 条件 | 状態 |
|---|---|
| 作業worktree が production-linked でない | 🟢 解消済（RO worktree unlink・project-ref 空）。※root `Culcept` はまだ production-linked（別途判断） |
| disk 空き（`supabase start` は数GB pull） | 🟡 **2.9Gi（不足気味）**。safe margin ~10Gi 推奨 |
| Docker Desktop 起動 | 🔴 停止中 |
| local Supabase start | 🔴 未起動（上2条件 解消後） |
| RO-10 migration draft の用意 | docs-only 在。local dry-run 対象は **.draft → local-only 適用**（別GO・remote 不触） |

→ RO-11 は **disk 確保 → Docker 起動 → local start** が揃うまで再開しない。production 系・remote db push は一切不要（local-only）。

---

## 9. DB / Supabase 不触確認

本セッションで実行した Supabase 関連は **`supabase unlink`（local config のみ・remote DB 非接続）1回のみ**。`db push` / `migration up` / `repair` / `db pull` / direct SQL / seed / INSERT-UPDATE-DELETE / production 接続 / Docker・local start は **すべてゼロ**。

---

## 10. 停止

本manifest（C0-wide・docs-only）で停止。次の実行候補は以下のいずれかで、**着手は CEO GO 待ち・commit 前に報告**：
- **(a)** C1+C2: canonical task 閉包 5 source + 4 test の path単位取込（pure・tsc55/vitest 緑）
- **(b)** migration 2本の file-restore-only を CoAlter C2-a worktree へ（apply なし）
- **(c)** root `Culcept` の production link 解消
