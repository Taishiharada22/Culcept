# CoAlter AOO — Canary Deploy Anti-Patterns (永続 reference)

**ステータス**: 永続 canon (Phase D 以降の **canary smoke 起票時の必読 docs**)
**作成日**: 2026-05-19
**根拠**: Phase C C-4 BLOCKED closure (`docs/decision-log.md` 2026-05-19 entry + `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §16)
**前提**: Phase A 完了 docs §3.4 / §3.5 / §3.7 / Phase B 完了 docs §7 + Appendix C / Phase C C-0 design §2

> ⚠️ **必読タイミング** (canary smoke 関連の Phase / sub-PR を起票するときは必ず本 doc を最初に読む):
> - Phase D-0 integration design 起票時
> - 任意 canary smoke runbook の起票時
> - 既存 smoke 実施中に異常 (visible Mirror が出ない / chat 機能が動かない / baseline 失敗 等) 検知時
> - canary deploy 経路を変更する任意 PR の design 時

---

## §0. このドキュメントが存在する理由

Phase C C-4 で発生した「Production-equivalent CoAlter smoke が構造的に不能」の root cause は、**Vercel CLI deploy が git attribution を inject しない** ことに起因する **env resolution の誤り**。

これは「Mirror Channel の bug」ではなく「**canary deploy の経路設計の bug**」だった。canary smoke 関連の作業をする全 phase / 全 sub-PR で **構造的に同じ事故が起こりうる**。本 doc は、その再発を構造で防ぐ。

### Phase A → B → C 学び連鎖の総括 (3 Phase 横断 view)

| Phase | 発覚した学び | 取り込み漏れ Phase | 結果 |
|---|---|---|---|
| A §3.5 | NODE_ENV gate は Vercel Preview = production build で canary を block | B-5a | B-5c smoke で `window.__coalterMirrorDiagnostic` undefined |
| A §3.4 | empty commit は IBS `ignoreCommand` で skip → 実 build にならない | B-5c (CLI `--force` で迂回) | B-5c smoke は通過したが、Phase C で `--force` 自体が attribution 欠落の根源と判明 |
| A §3.7 | 7-layer defense (env scope / strict parser / canary draft / 短命 / 15min / cleanup / redacted) | B-5a 部分取り込み、C-1 で完全取り込み | C-1 で NODE_ENV guard 削除済 |
| **C-4 (本 doc)** | **Vercel CLI `vercel --force` deploy は source=cli / gitSource.ref=None / gitCommitRef=None → branch-scoped env を skip し all-preview env を resolve** | Phase D で本来課題 (canary deploy 経路) を正面から扱う | C-4 BLOCKED |

**3 Phase 連続で「同型の取り込み漏れ」が起こっている**。本 doc は Phase D 以降この pattern を断ち切るための structural canon。

---

## §1. 確定 Anti-Pattern (C-4 BLOCKED で実機証拠取得)

### 1.1 ❌ `npx vercel --force` (CLI deploy) を branch-scoped env が必要な canary で使う

**症状**:
- Vercel API: `source: cli` / `gitSource.ref: None` / `gitCommitRef: None`
- branch-scoped Preview env が build に**到達しない**
- all-preview env (他 team / 他 phase の作業) が代わりに build に baked-in

**実証** (C-4 BLOCKED、HTML bundle 直接 curl):
```
$ curl -sL https://culcept-1h8ychlul-...vercel.app | grep "supabase.co"
https://hjcrvndumgiovyfdacwc.supabase.co  ← Alter staging Supabase (意図外)
```

意図された Production Supabase (`aljavfujeqcwnqryjmhl`) は build に反映されず。CEO の branch-scoped 投入が無駄になる。

### 1.2 ❌ user alias URL (`culcept-th7328aish-1775-...`) を smoke 本命 URL として使う

**症状**: 複数の user-attributed deploy 間で alias が奪い合いになる。CEO が開いた時点でどの deploy に resolve されているか不確定。

**正しい**: canonical deployment URL (`culcept-<8-char-hash>-taishis-projects-...`) を使う。

### 1.3 ❌ 削除済 / 別 phase branch 起源の old preview URL を redeploy / smoke 対象にする

**症状**: PR merge 後に削除済の branch (例: PR #191 merge 後の `feat/coalter-mirror-c3-forced-canary-mode`) の preview URL を redeploy しても、その deployment は元 branch の env scope で resolve される。canary branch の env は適用されない。

**正しい**: 専用 canary branch (例: `chore/coalter-mirror-c<N>-canary`) で deploy を新規作成し、その canonical URL を使う。

### 1.4 ❌ env injection 後の deploy artifact の検証を skip する

**症状**: env を投入したのに deploy artifact に env が反映されていない (本 C-4 ケース)、または **空文字で投入してしまった** (本 C-4 前段) ことに気づかない。

**正しい**: deploy artifact の HTML bundle を `curl + grep` で env 値の実 inline を確認 (§4 verification command 参照)。

### 1.5 ❌ Mount smoke を「visible Mirror smoke」「CoAlter chat smoke」と混同する

**症状**: `/talk/<任意 uuid>` 直打ちで MirrorHost mount を確認 → 「visible Mirror smoke 成功」と誤判定。

**正しい**: smoke layer を 3 分類で**明示宣言**して実施する (§8 参照)。

---

## §2. 今後の禁止 (CEO 補正 2026-05-19、Phase D 以降不変)

| # | 禁止操作 | 理由 |
|---|---|---|
| 1 | **branch-scoped env が必要な canary で `npx vercel --force` を使わない** | source=cli で git attribution が inject されない、branch-scoped env が build に到達しない |
| 2 | **git attribution なし deploy を smoke 本命にしない** | Vercel API meta で `gitSource.ref` / `gitCommitRef` が **対象 branch である**ことを必ず事前確認 |
| 3 | **user alias URL を smoke 本命 URL として使わない** | alias 解決先が時点依存、reproducibility なし |
| 4 | **削除済 / 別 phase branch 起源の old preview URL を smoke 対象にしない** | env scope が対象 branch に紐付かない |
| 5 | **deploy 直後に Supabase ref grep を skip しない** | 意図外 staging Supabase / 空 env を素早く検知する operational gate |

---

## §3. 今後の必須 pre-flight 確認 (CEO 補正 2026-05-19、Phase D 以降不変)

### 3.1 Deploy meta で git attribution が対象 branch であること

```bash
DEPLOYMENT_ID="dpl_<your-deploy-id>"
TOKEN=$(cat ~/Library/Application\ Support/com.vercel.cli/auth.json | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")
TEAM_ID="team_wS0pdrzKkPjZAf5K5QJuqy5h"

curl -s "https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}?teamId=${TEAM_ID}" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import json, sys
d = json.load(sys.stdin)
m = d.get('meta', {})
print('source:', d.get('source'))
print('gitSource.type:', (d.get('gitSource') or {}).get('type'))
print('gitSource.ref:', (d.get('gitSource') or {}).get('ref'))
print('meta.githubCommitRef:', m.get('githubCommitRef'))
print('meta.githubCommitSha:', (m.get('githubCommitSha') or '')[:12])
"
```

**期待**:
- `source: github` (NOT `cli`)
- `gitSource.ref: chore/coalter-mirror-c<N>-canary` (NOT None)
- `meta.githubCommitRef: chore/coalter-mirror-c<N>-canary` (NOT None)

**いずれかが None なら git attribution 欠落 → STOP**。下記 §6 を参照して git-attributed deploy 経路で再 deploy。

### 3.2 canonical deployment URL の取得

```bash
# canonical URL pattern: culcept-<8-char-hash>-taishis-projects-0a8deb17.vercel.app
# user alias pattern (使わない): culcept-th7328aish-1775-taishis-projects-...
# git branch alias (使ってもよいが canonical も併記推奨): culcept-git-<branch-slug>-...
```

### 3.3 HTML bundle で Supabase project ref 確認

```bash
# 本 §4 verification command を使う
```

### 3.4 Phase D-1 機械化された pre-flight + post-deploy verification (recommended)

Phase D-1 で `scripts/coalter/verify-canary-deploy.ts` が実装された。本 script は §3.1 (deploy meta verify) + §4 (HTML bundle Supabase ref grep) を **1 コマンドで 3 gates 順次評価** する。

```bash
npx tsx scripts/coalter/verify-canary-deploy.ts \
  --deployment-url=https://culcept-<canonical-hash>-taishis-projects-0a8deb17.vercel.app \
  --deployment-id=dpl_<your-deploy-id> \
  --expected-branch=chore/coalter-mirror-c<N>-canary \
  --expected-supabase=aljavfujeqcwnqryjmhl \
  --forbidden-supabase=hjcrvndumgiovyfdacwc
```

3 gates 順次 fail-closed 評価:
1. **Gate 1**: URL canonical-ness (user alias / git branch alias 禁止)
2. **Gate 2**: Deploy meta git attribution (`source: github` + `gitSource.ref` + `meta.githubCommitRef` が対象 branch)
3. **Gate 3**: HTML bundle Supabase ref (expected あり / forbidden なし)

Exit code:
- `0`: 3 gates 全 PASS (smoke 開始可能)
- `1`: いずれか FAIL (smoke 中止、§5 git-attributed deploy 経路で再 deploy)
- `2`: CLI argument error

Vercel token 解決順: `--vercel-token` flag > `VERCEL_TOKEN` env > `~/Library/Application Support/com.vercel.cli/auth.json` (macOS) > `~/.config/vercel/auth.json` (Linux)。

詳細は `scripts/coalter/verify-canary-deploy.ts` 冒頭 docstring + `tests/unit/coalter/verifyCanaryDeploy.test.ts` (47+ tests) を参照。

**本 script は read-only**: env 変更なし / deploy 作成なし / vercel env rm/add 一切使わない。HTTP GET (Vercel API + HTML bundle) のみ。

---

## §4. 必須 post-deploy verification — Supabase project ref grep (literal command)

> 📜 **Ref source-of-truth canon (D-3-α 以降)**: 本 §4 で使う `expected_ref` / `forbidden_ref` の正本は `docs/coalter-supabase-ref-canon.md` (§1 machine-readable JSON block) である。本 doc と canon の表記が drift した場合は `tests/unit/coalter/supabaseRefCanon.test.ts` で構造的に fail する。Ref を変更する PR は canon §4 protocol に従って同 PR で全参照先を同期する。

下記コマンドを **canary deploy Ready 直後 + CEO smoke 開始前** に必ず実行:

```bash
verify_canary_supabase() {
  local url=$1
  local expected_ref=$2  # e.g., "aljavfujeqcwnqryjmhl" (Production)
  local forbidden_ref="hjcrvndumgiovyfdacwc"  # ⚠️ Alter staging — Mirror canary では絶対 NG

  local found=$(curl -sL "$url" 2>/dev/null | grep -oE "https://[a-z0-9]+\.supabase\.co" | sort -u)
  if [ -z "$found" ]; then
    echo "🔴 STOP: HTML に Supabase URL が見つかりません (env 未投入 or build 失敗)"
    return 1
  fi
  if echo "$found" | grep -q "$forbidden_ref"; then
    echo "🔴 STOP: Alter staging Supabase が baked-in されています:"
    echo "$found"
    echo "→ canary env の git attribution 失敗の徴候。§6 git-attributed deploy 経路で再 deploy 必要。"
    return 1
  fi
  if echo "$found" | grep -q "$expected_ref"; then
    echo "✅ Supabase project ref OK ($expected_ref)"
    echo "$found"
    return 0
  fi
  echo "⚠️ Expected $expected_ref ですが、別 ref が混入しています:"
  echo "$found"
  return 1
}

# 使用例
verify_canary_supabase "https://culcept-<canonical-hash>-taishis-projects-0a8deb17.vercel.app" "aljavfujeqcwnqryjmhl"
```

> 🔴 **`hjcrvndumgiovyfdacwc` が build に含まれていたら即停止**。env 投入し直し / git-attributed deploy 経路で再 deploy 等の対処を CEO 判断で行う。

---

## §5. 必須 — git-attributed Preview deploy 経路 (現状の唯一の正解)

### Option A: `.ts/.tsx` 最小 trigger commit (Phase A §3.4 学び、現状の確実な唯一手段)

```bash
# 1. canary branch 上で、無害な comment 行を 1 file に追加
git checkout chore/coalter-mirror-c<N>-canary
# 例: hooks/useMirrorEngine.ts の冒頭 docstring に 5 行 comment 追加
#     (functional 変更なし、JSDoc 内 trigger marker)

# 2. commit + push
git add hooks/useMirrorEngine.ts
git commit -m "chore(coalter): trigger C-<N> canary build (5-line jsdoc comment, no functional change)"
git push -u origin chore/coalter-mirror-c<N>-canary

# 3. Vercel GitHub integration が自動 build trigger
#    → source: github / gitSource.ref: chore/coalter-mirror-c<N>-canary 確実に attribution 付く
#    → branch-scoped Preview env を build に baked-in する

# 4. §3.1 git attribution verify
# 5. §4 Supabase ref grep verify
```

### Option B: `.canary-trigger.json` + `vercel.json` `ignoreCommand` 拡張 (Phase D-2 で**実装済**)

Phase D-2 で `vercel.json` の `ignoreCommand` を**最小拡張**し、新規 dedicated metadata file `.canary-trigger.json` の変更を canary build trigger として認識する経路を確立。

#### 実装 (D-2 main 配置)

**`vercel.json` ignoreCommand** (1 line):
```json
"ignoreCommand": "git diff --name-only HEAD^ HEAD | grep -q '^\\.canary-trigger\\.json$' && exit 1; [ -z \"$(git diff --name-only HEAD^ HEAD | grep -v '\\.md$')\" ] && exit 0 || exit 1"
```

**判定 logic** (CEO 補正 2026-05-19 厳守、tests/unit/coalter/canaryTriggerIgnoreCommand.test.ts §"shouldBuild pure logic mirror" で永続検証):

| 変更内容 | exit | 挙動 |
|---|---|---|
| `.md` のみ | 0 | **skip** (Vercel build しない、既存挙動維持) |
| `.canary-trigger.json` のみ | 1 | **build** (D-2 で追加) |
| `.md + .canary-trigger.json` | 1 | **build** (canary-trigger 優先、D-2 で追加) |
| code (`.ts/.tsx/etc`) のみ | 1 | **build** (既存挙動維持) |
| `.md + code` | 1 | **build** (既存挙動維持) |
| 空 | 0 | skip (defensive) |

**`.canary-trigger.json`** (repo root):
- canary smoke 専用 metadata file
- 含むもの: `phase` / `smoke_purpose` / `canary_branch` / `expected_supabase_ref` / `forbidden_supabase_ref` / `trigger_at` / `trigger_count`
- **絶対に含めないもの**: secret / token / API key / PII (test で invariant 強制、§"secret-free")

#### Phase D-2 以降 canary smoke の git-attributed trigger 標準手順

```bash
# 1. canary branch を作成 + checkout
git checkout main && git pull
git checkout -b chore/coalter-mirror-c<N>-canary

# 2. .canary-trigger.json の metadata を更新
#    phase / canary_branch / trigger_at / trigger_count をそれぞれ修正
#    あるいは trigger_count を increment するだけでも file diff が発生
$EDITOR .canary-trigger.json

# 3. commit + push
git add .canary-trigger.json
git commit -m "chore(coalter): trigger C-<N> canary build (canary-trigger metadata update)"
git push -u origin chore/coalter-mirror-c<N>-canary

# 4. Vercel GitHub integration が自動 build trigger
#    → source: github / gitSource.ref: chore/coalter-mirror-c<N>-canary 確実
#    → branch-scoped Preview env を build に baked-in

# 5. §3.4 verify-canary-deploy.ts (D-1) で 3 gate 検証 (Gate 2 で git attribution、Gate 3 で Supabase ref)
```

#### D-2 と Option A の関係

| 項目 | Option A (`.ts/.tsx` 最小 trigger commit) | Option B (`.canary-trigger.json` + ignoreCommand、D-2 実装済) |
|---|---|---|
| 実装 | docs / 運用手順 (D-0 §4.3 案) | **D-2 で実装済** (vercel.json + .canary-trigger.json) |
| 利用シーン | D-2 実装前の fallback / 緊急時 | **Phase D-2 以降の標準** (canary smoke すべて) |
| code 変更 | 各 canary で必要 (jsdoc 5 行) | trigger metadata 更新のみ (`trigger_count` increment 等) |
| 履歴汚染 | 各 canary に jsdoc commit | `.canary-trigger.json` の commit 履歴のみ |

→ **Phase D-2 以降は Option B (`.canary-trigger.json` + ignoreCommand) を標準**として使う。Option A は緊急時の fallback。

### Option C: Vercel UI で canary branch を IBS 例外化 — D-3 で再評価

Vercel Dashboard 設定の機能存在 / 安定性は D-2 実装後に未確認。D-3 で env 分離戦略 (Mirror 専用 Preview Supabase project 等) と一緒に CEO 判断。

---

## §6. Symptom → Diagnosis Table (CEO 観測の root cause 即断表)

| 観測 (CEO 報告) | 即断される root cause | 対処 |
|---|---|---|
| /talk/<production-threadId> で counterpart 「ユーザー」default 表示 | canary build が staging Supabase を見ている (production data 不在) | §4 verify → §5 git-attributed redeploy |
| chat 履歴空 | 同上 (`GET /api/talk/threads/<id>/messages` 404 silent fail) | 同上 |
| chat 送信不可 | 同上 (`POST /api/talk/threads/<id>/messages` 401) | 同上 |
| baseline 保存失敗「ベースライン保存に失敗しました」 | staging Supabase DB に CEO profile row なし、profiles.update() 対象なし | 同上 |
| /baseline → /plan に飛ばされる | code 上の自動 redirect なし。`PLAN_ROUTE_LIVE=true` が all-preview に投入されている (Alter 別作業) ため CEO の URL bar 直入力で /plan page 表示可能 | Mirror canary とは無関係。診断は Alter 別作業の env 状態を確認 |
| `window.__coalterMirrorDiagnostic` undefined | flag 未投入 / build 前 / production NODE_ENV guard (Phase A §3.5、C-1 で削除済) / 15min expire / git attribution 欠落 | §3.1 + §4 で env 状態確認 |
| visible Mirror が出ない | flag 未投入 / engine STAY_SILENT / Observe Gate fail / sleep ON / cap 到達 / git attribution 欠落で forced canary 効かず | C-3 forced canary env 必要、§4 で確認 |

---

## §7. Phase D / C-4R で解決すべき設計課題 (CEO 補正 2026-05-19)

### 7.1 git-attributed Preview deploy 経路の確立

- Vercel CLI `vercel --force` を canary smoke 標準手順から **除外**
- `.ts/.tsx` 最小 trigger commit (Option A) を **canary smoke の標準** に格上げ
- Vercel UI redeploy 経由 trigger の git attribution 挙動を Phase D で実機確認
- `vercel.json` の `ignoreCommand` を canary branch 限定で例外化する design 検討 (Option C)

### 7.2 IBS (Ignored Build Step) / `ignoreCommand` の正面取り扱い

- 現状: `.md` 以外の変更なしで IBS skip → empty commit が build trigger にならない
- 解: §5 Option C の branch-allowlist 例外化、もしくは canary branch を `ignoreCommand` 評価対象から外す設定

### 7.3 Alter staging Supabase ↔ CoAlter Mirror canary の env 分離戦略

- 現状: all-preview Supabase が Alter staging を指す (Alter 別作業の正当な投入)
- 課題: Mirror canary でこれを上書きするには branch-scoped env が必須だが、git attribution 欠落で適用されない
- 解: Phase D で **Mirror canary 専用 Preview Supabase project** の分離 design、もしくは Vercel UI で canary-only allowlist branch 設定

### 7.4 Production-equivalent CoAlter smoke の正式手順設計

- 現状: production-equivalent な「login → /talk → 既存 thread → CoAlter button → activate → visible Mirror」は構造的に未検証
- 候補 path:
  - (a) Production env への gradual rollout (allowlist user) で smoke 代替
  - (b) 別 staging Supabase project に CEO 個人 data を migration (Phase D で CEO 判断)
  - (c) Mirror canary 専用 Preview Supabase project + Production data の subset を migration
- Phase D-0 design でいずれかを CEO が選択

### 7.5 「前 Phase 完了 docs §3 系 必読 checklist」の機械的強制

- Phase A → B → C で 3 連続「学び取り込み漏れ」発生
- 解: 新 Phase 起票 PR の template に「前 Phase §3 系 / 本 anti-patterns doc / Phase A 学び checklist 全項目読了」 checkbox を必須化 (Phase D-0 で design)

---

## §8. Smoke Layer 分類 Canon (Phase D 以降、smoke 起票時に必ず明示宣言)

任意 smoke を起票するときは、以下の **3 分類** のうち**どれを実施するか**を必ず明示宣言する:

| Layer | 内容 | 達成手段 | 完了判定 |
|---|---|---|---|
| **Mount smoke** | MirrorHost が DOM mount + useMirrorEngine 起動 | unit test + 構造確認 (既達 B-5a/b) | mock data or `/talk/<任意 uuid>` 直打ちで OK |
| **Mirror visible smoke** | MirrorVisibleSurface 実機表示 + close/sleep/cap/verification 動作 | forced canary mode (C-3) の mock injection で生成、production-equivalent context では**ない** | UI 操作で close/sleep ボタン動作確認 |
| **CoAlter chat smoke (Production-equivalent)** | login → /talk → 既存 thread → CoAlter button → activate → visible Mirror。real user / real data / real chat traffic の中で Mirror が振る舞う | **Phase D 設計後** (現状不能、§7 課題解決後) | real chat 中 visible Mirror が controlled に出る + retreat affordance が real user 操作で機能 |

> ⚠️ Mount smoke の成功を「CoAlter smoke 成功」と誤判定してはいけない。3 layer は**独立**であり、上 layer の達成は下 layer の達成を**含意しない**。

---

## §9. References

### Phase A 学び (本 doc の前提)
- `docs/coalter-aoo-phase-a-completion.md` §3.4 (empty commit IBS skip)
- 同 §3.5 (NODE_ENV gate 採用禁止)
- 同 §3.7 (7-layer defense)
- 同 §5 (Phase A 不変境界)

### Phase B 学び (本 doc の前提)
- `docs/coalter-aoo-phase-b-completion.md` §7 (Phase A→B 学び取り込み漏れ + 重要発見)
- 同 §13 (Phase C で起こりやすい設計事故 5 つ)
- 同 Appendix C (Phase B/C invariant checklist)

### Phase C 学び (本 doc の前提)
- `docs/coalter-aoo-phase-c-integration-design.md` §2 (Phase A→B 学び取り込み漏れの構造的再発防止 meta-process)
- 同 §11 (Phase C 設計事故 7 つの事前回避)
- 同 Appendix B (Phase C smoke runbook template)

### C-4 BLOCKED docs (本 anti-pattern doc の直接根拠)
- `docs/decision-log.md` 2026-05-19 C-4 BLOCKED entry
- `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` §16

---

## §10. 変更履歴

| 日付 | 変更 | 承認 |
|---|---|---|
| 2026-05-19 | 新規 (Phase C C-4 BLOCKED closure の structural 再発防止 canon) | CEO 補正「再発防止の記述を必ず厚く」(2026-05-19) |
