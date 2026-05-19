# CoAlter AOO — Phase D-0 / C-4R: Production-equivalent Canary Deploy Route Design (docs-only)

**ステータス**: D-0 設計 docs (docs-only) / Phase D 実装着手は CEO 承認後 (D-1 から sequential)
**起票日**: 2026-05-19
**前提**: Phase C C-4 BLOCKED closure (PR #195 merged `9b294164`)
**位置付け**: Phase C 完了に必要だが C-4 で構造的に達成不能だった **「Production-equivalent canary smoke 経路」を Phase D-0 として正面から設計する**
**Phase 命名**: 内部呼称は "C-4R" (C-4 Recovery) / "Phase D-0" 両用。docs 上は **Phase D-0** を canonical
**学術基盤**: Phase B/C 継承 (Lambert / Miller & Rollnick / Nahum-Shani) + 信頼性工学 (defense in depth、fail-closed gate、anti-pattern catalog)

> ⚠️ **必読** (Phase D 任意 sub-PR 起票時、本 docs を最初に読む):
> - `docs/coalter-aoo-canary-deploy-anti-patterns.md` (C-4 BLOCKED で確立した永続 canon)
> - `docs/decision-log.md` 2026-05-19 entry (C-4 BLOCKED の正式記録)
> - `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §16 (smoke 詳細)

---

## §0. Executive Summary

**Phase C C-4 は production-equivalent CoAlter smoke が構造的に不能** (root cause: Vercel CLI `vercel --force` が `source: cli` / git attribution 欠落 → all-preview Alter staging Supabase が build に baked-in) で BLOCKED 状態。

**Phase D-0 (本 docs)** は、その構造的問題を**永久に解決する design** を確立する。実装は本 PR には含めない (docs-only)。Phase D-1 以降の実装 sub-PR が本設計を入力に進む。

### 0.1 設計原則

1. **再発防止は人間判断ではなく構造 gate で実現** (人為ミスを構造排除)
2. **5 層防御 (PR #195) を機械化 + canonical 化** (Phase D 全 sub-PR で踏襲)
3. **failure mode catalog** を継続更新する canon (新規 failure 発覚都度追記)
4. **smoke layer を 3 分類で明示宣言義務化** (Mount / Mirror visible / CoAlter chat の混同を構造禁止)
5. **deploy → smoke → cleanup を gate 付き cycle として設計** (各 step 通過判定明示)

### 0.2 Phase D 構成案 (本 docs は Phase D-0、D-1 以降は本 design を入力に sequential 実装)

| Sub-PR | 種別 | 役割 | LOC budget |
|---|---|---|---|
| **D-0 (本 PR)** | docs-only | route 設計 + canon 確立 | docs 600-800 行 |
| D-1 | code (script) | smoke verification automation script (`scripts/canary-smoke-verify.sh`) | < 200 lines + test |
| D-2 | code (vercel.json / Vercel UI) | IBS / `ignoreCommand` の canary branch 例外化 (CEO 承認後) | 1-10 lines |
| D-3 | env scope 戦略 (CEO 選択 option の実装) | Mirror 専用 Preview Supabase 分離 / Production allowlist gradual rollout / etc. | option 依存 |
| D-4 | re-smoke (production-equivalent CoAlter smoke) | C-4R smoke execution | smoke docs |
| D-5 | Phase D / C-4R 完了 docs | Phase D close + Phase C 完了判定 | docs |

Phase D 全体想定: 2-4 週間 (CEO 補正可)。

---

## §1. C-4 BLOCKED Root Cause 再掲 (Phase D 全 sub-PR の前提)

`docs/coalter-aoo-canary-deploy-anti-patterns.md` §1 と `docs/decision-log.md` 2026-05-19 entry §4 が正本。要約:

| 観察 | 構造的理由 |
|---|---|
| HTML bundle に `https://hjcrvndumgiovyfdacwc.supabase.co` (Alter staging) baked-in | all-preview scope env が build に resolve された |
| Vercel API meta: `source: cli` / `gitSource.ref: None` / `gitCommitRef: None` | `npx vercel --force` CLI deploy が git context を Vercel に inject しない |
| branch-scoped `chore/coalter-mirror-c4-canary` env (Production Supabase URL) は build に到達せず | git context 無しの CLI deploy は **branch-scoped Preview env を resolve しない** |

**Phase D 全 sub-PR は、このいずれかが再発した時点で即停止 + audit** をルール化する (§9 mandatory checklist)。

---

## §2. Phase D 解決すべき 10 課題 (CEO 補正 + Claude 自立推論)

### 2.1 CEO 提示 10 項目 (本 D-0 で必須扱い)

| # | CEO 課題 | 本 docs §参照 |
|---|---|---|
| 1 | `npx vercel --force` を原則禁止する条件 | §4.1 |
| 2 | git attribution 付き Preview build の作り方 | §4.2 + §4.3 |
| 3 | IBS / `ignoreCommand` 回避方法 (trigger file / minimal non-runtime diff / docs-only skip との整合) | §4.3 |
| 4 | branch-scoped env が効いていることの検証方法 (deploy meta / canonical URL / HTML bundle grep) | §5 |
| 5 | Supabase project ref 確認 (expected `aljavfujeqcwnqryjmhl` / forbidden `hjcrvndumgiovyfdacwc`) | §5.4 |
| 6 | user alias 禁止 | §5.2 |
| 7 | all-preview env を信用しない運用 | §6 |
| 8 | Alter staging env と CoAlter canary env の分離 | §6 |
| 9 | production-equivalent CoAlter 正規導線 (login → /talk → thread list → existing thread → CoAlterButton → /api/coalter/activate → Mirror visible) | §7 |
| 10 | rollback / cleanup 手順 | §8 |

### 2.2 Claude 自立推論で追加すべき 5 項目 (人間超越アイデア、本 docs §11-§13 で扱う)

| # | Claude 追加課題 | 本 docs §参照 |
|---|---|---|
| 11 | Smoke 起票時 **mandatory PR description checklist** (機械的 gate) | §9 |
| 12 | Smoke layer 3 分類 (Mount / visible / CoAlter chat) の **明示宣言義務化** | §10 |
| 13 | **Failure mode catalog** (新規 failure 発覚都度追記する canon、anti-patterns doc §1 拡張) | §11 |
| 14 | **deploy → smoke → cleanup の gate 付き cycle** 設計 (各 step に通過判定) | §12 |
| 15 | **Phase 跨ぎ学び継承の自動化** (新 Phase 起票 PR template に前 Phase §3 系 / 関連 anti-patterns doc 読了 checkbox 必須化) | §13 |

---

## §3. 設計原則 (Phase D 以降不変、Phase B/C canon と整合)

### 3.1 Phase B canon §7.4 (Phase D 以降不変、本 docs で再宣言)

| # | 原則 |
|---|---|
| 1 | shadow mode pattern |
| 2 | default-STAY_SILENT 構造保証 |
| 3 | 7-layer postSpeakVerification |
| 4 | 4-gate visible orchestration |
| 5 | PII firewall (型 + runtime 二重) |
| 6 | 4-layer flag gating defense |
| 7 | hedged grammar template only |
| 8 | retreat affordance principle (close / sleep のみ) |
| 9 | session-local persistence のみ |
| 10 | enum-locked template id |

### 3.2 Phase D-0 で追加する canon (3 項目、Phase D 以降不変)

| # | Phase D-0 canon |
|---|---|
| 11 | **canary deploy は git-attributed Preview build のみを smoke 本命にする** |
| 12 | **smoke layer 3 分類 (Mount / Mirror visible / CoAlter chat) を起票 PR で明示宣言** |
| 13 | **Failure mode catalog を新規 failure 発覚都度追記する** (anti-patterns doc §1 を拡張) |

---

## §4. Deploy 経路設計 (CEO 課題 1-3)

### 4.1 `npx vercel --force` を原則禁止する条件 (CEO 課題 1)

**禁止条件 (全該当で禁止)**:
- ✅ smoke の目的が **production-equivalent CoAlter chat smoke** または **Mirror visible smoke**
- ✅ build に **branch-scoped env** が必要 (Mirror flag / 専用 Supabase env / forced canary flag 等)

**許容条件 (mount smoke 限定、明示宣言が必要)**:
- smoke 目的が **Mount smoke のみ** (MirrorHost mount + useMirrorEngine 起動の構造確認)
- branch-scoped env 不要 (全 axis unknown でも目的達成)
- 起票 PR で **「Mount smoke only」を明示宣言**

### 4.2 git attribution 付き Preview build の作り方 (CEO 課題 2)

**必須条件 (Vercel API meta で全 4 項目確認)**:
- `source: github` (NOT `cli`)
- `gitSource.type: github`
- `gitSource.ref: <対象 canary branch 名>` (NOT None)
- `meta.githubCommitRef: <対象 canary branch 名>` (NOT None)

**確認 literal command**:
```bash
DEPLOYMENT_ID="dpl_<your-deploy-id>"
TOKEN=$(cat ~/Library/Application\ Support/com.vercel.cli/auth.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
TEAM_ID="team_wS0pdrzKkPjZAf5K5QJuqy5h"
curl -s "https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = d.get('meta', {})
gs = d.get('gitSource') or {}
print('source:', d.get('source'))
print('gitSource.type:', gs.get('type'))
print('gitSource.ref:', gs.get('ref'))
print('meta.githubCommitRef:', m.get('githubCommitRef'))
ok = d.get('source') == 'github' and gs.get('ref') is not None and m.get('githubCommitRef') is not None
print()
print('VERDICT:', 'PASS' if ok else 'FAIL — git attribution 欠落、smoke 中止')
"
```

### 4.3 IBS / `ignoreCommand` 回避方法 (CEO 課題 3、3 options)

現状の `vercel.json` `ignoreCommand`:
```json
{
  "ignoreCommand": "[ -z \"$(git diff --name-only HEAD^ HEAD | grep -v '\\.md$')\" ] && exit 0 || exit 1"
}
```

つまり `.md` 以外の変更なし → build skip。 empty commit / docs-only commit は IBS で canceled。

#### Option α: **`.ts/.tsx` 最小 trigger commit** (Phase A §3.4 学び、現状の確実な唯一手段)

```bash
git checkout chore/coalter-mirror-c<N>-canary
# 例: hooks/useMirrorEngine.ts の冒頭 docstring に 5 行 jsdoc comment 追加
#     functional 変更なし、type 変更なし、test に影響なし
git add hooks/useMirrorEngine.ts
git commit -m "chore(coalter): trigger C-<N> canary build (5-line jsdoc comment, no functional change)"
git push -u origin chore/coalter-mirror-c<N>-canary
# → Vercel GitHub integration が自動 build trigger
# → source: github / gitSource.ref: chore/coalter-mirror-c<N>-canary 確実に attribution 付く
```

利点: 実装変更不要 (code 変更は jsdoc のみ、test に影響なし)
欠点: docstring 変更が PR 履歴に残る (許容範囲)

#### Option β: **trigger file pattern** (専用 dedicated file)

```
.canary-trigger.json (新規追加、Phase D-1 で実装案)
{
  "phase": "C-4R",
  "smoke_purpose": "production-equivalent CoAlter chat smoke",
  "trigger_at": "2026-05-19T10:00:00Z",
  "expected_supabase_ref": "aljavfujeqcwnqryjmhl"
}
```

`vercel.json` `ignoreCommand` を拡張:
```json
{
  "ignoreCommand": "[ -z \"$(git diff --name-only HEAD^ HEAD | grep -vE '\\.md$|\\.canary-trigger\\.json$')\" ] && exit 0 || exit 1"
}
```

利点: trigger 専用 file で意図明示、metadata 構造化、`vercel --force` 不要
欠点: `vercel.json` 変更 (code 変更) → Phase D-1 で CEO 承認後に実装

#### Option γ: **Vercel UI で canary branch を IBS 例外化** (Vercel Dashboard 設定変更)

```
Vercel Dashboard → Settings → Git → Ignored Build Step
→ 「Ignore for the following branches」 (or 同等) に chore/coalter-mirror-c<N>-canary を allowlist
```

利点: code 変更不要、Vercel UI 操作のみ
欠点: Vercel UI 設定変更履歴が git に残らない、operational drift リスク

#### Phase D-0 推奨: **Option α + Option β の併用**

- **短期**: Option α (trigger commit) を Phase D-1 から canary smoke 標準手順に格上げ
- **中期**: Option β (`.canary-trigger.json` + `vercel.json` 拡張) を Phase D-2 で実装、Option α を deprecated
- Option γ は実装不能ケースの fallback (Vercel UI 設定は version 管理外)

---

## §5. env 検証設計 (CEO 課題 4-6)

### 5.1 Deploy meta verify (§4.2 と同 command、必須 pre-smoke step)

deploy 直後、smoke 開始**前**に必ず実行。FAIL なら smoke 中止 → §4.3 で再 deploy。

### 5.2 Canonical URL の取得と user alias 禁止 (CEO 課題 6)

**Canonical URL pattern**:
```
https://culcept-<8-char-hash>-taishis-projects-0a8deb17.vercel.app
```

**禁止される alias**:
- `culcept-th7328aish-1775-...` (user alias、複数 user-attributed deploy で奪い合い、reproducibility なし)
- `culcept-git-<branch-slug>-<hash>-...` (git branch alias、補助用途のみ、smoke 本命 URL としては canonical を使う)

### 5.3 HTML bundle Supabase ref grep (CEO 課題 4 の最終 gate、必須 post-deploy step)

```bash
CANONICAL_URL="https://culcept-<8-char-hash>-taishis-projects-0a8deb17.vercel.app"
EXPECTED_REF="aljavfujeqcwnqryjmhl"  # Aneurasync Production Supabase
FORBIDDEN_REF="hjcrvndumgiovyfdacwc"  # Alter staging Supabase (Mirror canary では絶対 NG)

found=$(curl -sL "$CANONICAL_URL" 2>/dev/null | grep -oE "https://[a-z0-9]+\.supabase\.co" | sort -u)
echo "Found Supabase URLs:"
echo "$found"

if echo "$found" | grep -q "$FORBIDDEN_REF"; then
  echo "🔴 STOP: Alter staging Supabase が baked-in、smoke 中止"
  exit 1
fi
if ! echo "$found" | grep -q "$EXPECTED_REF"; then
  echo "🔴 STOP: Expected Production Supabase ($EXPECTED_REF) が見えない、smoke 中止"
  exit 1
fi
echo "✅ Supabase project ref OK"
```

### 5.4 Expected / Forbidden Supabase ref (CEO 課題 5)

| 種別 | project ref | 用途 |
|---|---|---|
| **Expected** | `aljavfujeqcwnqryjmhl` | Aneurasync Production Supabase。CoAlter Mirror canary は必ずこれを向く必要 |
| **Forbidden** | `hjcrvndumgiovyfdacwc` | Alter staging Supabase (Alter 別作業の all-preview env)。Mirror canary に bake された時点で smoke 中止 |

### 5.5 環境ごとの env source 期待値 (matrix)

| build env | NEXT_PUBLIC_SUPABASE_URL source | 期待 ref |
|---|---|---|
| Production deploy | Production env (125d ago) | `aljavfujeqcwnqryjmhl` |
| Preview deploy (canary, git-attributed, branch-scoped env あり) | branch-scoped env | `aljavfujeqcwnqryjmhl` (CEO 投入) |
| Preview deploy (canary, **git attribution 欠落**) | **all-preview env (Alter 別作業)** | **`hjcrvndumgiovyfdacwc`** (forbidden) |
| Preview deploy (他 branch、branch-scoped env なし) | all-preview env (Alter 別作業) | `hjcrvndumgiovyfdacwc` (Alter 用途では正常、Mirror canary なら異常) |
| Development | Development env (なし、Vercel default) | undefined (local dev は別 env) |

---

## §6. env 分離戦略 (CEO 課題 7-8、all-preview env と CoAlter canary の混在禁止)

### 6.1 現状の問題

- Vercel project の **all-preview scope** に Alter 別作業の Supabase staging (`hjcrvndumgiovyfdacwc`) + `PLAN_ROUTE_LIVE=true` 等が投入されている
- これらは Alter Plan W1-X 作業として正当な投入だが、CoAlter Mirror canary でも同じ env が default 解決される
- branch-scoped env で上書きしても、git attribution 欠落 deploy では適用されない (C-4 root cause)

### 6.2 3 解決 option (Phase D-3 で CEO 選択)

#### Option A: **Mirror canary 専用 Preview Supabase project の新規分離**

- 新規 Supabase project を Aneurasync org に作成 (e.g. `aneurasync-mirror-canary`)
- 必要 schema を migration (talk_threads / genome_connections / profiles / stargazer_star_maps 等)
- CEO 個人 data の subset を migrate (CEO 判断)
- Mirror canary branch にのみ branch-scoped env で投入
- Alter 別作業 (all-preview Supabase) と完全分離

**利点**:
- Mirror canary が Alter 別作業に永続的に影響されない
- production-equivalent な data で smoke 可能

**欠点**:
- Supabase project 増 (運用コスト)
- migration / data subset 選定 (CEO data の何を migrate するか判断必要)
- Phase D-3 で 1-2 週間の工程

#### Option B: **Production env への gradual rollout (allowlist user)**

- Production env に Mirror flag (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` 等) を**追加**
- ただし `useMirrorEngine` hook 内で **user allowlist** check を追加 (CEO の user id のみ Mirror 有効化)
- Production 全 user には flag default false で no-op
- canary は Production と同 deploy で動作確認可能

**利点**:
- Supabase project 増なし
- 完全 production-equivalent

**欠点**:
- **Phase B/C canon「Production env 触らない」を緩める**必要 (CEO 承認必須)
- allowlist 実装に code 変更 (user ID 比較)
- Production 全 user に対する flag 漏れリスク → 4-layer flag gating + user allowlist の二重防御必須

#### Option C: **Vercel UI で canary-only allowlist branch 設定 (env scope 強制)**

- Vercel project Settings で `chore/coalter-mirror-c<N>-canary` を特別 branch として allowlist
- 当該 branch の build は all-preview env を読まず、branch-scoped env のみを resolve する設定 (Vercel が提供する場合)
- 注: **Vercel が提供する機能か Phase D-2 で確認必要**。提供されていない場合 Option C は不能

**利点 (実現可能なら)**:
- code 変更なし
- 最も小さい修正

**欠点**:
- Vercel 機能依存、提供保証なし
- Vercel UI 設定変更履歴が git に残らない

### 6.3 Option 評価 matrix

| Option | code 変更 | env scope 変更 | Production env touch | 実装期間 | Phase B/C canon 整合 |
|---|---|---|---|---|---|
| A. 専用 Supabase 分離 | minor (migration script) | env 増 (canary-scoped のみ) | なし | 1-2 週 | ✅ 完全整合 |
| B. Production allowlist rollout | 必要 (user allowlist hook) | Production env 追加 | あり (flag 投入) | 1 週 | ⚠️ canon 緩和 (CEO 承認必須) |
| C. Vercel UI allowlist branch | なし | なし | なし | 1 日 (機能確認のみ) | ✅ (機能存在なら) |

**Claude 推奨**: **Option A** (canon 維持 + 構造的に確実 + Alter 別作業との永続分離)。

Option C を Phase D-2 で**先に試行** (Vercel 機能調査) → 実現可能なら C 採用、不能なら A 採用。Option B は緊急時の fallback のみ (Production env 触る重みあり)。

---

## §7. Production-equivalent CoAlter 正規導線 (CEO 課題 9)

### 7.1 Production 導線の全 step

```
Step 1. login (Supabase auth session 作成)
  ↓
Step 2. root / → AneurasyncHome
  - baseline_completed_at OR stargazer_star_maps row 存在
  - 不在なら /baseline or /stargazer redirect
  ↓
Step 3. MAIN_NAV「メッセージ」or HOME_QUICK_NAV「トーク」 → /talk
  - requireBaseline() gate 通過
  - 匿名 user → AnonymousRegistrationPage
  ↓
Step 4. /talk (TalkPageClient): 既存 thread 一覧表示
  - genome_connections 経由で表示
  ↓
Step 5. 既存 thread を click → /talk/[threadId]
  - ChatClient render
  - fetchMessages / fetchGenomeCard / fetchCounterpart
  - <CoAlterButton /> + <CoAlterCardDispatcher /> + <UpperLayerMount /> + <ObserverHost /> + <MirrorHost />
  ↓
Step 6. CoAlterButton click → useCoAlter(threadId).activate()
  - POST /api/coalter/activate
  - 必要 DB: talk_threads + genome_connections (status accepted)
  - pair_state row 作成 / 取得
  ↓
Step 7. CoAlter chat 動作 (CoAlterCard / Dispatcher で proposal 等)
  - (Phase B/C 投入時) MirrorHost が useMirrorEngine() で decideMirror() 実行
  - (forced canary mode の場合) MirrorVisibleSurface 出現可能
```

### 7.2 各 step の必要 DB 条件 (full path 通過のため)

| Step | 必要 DB 行 | 場所 |
|---|---|---|
| 2 | `profiles.id = user.id` + `baseline_completed_at IS NOT NULL` OR `stargazer_star_maps.user_id = user.id` row exists | Supabase project (canary が向くべき) |
| 3 | 上記 (`requireBaseline` 通過) | 同上 |
| 4 | `genome_connections` accepted status の row | 同上 |
| 5 | `talk_threads.id = <threadId>` + `talk_threads.connection_id` → `genome_connections` join | 同上 |
| 6 | 同上 (`/api/coalter/activate` が両 table を join) | 同上 |
| 7 | `pair_state` row (activate で作成) | 同上 |

**結論**: production-equivalent smoke を成立させるには、canary が向く Supabase project に **CEO 個人の上記全 DB 行**が必要。

Option A (専用 Supabase 分離) を採用する場合、これらを migrate する subset を Phase D-3 で CEO 判断。Option B (Production allowlist) なら migration 不要。Option C (Vercel UI allowlist) なら Production data がそのまま使える (canary が Production project に向く)。

### 7.3 Production-equivalent smoke 観測項目

`docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §5 の 19 項目 + Phase C 追加 7 項目を踏襲。詳細は Phase D-4 (re-smoke) sub-PR で smoke plan docs として正式起票。

---

## §8. Rollback / Cleanup 手順 (CEO 課題 10)

### 8.1 Deploy 異常時の即時 rollback (smoke 開始**前**)

| trigger | action |
|---|---|
| §4.2 git attribution verify FAIL | 該当 deployment 放置 (build 自体は完了)、smoke 開始しない、§4.3 で再 trigger |
| §5.3 HTML grep で forbidden ref 検出 | 同上 + env scope audit (誤 env 投入か確認) |
| Vercel deploy が Building → Error | 通常の build error として log audit |
| canary branch に意図せぬ commit (CEO 以外の push 等) | branch 削除 + 新規 canary branch 作成 |

### 8.2 Smoke 中の即時 rollback (smoke 開始後、rollback trigger 観測時)

`docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §9 rollback trigger 11 件を踏襲。kill switch (env 全削除 1 行 command) を Phase D-4 smoke docs に literal で。

### 8.3 Smoke 後 cleanup (Phase D-4 完了 → Phase D-5 close 前)

```bash
# 削除 (順序: forced canary → diagnostic → channel → Supabase NEXT_PUBLIC)
for KEY in NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  npx vercel env rm "$KEY" preview chore/coalter-mirror-c<N>-canary --yes
done

# 確認: 全 scope で 0
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  npx vercel env ls $SCOPE | grep -E "(NEXT_PUBLIC_COALTER_MIRROR_|NEXT_PUBLIC_SUPABASE_)" | head
done

# canary branch + worktree cleanup
git push origin --delete chore/coalter-mirror-c<N>-canary
git worktree remove /path/to/canary-worktree --force
git branch -D chore/coalter-mirror-c<N>-canary
```

### 8.4 Cleanup の必須 verify (Phase D-5 で確認)

- Production env / all-Preview Alter env / Development env / SUPABASE_URL (server) / SUPABASE_SERVICE_ROLE_KEY (server) **すべて touch なし**を Vercel UI で目視確認
- Alter 別作業 (all-preview Supabase / PLAN_ROUTE_LIVE 等) に**影響なし**を Alter 担当が確認 (Phase D-5 で CEO judgment)

---

## §9. Mandatory PR Description Checklist (Claude 自立推論 §11、機械的 gate)

Phase D 任意 sub-PR (D-1 〜 D-5、それ以降の全 phase の canary smoke 関連 PR) 起票時、PR description に**下記 checklist を必須含有**する。

```markdown
## Canary Smoke Pre-flight Checklist (Phase D-0 §9 必須)

### 必読 docs
- [ ] `docs/coalter-aoo-canary-deploy-anti-patterns.md` 全 section 読了
- [ ] `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` (本 docs) 全 section 読了
- [ ] 前 Phase 完了 docs §3 系 (重要発見・訂正) 全項目読了

### Smoke layer 明示宣言 (§10、3 分類のうちどれか)
- [ ] Mount smoke (MirrorHost mount + useMirrorEngine 起動 のみ)
- [ ] Mirror visible smoke (MirrorVisibleSurface 実機表示)
- [ ] CoAlter chat smoke (production-equivalent: login → /talk → 既存 thread → activate → Mirror visible)

### 期待 env 値 (§5.4)
- [ ] expected Supabase ref: aljavfujeqcwnqryjmhl
- [ ] forbidden Supabase ref: hjcrvndumgiovyfdacwc (Mirror canary では絶対 NG)
- [ ] branch-scoped env が必要な場合は **§4.3 git-attributed deploy 経路** を使う (§4.1 `--force` 禁止条件)

### Deploy 経路宣言 (§4)
- [ ] `.ts/.tsx` 最小 trigger commit (Option α)
- [ ] `.canary-trigger.json` (Option β、Phase D-2 以降)
- [ ] Vercel UI allowlist branch (Option C、確認後採用なら)
- [ ] `vercel --force` を使う場合は **mount smoke only** を明示 (§4.1 許容条件)

### Cleanup 計画 (§8)
- [ ] smoke 終了後の env 削除 command を pre-defined
- [ ] canary branch + worktree cleanup 手順記述
- [ ] Alter 別作業への影響なしを Phase D-5 で確認する旨記述
```

### 9.1 Mandatory checklist の機械化 (Phase D-1 候補)

`.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` 新規作成案 (Phase D-1 sub-PR):
- PR 起票時に上記 checklist が自動 inject
- checkbox 未完了で merge できない CI gate

Phase D-1 で実装判断。

---

## §10. Smoke Layer 3 分類 (Claude 自立推論 §12、明示宣言義務化)

`docs/coalter-aoo-canary-deploy-anti-patterns.md` §8 と整合。本 docs で再宣言。

| Layer | 内容 | 達成手段 | 完了判定 |
|---|---|---|---|
| **L1 Mount smoke** | MirrorHost mount + useMirrorEngine 起動 | unit test + 構造確認 (既達 B-5a/b) | mock data or `/talk/<任意 uuid>` 直打ちで OK |
| **L2 Mirror visible smoke** | MirrorVisibleSurface 実機表示 + close/sleep/cap/verification 動作 | forced canary mode (C-3) の mock injection、production-equivalent context では**ない** | UI 操作で close/sleep ボタン動作確認 |
| **L3 CoAlter chat smoke** (Production-equivalent) | login → /talk → 既存 thread → CoAlter button → activate → visible Mirror | **Phase D 設計後 (D-3/D-4)** | real chat 中 visible Mirror が controlled に出る + retreat affordance が real user 操作で機能 |

**3 layer は独立**、上 layer 達成は下 layer 達成を**含意しない**。各 smoke 起票時に**どの layer を実施するか PR で明示宣言必須**。

---

## §11. Failure Mode Catalog (Claude 自立推論 §13、永続更新)

`docs/coalter-aoo-canary-deploy-anti-patterns.md` §1 (既知 anti-pattern) を**継続更新する canon** として位置付ける。Phase D 以降:

### 11.1 既知 failure mode (現時点)

| # | failure mode | 発覚 phase | 対処 |
|---|---|---|---|
| F1 | NODE_ENV gate が Vercel Preview build (= production build) で canary を block | Phase A §3.5 → B-5a 取り込み漏れ → C-1 で修正 | NODE_ENV gate 採用禁止 |
| F2 | empty commit が IBS `ignoreCommand` で skip → build にならない | Phase A §3.4 → B-5c で `--force` 迂回 → C-4 で root cause 判明 | §4.3 Option α/β/γ |
| F3 | `vercel --force` CLI deploy が source=cli / git attribution 欠落 → branch-scoped env 不適用 → all-preview env が baked-in | C-4 BLOCKED で判明 | §4 全体 |
| F4 | user alias URL の解決先が時点依存 (複数 user-attributed deploy 間で奪い合い) | C-4 で判明 | §5.2 canonical URL のみ使う |
| F5 | 削除済 / 別 phase branch 起源の old preview URL を redeploy しても元 branch の env scope で resolve | C-4 で判明 | §5.2 専用 canary branch を新規作成 |

### 11.2 新規 failure mode 発覚時の手順

1. 当該 sub-PR で failure mode を docs/decision-log に記録
2. `docs/coalter-aoo-canary-deploy-anti-patterns.md` §1 に追記
3. 本 docs §11.1 表を更新 (別 PR で)
4. 必要なら §9 mandatory checklist に対応項目追加

---

## §12. Deploy → Smoke → Cleanup の Gate 付き Cycle (Claude 自立推論 §14)

各 step に**通過 gate**を設置、gate FAIL なら次 step に進めない:

```
[Gate 0: pre-flight checklist]
  ↓ (PASS: §9 全項目 ✅)
[Step 1: canary branch + git-attributed deploy]
  ↓
[Gate 1: deploy meta verify]
  ↓ (PASS: §4.2 git attribution 全 4 項目 OK)
[Step 2: CEO env injection (branch-scoped only)]
  ↓
[Gate 2: env scope verify]
  ↓ (PASS: Production/全 Preview/Development 流出 0 + canary branch のみに存在)
[Step 3: redeploy (git-attributed 経路 §4.3)]
  ↓
[Gate 3: HTML bundle Supabase ref verify]
  ↓ (PASS: §5.3 expected ref 含有 + forbidden ref 不在)
[Step 4: CEO smoke (3 layer のいずれか §10)]
  ↓
[Gate 4: smoke checklist verify (rollback trigger 0)]
  ↓ (PASS: 全 phase observation 合格)
[Step 5: cleanup (env / branch / worktree §8)]
  ↓
[Gate 5: cleanup verify (Production/全 Preview/Development/Alter 別作業 不変)]
  ↓ (PASS)
[Step 6: decision-log + smoke result docs PR]
  ↓
[Phase D-5 close / 次 phase 起票]
```

各 gate を**実体ある verification command で表現** (本 docs §4-§8 の literal command 群)。**人間判断ではなく機械実行可能**。

---

## §13. Phase 跨ぎ学び継承の自動化 (Claude 自立推論 §15)

### 13.1 現状の問題

Phase A → B (B-5a) → C (C-4) で 3 連続「同型の学び取り込み漏れ」が発生:
- 各 phase 完了 docs に「前 phase 学び reference」と記述するが、新 phase 着手 PR で**実際に読まれる保証がない**
- 結果として同型事故が反復

### 13.2 解決 design

**新 Phase 起票 PR template** (`.github/PULL_REQUEST_TEMPLATE/new-phase.md` 新規案、Phase D-1 候補):

```markdown
## 新 Phase 起票 Pre-flight (Phase D-0 §13 必須)

### 前 Phase 学び読了 checkbox (全 phase 必須)
- [ ] Phase A 完了 docs §3.4 (empty commit IBS skip) 読了
- [ ] Phase A 完了 docs §3.5 (NODE_ENV gate 採用禁止) 読了
- [ ] Phase A 完了 docs §3.7 (7-layer defense) 読了
- [ ] Phase B 完了 docs §7 (Phase A→B 学び取り込み漏れ + 重要発見) 読了
- [ ] Phase B 完了 docs §13 (Phase C で起こりやすい設計事故) 読了
- [ ] Phase C C-0 design §2 (Phase 間学び連鎖 meta-process) 読了
- [ ] `docs/coalter-aoo-canary-deploy-anti-patterns.md` (永続 canon) 全 section 読了
- [ ] `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` (本 docs) 全 section 読了

### 新 Phase で適用する学び (各項目 1-2 行で記述)
- [ ] Phase A §3.5 → 本 Phase で...
- [ ] Phase A §3.7 → 本 Phase で...
- [ ] Phase B §7 → 本 Phase で...
- [ ] Phase C C-0 §2 → 本 Phase で...
- [ ] anti-patterns canon → 本 Phase で...

### 想定 failure mode (本 phase で起こりうるもの)
- [ ] (記述)
- [ ] 対策: (記述)
```

**checkbox 未完了で merge できない CI gate** を Phase D-1 で実装判断。

### 13.3 機械的強制が必要な理由

人間は:
- 「読んだことにする」
- 「自分の case では関係ない」と判断する
- 多忙時に skip する

機械 gate は:
- checkbox を埋めるまで merge できない (運用に gate 埋込)
- 各 phase が前 phase 学びを**明示的に取り込む証拠**を強制
- 同型事故の構造的反復を防ぐ

---

## §14. Phase D 着手前 pre-flight (印刷可能 checklist)

```
[Phase B/C 完了確認]
□ PR #195 main 着地 (9b294164、C-4 BLOCKED closure)
□ docs/coalter-aoo-canary-deploy-anti-patterns.md main 配置確認
□ env 全 scope cleanup 確認 (Mirror / Supabase canary-scope 0 件)
□ canary branch / worktree 不在確認

[Phase D 設計合意]
□ 本 docs (Phase D-0) §6 で env 分離 option (A/B/C) を CEO 選択
□ §4.3 deploy 経路 option (α/β/γ) を Phase D-1/D-2 で確定
□ §9 mandatory checklist の template 化を Phase D-1 で起票判断
□ §13 phase 学び継承 template の機械化を Phase D-1 で起票判断

[各 Phase D sub-PR 起票時]
□ Appendix A の PR description checklist 全項目確認
□ smoke layer 明示宣言 (§10、3 分類)
□ 不可侵境界 (本 docs §3.1 Phase B canon §7.4 + §3.2 Phase D-0 canon) 全項目維持
□ test (mirror + presence regression) full PASS
□ vitest / tsc / eslint clean
□ hidden / bidi Unicode 0
```

---

## §15. References

### Phase C C-4 BLOCKED 関連 docs (本 docs の直接前提)
- `docs/coalter-aoo-canary-deploy-anti-patterns.md` (永続 canon、PR #195 で起票)
- `docs/decision-log.md` 2026-05-19 C-4 BLOCKED entry
- `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §16 (smoke 詳細)

### Phase B/C 設計 docs (canon 継承)
- `docs/coalter-aoo-phase-b-completion.md` §7.4 (Phase B canon 10 原則) / §13 (設計事故 5 件)
- `docs/coalter-aoo-phase-c-integration-design.md` §2 (Phase 間学び連鎖 meta-process)

### Phase A 学び (本 root cause の前提)
- `docs/coalter-aoo-phase-a-completion.md` §3.4 (empty commit IBS skip)
- 同 §3.5 (NODE_ENV gate 採用禁止)
- 同 §3.7 (7-layer defense)

### Phase D 実装 sub-PR (未起票、本 design 完了後に CEO 承認で起票)
- D-1: smoke verification automation script + `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` (本 §9 機械化)
- D-2: `vercel.json` `ignoreCommand` 拡張 (Option β `.canary-trigger.json` 経路、§4.3)
- D-3: env 分離戦略実装 (CEO 選択 Option A/B/C、§6)
- D-4: re-smoke (production-equivalent CoAlter smoke、§7)
- D-5: Phase D close + Phase C 完了判定

### 学術基盤 (再発防止の機械的強制 design)
- Reliability engineering: defense in depth (Reason 1990: Swiss cheese model)
- Software engineering: fail-closed gate pattern (Lampson 1973)
- DevOps: GitOps pre-merge enforcement (Weaveworks 2017)
- Phase B/C 継承: Lambert (1992) / Miller & Rollnick (2013) / Nahum-Shani et al. (2018)

---

## §16. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-19 | Phase D-0 / C-4R: Production-equivalent Canary Deploy Route Design (docs-only) 起票 | CEO 補正「C-4R / D-0 起票、docs-only、code/env/redeploy 禁止」(2026-05-19) |

---

## Appendix A — Phase D sub-PR 起票時 PR description checklist (印刷可能)

(§9 と同内容、PR description にコピペ用)

```markdown
## Canary Smoke Pre-flight Checklist (Phase D-0 §9 必須)

### 必読 docs
- [ ] docs/coalter-aoo-canary-deploy-anti-patterns.md 全 section 読了
- [ ] docs/coalter-aoo-phase-d0-canary-deploy-route-design.md 全 section 読了
- [ ] 前 Phase 完了 docs §3 系 全項目読了

### Smoke layer 明示宣言 (3 分類のいずれか)
- [ ] L1 Mount smoke
- [ ] L2 Mirror visible smoke
- [ ] L3 CoAlter chat smoke (production-equivalent)

### 期待 env 値
- [ ] expected Supabase ref: aljavfujeqcwnqryjmhl
- [ ] forbidden Supabase ref: hjcrvndumgiovyfdacwc

### Deploy 経路宣言
- [ ] Option α: .ts/.tsx 最小 trigger commit
- [ ] Option β: .canary-trigger.json
- [ ] Option γ: Vercel UI allowlist branch
- [ ] vercel --force (Mount smoke only)

### Cleanup 計画
- [ ] env 削除 command pre-defined
- [ ] canary branch + worktree cleanup 手順記述
- [ ] Alter 別作業への影響なし確認
```

---

## Appendix B — env 検証 1-shot script (Phase D-1 候補、印刷可能)

```bash
#!/bin/bash
# canary-smoke-verify.sh — Phase D-0 §4.2 + §5 verification (1-shot)

set -e

CANARY_BRANCH="$1"
DEPLOYMENT_ID="$2"
EXPECTED_SUPABASE_REF="${3:-aljavfujeqcwnqryjmhl}"
FORBIDDEN_SUPABASE_REF="${4:-hjcrvndumgiovyfdacwc}"

if [ -z "$CANARY_BRANCH" ] || [ -z "$DEPLOYMENT_ID" ]; then
  echo "Usage: $0 <canary-branch> <deployment-id> [expected-ref] [forbidden-ref]"
  exit 1
fi

TOKEN=$(cat ~/Library/Application\ Support/com.vercel.cli/auth.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
TEAM_ID="team_wS0pdrzKkPjZAf5K5QJuqy5h"

# Gate 1: deploy meta verify
echo "=== Gate 1: deploy meta verify ==="
result=$(curl -s "https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}?teamId=${TEAM_ID}" -H "Authorization: Bearer $TOKEN")
source_type=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('source',''))")
git_ref=$(echo "$result" | python3 -c "import json,sys; print((json.load(sys.stdin).get('gitSource') or {}).get('ref',''))")
git_commit_ref=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('meta',{}).get('githubCommitRef',''))")
canonical_url=$(echo "$result" | python3 -c "import json,sys; print('https://' + json.load(sys.stdin).get('url',''))")

echo "source: $source_type"
echo "gitSource.ref: $git_ref"
echo "meta.githubCommitRef: $git_commit_ref"

if [ "$source_type" != "github" ] || [ "$git_ref" != "$CANARY_BRANCH" ] || [ "$git_commit_ref" != "$CANARY_BRANCH" ]; then
  echo "🔴 FAIL: git attribution 欠落、smoke 中止"
  exit 1
fi
echo "✅ Gate 1 PASS"

# Gate 3: HTML bundle Supabase ref verify
echo ""
echo "=== Gate 3: HTML bundle Supabase ref verify ==="
echo "Canonical URL: $canonical_url"
found=$(curl -sL "$canonical_url" 2>/dev/null | grep -oE "https://[a-z0-9]+\.supabase\.co" | sort -u)
echo "Found:"
echo "$found"

if echo "$found" | grep -q "$FORBIDDEN_SUPABASE_REF"; then
  echo "🔴 FAIL: Forbidden Supabase ref ($FORBIDDEN_SUPABASE_REF) detected、smoke 中止"
  exit 1
fi
if ! echo "$found" | grep -q "$EXPECTED_SUPABASE_REF"; then
  echo "🔴 FAIL: Expected Supabase ref ($EXPECTED_SUPABASE_REF) not found、smoke 中止"
  exit 1
fi
echo "✅ Gate 3 PASS"

echo ""
echo "🟢 ALL GATES PASS — smoke 開始可能"
echo "Canonical URL: $canonical_url"
```

Phase D-1 で本 script を `scripts/canary-smoke-verify.sh` として実装 (CEO 承認後)。

---

## Appendix C — Vercel CLI deploy 挙動の調査メモ (Phase D-1 で実機確認推奨)

下記は本 D-0 起票時点での仮説。Phase D-1 で実機検証し、本 docs を更新:

| CLI command | git attribution が付くか? | 検証必要 |
|---|---|---|
| `vercel deploy` (no flags、from git worktree) | 不明 (要検証) | Phase D-1 |
| `vercel deploy --force` (from git worktree) | **付かない** (C-4 で実証) | 確定 |
| `vercel deploy --meta gitCommitRef=<branch>` | 不明 (要検証、Vercel docs に記述あり) | Phase D-1 |
| `vercel redeploy <existing-deployment>` | 元 deployment の git attribution を継承? | Phase D-1 |
| git push (Vercel GitHub integration) | **付く** (B-5c で実証、ただし IBS で skip される問題と組み合わせ) | 確定 |

Phase D-1 で full matrix 検証し、確実な git-attributed deploy 経路を確定する。
