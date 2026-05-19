# CoAlter AOO Phase E-1 — Close (Visible Smoke PASS)

**ステータス**: Phase E-1 正式 close (2026-05-19)
**前提**: Phase E-0 plan (`docs/coalter-aoo-phase-e-plan.md`、PR #211 merged `314ed277`)
**本 PR の関連 PR**: Phase E-1 実装 + visible smoke artifacts (PR #213 merged `f37a684d`)
**次 phase**: E-2-α (Production gradual rollout、CEO のみ、別 起票)

---

## §0. なぜ E-1 close docs が必要か

Phase E-0 plan §3.9 + §9.2 で定義された **E-2-α 着手 gate condition #3** が「E-1 close 記録 main 着地」を要求する。本 docs は:

- E-1 visible smoke の **PASS 結果を永続記録**
- canary infra cleanup 完了を構造的に記録
- E-2-α 着手の prerequisite として参照される

Phase D-5 close docs (`docs/coalter-aoo-phase-d-close.md`) と同 pattern。

---

## §1. E-1 達成事項

### 1.1 E-1 で main に着地した artifacts (PR #213、merge commit `f37a684d`)

| artifact | path | 役割 |
|---|---|---|
| reflection-only canon CI test (Phase E 永続 gate) | `tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts` (46 tests) | template の positive hedge ending / PII firewall / commit vocab banlist / 第二人称 banlist / forcedCanaryMode 構造的不変 を CI で enforce |
| E-1 visible smoke runbook | `docs/coalter-aoo-phase-e1-visible-smoke-runbook.md` (10 sections) | E-1 CEO 実機 smoke 手順 + PASS/FAIL 10 criteria + cleanup 手順 |
| `.canary-trigger.json` E-1 metadata | (修正、main 着地) | trigger_count=3、phase=E-1、smoke_purpose 更新 |
| lint fix (rename `module` → `loadedModule`) | reflectionCanonInvariant.test.ts §6 | Next.js ESLint rule `@next/next/no-assign-module-variable` 違反解消 |

### 1.2 E-1 visible smoke 実機実施結果 (CEO PASS 判定、2026-05-19)

CEO がブラウザで canonical URL `https://culcept-b0weep0zr-taishis-projects-0a8deb17.vercel.app` を開き、以下を順に確認・記録:

| Step | 観測 | 結果 |
|---|---|---|
| Step 1: login | Production Supabase Auth で login 成功 | ✅ |
| Step 2: Home | `/` (AneurasyncHome) 表示、`/baseline` / `/stargazer` redirect なし | ✅ |
| Step 3: /talk | thread list 表示、counterpart 実 user 名 `kumi` 表示 ("ユーザー" placeholder ではない) | ✅ |
| Step 4: /talk/[threadId] | ChatClient mount、既存 message 履歴表示 (Production data 由来) | ✅ |
| Step 5: CoAlterButton 表示 | header「見守り中」 + CoAlterButton 表示 | ✅ |
| Step 6: activate | CoAlter activate 済 (本 smoke 前から enabled state 維持) | ✅ |
| Step 7: MirrorHost mount (shadow) | `mirror-surface-shell` + `mirror-sleep-toggle` DevTools 確認 | ✅ |
| **Step 7a: MirrorVisibleSurface mount (E-1 核心)** | `mirror-visible-surface` 表示 | ✅ |
| **Step 7b: visible text reflection-only canon 視認** | text = **「少し、間がほしいような…そんな雰囲気でした」** (5 templates の 1 つ、reflection-only 準拠) | ✅ |
| Step 7c: close/sleep button 表示確認 | 両 button DOM 存在、**click は実施せず** (CEO Q4 厳守) | ✅ |
| Step 7d: a11y 属性 | `aria-live="polite"` + `aria-atomic="true"` 確認 | ✅ |
| Step 7e: console 重大 error 0 | uncaught exception / auth fail / engine crash 0 | ✅ |

### 1.3 E-1 PASS 判定 (10 acceptance criteria、本 runbook §1.1 反映)

| # | criterion | 結果 |
|---|---|---|
| 1 | D-1 verify 3 gates 全 PASS | ✅ |
| 2 | expected Supabase ref `aljavfujeqcwnqryjmhl` 検出 | ✅ |
| 3 | forbidden Supabase ref `hjcrvndumgiovyfdacwc` 0 hit | ✅ |
| 4 | canonical URL のみ smoke (user alias / git branch alias 不使用) | ✅ |
| 5 | visible Mirror surface 表示 | ✅ |
| 6 | visible text reflection-only canon 遵守 | ✅ |
| 7 | close/sleep button **表示のみ確認、click しない** | ✅ (CEO Q4) |
| 8 | **PII leak 0** | ✅ |
| 9 | console 重大 error 0 | ✅ |
| 10 | smoke 後 cleanup 手順明記 (runbook §6) | ✅ |

→ **E-1 visible smoke PASS** (CEO 直接判定、2026-05-19)

### 1.4 構造的に確定したこと

- **production-equivalent CoAlter flow + visible Mirror UI が canary build で成立**
- `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED=true` (canary scope) で `MirrorVisibleSurface` render 経路を構造的に発火可能
- **reflection-only canon (Phase B 北極星)** が runtime + CI test の二重 enforce で永続化
- staging 混入 (C-4 BLOCKED 同型) **再発せず** (HTML bundle に forbidden ref 0 hit)
- Mirror runtime **No-Effect Contract 遵守** (network/storage/timer 0)

---

## §2. Phase E-1 で永続化された Phase E artifacts

| artifact | path / location | 永続性 |
|---|---|---|
| **reflection-only canon CI test** | `tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts` (46 tests) | **Phase E 全期間 + 後継 phase の永続 merge gate** |
| visible smoke runbook | `docs/coalter-aoo-phase-e1-visible-smoke-runbook.md` | E-1 期間 reference、E-2 起票時 hand-off |
| 本 close docs | `docs/coalter-aoo-phase-e1-close.md` (本 file) | Phase E-1 永続記録 |

### 2.1 Phase D 由来 + Phase E-1 由来の test 集計

| test suite | test 数 | phase 起源 |
|---|---|---|
| `verifyCanaryDeploy.test.ts` | 58 | Phase D-1 + D-1 fix |
| `canaryTriggerIgnoreCommand.test.ts` | 20 | Phase D-2 |
| `supabaseRefCanon.test.ts` | 45 | Phase D-3-α |
| **`reflectionCanonInvariant.test.ts`** | **46** | **Phase E-1 (本 close で永続化)** |
| **小計 (Mirror canary 関連)** | **169** | Phase D + E-1 由来の永続 regression guard |

---

## §3. Phase E-1 cleanup 完了確認 (E-1 close 段階で実施)

### 3.1 Canary scope env 削除 (6 件、E-1 投入 → 本 close 段階で削除)

| key | status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (canary scope) | ✅ 削除済 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (canary scope) | ✅ 削除済 |
| `SUPABASE_URL` (canary scope) | ✅ 削除済 |
| `SUPABASE_ANON_KEY` (canary scope) | ✅ 削除済 |
| `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` (canary scope) | ✅ 削除済 |
| `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED` (canary scope) | ✅ 削除済 |

確認: `vercel env ls preview | grep "feat/coalter-e1-visible-smoke-canary"` → **0 件**

### 3.2 Canary branch + worktree cleanup

| 対象 | status |
|---|---|
| remote branch `feat/coalter-e1-visible-smoke-canary` | ✅ 削除済 (`git push origin --delete`) |
| local branch | ✅ 削除済 (was `2abcedf5`) |
| worktree `/Users/haradataishi/Culcept-coalter-e1` | ✅ remove --force |
| local remote-ref | ✅ `git fetch --prune` 同期 |

### 3.3 Vercel deployment (artifact 自体は保持、Vercel auto-delete 待ち)

- `dpl_9fDfcj4tYFGDPWxbD4atwg8dXvD2` (canonical `culcept-b0weep0zr-...`): **Ready のまま**、Vercel auto-delete までは履歴として残る
- 削除に伴う Production / Preview / Development への影響: **0**

### 3.4 Production / all-Preview / Development env 不変確認 (E-1 close final verify)

| scope | env state | 評価 |
|---|---|---|
| **Production** | NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY すべて 125d ago | ✅ 不変 |
| **all-Preview** | Alter 別作業の 1d ago + `preview/plan-home-swipe-smoke` branch scope 1h ago | ✅ 不変 (E-1 触らず) |
| **Development** | SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 125d ago (inherited のみ) | ✅ 不変 |
| Mirror / FORCED_CANARY 関連 env (全 scope) | 0 件 | ✅ leftover なし |

### 3.5 最終 D-1 reverify (post-cleanup)

cleanup 完了後、E-1 deployment `dpl_9fDfcj4tYFGDPWxbD4atwg8dXvD2` に対して D-1 を最後に 1 回実行:

| Gate | 結果 |
|---|---|
| Gate 1: URL canonical-ness | ✅ PASS (`hash=b0weep0zr`) |
| Gate 2: Deploy meta git attribution | ✅ PASS (`source=git, gitSource.type=github, ref + sha 完全一致`) |
| Gate 3: HTML bundle Supabase ref | ✅ PASS (`aljavfujeqcwnqryjmhl` baked、`hjcrvndumgiovyfdacwc` 不在) |
| **Overall** | **🟢 ALL GATES PASS** (build artifact 不変、cleanup 後も Phase E-1 構造的成立を最後に再確認) |

→ canary infra cleanup 完了後でも、**過去の canary deploy artifact は git-attributed Preview として永続的に成立** (Phase D-5 と同 pattern、Vercel auto-delete までは Phase E-1 の証跡として参照可能)。

---

## §4. CEO Q1-Q10 (Phase E-0 で承認済) と E-1 で達成した項目の対応

| Q | answer | E-1 で達成 |
|---|---|---|
| Q1 (Production env 緩和承認) | YES | E-1 では未着手 (E-2 で実施、本 phase は canary visible のみ) |
| Q2 (allowlist Option A) | env-based | E-1 では未実装 (E-2 で実施) |
| Q3 (kill switch L1+L3) | 両方必須 | E-1 では未実装 (E-3 で実施) |
| **Q4 (close/sleep click)** | **表示確認のみ** | **✅ E-1 で完全遵守、click 0** |
| **Q5 (canon CI test E-1 同時着地)** | YES、E-1 と同時 | **✅ 本 PR (#213) で 46 tests 同時 main 着地** |
| Q6 (onboarding tooltip E-2-β 以降) | YES、E-2-β | E-1 では未着手 |
| Q7 (failure injection drill) | YES、E-2-α 前必須 | E-1 では未着手 (E-3 で実施) |
| Q8 (reflection text catalog E-3) | YES、E-3 | E-1 では未着手 |
| Q9 (A/B rollout) | Deferred | Phase E 見送り |
| Q10 (期間 + 安全優先停止) | 3-4 週間目安、PII/discomfort/false positive 即停止 | E-1 で安全観測 0 件、即停止 trigger 不発火 |

---

## §5. E-2-α 着手 gate condition の現状 (CEO 補正 8 condition)

Phase E-0 §9.2 で確定された E-2-α 着手 8 condition のうち、本 E-1 close で **4 condition 達成** (本 PR merge 後の確定状態、残 4 condition は E-2-α 前の別 phase で実施):

| # | condition | 状態 |
|---|---|---|
| 1 | E-1 visible smoke PASS (10 criteria) | ✅ **本 close で達成** |
| 2 | E-1 canary cleanup 完了 | ✅ **本 close で達成** |
| 3 | **E-1 close 記録 main 着地** | ✅ **本 PR で達成予定** |
| 4 | kill switch L1 + L3 drill 済 | ⏸ E-3 で実施 (未着手) |
| 5 | allowlist 実装 (Option A) 着地 | ⏸ E-2-α 前の別 PR (未着手) |
| 6 | reflection-only canon CI test 着地 | ✅ PR #213 で達成 (`reflectionCanonInvariant.test.ts` 46 tests main 着地) |
| 7 | CEO 直接承認 | ⏸ E-2-α 起票 PR で (未取得) |
| 8 | Sentry baseline 記録済 | ⏸ E-3 で実施 (未着手) |

→ **8 condition 中 4 達成** (1 / 2 / 3 / 6)、**残 4 condition (4 / 5 / 7 / 8) は未達**。Production env touch (E-2-α) は **残 4 condition 全達成後**。

### 5.1 残 condition 正本一覧 (CEO 期待表現と完全一致、Phase E-2 着手 gate の core)

Phase E-2-α 着手前に達成すべき 4 condition は以下:

1. **kill switch L1 + L3 drill 済** (E-3 phase で実施、未着手)
2. **allowlist 実装 (Option A env-based) 着地** (E-2-α 前の別 PR、未着手)
3. **CEO 直接承認** (E-2-α 起票 PR で取得、未取得)
4. **Sentry baseline 記録** (E-3 phase で実施、未着手)

→ この 4 condition がすべて揃うまで、Production env への Mirror Channel 関連 env (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` + `_ALLOWLIST_USER_IDS`) 投入は **構造的に不可** (canon §12.1 補正 + §9.2 gate 厳守)。

### 5.2 Phase E-2 実装ステータス (本 PR 時点)

- **Phase E-2 実装は未着手** (E-2-α / E-2-β / E-2-γ いずれも 0 着手)
- **Production env touch 0** (Phase E-1 全期間維持、本 PR でも触らず)
- **C-5 着手なし** (Phase C-5 系作業は Phase E と独立、本 PR 範囲外)

---

## §6. Phase E-2 への hand-off

### 6.1 Phase E-1 で得た知見 (Phase E-2 起票時 reference)

1. **canary visible smoke は production-equivalent flow で成立**: E-2 でも同じ Supabase Production ref を使う path が proven
2. **FORCED_CANARY mock data の安全性**: 5 templates すべて reflection-only canon 遵守、CI test で構造的 enforce
3. **service_role inheritance の現実**: D-3-β-0 6 fact は E-1 でも全て invariant 維持、E-2 でも継承
4. **CEO 視認 + CI test 二重 review**: canon 違反検出の最終 verifier は CEO 視認、CI test は前段 gate
5. **build OOM の transient 性**: 初回 OOM → 2 回目 Ready、Vercel 側の memory allocation の揺らぎ (再現性低、E-2 でも要監視)

### 6.2 Phase E-2-α 起票時の必読 reference

- 本 E-1 close docs (`docs/coalter-aoo-phase-e1-close.md`、本 file)
- Phase E-0 plan (`docs/coalter-aoo-phase-e-plan.md` §4 E-2 計画 + §9.2 8 condition gate)
- Phase D-5 close (`docs/coalter-aoo-phase-d-close.md` §5 service_role inheritance / §6 canon)
- Supabase ref canon (`docs/coalter-supabase-ref-canon.md`)
- anti-patterns canon (`docs/coalter-aoo-canary-deploy-anti-patterns.md`)

### 6.3 Phase E-2-α 起票時の必須準備 (Claude/CEO による)

- E-2-α 前に **kill switch L1 + L3 実装 PR** + **drill 実施 + drill 記録**
- E-2-α 前に **allowlist runtime code 実装 PR** (Mirror engine に user.id allowlist check 追加)
- E-2-α 前に **Sentry baseline error rate 記録** (Mirror module の現状 error rate を測定)
- E-2-α で投入する 2 keys (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` + `_ALLOWLIST_USER_IDS`) を **CEO 直接承認**

---

## §7. Phase E-1 全期間の不可侵境界保持確認

| 不可侵境界 | Phase E-1 全期間の状態 |
|---|---|
| Production env (Vercel scope) | **0 touch** (125d ago の値が不変) |
| all-Preview env (Alter 別作業の正当 scope) | **0 touch** (Alter team work-stream 不変) |
| Development env | **0 touch** |
| `SUPABASE_SERVICE_ROLE_KEY` の canary scope 追加投入 | **0** (inheritance のみ、Mirror code は anon-only contract で構造的に未消費) |
| Supabase schema / migration | **0** |
| `package.json` / `package-lock.json` | **0 diff** (Phase E-1 全期間) |
| runtime app code (`app/` / `lib/` / `components/` / `hooks/`) | **0 diff** (Phase E-1 全期間、E-1 は infra/test/docs phase) |
| `vercel.json` ignoreCommand (D-2 確定) | **0 diff** |
| Mirror runtime (`components/coalter/mirror/**` / `hooks/useMirrorEngine.ts`) | **0 diff** |
| ChatClient (`app/(culcept)/talk/[threadId]/ChatClient.tsx`) | **0 diff** |
| CoAlter API routes (`app/api/coalter/**`) | **0 diff** |
| `docs/coalter-supabase-ref-canon.md` (D-3-α canon) | **0 diff** |
| `scripts/coalter/verify-canary-deploy.ts` (D-1 fix 後) | **0 diff** |

---

## §8. Phase E-1 merged PR 一覧

| PR | branch | 種別 | merge commit (origin/main) |
|---|---|---|---|
| #213 | `feat/coalter-e1-visible-smoke-canary` | canon CI test + runbook + lint fix + trigger commit | `f37a684d` |
| **本 PR** | `docs/coalter-aoo-phase-e1-close` | E-1 close docs (本 file) + decision-log entry | (本 PR merge 後の commit) |

---

## §9. Phase E-1 close declaration

Phase E-1 は本日 (2026-05-19) **正式 close**。

- 達成: **visible Mirror UI が canary build で render され、reflection-only canon を遵守することを実機実証**
- 残留: なし (canary infra cleanup 完了、env 全 scope 不変、最終 D-1 reverify PASS)
- 不可侵境界: 全期間維持
- 次 phase: **E-2-α (Production gradual rollout、CEO のみ、別 起票)**

### 9.1 Phase E-2 / C-5 着手状況 (canonical 宣言)

- **Phase E-2 実装は未着手** (E-2-α / E-2-β / E-2-γ いずれも 0 着手)
- **Production env touch 0** (Phase E-1 全期間 + 本 close PR 全期間維持)
- **C-5 着手なし** (Phase C-5 系作業は Phase E と独立、本 PR 範囲外)
- **E-2-α 着手 gate**: §5.1 の残 4 condition (kill switch L1+L3 drill 済 / allowlist 実装 Option A 着地 / CEO 直接承認 / Sentry baseline 記録) すべて達成後にのみ Production env touch 可

本 doc は Phase E-1 の **永続記録** として `docs/coalter-aoo-phase-e1-close.md` に残り、Phase E-2-α 起票時に **gate condition #3 (E-1 close 記録 main 着地)** を満たす根拠 doc となる。

**End of Phase E-1.**
