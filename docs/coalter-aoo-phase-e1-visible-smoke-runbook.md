# CoAlter AOO Phase E-1 — Visible Smoke Runbook

**ステータス**: E-1 visible smoke 起票 (canary branch + env 投入 + git-attributed build + D-1 verify 後の CEO 実機 smoke 手順書)
**作成日**: 2026-05-19
**前提**: Phase E-0 (`docs/coalter-aoo-phase-e-plan.md`) main 着地済 (PR #211 merged `314ed277`)、本 PR 内で reflection-only canon CI test (`tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts`、46 tests) 同時着地
**E-1 scope**: **canary visible smoke only** (Production rollout ではない、Production env 触らない、CEO Q1-Q10 + §12.1 補正に厳密準拠)

---

## §0. 本 runbook の位置付け

Phase D の `D-4 minimum smoke (shadow mount)` で確認できなかった **「visible Mirror UI が canary build で render され、reflection-only canon を遵守する」** ことを実機検証するための CEO 手順書。

D-4 runbook を踏襲しつつ、E-1 固有の以下を追加する:
- `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED=true` 投入による visible Mirror render の trigger
- `[data-testid="mirror-visible-surface"]` の visible 確認 (D-4 では null 期待だった)
- visible text の reflection-only canon 視認確認 (CEO Q5、本 PR 内 CI test と並んで人手 review)
- close / sleep button の **表示確認のみ** (click 禁止、CEO Q4)

---

## §1. E-1 PASS / FAIL 基準 (CEO 提示 10 acceptance criteria)

### 1.1 PASS conditions (10 項目すべて成立で E-1 PASS)

| # | 条件 | verification method |
|---|---|---|
| 1 | D-1 verify-canary-deploy.ts の **3 gates 全 PASS** | `npx tsx scripts/coalter/verify-canary-deploy.ts ... → exit 0` |
| 2 | expected Supabase ref `aljavfujeqcwnqryjmhl` (Aneurasync Production) が HTML bundle に baked-in | D-1 Gate 3 evidence |
| 3 | forbidden Supabase ref `hjcrvndumgiovyfdacwc` (Alter staging) が **HTML bundle で 0 hit** | D-1 Gate 3 evidence |
| 4 | smoke は canonical URL `culcept-<hash>-taishis-projects-0a8deb17.vercel.app` のみで実施 | URL bar 視認、user alias / git branch alias 不使用 |
| 5 | `<MirrorVisibleSurface />` が DOM に mount | `[data-testid="mirror-visible-surface"]` selector → element 返却 |
| 6 | visible text が **reflection-only** (Phase B 北極星 + 本 PR canon CI test 遵守) | CEO 視認、CI test PASS、5 templates のいずれか表示 |
| 7 | 「閉じる」/「黙ってもらう」button は **表示のみ確認、click しない** | DOM 存在確認のみ (`[data-testid="mirror-visible-close"]` / `mirror-visible-sleep`) |
| 8 | **PII leak 0** (Mirror text に他 user data / email / phone 等の混入なし) | CEO 視認 + canon CI test PII firewall PASS |
| 9 | **console 重大 error 0** (uncaught exception / auth fail / network 全断 なし) | DevTools Console review |
| 10 | smoke 後の cleanup 手順が本 runbook §6 で明記され、CEO 実行可能 | §6 reference |

### 1.2 FAIL conditions (いずれか 1 つでも観測されたら即停止)

| # | FAIL 観測 | 即時対応 |
|---|---|---|
| 1 | D-1 Gate 1/2/3 のいずれか FAIL | smoke 停止、§6 cleanup、CEO に原因報告 |
| 2 | forbidden ref `hjcrvndumgiovyfdacwc` を **Network tab or HTML bundle で観測** (C-4 同型) | smoke 即停止、env scope audit、cleanup |
| 3 | `[data-testid="mirror-visible-surface"]` が **0 hit** (FORCED_CANARY 投入したのに visible 出ない) | engine 動作不能、smoke 停止、原因 audit |
| 4 | visible text が Question / Proposal / Suggestion に見える (canon 違反) | canon CI test が事前 block しているはずだが、視認で漏れ検出 → 即停止 + canon update |
| 5 | visible text に **PII / email / phone / 第二人称 direct address** が混入 | canon CI test 強化 + 即停止 (CEO Q10 安全優先) |
| 6 | user alias URL (`culcept-th7328aish-...`) を踏んだ | canonical URL に戻る、URL 共有経路 audit |
| 7 | service_role **write route を踏んだ** (`/api/coalter/handoff-events` 等) | bottom sheet / intent UI 操作禁止 violation、CEO 操作 audit |
| 8 | console 重大 error (uncaught exception / auth 失敗 / engine crash) | smoke 停止、error 内容を Claude 共有、§6 cleanup |
| 9 | UI 破壊 (真っ白画面 / 無限 spinner / layout 大規模崩壊) | 同上 |
| 10 | Vercel deployment が smoke 中に Error / Building 状態に戻る | 一旦停止、Vercel side audit |

---

## §2. CEO 操作手順 (visible smoke、D-4 runbook 拡張)

### 2.1 Pre-flight (Claude 側で既に実施済、smoke 開始前に CEO confirm)

| step | action | 状態 |
|---|---|---|
| 1 | canary branch `feat/coalter-e1-visible-smoke-canary` 作成 + push | Claude 実施済 |
| 2 | CEO がbranch-scoped Preview env を **6 件投入** (§3 一覧) | CEO 手動 |
| 3 | canon CI test + 本 runbook + `.canary-trigger.json` (E-1) を single commit + push | Claude 実施 |
| 4 | git-attributed Preview build 完了確認 (`vercel inspect <url>` で Ready + gitSource.type=github) | Claude 観測 |
| 5 | D-1 verify-canary-deploy.ts 実行、3 gates 全 PASS 確認 | Claude 実施 |
| 6 | canonical URL + deployment ID + meta を CEO に提示 | Claude 報告 |

### 2.2 CEO 実機 visible smoke (Step 1-7、D-4 Step 1-7 + 拡張 7a-7e)

**重要**: 各 step 完了ごとに CEO は DevTools (Network / Console / Elements) を確認、異常があれば即停止。

#### Step 1: login
- canonical URL `https://culcept-<hash>-taishis-projects-0a8deb17.vercel.app/login` を開く
- CEO 本人の Production Supabase Auth credentials で login
- **期待**: login 後 `/` (AneurasyncHome) に redirect
- **verify**: DevTools → Network → Supabase auth call host が `aljavfujeqcwnqryjmhl.supabase.co`

#### Step 2: Home (AneurasyncHome)
- `/` で AneurasyncHome 表示 (baseline / star_maps gate 通過)
- **期待**: `/baseline` / `/stargazer` redirect なし
- **FAIL シグナル**: redirect → canary が Production data を読めていない (env baked-in 失敗)

#### Step 3: トーク
- HOME_QUICK_NAV「トーク」 or MAIN_NAV「メッセージ」 click → `/talk`
- **期待**: thread list が Production data 由来、counterpart 実 user 名 (D-4 で `kumi` 確認済 pattern)
- **verify**: Network tab で `/api/talk/threads` 200 OK、host が aljavfujeqcwnqryjmhl
- **FAIL シグナル**: 「メッセージがありません」 / "ユーザー" placeholder

#### Step 4: 既存 thread を開く
- thread click → `/talk/[threadId]`
- **期待**: ChatClient mount、既存 message 履歴表示
- **verify**: `/api/talk/threads/<id>/messages` 200、`/api/coalter/status` 200、`/api/genome-card` 200

#### Step 5: CoAlterButton 表示確認 (click しない)
- ChatClient mount 後、CoAlterButton (or 「見守り中」header) が表示
- **CEO は click しない** (Step 6 で click)

#### Step 6: CoAlterButton click → activate
- button click → POST `/api/coalter/activate`
- **期待**: 200 OK + `data.state === "enabled"` + button が enabled state に推移
- **FAIL シグナル**: 401/403/500 / 「もう一度試す」error UI

#### Step 7: MirrorHost mount 確認 (shadow shell、D-4 で確認済 pattern)
- DevTools → Elements → Cmd+F → `mirror-surface-shell`
- **期待**: 1 hit (hidden / display:none、`<div data-testid="mirror-surface-shell" ... hidden>`)
- DevTools → Cmd+F → `mirror-sleep-toggle`: 1 hit (button)

#### Step 7a (E-1 NEW): MirrorVisibleSurface mount 確認 ★ E-1 の核心
- DevTools → Elements → Cmd+F → `mirror-visible-surface`
- **期待**: **1 hit** (visible UI element、aria-live="polite" 属性付き)
- **verify**:
  ```js
  document.querySelector('[data-testid="mirror-visible-surface"]')
  // → 期待: <div role="..." aria-live="polite" aria-atomic="true">...</div>
  ```
- **FAIL シグナル**: 0 hit → FORCED_CANARY が build に到達していない、env scope verify

#### Step 7b (E-1 NEW): visible text の reflection-only 確認 ★ canon 視認
- visible surface の textContent を読む
- **期待**: 以下 5 templates のいずれか:
  - 「少し、間がほしいような…そんな雰囲気でした」
  - 「なにかが揺れている、そんな印象でした」
  - 「まだ言葉になっていない感じが、ありました」
  - 「なにかを抱えているような、そんな気がしました」
  - 「少し、立ち止まっているような感覚があります」
- **CEO 視認チェック**:
  - 疑問符 `?` / `？` を**含まない**
  - 「〜しませんか」「〜してみよう」「〜したらどう」を**含まない**
  - 「おすすめ」「提案」「助言」を**含まない**
  - 「あなた」「君」等 direct address を**含まない**
  - 「確実」「必ず」「絶対」等 commit vocab を**含まない**
  - email / phone / URL 等 PII を**含まない**
- **canon CI test と並んで人手 review** (CI 検出漏れの最後の壁)

#### Step 7c (E-1 NEW): close / sleep button 表示のみ確認 ★ CEO Q4 厳守
- DevTools → Cmd+F → `mirror-visible-close`: 1 hit (button)
- DevTools → Cmd+F → `mirror-visible-sleep`: 1 hit (button)
- **CEO は click しない** (state 変化させない、最小 smoke 維持)

#### Step 7d (E-1 NEW): a11y 属性確認
- visible surface element の attributes 確認:
  - `aria-live="polite"`
  - `aria-atomic="true"`
- **期待**: 両方存在

#### Step 7e (E-1 NEW): console 重大 error 0 確認
- DevTools → Console
- **期待**: Mirror 関連の warn 程度は許容、uncaught exception / auth 失敗 / engine crash 0
- **FAIL シグナル**: red error log → smoke 停止 + error 内容を Claude 共有

---

## §3. CEO が後で投入する env 一覧 (branch-scoped Preview only)

### 3.1 必須投入 6 件 (canary branch `feat/coalter-e1-visible-smoke-canary` scope only)

```bash
cd /Users/haradataishi/Culcept

# 1/6 client-side Production URL
npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview feat/coalter-e1-visible-smoke-canary
# 値: https://aljavfujeqcwnqryjmhl.supabase.co

# 2/6 client-side Production anon key
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview feat/coalter-e1-visible-smoke-canary
# 値: (Production anon public key、Supabase Dashboard → API)

# 3/6 server-side Production URL (defensive)
npx vercel env add SUPABASE_URL preview feat/coalter-e1-visible-smoke-canary
# 値: https://aljavfujeqcwnqryjmhl.supabase.co

# 4/6 server-side Production anon key (defensive)
npx vercel env add SUPABASE_ANON_KEY preview feat/coalter-e1-visible-smoke-canary
# 値: (同 #2)

# 5/6 Mirror Channel feature flag
npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview feat/coalter-e1-visible-smoke-canary
# 値: true

# 6/6 Forced canary mode (E-1 NEW、visible Mirror trigger)
npx vercel env add NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED preview feat/coalter-e1-visible-smoke-canary
# 値: true
```

### 3.2 投入後 verify (CEO + Claude)

```bash
npx vercel env ls preview | grep "feat/coalter-e1-visible-smoke-canary"
# 期待: 6 件すべて branch-scoped で表示
```

### 3.3 絶対投入禁止 (CEO Q1 / Q3 / §12.1 補正、永続)

| key | scope | 理由 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 任意 (canary scope 追加投入不可) | canon §2.1 永続禁止、Mirror code は anon-only contract で構造的に未消費 |
| Production scope の任意 key | Production | CEO 補正: E-1 では Production env 絶対触らない |
| all-Preview scope の任意 key | Preview (all) | Alter 別作業の正当 scope、E-1 で touch しない |
| Development scope の任意 key | Development | E-1 では Development env 触らない |
| `NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED` を Production / all-Preview に投入 | Production / all-Preview | CEO 補正: branch-scoped Preview でのみ |
| `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE` (本 E-1 では不要) | 全 scope | E-1 では DIAGNOSTIC_EXPOSE 投入なし、Step 7 verify は DOM selector で完結 |

---

## §4. Env scope 設定 (絶対 lock)

| Environment | Git branch | scope 投入 |
|---|---|---|
| **Preview** | **`feat/coalter-e1-visible-smoke-canary`** のみ | ✅ 上記 §3.1 の 6 件 |
| Preview | 全 branch (all-Preview、Alter 別作業) | **❌ 投入禁止** |
| Preview | 他 specific branch | ❌ 投入禁止 |
| **Production** | — | **❌ 投入禁止** (CEO §12.1 補正: E-1 では Production env 絶対触らない) |
| **Development** | — | **❌ 投入禁止** |

---

## §5. D-1 verify command (canary build Ready 直後)

### 5.1 実行コマンド (Claude 実施)

```bash
npx tsx scripts/coalter/verify-canary-deploy.ts \
  --deployment-url=https://culcept-<8-char-hash>-taishis-projects-0a8deb17.vercel.app \
  --deployment-id=dpl_<id> \
  --expected-branch=feat/coalter-e1-visible-smoke-canary \
  --expected-supabase=aljavfujeqcwnqryjmhl \
  --forbidden-supabase=hjcrvndumgiovyfdacwc
```

### 5.2 3 gates 評価基準

| Gate | 内容 | PASS 条件 | FAIL → action |
|---|---|---|---|
| **Gate 1: URL canonical-ness** | host pattern が `culcept-<8-9 char hash>-taishis-projects-[a-z0-9]+\.vercel\.app$` | 一致 | 即停止、user alias 不使用 |
| **Gate 2: deploy meta git attribution** | `source !== "cli"` + `gitSource.type === "github"` + branch refs 一致 + sha 整合 (D-1 fix #205 の 10 criteria) | 全 satisfy | 即停止、D-2 trigger 経路再実行 (`--force` 禁止) |
| **Gate 3: HTML bundle Supabase ref** | expected `aljavfujeqcwnqryjmhl` 含有 + forbidden `hjcrvndumgiovyfdacwc` 不在 | 両 satisfy | **即停止 (C-4 同型事故)**、env scope audit |

exit code: `0` (3 gates PASS、smoke 可) / `1` (FAIL、smoke 中止)。

---

## §6. Cleanup / rollback (smoke 完了 / FAIL いずれも)

### 6.1 Canary scope env 削除 (6 件)

```bash
cd /Users/haradataishi/Culcept

for KEY in NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED \
           NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED \
           NEXT_PUBLIC_SUPABASE_URL \
           NEXT_PUBLIC_SUPABASE_ANON_KEY \
           SUPABASE_URL \
           SUPABASE_ANON_KEY; do
  npx vercel env rm "$KEY" preview feat/coalter-e1-visible-smoke-canary --yes
done

# 削除確認
npx vercel env ls preview | grep "feat/coalter-e1-visible-smoke-canary" || echo "✅ canary scope clean (0 envs)"
```

### 6.2 Canary branch + worktree cleanup

```bash
git push origin --delete feat/coalter-e1-visible-smoke-canary
git branch -D feat/coalter-e1-visible-smoke-canary
git worktree remove /Users/haradataishi/Culcept-coalter-e1 --force
git fetch --prune origin
```

### 6.3 Production / all-Preview / Development 不変確認

```bash
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  npx vercel env ls $SCOPE | grep -iE "(MIRROR|FORCED_CANARY)" && echo "🔴 leftover" || echo "✅ clean"
done

# Production scope Supabase env は 125d ago の値 (不変確認)
npx vercel env ls production | grep -E "(NEXT_PUBLIC_SUPABASE|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)"
```

### 6.4 最終 D-1 reverify (post-cleanup、build artifact 永続記録)

cleanup 完了後、E-1 deployment に対して D-1 を最後に 1 回実行 (build artifact が env 削除後も healthy であることを記録):

```bash
npx tsx scripts/coalter/verify-canary-deploy.ts \
  --deployment-url=<E-1 canonical URL> \
  --deployment-id=<E-1 dpl id> \
  --expected-branch=feat/coalter-e1-visible-smoke-canary \
  --expected-supabase=aljavfujeqcwnqryjmhl \
  --forbidden-supabase=hjcrvndumgiovyfdacwc
```

期待: 3 gates PASS のまま (build artifact は env 削除に影響されない、Phase D-5 確認済 pattern)。

### 6.5 Production DB row cleanup 判断 (CEO 判断、Claude 自動実施しない)

E-1 Step 6 で `activate` が成功した場合、Production Supabase `coalter_pair_states` に CEO-attributed row が 1 件 insert される (D-4 と同じ pattern)。Phase D-5 §K.4 の判断基準を踏襲:
- (a) row 保持: production data として継続
- (b) row 削除: CEO が Supabase Studio から SQL で個別削除

Claude 推奨 (D-5 と同): **(a) 保持** (smoke 専用ではなく実 user data)。

---

## §7. E-1 で **禁止** する操作 (CEO 直接指示、絶対遵守)

### 7.1 UI 操作禁止

- ❌ visible Mirror の「閉じる」button click (CEO Q4)
- ❌ visible Mirror の「黙ってもらう」button click (CEO Q4)
- ❌ bottom sheet 操作 (`/api/coalter/handoff-events` service_role write を avoid、D-3-β-0 canon)
- ❌ intent UI 操作 (`/api/talk/intent-check` / `intent-translate` service_role read を avoid)
- ❌ message 送信 (chat data 生成、最小 smoke 範囲外)
- ❌ CoAlter end / accept / refine / plan 操作
- ❌ Proposal 操作 (proposal 採用 / 拒否 / 修正)
- ❌ Question / Proposal / Suggestion 表示への drift 観測時の追従 (即停止 + canon update)

### 7.2 環境変更禁止 (CEO 直接指示)

- ❌ Production env (任意 key) の変更
- ❌ all-Preview env (任意 key) の変更
- ❌ Development env (任意 key) の変更
- ❌ canary scope env の削除 / 再投入 (cleanup §6 でのみ削除)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` を canary scope に追加投入 (canon §2.1 永続禁止)
- ❌ redeploy (新 commit push 以外の手段)
- ❌ Supabase migration / schema 変更
- ❌ Mirror runtime (`lib/coalter/mirror/**`) / ChatClient / useMirrorEngine code 変更
- ❌ `vercel.json` / `package.json` / `.canary-trigger.json` 構造変更 (trigger_count increment は OK)

### 7.3 Phase 進行禁止

- ❌ E-1 PASS なしで E-2 着手
- ❌ Production rollout 着手 (E-2 以降)
- ❌ C-5 着手

---

## §8. Service_role acknowledgement (D-3-β-0 audit §F.2 6 fact 継承)

E-1 minimum smoke 経路で **使用される** service_role route:
- `/api/talk/threads` (GET): `auth.admin.getUserById` + table admin read (READ-only、CEO 自身参加 thread のみ、write 0)

E-1 minimum smoke 経路で **使用されない** service_role route (§7.1 禁止操作により回避):
- `/api/coalter/handoff-events` (bottom sheet 操作禁止)
- `/api/talk/intent-check` / `intent-translate` (intent UI 操作禁止)

`SUPABASE_SERVICE_ROLE_KEY` は all-Preview scope (125d ago) inheritance により canary deploy `process.env` に存在するが、canary scope 追加投入は 0、Mirror code は構造的に未消費。

---

## §9. Phase E-2 着手 gate (E-1 PASS 後の prerequisite、§3.9 / §9.2 反復)

E-1 visible smoke PASS は **E-2 着手 8 condition のうち 1 つを達成** に過ぎない。E-2-α (Production env touch) に進むには以下すべて必要 (CEO 補正 5 → 8):

1. **E-1 visible smoke PASS** (本 runbook §1.1 の 10 conditions すべて) ← 本 phase で達成
2. **E-1 canary cleanup 完了** ← §6 実施
3. **E-1 close 記録 main 着地** ← 本 PR merge + Phase E-2 起票時に E-1 close doc
4. kill switch L1 + L3 drill 済 ← E-3 で実施
5. allowlist 実装 (Option A env-based) 着地 ← 別 PR
6. **reflection-only canon CI test 着地** ← 本 PR で達成 (`tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts`)
7. CEO 直接承認 ← E-2 起票 PR で
8. Sentry baseline 記録済 ← E-3 で

→ 8 condition すべて揃うまで Production env touch 不可。E-1 PASS だけでは E-2 着手不能。

---

## §10. Claude の E-1 phase action 時間軸

| timing | Claude action | CEO action |
|---|---|---|
| Pre-flight | branch 作成 + push pointer + canon CI test + 本 runbook + `.canary-trigger.json` 準備 (本 PR 起票) | 本 PR review |
| 環境準備 | (env 投入は CEO 手動) | §3.1 の 6 envs を canary scope に投入 |
| trigger | commit + push → Vercel build trigger | 待機 |
| build observe | Vercel inspect で Ready 確認、canonical URL 取得 | 待機 |
| D-1 verify | D-1 script 3 gates 実行、結果報告 | 結果 review |
| visible smoke | (Claude は実施しない、CEO 実機) | §2.2 の Step 1-7 + 7a-7e 実機実施 |
| 観測 | CEO の DOM / Console screenshot を解釈、PASS/FAIL 集計支援 | DevTools screenshot を Claude 共有 |
| E-1 PASS 判定 | 10 acceptance criteria 集計 | CEO 最終 PASS/FAIL 判定 |
| cleanup | (env 削除は CEO 手動推奨、Claude も可) + branch + worktree | env rm 確認 |
| E-1 close 記録 | decision-log entry + close docs (Phase D-5 pattern) | review + merge |

### 10.1 Claude 絶対禁止 (本 phase)

- ❌ env 投入 / 削除 / 値変更 (canary scope 含む、CEO 手動以外不可、cleanup は CEO 承認後)
- ❌ redeploy / vercel deploy / vercel --force
- ❌ ブラウザ操作 (CEO の代わりに login / click しない)
- ❌ Production DB 直接 query / SQL
- ❌ Mirror runtime / ChatClient / API route の code 変更
- ❌ Phase E-2 着手 (E-1 PASS + 8 condition 揃うまで)
- ❌ C-5 着手

---

**End of E-1 visible smoke runbook.** 本 doc は Phase E-1 期間の永続 reference、E-1 close 後 deferred archived。
