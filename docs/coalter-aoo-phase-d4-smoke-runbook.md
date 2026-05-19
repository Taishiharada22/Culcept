# CoAlter Mirror — Phase D-4 Smoke Runbook (docs-only)

**作成日**: 2026-05-19
**Status**: 採択待ち（CEO レビュー後に smoke GO 判断）
**branch**: `docs/coalter-d4-smoke-runbook`
**Smoke Layer**: **L3 CoAlter chat smoke (production-equivalent)** — Phase D-0 §10
**実装範囲**: **docs only**。env / migration / production 操作 / smoke 実行を一切含まない

---

## §0. Post-merge Audit Summary (Phase D-3β merge 直後の状態証拠)

CEO 指定 6 項目の audit を **read-only 操作のみで** 実施した結果。

| # | 項目 | 結果 | 証拠 |
|---|------|------|------|
| 1 | main contains PR #206 merge commit | ✅ PASS | `git log origin/main` HEAD `d929d7143245...` (PR #207) → `d3042b40` (PR #206 D-3β trigger) → `e80d8eb8` (PR #205 source=git 受容修正) を含む |
| 2 | working tree clean | ⚠️ noise only | `M next-env.d.ts` / `M supabase/.temp/cli-latest` の Vercel CLI 系 noise、複数 PNG untracked。**D-4 関連の変更は 0、本 PR の docs commit 以外なし**。Phase B/C canon の "runtime app code 0 diff" は維持 |
| 3 | PR #206 branch state | ✅ PASS | `chore/coalter-mirror-d3b-canary` on origin at `ae3faaee36b456328a08577dc6ccb0ade665b2f9` (PR #206 trigger commit) |
| 4 | canary scope env 5 件 retained | ✅ PASS (5 件正確に投入) | `preview:branch=chore/coalter-mirror-d3b-canary` scope: **5 envs**:<br>`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED`<br>`NEXT_PUBLIC_SUPABASE_URL`<br>`NEXT_PUBLIC_SUPABASE_ANON_KEY`<br>`SUPABASE_URL`<br>`SUPABASE_ANON_KEY`<br>`FORCED_CANARY_ENABLED` 不在 ✅<br>`DIAGNOSTIC_EXPOSE` 不在 ✅ |
| 5 | D-1 verify 3 gates re-run | ✅ ALL 3 GATES PASS | 詳細は §0.1 |
| 6 | Production / all-Preview / Development env unchanged | ✅ PASS (counts 静的) | Production: 13 envs (不変)、preview (all-branch): 18 envs (Alter 別作業 scope、不変)、development: 1 env (GEMINI_API_KEY、不変)。**SUPABASE_SERVICE_ROLE_KEY は本 audit 時点で `development,preview,production` の 3 scope に同居（既存）、canary scope に投入 0**<br>※ snapshot 不変判定は CEO の D-3α / D-3β PR description 記載 env list との照合で最終確証 |

### §0.1 D-1 verify 再実行 raw output (read-only)

```text
deployment URL    : https://culcept-jyq5mnif8-taishis-projects-0a8deb17.vercel.app
deployment ID     : dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7
expected branch   : chore/coalter-mirror-d3b-canary
expected Supabase : aljavfujeqcwnqryjmhl
forbidden Supabase: hjcrvndumgiovyfdacwc

✅ Gate 1 [PASS] — URL canonical-ness
  host=culcept-jyq5mnif8-taishis-projects-0a8deb17.vercel.app, hostType=canonical, hash=jyq5mnif8

✅ Gate 2 [PASS] — Deploy meta git attribution
  source=git, gitSource.type=github, gitSource.ref=chore/coalter-mirror-d3b-canary,
  gitSource.sha=ae3faaee36b4, meta.githubCommitRef=chore/coalter-mirror-d3b-canary,
  isGitAttributed=true

✅ Gate 3 [PASS] — HTML bundle Supabase ref
  foundRefs=[aljavfujeqcwnqryjmhl], expectedRef=aljavfujeqcwnqryjmhl,
  forbiddenRef=hjcrvndumgiovyfdacwc (absent)

🟢 ALL GATES PASS — smoke 開始可能
```

### §0.2 Audit Caveat

本 audit は **CEO 操作なし** で `Vercel API GET` / `git log` / `docs read` のみで実施した read-only audit。env scope の **数値**は確認したが、CEO 個別 env 投入の time-series snapshot は CEO 側の D-3α / D-3β PR description 記載との突合で最終確証となる。**Production / all-Preview / Development env が D-3β 投入以降 touch されていない** ことの **最終 sign-off は CEO 判断**。

---

