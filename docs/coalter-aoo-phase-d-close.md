# CoAlter AOO Phase D — Phase Close (D-5)

**ステータス**: Phase D 正式 close (2026-05-19)
**前提**: Phase C C-4 BLOCKED (PR #195、`9b294164`) → Phase D 起票 (`docs/coalter-aoo-phase-d0-canary-deploy-route-design.md`、PR #197)
**次 phase**: Mirror Channel 製品化 (Phase E、別 起票、本 doc §7 hand-off 参照)

---

## §0. なぜ Phase D が必要だったか

Phase C C-4 で「production-equivalent CoAlter smoke は構造的に不能」が観測された (PR #195 BLOCKED closure)。原因は `npx vercel --force` の git attribution 欠落 + all-Preview scope に Alter 別作業の staging Supabase URL (`hjcrvndumgiovyfdacwc`) が baked-in されたこと。

→ Phase D は「**production-equivalent canary smoke を構造的に再現可能にする**」ことを目的に起票され、5 sub-phase (D-0 〜 D-5) を経て本日 close した。

---

## §1. Phase D 達成事項 (sub-phase 別)

| Sub-phase | PR | 達成事項 |
|---|---|---|
| **D-0** | #197 | `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` 起票。CEO 提示 10 課題 + Claude 自立推論 5 項目を網羅した integration design |
| **D-1 (初版)** | #198 | `scripts/coalter/verify-canary-deploy.ts` + 41 tests + canary-smoke PR template の機械化 (3 gates: URL canonical / git attribution / HTML bundle Supabase ref) |
| **D-2** | #200 | `vercel.json` `ignoreCommand` を 2 段ゲート構成に拡張 + `.canary-trigger.json` 新規 + 20 tests。`.canary-trigger.json` 変更で git-attributed Preview build を確実に trigger する経路を確立 |
| **D-3-α** | #203 | `docs/coalter-supabase-ref-canon.md` (永続 canon) + `tests/unit/coalter/supabaseRefCanon.test.ts` (45 tests) で Supabase project ref の role を canonicalize、drift 構造的に防止 |
| **D-3-β-0** | (audit、PR なし) | service_role route audit (read-only) で D-4 smoke 経路の service_role 使用を全数 inventory、条件付き GO |
| **D-3-β** | #206 | canary branch `chore/coalter-mirror-d3b-canary` 作成 + branch-scoped Preview env 5 件 CEO 投入 + `.canary-trigger.json` increment で git-attributed Preview build (`dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7`) + D-1 verify 3 gates 全 PASS |
| **D-1 fix** | #205 | Vercel API field semantics 進化 (`source: "git"` + `gitSource.type: "github"`) に追従、CEO 提示 10 criteria に再構築。58 tests (+17 new criteria tests) |
| **D-4** | (smoke runbook、docs 起票なし) | minimum smoke 実機実施 PASS。production-equivalent CoAlter flow 成立、staging 混入なし、Mirror shadow mount 成立。FORCED_CANARY escalation は不要と CEO 判断 |
| **D-5 (本 doc)** | (本 PR) | Phase D 正式 close + canary infra cleanup + Phase E hand-off |

### 1.1 D-4 smoke 観測サマリ (CEO 実機実施)

- canonical URL `https://culcept-jyq5mnif8-...` で smoke、user alias 不使用
- `/talk/[threadId]` 到達、counterpart 実 user 名 `kumi` 表示 ("ユーザー" placeholder ではない)
- 既存 thread / 既存 message 表示 (production data 由来)
- CoAlter header「見守り中」 + CoAlterButton 表示
- 画面左下「観測を控える」chip (SleepUIToggle)
- DevTools で `mirror-surface-shell` + `mirror-sleep-toggle` 確認
- `mirror-visible-surface` は null 期待 (FORCED_CANARY 未投入、shadow mode)
- staging ref `hjcrvndumgiovyfdacwc` 不在を D-1 で構造的に保証

**D-4 PASS の意味**: Phase A → B → C 横断で観測されてきた "production-equivalent canary smoke は構造的に成立するか?" の問いが **YES で確定**。

---

## §2. Phase D で確立された artifacts (永続)

| artifact | path / location | 役割 (Phase D 以降不変) |
|---|---|---|
| ignoreCommand 2 段ゲート | `vercel.json` | `.canary-trigger.json` 変更で必ず build、`.md` 単独で skip、code は build |
| canary trigger metadata file | `.canary-trigger.json` | canary build trigger 専用 marker、expected/forbidden Supabase ref を canon と同期 |
| D-1 verification script | `scripts/coalter/verify-canary-deploy.ts` | 3 gates 機械化 (URL canonical / git attribution / Supabase ref) |
| D-1 test suite | `tests/unit/coalter/verifyCanaryDeploy.test.ts` (58 tests) | CEO 10 criteria 全 cover (D-3-β で増強済) |
| Supabase ref canon | `docs/coalter-supabase-ref-canon.md` | role の single source-of-truth、`aljavfujeqcwnqryjmhl` = Production / `hjcrvndumgiovyfdacwc` = Alter staging |
| canon consistency test | `tests/unit/coalter/supabaseRefCanon.test.ts` (45 tests) | 5 参照先 (D-1 fixtures / D-2 trigger / PR template / anti-patterns doc / canon 自身) の drift 構造的検出 |
| canary smoke PR template | `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` | Phase D 以降の任意 canary smoke PR で必須 pre-flight checklist |
| anti-patterns canon | `docs/coalter-aoo-canary-deploy-anti-patterns.md` | C-4 BLOCKED 知見を永続記録、Phase D 以降の全 canary smoke 起票時必読 |

### 2.1 Phase D 由来の test 集計

| test suite | test 数 | 役割 |
|---|---|---|
| verifyCanaryDeploy.test.ts | 58 | D-1 機械化 (Gate 2 = CEO 10 criteria 完全 cover) |
| canaryTriggerIgnoreCommand.test.ts | 20 | D-2 ignoreCommand logic invariant |
| supabaseRefCanon.test.ts | 45 | D-3-α canon drift detection |
| **小計** | **123** | Phase D 由来の永続 regression guard |

---

## §3. Phase D で達成されなかった / 意図的に deferred な事項

| 項目 | 理由 | 次 phase |
|---|---|---|
| Mirror visible smoke (FORCED_CANARY=true での visible UI 検証) | CEO 判断: minimum smoke で十分、escalation 不要 | Phase E で必要なら実施 |
| Production rollout (Mirror Channel Production 有効化) | Phase D scope 外 (canary 経路の検証が目的) | Phase E |
| canary 専用 Supabase project (D-0 Option A) | CEO が Option C-prime 採用、Production Supabase を branch-scoped env で使う方針確定 | (Option A は永続的に deferred) |
| user allowlist gradual rollout (D-0 Option B) | CEO canon「Production env 触らない」と衝突、永続的に NG | (永続却下) |

---

## §4. Phase D cleanup 完了確認 (D-5 で実施)

### 4.1 Canary scope env 削除 (5 件、D-3-β 投入 → D-5 削除)

| key | status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (canary scope) | ✅ 削除済 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (canary scope) | ✅ 削除済 |
| `SUPABASE_URL` (canary scope) | ✅ 削除済 |
| `SUPABASE_ANON_KEY` (canary scope) | ✅ 削除済 |
| `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` (canary scope) | ✅ 削除済 |

確認: `vercel env ls preview | grep "chore/coalter-mirror-d3b-canary"` → **0 件**

### 4.2 Canary branch + worktree cleanup

| 対象 | status |
|---|---|
| remote branch `chore/coalter-mirror-d3b-canary` | ✅ 削除済 (`git push origin --delete`) |
| local branch `chore/coalter-mirror-d3b-canary` | ✅ 削除済 (`was ae3faaee`) |
| worktree `/Users/haradataishi/Culcept-coalter-d3b` | ✅ remove --force |
| local remote-ref | ✅ `git fetch --prune` 同期 |

### 4.3 Vercel deployment (artifact 自体は保持、Vercel auto-delete 待ち)

- `dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7` (canonical URL `culcept-jyq5mnif8-...`): **Ready のまま** (Vercel 側で auto-delete されるまで履歴として残る)
- 削除に伴う Production / Preview / Development への影響: **0** (deploy artifact は env scope と独立)

### 4.4 Production / all-Preview / Development env 不変確認 (D-5 final verify)

| scope | env state | 評価 |
|---|---|---|
| **Production** | NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY すべて 125d ago | ✅ 不変 |
| **all-Preview** (Alter 別作業の正当 scope) | NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 1d ago (Alter staging) + SUPABASE_URL / SERVICE_ROLE_KEY 125d ago (inherited) | ✅ 不変 (Alter 別作業に影響 0) |
| **Development** | SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 125d ago (inherited のみ) | ✅ 不変 |
| Mirror / FORCED_CANARY 関連 env (全 scope) | 0 件 | ✅ leftover なし |

### 4.5 最終 D-1 reverify (post-cleanup)

cleanup 完了後、`dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7` に対して D-1 を最後に 1 回実行:

| Gate | 結果 |
|---|---|
| Gate 1: URL canonical-ness | ✅ PASS (`hash=jyq5mnif8`) |
| Gate 2: Deploy meta git attribution | ✅ PASS (`source=git`, `gitSource.type=github`, `ref=chore/coalter-mirror-d3b-canary`) |
| Gate 3: HTML bundle Supabase ref | ✅ PASS (`aljavfujeqcwnqryjmhl` baked、`hjcrvndumgiovyfdacwc` 不在) |
| **Overall** | **🟢 ALL GATES PASS** (post-cleanup の deploy artifact 不変、Phase D 構造的成立を最後に再確認) |

→ canary infra を完全 cleanup した時点でも、**過去の canary deploy artifact は git-attributed Preview として永続的に成立** を示している (Vercel auto-delete までは Phase D の証跡として参照可能)。

---

## §5. Service_role inheritance の永続記録 (Phase D-3-β-0 audit 結論)

Phase D-3-β-0 audit (read-only) で確定した 6 fact (D-4 smoke 中も維持):

| # | fact | Phase D 全期間の状態 |
|---|---|---|
| 1 | `SUPABASE_SERVICE_ROLE_KEY` は all-Preview scope (125d ago) から canary deploy の `process.env` に inheritance | D-3-β / D-4 中も canary scope 追加投入 0 |
| 2 | `/api/talk/threads` は service_role を READ-only で使用 (auth.admin.getUserById + table RLS bypass) | D-4 smoke で trigger、write 0 |
| 3 | 最小 smoke 経路では service_role write 0 件 | D-4 smoke で実証、bottom sheet / intent UI / message 送信なし |
| 4 | `/api/coalter/handoff-events` は bottom sheet 操作時のみ service_role write | D-4 smoke で trigger されず |
| 5 | `/api/talk/intent-check` / `intent-translate` は intent UI 操作時のみ service_role READ | D-4 smoke で trigger されず |
| 6 | MirrorHost / useMirrorEngine は service_role を構造的に未消費 | D-4 で shadow mount 確認、No-Effect Contract 永続的に遵守 |

`lib/supabase/client.ts` + `lib/supabase/server.ts` の anon-only contract (canon §2.1) は Phase D 全期間で不変。

---

## §6. Phase D で追加された永続 canon (anti-patterns + canon update)

| canon | source | 内容 |
|---|---|---|
| **canon 11** | D-0 §3.2 | canary deploy は **git-attributed Preview build のみ**を smoke 本命にする。`vercel --force` は L1 Mount smoke のみ許容 |
| **canon 12** | D-0 §3.2 | smoke layer 3 分類 (Mount / Mirror visible / CoAlter chat) を起票 PR で明示宣言義務 |
| **canon 13** | D-0 §3.2 | Failure mode catalog を新規 failure 観測都度に anti-patterns doc §1 に追記 |
| **ref source-of-truth canon** | D-3-α | `aljavfujeqcwnqryjmhl` = Production / `hjcrvndumgiovyfdacwc` = Alter staging を `docs/coalter-supabase-ref-canon.md` で permanent canonicalize、変更は CEO 直接承認 + 全 6 file 同期必須 |
| **Production env vs Production data 明示区別** | D-3-α §2.3 + §6 | Mirror canary smoke では Production env (Vercel scope) を **触らない** が、Production Supabase **data は使う**。両者を別概念として扱う、曖昧表現禁止 |
| **D-1 Gate 2 CEO 10 criteria** | D-1 fix (PR #205) | `source === "cli"` は確実 FAIL / `gitSource.type === "github"` 必須 / branch refs 両方欠落なら FAIL / sha 整合 / source field の variant (`"git"` / `"github"`) は許容 |

---

## §7. Phase E (Mirror Channel 製品化) への hand-off

Phase D で **infra (canary deploy 経路 + verification) は proven**。次 phase は **Mirror Channel を Production に向けて段階的に展開** する Phase E (別 起票)。

### 7.1 Phase E で扱う事項 (Phase D scope 外)

- **Mirror visible smoke (`NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED=true`)**: D-4 で deferred、Phase E-1 で必要なら実施
- **Mirror Channel Production gradual rollout**:
  - allowlist user 経由の Production 有効化 (CEO + 招待 user 限定)
  - feature flag 段階的拡大
  - rollback 機構 (kill switch via env)
- **Production smoke 観測項目** (`docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §5 の 19 項目 + Phase C 追加 7 項目を継承)
- **Mirror text content quality 観測** (Question/Proposal/Suggestion 混入なし、reflection-only 遵守)

### 7.2 Phase E で **再利用する Phase D artifacts**

| Phase D artifact | Phase E 再利用方法 |
|---|---|
| `.canary-trigger.json` | Phase E でも canary trigger marker として使用 |
| `scripts/coalter/verify-canary-deploy.ts` | Phase E の任意 canary smoke で必須 pre-flight |
| `docs/coalter-supabase-ref-canon.md` | ref role の正本、Phase E でも遵守 |
| `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` | Phase E の canary smoke PR で使用 |
| `docs/coalter-aoo-canary-deploy-anti-patterns.md` | Phase E で必読 |

### 7.3 Phase E 起票時の必須 reference (canon)

Phase E (or 任意の後続 canary smoke phase) を起票する PR は、PR description に以下を含めること:

1. 本 Phase D close docs (`docs/coalter-aoo-phase-d-close.md`、本 file) への参照
2. canary smoke PR template (`.github/PULL_REQUEST_TEMPLATE/canary-smoke.md`) の checklist 完全充足
3. `docs/coalter-aoo-canary-deploy-anti-patterns.md` 全 section 読了確認
4. `docs/coalter-supabase-ref-canon.md` §1 expected/forbidden 整合確認 (drift 防止 test で機械的に enforce)

---

## §8. Phase D 全期間の不可侵境界保持確認

| 不可侵境界 | Phase D 全期間の状態 |
|---|---|
| Production env (Vercel scope) | **0 touch** (125d ago の値が不変、本日 cleanup 後も同じ) |
| all-Preview env (Alter 別作業の正当 scope) | **0 touch** (Alter team の 1d-ago 投入を尊重、Mirror canary は branch-scoped override で隠す手法) |
| Development env | **0 touch** |
| `SUPABASE_SERVICE_ROLE_KEY` の canary scope 追加投入 | **0** (D-3-β 全期間で inheritance のみ、追加投入なし) |
| Supabase schema / migration | **0** |
| `package.json` / `package-lock.json` | **0 diff** (Phase D 全期間) |
| runtime app code (`app/` / `lib/` / `components/` / `hooks/` のうち Mirror Channel **以前**から存在する部分) | **0 diff** (Phase D は infra phase、Mirror runtime 本体は Phase B B-5b で着地済、Phase D で再 touch なし) |
| `vercel.json` | 1 line diff (D-2 ignoreCommand 2 段ゲート化)、Phase D 内では D-2 以降不変 |
| Mirror runtime (`components/coalter/mirror/**`、`hooks/useMirrorEngine.ts`) | **0 diff** (Phase D 全期間) |
| ChatClient (`app/(culcept)/talk/[threadId]/ChatClient.tsx`) | **0 diff** (Phase D 全期間) |
| CoAlter API routes (`app/api/coalter/**`) | **0 diff** (Phase D 全期間) |

---

## §9. Phase D 全期間の merged PR 一覧

| PR | branch | 種別 | merge commit (origin/main) |
|---|---|---|---|
| #197 | `docs/coalter-aoo-phase-d0-canary-deploy-route-design` | D-0 design (docs) | `aa49a99f` |
| #198 | `feat/coalter-d1-verify-canary-deploy-script` | D-1 script + 41 tests | `837b46f1` |
| #200 | `feat/coalter-d2-canary-trigger-build-route` | D-2 ignoreCommand + .canary-trigger.json | `635cb30b` |
| #203 | `feat/coalter-d3a-supabase-ref-canon` | D-3-α canon + 45 tests | `8eb9eca7` |
| #205 | `fix/coalter-d1-vercel-git-source-gate` | D-1 fix (CEO 10 criteria) | `e80d8eb8` |
| #206 | `chore/coalter-mirror-d3b-canary` | D-3-β trigger commit | `d3042b40` |
| **本 PR** | `docs/coalter-d5-phase-d-close` | D-5 close (docs only) | (本 PR merge 後の commit) |

---

## §10. Phase D close declaration

Phase D は本日 (2026-05-19) **正式 close**。

- 達成: production-equivalent canary smoke の構造的成立を実機実証
- 残留: なし (canary infra cleanup 完了)
- 不可侵境界: 全期間維持
- 次 phase: Mirror Channel 製品化 (Phase E、別 起票)

本 doc は Phase D の **永続記録** として `docs/coalter-aoo-phase-d-close.md` に残る。Phase E 以降の任意 canary smoke 起票時、本 doc + §6 canon + §7 hand-off section を必読 reference とする。

**End of Phase D.**