## §1. Smoke 目的 / Scope / 非目的

### 1.1 目的

`docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` §10 の **L3 CoAlter chat smoke (production-equivalent)** を 1 回実機検証する：

- canary build (PR #206、Supabase ref `aljavfujeqcwnqryjmhl` baked-in) が **Production-equivalent CoAlter 導線** で起動できる
- `MirrorHost` が **正しい環境** (= production Supabase data 上) で mount する
- `useMirrorEngine` engine が **正しい flag context** で起動する
- C-4 BLOCKED の structural 再発が起きない（forbidden ref を踏まない / user alias に飛ばされない）

### 1.2 Scope (本 D-4 で扱う対象、最小)

- login → Home → トーク → 既存 thread → CoAlterButton → activate → MirrorHost mount
- canonical URL のみで実施
- READ-only 系 service_role 経路 (`/api/talk/threads`) を踏むのは許容（後述 §5）
- 観測項目: §7 PASS / §8 FAIL に列挙

### 1.3 非目的 (本 D-4 ではやらない)

- 全 CoAlter 機能の検証（D-4 は **最小 smoke**、機能完全網羅ではない）
- L2 MirrorVisibleSurface の **積極的可視化**（forced canary mode を最初から有効化しない、§6 参照）
- proposal / handoff / intent UI / bottom sheet の操作（service_role **write** 経路を踏むため、§4 で禁止）
- message 送信（Mirror engine の post-speak verification を triggering、scope 拡張）
- chat 切断後 cleanup の検証（D-5 で別途）
- Vercel env state の D-3α / D-3β snapshot 比較（CEO sign-off で確証）

---

## §2. Canonical URL (Single Source of Truth)

**CEO が D-4 smoke で開く URL は以下の 1 個のみ**:

```
https://culcept-jyq5mnif8-taishis-projects-0a8deb17.vercel.app
```

### 2.1 禁止される URL

| 種別 | パターン | 理由 |
|------|----------|------|
| user alias | `https://culcept-th7328aish-1775-...vercel.app` | 複数 user-attributed deploy 間で奪い合い、reproducibility なし。Phase D-0 §5.2 / failure mode F4 |
| git branch alias | `https://culcept-git-chore-coalter-mirror-d3b-canary-...vercel.app` | 補助用途のみ、本命 URL ではない。最新 deploy の hash 解決が drift する |
| 旧 deploy URL | `https://culcept-<別 hash>-taishis-projects-0a8deb17.vercel.app` | PR #206 以外の deployment 経由。env scope の time-series 不明確、smoke の証拠性が弱まる |
| Aneurasync production URL | `https://aneurasync.com/` 等 | **Production deploy** に飛び、Mirror flag が false の build。D-4 の意味なし |

### 2.2 Canonical URL を確認する 1-shot command (Pre-Open verify)

```bash
# (read-only) deploy が READY 状態かつ canonical hash が正しいことを再確認
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json')).get('token',''))")
curl -s "https://api.vercel.com/v13/deployments/dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7?teamId=team_wS0pdrzKkPjZAf5K5QJuqy5h" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('state:',d.get('readyState')); print('url:',d.get('url'))"
# 期待: state=READY, url=culcept-jyq5mnif8-taishis-projects-0a8deb17.vercel.app
```

---

## §3. CEO 操作手順 (timed / gated)

各 step に **想定操作時間** と **通過 gate** を明示。**gate FAIL なら次 step に進まず § 8 stop-the-line を発動**。

### 3.0 Pre-Open verify (smoke 開始 30 秒前、必須)

| 確認項目 | command / action | 通過 gate |
|----------|------------------|-----------|
| §0.1 D-1 verify 3 gates ALL PASS が **最新の** verify 結果である | `npx tsx scripts/coalter/verify-canary-deploy.ts --deployment-url=https://culcept-jyq5mnif8-taishis-projects-0a8deb17.vercel.app --deployment-id=dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7 --expected-branch=chore/coalter-mirror-d3b-canary --expected-supabase=aljavfujeqcwnqryjmhl --forbidden-supabase=hjcrvndumgiovyfdacwc` | `🟢 ALL GATES PASS` |
| deploy state | §2.2 command | `state: READY` |
| §4 禁止 operations を頭に内在化 | CEO 自己確認 | (本 doc を熟読、§4 を 1 回読み直す) |
| ブラウザ private window で開く | Safari Private / Chrome Incognito | localStorage / cookie 干渉なし |
| DevTools を開いた状態にする | Cmd+Option+I (Mac) | Console + Network + Elements tab 利用可能 |

### 3.1 Step 1 — login (想定 30 秒)

| 項目 | 内容 |
|------|------|
| action | canonical URL を開く → Supabase Auth で login |
| 期待 redirect | `/login` (or 直接 `/`) → auth 成功 → `/` (Home) |
| gate | Console に **Mirror 関連 error 0** / Network に forbidden Supabase ref (`hjcrvndumgiovyfdacwc`) request 0 / login 成功時に `aljavfujeqcwnqryjmhl.supabase.co` への request 確認 |
| 失敗時 | §8 F1 (login break) or F3 (forbidden ref) → stop-the-line |

### 3.2 Step 2 — Home 表示 (想定 1 分)

| 項目 | 内容 |
|------|------|
| action | login 後の遷移先が AneurasyncHome (= `/` Home Server Component) であることを目視 |
| 期待 | baseline_completed_at が CEO data に存在するため `/baseline` リダイレクトされない |
| gate | `/plan` に固定されない / `/baseline` リダイレクトされない / Home の主要 UI 要素が render (`MAIN_NAV`, `HOME_QUICK_NAV`, glassmorphism cards) |
| 失敗時 | §8 F2 (/plan 固定) or F5 (UI 破壊) → stop-the-line |

### 3.3 Step 3 — トークへ移動 (想定 30 秒)

| 項目 | 内容 |
|------|------|
| action | `MAIN_NAV`「メッセージ」(or `HOME_QUICK_NAV`「トーク」) を click → `/talk` 到達 |
| 期待 | `TalkPageClient` が render、thread 一覧が表示 |
| gate | thread 一覧が空配列でない / 404 でない / requireBaseline gate 通過 / forbidden ref network request 0 |
| 失敗時 | §8 F2 or F4 (thread list 空/404) → stop-the-line |

### 3.4 Step 4 — 既存 thread を開く (想定 1 分)

| 項目 | 内容 |
|------|------|
| action | 既存 thread (genome_connections status=accepted の対) を 1 件 click → `/talk/[threadId]` 遷移 |
| 期待 | ChatClient が render、fetchMessages / fetchGenomeCard / fetchCounterpart が成功 |
| gate | thread 内の既存 message 一覧表示 / network log に `/api/talk/threads` (service_role READ-only, §5) と Supabase data の正常 fetch / forbidden ref 0 / `aljavfujeqcwnqryjmhl` への request 確認 |
| 失敗時 | §8 F4 (thread 開けない) → stop-the-line |

### 3.5 Step 5 — CoAlterButton 確認 (想定 30 秒)

| 項目 | 内容 |
|------|------|
| action | chat header の CoAlterButton コンポーネントが render されているか目視 |
| 期待 | CoAlterButton が **見える** 状態 (state: inactive or pending or enabled、disabled でない) |
| gate | DevTools Elements で `<button>` 要素として存在 / その state class / role が inactive/pending/enabled いずれか / **`disabled` state でない** |
| 失敗時 | §8 F6 (CoAlterButton 不表示) → stop-the-line |

### 3.6 Step 6 — CoAlter activate (想定 1-2 分)

| 項目 | 内容 |
|------|------|
| action | CoAlterButton を **click 1 回のみ** (`useCoAlter(threadId).activate()` 経由で `POST /api/coalter/activate`) |
| 期待 | 200 OK response、pair_state row 作成、CoAlterButton state が `active` に遷移、CoAlterCardDispatcher mount |
| gate | Network: `POST /api/coalter/activate` → 200 / Response body に pair_state 情報 / Console: Mirror 関連 error 0 / Supabase request は `aljavfujeqcwnqryjmhl` のみ |
| 失敗時 | §8 F7 (activate 破壊) → stop-the-line |

### 3.7 Step 7 — MirrorHost / Mirror state 確認 (想定 2-3 分)

| 項目 | 内容 |
|------|------|
| action | DevTools Elements で `MirrorHost` が DOM 上に mount されているか確認 / `useMirrorEngine` の起動が console.error 0 で行われたか確認 |
| 期待 | `MirrorHost` 要素が mount (内部に `<div>` で `MirrorSurface` placeholder 等) / `MirrorVisibleSurface` は **shadow mode のため不可視 のはず** (FORCED_CANARY_ENABLED 不在のため real signal 不足、§6 参照) |
| gate | DevTools Elements で `MirrorHost` 要素存在 / Console: `[Mirror]` 系 error 0 / Network: Mirror が forbidden ref を 1 回も叩いていない |
| 失敗時 | §8 F8 (MirrorHost 不 mount) or F3 → stop-the-line |

#### §3.7.1 MirrorState 観測の制約 (重要)

`docs/coalter-aoo-canary-deploy-anti-patterns.md` で確立した canon: **Vercel Preview は production build**、`process.env.NODE_ENV === "production"` guard により `window.__coalterMirrorDiagnostic` global は **expose されない**。

代替観測方法:
1. **DevTools Elements**: `MirrorHost` DOM 存在確認
2. **DevTools Network**: Mirror engine 起動が Supabase / 内部 API call を起こしたか
3. **DevTools Console**: Mirror engine が error 出していないか (info / debug log は production build で suppress 可、error は出る)
4. **React DevTools** (CEO ブラウザに install 済の場合): MirrorHost component tree visible
5. **diagnostic global の expose は本 D-4 ではしない**（forced canary mode と同様、§6 参照、必要なら別途投入）

### 3.8 Step 8 — Smoke close (想定 1 分)

| 項目 | 内容 |
|------|------|
| action | smoke 完了。**Mirror 状態 / chat 状態に手をつけずブラウザ tab を閉じる** |
| 期待 | DevTools log を CEO が記録 (§10 action log template に従い) |
| 禁止 | CoAlter end button を押さない（§4）、message 送信しない、bottom sheet / intent UI 触らない |

---

## §4. 禁止操作 (D-4 中、明示)

CEO 指定 + Phase D-0 canon + service_role write 経路の構造的回避。

### 4.1 UI 操作禁止 (smoke 中)

| 禁止操作 | 理由 |
|----------|------|
| bottom sheet (handoff sheet) 操作 | `app/api/coalter/handoff-events/route.ts` が `supabaseAdmin` (service_role) で **write**。Production data に row 作成。D-4 scope 外 |
| intent UI 操作 | `app/api/talk/intent-check/route.ts` / `intent-translate/route.ts` が `supabaseAdmin` で cross-user intent profile **read/write**。D-4 scope 外 |
| message 送信 | post-speak verification 7-layer / Mirror engine の visible candidate evaluation が triggering、scope 拡張 |
| CoAlter end button 操作 | session 切断 → pair_state 変更 + 関連 row 削除 / 状態遷移。D-5 で扱う領域 |
| proposal UI 操作 (CoAlterCardDispatcher) | proposal write → handoff log。 service_role 経路 |
| 別 thread への移動 | scope 拡張、smoke の証拠性が薄まる |
| login 後の `/plan` 経由 | `/plan` route の data fetch が Alter 別作業の table を叩く可能性、scope 外 |
| Supabase Dashboard / Vercel Dashboard で env / data を変更 | D-4 中の env 変更禁止 (CEO 指示) |

### 4.2 Environment / deploy 操作禁止 (D-4 中 ＋ D-4 後)

| 禁止操作 | 理由 |
|----------|------|
| `npx vercel env add/rm` を canary scope 以外で実行 | Production / all-Preview / Development env 不変原則 |
| canary scope env 5 件の手動削除 | smoke 中の build context 不変原則 |
| `npx vercel redeploy` / 新規 deployment trigger | smoke 中の build context 不変、`dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7` で固定 |
| Supabase migration apply (production / staging) | smoke と無関係の data plane 変更 |
| W1-Z production migration apply | 別 wave、D-4 完了まで保留 (`docs/alter-plan-w1z-production-migration-decision.md`) |
| C-5 着手 | D-5 close 前 |
| D-5 close 着手 | D-4 完了 + CEO 判断後 |

---

## §5. service_role 注意 (READ-only 経路と WRITE 経路の境界)

`/api/talk/threads` は **service_role を使うが、READ-only**。本 D-4 smoke で踏むのは許容。

### 5.1 READ-only service_role 経路 (許容)

| route | 利用 | 理由 |
|-------|------|------|
| `app/api/talk/threads/route.ts` | `getAdminClient()` → `talk_threads`, `talk_messages` の **read** + `auth.admin.getUserById` で display name resolve | Read-only。RLS 迂回するが書き込みなし。`/talk` ページ render に必要 |

### 5.2 WRITE service_role 経路 (D-4 で**踏まない**、§4 禁止操作で構造的回避)

| route | 触れる UI | 構造的回避 |
|-------|----------|-----------|
| `app/api/coalter/handoff-events/route.ts` | bottom sheet, proposal | §4 で bottom sheet / proposal 禁止 |
| `app/api/talk/intent-check/route.ts` | intent UI | §4 で intent UI 禁止 |
| `app/api/talk/intent-translate/route.ts` | intent UI (translate) | 同上 |
| `app/api/genome-card/exchange/route.ts` | genome card exchange | D-4 scope 外、触らない |
| `app/api/genome-card/search/route.ts` | genome card search | 同上 |
| `app/api/genome-connections/[id]/route.ts` | genome connection update | 同上 |

### 5.3 Canary scope に SUPABASE_SERVICE_ROLE_KEY は投入されていない

§0 audit で確認済: `preview:branch=chore/coalter-mirror-d3b-canary` scope に `SUPABASE_SERVICE_ROLE_KEY` は存在しない。canary build は `development,preview,production` 3 scope に既存の同 key を resolve するが、**RLS-bounded anon key** で動作するため canary 内の `getAdminClient()` 呼び出しは service_role を resolve できる場合のみ動作（fallback は user-scoped supabase）。本 smoke で `/api/talk/threads` が service_role 経路を踏むのは、Phase D-0 §6 で許容された Production Supabase data plane 使用範囲内。

---

## §6. FORCED_CANARY_ENABLED の扱い

### 6.1 初期状態 (本 audit 時点で **未投入** ✅)

`preview:branch=chore/coalter-mirror-d3b-canary` scope に `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED` は存在しない (§0 §4 audit で確認)。

→ D-4 smoke は **shadow mode** で実施。`MirrorVisibleSurface` は real signal 不足で出現しない可能性大（CEO 個人の Production data に Mirror 起動条件を満たす Speech / Presence signal が現在ないため）。

### 6.2 投入が必要になる条件 (D-4 phase 内、CEO 判断のみで投入)

以下の **すべて** を満たす場合のみ投入を検討:

1. §3.7 で `MirrorHost` mount は確認できたが、`MirrorVisibleSurface` の DOM mount が観測できない
2. CEO が「実機で MirrorVisibleSurface の retreat affordance / hedged grammar template が render されること」を D-4 内で確認したい
3. §6.4 の手順を CEO が踏める時間 (約 15 分) がある

**それ以外は最初から投入しない**。MirrorHost mount + useMirrorEngine 起動の確認だけで D-4 PASS。

### 6.3 投入してはならない条件

- §0 audit で他 env scope (Production / all-Preview / Development) に同 key が存在する場合 (本 audit 時点では 0、§4 構造的に確認)
- D-4 PASS 判定が CEO 内ですでに固まっている場合 (投入は scope 拡張)
- D-5 close 段階で「smoke 再走」したい場合 (それは別 phase の話)

### 6.4 投入手順 (CEO が D-4 phase 内で必要と判断した場合のみ)

#### Step a. env 投入 (branch-scoped Preview のみ)

```bash
# CEO 操作、canary branch scope のみ
echo "true" | npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED preview chore/coalter-mirror-d3b-canary
```

#### Step b. .canary-trigger.json increment で trigger

```bash
git checkout chore/coalter-mirror-d3b-canary
# .canary-trigger.json の trigger_count を +1
git add .canary-trigger.json
git commit -m "chore(coalter): D-3γ — inject FORCED_CANARY_ENABLED for D-4 L2 observation"
git push origin chore/coalter-mirror-d3b-canary
# → 新規 deployment ID 発番、新規 canonical URL 取得
```

#### Step c. **新規 deployment ID で D-1 re-verify**

```bash
# 新 deployment ID と canonical URL を Vercel API で取得
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json')).get('token',''))")
curl -s "https://api.vercel.com/v6/deployments?teamId=team_wS0pdrzKkPjZAf5K5QJuqy5h&projectId=prj_1NRAGBi6DcqP9zwYryFjCOie7pT7&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import json,sys; [print(d['uid'], d['url'], d.get('meta',{}).get('githubCommitRef','-')) for d in json.load(sys.stdin)['deployments'][:5]]"
# 最新の dpl_<new> + canonical URL を確認

# D-1 verify を 3 gates 再走
npx tsx scripts/coalter/verify-canary-deploy.ts \
  --deployment-url=https://culcept-<new-hash>-taishis-projects-0a8deb17.vercel.app \
  --deployment-id=dpl_<new> \
  --expected-branch=chore/coalter-mirror-d3b-canary \
  --expected-supabase=aljavfujeqcwnqryjmhl \
  --forbidden-supabase=hjcrvndumgiovyfdacwc
# 期待: 3 gates 全 PASS
```

#### Step d. 新 canonical URL で smoke 再走 (§3 全体を再実施、§3.7 で MirrorVisibleSurface 確認)

#### Step e. D-4 完了時、Step a の env を必ず削除 (§9 cleanup に統合)

```bash
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED preview chore/coalter-mirror-d3b-canary --yes
```

---

## §7. PASS 条件

§3 全 step 完走 + 以下 **全部** を満たした場合のみ D-4 smoke PASS：

| # | 項目 | 観測方法 |
|---|------|----------|
| 7.1 | baseline / plan に固定されず、Home → Talk → existing thread への遷移完了 | §3.2 / §3.3 / §3.4 |
| 7.2 | thread list が Production-equivalent な内容で表示 (CEO 個人の既存 thread が見える) | §3.3 / §3.4 |
| 7.3 | forbidden Supabase ref `hjcrvndumgiovyfdacwc` が Network log に 0 回 | DevTools Network filter (`.supabase.co`) |
| 7.4 | expected Supabase ref `aljavfujeqcwnqryjmhl` が Network log に出現 | 同上 |
| 7.5 | CEO が user alias URL / git branch alias URL を踏んでいない (canonical URL 1 個のみで完走) | CEO 自己確認 |
| 7.6 | CoAlterButton が render される (`inactive` or `pending` or `enabled` state) | §3.5 |
| 7.7 | `POST /api/coalter/activate` → 200 OK、CoAlterButton が `active` state に遷移 | §3.6 |
| 7.8 | `MirrorHost` が DOM に mount される | §3.7 DevTools Elements |
| 7.9 | Console に **重大 error 0** (`[Mirror]` / `MirrorEngine` / `useMirrorEngine` 系を grep) | DevTools Console filter |
| 7.10 | UI 破壊なし (visual regression: chat header / message list / nav が崩れていない) | CEO 目視 |
| 7.11 | service_role **write** 経路 (`handoff-events` / `intent-check` / `intent-translate`) を踏んでいない | DevTools Network filter (`/api/coalter/handoff-events|/api/talk/intent-`) で 0 回 |
| 7.12 | smoke 中、env / deploy / migration 操作なし | CEO 自己確認 |

§6.4 で FORCED_CANARY_ENABLED 投入版 smoke を実施した場合は追加:

| # | 項目 | 観測方法 |
|---|------|----------|
| 7.13 | `MirrorVisibleSurface` が DOM mount され、retreat affordance (close / sleep) ボタンが render | DevTools Elements |
| 7.14 | retreat affordance を click せず、観測のみで step 8 で close | CEO 自己確認 |

---

## §8. FAIL 条件 / Stop-the-line trigger

任意の 1 つが観測されたら **即時 smoke 中止**、§9 rollback / cleanup を実行。再 deploy / 再 smoke は CEO 判断。

| code | 事象 | 該当 D-0 anti-pattern |
|------|------|------------------------|
| F1 | login break (5xx / Auth flow 不能) | infra |
| F2 | `/plan` に固定される / Home に到達しない / baseline 強制遷移 | infra / data |
| F3 | forbidden Supabase ref `hjcrvndumgiovyfdacwc` を Network log に検出 | C-4 BLOCKED 同型、要 phase D anti-pattern 追記 |
| F4 | thread list 空 or 404 / 既存 thread が開けない | data |
| F5 | user alias URL / git branch alias URL を踏んだ | F4 (D-0 §11.1) |
| F6 | service_role **write** 経路 を踏んだ (`handoff-events` / `intent-check` / `intent-translate` への POST) | §4 / §5 違反 |
| F7 | CoAlterButton 非表示 or activate POST が non-200 | engine/data |
| F8 | MirrorHost mount されない / Console に `[Mirror]` 系 error 出現 | engine |
| F9 | Console に重大 error (Mirror 以外、例: chat / auth / nav 系 critical) | runtime |
| F10 | UI 破壊 (visual regression) | runtime |
| F11 | smoke 中に env / deploy / migration を不意に触ってしまった | 制約違反 |

### 8.1 Stop-the-line 発動時の即時 action

1. ブラウザを閉じる（UI 操作を止める）
2. DevTools の Console / Network log を screenshot or copy
3. **§9 cleanup を実行しない** (cleanup は smoke PASS 後の手順、FAIL 時は CEO 判断)
4. failure mode を `docs/decision-log.md` に記録
5. 新規 failure mode なら `docs/coalter-aoo-canary-deploy-anti-patterns.md` §1 に追記
6. 必要なら本 runbook を update PR

---

## §9. Rollback / Cleanup (D-4 smoke PASS 後、D-5 close 前)

### 9.1 削除する env (5 件、または 6 件 if §6.4 実施)

```bash
# CEO 操作、順序: forced canary (if any) → channel → Supabase NEXT_PUBLIC → Supabase server
KEYS=(
  NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED  # §6.4 実施時のみ
  NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_URL
  SUPABASE_ANON_KEY
)
for KEY in "${KEYS[@]}"; do
  npx vercel env rm "$KEY" preview chore/coalter-mirror-d3b-canary --yes 2>/dev/null || echo "skip $KEY (not exists)"
done
```

### 9.2 削除後の必須 verify

```bash
TOKEN=$(python3 -c "import json; print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json')).get('token',''))")
TEAM_ID="team_wS0pdrzKkPjZAf5K5QJuqy5h"
PROJ_ID="prj_1NRAGBi6DcqP9zwYryFjCOie7pT7"
curl -s "https://api.vercel.com/v10/projects/${PROJ_ID}/env?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import json,sys
envs = json.load(sys.stdin).get('envs', [])
canary = [e for e in envs if e.get('gitBranch') == 'chore/coalter-mirror-d3b-canary']
print('canary-scoped env count:', len(canary))
for e in canary:
    print(' ', e.get('key'))
"
# 期待: 0 件
```

### 9.3 canary branch / worktree cleanup

```bash
# remote 削除 (CEO 操作)
git push origin --delete chore/coalter-mirror-d3b-canary

# local worktree 削除 (CEO が worktree 使っていた場合のみ)
# git worktree remove /path/to/canary-worktree --force

# local branch 削除
git branch -D chore/coalter-mirror-d3b-canary
```

### 9.4 全 scope 不変確認 (Phase D-5 close の前提)

```bash
# Production / all-Preview / Development env counts を audit baseline と比較
curl -s "https://api.vercel.com/v10/projects/${PROJ_ID}/env?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import json,sys
from collections import defaultdict
envs = json.load(sys.stdin).get('envs', [])
groups = defaultdict(int)
for e in envs:
    tgts = e.get('target') or []
    branch = e.get('gitBranch')
    if branch:
        groups[f'preview:branch={branch}'] += 1
    else:
        groups[','.join(sorted(tgts))] += 1
for k in sorted(groups.keys()):
    print(f'{k}: {groups[k]}')
"
# 期待 (cleanup 後):
#   development: 1
#   development,preview,production: 7
#   preview: 18
#   preview,production: 7
#   production: 13
#   preview:branch=preview/coalter-stepc-phase3a: 1
#   preview:branch=chore/coalter-mirror-d3b-canary: 0 ← 削除済
#
# 各 scope の count が §0 audit table と一致すれば「Production / all-Preview / Development 不変」確証
```

### 9.5 Alter 別作業への影響なし確認

`docs/coalter-supabase-ref-canon.md` §2.2 で確立した canon に従い、`hjcrvndumgiovyfdacwc` (Alter staging) の env scope (`preview`、all-branch) が**touch されていない**ことを §9.2 / §9.4 で確認。Alter Plan W1-X 作業に影響 0。

---

## §10. CEO Action Log Template (smoke 中の記録、D-5 close evidence)

D-4 smoke 中、CEO は以下 template を埋める（手動記録、新規 dashboard 実装なし）。テキストファイル 1 個で十分。

```markdown
# CoAlter D-4 Smoke Action Log

## Smoke 実施日時: YYYY-MM-DD HH:MM (Asia/Tokyo)
## 実施者: Taishi (CEO)
## Browser / OS: Safari Private (or Chrome Incognito) / macOS

## Pre-Open verify
- [ ] §3.0 D-1 verify 3 gates ALL PASS 再走 完了 (timestamp: ____)
- [ ] §2.2 deploy state=READY 確認 完了
- [ ] §4 禁止 operations 内在化 完了

## Step-by-step
| step | 開始時刻 | 完了時刻 | gate PASS? | 観測メモ |
|------|---------|---------|------------|---------|
| 3.1 login | __:__ | __:__ | ☐ | |
| 3.2 Home | __:__ | __:__ | ☐ | |
| 3.3 トーク | __:__ | __:__ | ☐ | |
| 3.4 thread 開く | __:__ | __:__ | ☐ | |
| 3.5 CoAlterButton | __:__ | __:__ | ☐ | |
| 3.6 activate | __:__ | __:__ | ☐ | |
| 3.7 MirrorHost | __:__ | __:__ | ☐ | |
| 3.8 close | __:__ | __:__ | ☐ | |

## Network log observation
- expected Supabase request count (`aljavfujeqcwnqryjmhl.supabase.co`): ____
- forbidden Supabase request count (`hjcrvndumgiovyfdacwc.supabase.co`, must be 0): ____
- service_role write paths hit count (must be 0):
  - `/api/coalter/handoff-events`: ____
  - `/api/talk/intent-check`: ____
  - `/api/talk/intent-translate`: ____
- `/api/coalter/activate` response code: ____
- `/api/talk/threads` (READ-only service_role allowed) response code: ____

## Console log observation
- `[Mirror]` 系 critical error count: ____
- 他 critical error: ____
- warning / info level log を見て気づいたこと: ____

## DevTools Elements observation
- `MirrorHost` 要素存在: ☐ yes / ☐ no
- `MirrorVisibleSurface` 要素存在 (FORCED_CANARY_ENABLED 投入時のみ期待): ☐ yes / ☐ no / ☐ N/A

## PASS / FAIL 判定
- [ ] §7 PASS 条件 12 項目 ALL ☐ → PASS
- [ ] §8 FAIL trigger 観測 → FAIL code: ____

## §6.4 FORCED_CANARY_ENABLED 投入有無
- [ ] 投入なし (推奨)
- [ ] 投入あり → §6.4 Step e の cleanup を §9.1 に統合

## Smoke 後 cleanup
- [ ] §9.1 env 削除 完了 (timestamp: ____)
- [ ] §9.2 削除後 verify 完了 (canary scope env count = 0)
- [ ] §9.3 branch 削除 完了
- [ ] §9.4 全 scope 不変確認 完了
- [ ] §9.5 Alter 別作業影響なし確認 完了

## D-5 close advance 判断
- [ ] D-4 smoke PASS + cleanup 完了 → D-5 起票 GO
- [ ] D-4 smoke FAIL → 原因 analysis + failure mode 追記 + 再 smoke or D-4 redesign

## CEO sign-off
署名: __________ 日時: __________
```

---

## §11. Beyond D-4 (本 runbook の対象外、明示)

| Phase | 内容 | 着手条件 |
|-------|------|----------|
| D-5 close | Phase D 完了 docs + Phase C 完了判定 | D-4 PASS + cleanup 完了 + CEO sign-off |
| C-5 | (CoAlter Phase C 残工程) | D-5 close 後 |
| Phase D-3γ (option) | FORCED_CANARY_ENABLED 投入版 smoke (§6.4) | D-4 PASS 内で必要と CEO 判断した場合 |
| W1-Z production migration apply | Alter Plan 別 wave | 本 D-4 smoke と独立、CEO 判断時期 |

---

## §12. やらないこと (明示)

CEO 指示 + Phase D-0 制約の再宣言：

- ❌ いきなり smoke 開始（本 runbook は CEO レビュー → GO 判断後に smoke 実行）
- ❌ env 追加 / 削除 (canary scope 含む、D-4 中)
- ❌ redeploy / 新規 deployment trigger (`dpl_8zycPH9sMNLycqR4Gszk4dU7HTf7` 固定)
- ❌ Supabase migration apply (production / staging)
- ❌ Production env 変更
- ❌ all-Preview env 変更
- ❌ Development env 変更
- ❌ C-5 着手
- ❌ D-5 close 着手
- ❌ service_role write 経路 (bottom sheet / intent UI / proposal / handoff) を踏む
- ❌ message 送信 / CoAlter end / 別 thread への移動
- ❌ canonical URL 以外の URL (user alias / git branch alias / 旧 deploy) を踏む
- ❌ Vercel UI で env / project setting を編集
- ❌ Supabase Dashboard で data / table を編集
- ❌ Phase B/C canon §7.4 の Phase B 10 原則を緩める
- ❌ runtime app code / lib / components / hooks の編集 (本 docs PR は docs-only)

---

## §13. References

- `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` (Phase D 全体設計、本 runbook の上位 doc)
- `docs/coalter-aoo-canary-deploy-anti-patterns.md` (永続 canon、failure mode catalog)
- `docs/coalter-supabase-ref-canon.md` (D-3α、Supabase project ref の single source-of-truth)
- `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §16 (smoke 詳細 reference)
- `docs/coalter-aoo-phase-b-completion.md` §7.4 (Phase B canon 10 原則)
- `docs/decision-log.md` 2026-05-19 entries (C-4 BLOCKED / D-3 audit)
- `scripts/coalter/verify-canary-deploy.ts` (D-1 verify、本 runbook §3.0 で再走)
- `.canary-trigger.json` (D-2 trigger file)
- `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` (canary smoke PR template)

---

## §14. 変更履歴

| 日付 | 変更 | 承認 |
|------|------|------|
| 2026-05-19 | Phase D-4 Smoke Runbook (docs-only) 起票、CEO 補正「いきなり smoke 開始せず runbook 先行」(2026-05-19) | CEO レビュー待ち |

---

**End of D-4 Smoke Runbook**. CEO レビュー後、D-4 smoke GO 判断をお待ちします。
