# CoAlter AOO Phase E — Mirror Channel Productization Plan (E-0)

**ステータス**: Phase E 起票 (docs-only)、Phase D 完了 (`docs/coalter-aoo-phase-d-close.md`、PR #210 merged `e299b243`) を前提
**作成日**: 2026-05-19
**目的**: Phase D で proven された canary deploy 経路 + Mirror Channel infra を活用し、Mirror Channel を Production に向けて**段階的に展開**する計画 (docs-only、Phase E 実装は別 PR で sub-phase 毎に sequential)
**Production ON はしない** (本 PR では計画 only、CEO 承認 + sub-phase 完了後に段階移行)

---

## §0. なぜ Phase E が docs から始まるか (Phase D 学び継承)

Phase A → B → C → D を貫いて、「実装着手の前に docs で全体合意を取る」運用が事故予防に寄与した。特に Phase D-0 では CEO 提示 10 課題 + Claude 自立推論 5 項目を docs で並列議論し、後続 sub-phase の判断 cost を大幅に削減した。Phase E も同じ pattern で起票する。

Phase E の固有 risk: **Phase D 全期間で守ってきた「Production env 触らない」canon を、E-2 で構造的に緩める必要がある**。これは canon 修正であり、CEO 直接承認 + sub-phase ごとの安全 gate 設計が不可欠。本 docs はその安全 gate の設計を中心に置く。

---

## §1. Phase D 引き継ぎ (artifacts re-use map)

Phase D で main に着地した artifacts は **Phase E でそのまま再利用** する。改造は許容するが、改造する PR は canon §4 protocol (canon 自身は D-3-α §4) に従い CEO 直接承認必須。

| Phase D artifact | Phase E 再利用方法 | 改造可否 |
|---|---|---|
| `vercel.json` ignoreCommand (D-2、2 段ゲート) | E-1 canary build trigger でそのまま機能 | 不可 (Phase D close 後不変、変更は新 phase で別 PR) |
| `.canary-trigger.json` (D-2) | E-1 canary trigger marker として再利用、phase/canary_branch/trigger_count を更新 | 可 (metadata 更新は構造変更でない) |
| `scripts/coalter/verify-canary-deploy.ts` + 58 tests (D-1 + D-1 fix) | E-1 visible smoke の pre-flight verification で必須実行 | 不可 (Phase D 確定版を維持) |
| `docs/coalter-supabase-ref-canon.md` + 45 tests (D-3-α) | Phase E でも `aljavfujeqcwnqryjmhl` = Production / `hjcrvndumgiovyfdacwc` = Alter staging を遵守 | 不可 (canon §4 protocol、CEO 直接承認なしに変更不可) |
| `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` (D-1) | Phase E の任意 canary smoke PR で必須使用 (`?template=canary-smoke.md`) | 不可 |
| `docs/coalter-aoo-canary-deploy-anti-patterns.md` | Phase E 起票時必読 (canon 11/12/13) | 可 (新規 anti-pattern 観測時に追記、§1 拡張) |
| `docs/coalter-aoo-phase-d-close.md` (D-5) | Phase E 起票時 §7 hand-off section が origin reference | 不可 (Phase D の永続記録) |

### 1.1 Phase D で生み出された **構造的 safety net** (Phase E でも有効)

- **lib/supabase は service_role を読まない (anon-only contract)**: canon §2.1 永続記述、Phase E でも維持
- **Mirror runtime は I/O 0 / network 0 / storage 0 / timer 0 (No-Effect Contract)**: MirrorHost + useMirrorEngine の docstring 明示、Phase E でも遵守
- **D-1 verification の 3 gates**: Phase E の任意 canary build に対しても適用、PASS なしで smoke 開始しない
- **canon drift detection test (45 tests)**: ref の role を構造的に固定、Phase E で新規 Supabase project を導入する場合も canon §4 protocol で同期必須

---

## §2. Phase E 構成 (5 sub-phases + 依存関係)

### 2.1 sub-phase 一覧

| Sub-phase | scope | docs/code/env | 期間目安 | 前提 |
|---|---|---|---|---|
| **E-0** (本 PR) | productization plan (本 docs) + decision-log | docs only | 1 day | Phase D close |
| **E-1** | visible smoke (canary FORCED_CANARY=true) | env 追加 1 + canary build trigger + smoke | 3-5 days | E-0 merge |
| **E-2** | Production gradual rollout (CEO + invited allowlist) | **Production env 触る** + allowlist 実装 (runtime code) + smoke | 1-3 weeks | E-1 PASS |
| **E-3** | monitoring + kill switch | observability tooling + kill switch L1/L3 + drill | 1 week | E-2 in progress (並列可) |
| **E-4** | Phase E close | docs only | 1 day | E-3 stable |

### 2.2 依存関係 graph

```
E-0 (本 PR)
   ↓ merge
E-1 (canary visible smoke)
   ↓ PASS
E-2-α (CEO のみ Production 有効化、7 日観測)
   ↓ PASS + Sentry clean
E-2-β (invited user 1-N、allowlist)
   ↓ ⇄
E-3 (monitoring + kill switch、E-2 と並列展開)
   ↓ stable for 7+ days
E-4 (Phase E close)
```

### 2.3 各 sub-phase の goal (1 行要約)

- **E-0**: 全 sub-phase の judgment を docs で固定、Phase D canon の Phase E への投影を明示
- **E-1**: visible Mirror UI が canary build で render され、reflection-only canon を遵守することを実機検証
- **E-2**: Mirror が Production user に reach、kill switch が機能、user discomfort 観測なし
- **E-3**: monitoring channels 確立、kill switch L1/L3 が文書化 + drill 済
- **E-4**: Phase E 全期間の outcome を永続記録、Mirror Channel が Production 機能として canon 化

---

## §3. E-1 visible smoke 計画

### 3.1 E-1 目的

Phase D の **D-4 minimum smoke (shadow mount)** で確認できなかった「Mirror visible UI が canary build で render され、Phase B B-5b 設計通りに動く」ことを実機検証する。

### 3.2 E-1 前提 (Phase D artifacts、不変)

- canary deploy 経路 (D-2 ignoreCommand + .canary-trigger.json)
- D-1 verification script (Vercel API field semantics 進化対応済、PR #205)
- Supabase ref canon (D-3-α)
- canary-smoke PR template
- anti-patterns canon

### 3.3 E-1 実施手順 (CEO 手動 env 投入 + Claude 実装)

```
Step 1: canary branch 再作成
  - branch 名: chore/coalter-mirror-e1-canary (Phase D の d3b とは別、phase 識別性)
  - base: origin/main (post-D-5 = e299b243)
  - push 後、Vercel に branch を認知させる

Step 2: CEO がbranch-scoped Preview env を投入 (6 件)
  - 5 件 (Phase D-3-β と同じ):
    NEXT_PUBLIC_SUPABASE_URL = https://aljavfujeqcwnqryjmhl.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY = (Production anon)
    SUPABASE_URL = https://aljavfujeqcwnqryjmhl.supabase.co
    SUPABASE_ANON_KEY = (Production anon)
    NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED = true
  - 追加 1 件 (E-1 新規):
    NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED = true

Step 3: .canary-trigger.json 更新 (trigger_count +1, phase=E-1, canary_branch更新, smoke_purpose更新, trigger_at)

Step 4: commit + push → git-attributed Preview build trigger

Step 5: 修正後 D-1 verify-canary-deploy.ts 実行
  - 3 gates 全 PASS を要求 (Gate 2 で source=git + gitSource.type=github を許容)
  - FAIL なら即停止、原因確定、env / build artifact audit

Step 6: PASS なら CEO が visible smoke 実機実施 (§3.5)

Step 7: smoke 結果に基づき E-1 close docs PR (smoke 観測記録、Phase D pattern 踏襲)
```

### 3.4 FORCED_CANARY_ENABLED の挙動 (取り扱い注意)

`NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED=true` 時、`useMirrorEngine` 内で `forcedCanaryMode` が安全な mock engine input を engineAdapter に inject する (`lib/coalter/mirror/forcedCanaryMode.ts`、C-3 で確立)。

意味:
- engine が常時 visible candidate を出す → `MirrorVisibleSurface` が常に render される
- 実 user 行動 (chat history / observation 等) に依存せず、deterministic に visible 状態を作る
- **これは canary smoke 専用 mode**、Production では絶対に true にしない

E-1 期間中の制約:
- FORCED_CANARY は **canary branch scope のみ** に投入、Production / all-Preview / Development には **絶対投入禁止**
- E-1 完了後の cleanup で他 5 env と共に削除
- E-2 (Production rollout) では FORCED_CANARY は **使わない** (本物 engine の判定結果を使う)

### 3.5 E-1 visible smoke CEO 実機手順 (D-4 runbook 拡張)

D-4 minimum smoke の Step 1-7 をそのまま実行 + 以下を追加 (Step 7a-7e):

| step | 確認内容 | DOM/Console verification |
|---|---|---|
| Step 7a | `<MirrorVisibleSurface />` が render される | `document.querySelector('[data-testid="mirror-visible-surface"]')` → element 返却 |
| Step 7b | visible surface に reflection text が表示 (空文字でない) | element の textContent が non-empty |
| Step 7c | 「閉じる」/「黙ってもらう」button が DOM に存在 | `[data-testid="mirror-visible-close"]` + `[data-testid="mirror-visible-sleep"]` 両方 hit |
| Step 7d | **reflection-only canon 遵守確認** (CEO 視認、Phase B 北極星) | text に Question / Proposal / Suggestion-style 表現がない |
| Step 7e | aria-live="polite" 属性 (a11y) + Mirror text 内容の品質 | screen reader 動作 (optional、CEO 任意) + text の reflection 性 (mock data の場合は限定的) |

### 3.6 E-1 PASS / FAIL 基準

#### PASS conditions

| # | 条件 | verification |
|---|---|---|
| 1 | D-4 minimum smoke の全 PASS conditions が継続成立 | (D-4 runbook §I.1) |
| 2 | `mirror-visible-surface` が DOM に mount | Step 7a |
| 3 | visible text が non-empty | Step 7b |
| 4 | 「閉じる」/「黙ってもらう」 button が DOM 存在 | Step 7c |
| 5 | reflection-only canon 遵守 (Question/Proposal/Suggestion 表現なし) | Step 7d、**CEO 視認による品質判定** |
| 6 | console 重大 error 0 | DevTools Console review |
| 7 | UI 破壊なし、layout 崩壊なし | 画面視認 |

#### FAIL conditions (1 つでも観測で即停止)

- visible surface が表示されない (forced_canary mock が動作不能 = 構造的に重大)
- visible text が Question/Proposal/Suggestion に見える (canon 違反、Phase B 北極星不遵守)
- close / sleep button が機能していない (event handler 不能)
- console 重大 error
- forbidden ref `hjcrvndumgiovyfdacwc` を Network tab で観測 (canary が staging に向いた)

### 3.7 E-1 で **禁止** する操作 (D-4 と同じ + 追加)

- ❌ 「閉じる」 button click (state 変化、visible smoke の連続性破る)
- ❌ 「黙ってもらう」 button click (sleepStore state 変化、最小範囲外)
- ❌ message 送信 / receive (chat data 生成)
- ❌ CoAlter end / accept / refine / plan UI 操作
- ❌ bottom sheet 操作 (D-4 同様、service_role write trigger 回避)
- ❌ intent UI 操作 (同上)
- ❌ Production env 変更 (FORCED_CANARY も Production 投入禁止)

### 3.8 E-1 cleanup (smoke 完了 / FAIL いずれも)

```bash
# canary scope env 6 件削除 (Phase D-5 cleanup と同じ pattern + FORCED_CANARY 1 件追加)
for KEY in NEXT_PUBLIC_COALTER_MIRROR_FORCED_CANARY_ENABLED \
           NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED \
           NEXT_PUBLIC_SUPABASE_URL \
           NEXT_PUBLIC_SUPABASE_ANON_KEY \
           SUPABASE_URL \
           SUPABASE_ANON_KEY; do
  npx vercel env rm "$KEY" preview chore/coalter-mirror-e1-canary --yes
done

# canary branch + worktree 削除
git push origin --delete chore/coalter-mirror-e1-canary
git branch -D chore/coalter-mirror-e1-canary
git worktree remove <path> --force

# Production / all-Preview / Development 不変確認
for SCOPE in production preview development; do
  npx vercel env ls $SCOPE | grep -iE "(MIRROR|FORCED_CANARY)" && echo "🔴 leftover" || echo "✅ clean"
done

# 最終 D-1 reverify on existing E-1 deployment (build artifact 永続記録)
npx tsx scripts/coalter/verify-canary-deploy.ts --deployment-url=<E-1 canonical> ...
```

---

## §4. E-2 gradual rollout 計画

### 4.1 E-2 目的

Mirror Channel を Production deploy で **実 user に reach** させる。ただし全 user ではなく **allowlist (CEO + 招待 user)** に段階的に展開、kill switch を構造的に確保。

### 4.2 E-2 構造的 pivot (Phase D canon の修正)

| 観点 | Phase D 期間 | Phase E-2 以降 |
|---|---|---|
| Production env (Vercel scope) | **0 touch** (D-0 §6.2 Option C-prime canon) | **触る必要あり** (Mirror flag + allowlist) |
| Production data | 使う (canary 経由) | 使う (Production deploy 経由、より直接) |
| user 影響範囲 | CEO 自身 (canary smoke の私的 session のみ) | allowlist 全 user (招待 user に Mirror UI が見える) |
| rollback 経路 | env 削除 + canary cleanup | env 削除 OR runtime kill switch (E-3) |

→ **E-2 着手は CEO canon 修正を伴う**。本 docs §9 (Production env touch policy) で明示 + CEO 直接承認必須。

### 4.3 E-2 sub-stages (3 stage)

#### E-2-α: CEO のみ Production 有効化 (7 日観測)

| 操作 | 対象 |
|---|---|
| CEO が Production env に **`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true`** を投入 | Production scope only |
| **`NEXT_PUBLIC_COALTER_MIRROR_ALLOWLIST_USER_IDS=<CEO user.id>`** を投入 (CEO のみ) | Production scope only |
| Mirror runtime に allowlist check 追加 (runtime code 修正、新規 PR) | `useMirrorEngine` または `MirrorHost` 内で user.id を allowlist と照合 |
| CEO が Production deploy で `/talk/[threadId]` を実 use、Mirror 表示を観測 | CEO のみ実 use、他 user に影響 0 |

観測期間: **最低 7 日連続**、Mirror 関連 Sentry alert 0、user discomfort なし、kill switch drill 実施。

#### E-2-β: invited user 1-3 名追加 (allowlist 拡張、追加観測)

| 操作 | 対象 |
|---|---|
| CEO が invited user の Supabase user.id を allowlist に追加 | `MIRROR_ALLOWLIST_USER_IDS=<CEO>,<user2>,<user3>,...` |
| invited user に **事前 onboarding 説明** (Mirror の性質、opt-out 方法) | コミュニケーション (channel TBD) |
| invited user が実 use、CEO + Claude が観測 (Sentry / Vercel logs / quality 抜き取り) | observation period 7+ days |

観測期間: **最低 7 日連続**、PII leak 0、reflection-only canon 違反 0。

#### E-2-γ: 拡大判断 (CEO 判定)

- 既存 allowlist で **14 日以上 incident なし** → さらなる招待検討 OR Production 全体公開を CEO が判断
- incident 観測 → E-3 kill switch 即発動、原因 audit、E-2-α 状態に戻す or E-1 に巻き戻し

### 4.4 allowlist 実装案 (3 options、E-2 起票時に CEO 選択)

| Option | 実装方法 | rollout 速度 | 柔軟性 | code 変更量 |
|---|---|---|---|---|
| **A: env-based allowlist** | `NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS=uuid1,uuid2,...` 環境変数で配列保持、`useMirrorEngine` 内で `process.env.NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS.split(",").includes(user.id)` | 速い (env 変更で即) | 中 (deploy 必要、Vercel env scope 適用に伝播 lag あり) | 小 (~10 行) |
| B: DB-based allowlist | `profiles.mirror_channel_enabled` column 追加 + migration、`useMirrorEngine` が user fetch 時に確認 | 中 (DB 変更で即、deploy 不要) | 高 (user 単位 toggle) | 中 (migration + API 改修) |
| C: feature-flag service (e.g., LaunchDarkly) | 外部サービス導入、Mirror flag を SaaS で管理 | 高 (即時) | 最高 (rollout %, segment 等) | 大 (SaaS 契約 + integration) |

**Claude 推奨**: **Option A** (env-based)。理由:
- E-2 段階では allowlist は数件 (CEO + 1-3 名)、env 配列で十分
- Production env 変更は CEO 直接承認 + 数分で完了
- Supabase migration 不要 (DB スキーマ変更を Phase E に持ち込まない、Phase D canon 継承)
- 将来 Option B/C に移行する場合の glue 層 (`isMirrorEnabledForUser(userId)`) を runtime に置けば置き換え cost 最小

### 4.5 E-2 で **触る** Production env 一覧 (CEO 直接承認必須)

| env key | scope | value | 必要 phase |
|---|---|---|---|
| `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` | Production | `true` | E-2-α 開始 |
| `NEXT_PUBLIC_MIRROR_ALLOWLIST_USER_IDS` | Production | CEO user.id (initial) → invited user 追加 | E-2-α 開始、E-2-β で拡張 |
| (kill switch L3 採用なら) `MIRROR_RUNTIME_KILL_SWITCH` | Production | (通常 false、emergency 時 true) | E-3 完了後 |

### 4.6 E-2 で **触らない** env (Phase D canon 継承)

- `SUPABASE_SERVICE_ROLE_KEY` (canary scope 含む、Production scope は inheritance のみ、追加変更しない)
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` (Production scope の 125d ago 値を維持)
- all-Preview env (Alter 別作業の正当 scope)
- Development env

### 4.7 E-2 cleanup / rollback (即時 OFF 含む)

#### 通常 cleanup (E-2 完了 → E-4 に進む)

- allowlist env を維持 (Mirror が allowlist user で動き続ける、E-3 monitoring 下で運用)
- Phase E-4 (close) で形式的に "Mirror は Production 機能になった" 宣言

#### 緊急 rollback (kill switch 発動)

```bash
# L1 kill switch: env 削除 (deploy 必要、~5 min 伝播)
npx vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED production --yes

# OR L3 (E-3 で確立後): runtime kill switch
# Supabase Studio で app_settings.mirror_channel_enabled = false (即時)
```

---

## §5. E-3 monitoring + kill switch 設計

### 5.1 monitoring channels

| channel | data | 取得方法 |
|---|---|---|
| **Sentry** | uncaught exception, error rate | 既存 NEXT_PUBLIC_SENTRY_DSN を Mirror module で活用 |
| **Vercel logs** | server-side error, API route response | `vercel logs <deployment-url>` |
| **Supabase logs** | DB query error, anon write rate | Supabase Dashboard → Logs |
| **Mirror-specific event log** (NEW) | visible Mirror render count、close/sleep click rate、template ID 別 emission | E-3 で実装 (新 table `coalter_mirror_events` or 既存 telemetry 拡張) |
| **manual quality review** | Mirror text の reflection-only canon 遵守 | Claude or CEO が sample 抜き取り review |

### 5.2 kill switch 4 tier 設計

| tier | level | 速度 | 実装 | E-3 で確立 |
|---|---|---|---|---|
| **L1** | env removal | ~5 min (deploy 伝播) | `vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED production` | ✅ 必須 |
| **L2** | per-deploy override env | ~1 min (Vercel UI で flag flip + revert deploy) | Vercel UI 経由 | optional |
| **L3** | runtime kill switch (Supabase) | <1 sec (DB flag read on next render) | 新 table `app_settings.mirror_channel_enabled`、`useMirrorEngine` が boot 時 read | ✅ 必須 (Claude 強推奨) |
| **L4** | user-level opt-out (既存) | 即時 (session-local) | `SleepUIToggle` の click | ✅ 既存、Phase D B-5b 着地済 |

### 5.3 kill switch drill (E-3 実施必須)

E-2-α 開始前に canary 環境で drill:

1. canary deploy に Mirror flag true で投入
2. Sentry に偽 alert を投げる (or 偽 critical error を log)
3. CEO が kill switch L1 (env removal) を実行
4. ~5 min 以内に新 deploy で Mirror flag false になることを観測
5. CEO が kill switch L3 (Supabase flag) を実行 (separately tested)
6. <1 sec 以内に既存 deploy の Mirror が OFF になることを観測

drill 結果を decision-log に記録、E-3 完了の必須条件。

### 5.4 monitoring observation period (推奨)

| metric | target | observation |
|---|---|---|
| Mirror visible render error rate | 0% (uncaught exception 0 件 / 7 日) | Sentry alert 監視 |
| close/sleep click rate (user discomfort proxy) | <30% (sleep が頻繁 = うっとうしい signal) | event log 集計 |
| service_role write 回数 | 0 (smoke 中) → activate のみ (E-2 中) | API route 監視 |
| PII leak instance | **0** (絶対) | text review + automated PII scan |
| canon 違反 (Question/Proposal/Suggestion 含有) | 0 | template review + automated regex scan |

---

## §6. E-4 close 計画

Phase D-5 と同 pattern (`docs/coalter-aoo-phase-d-close.md`):

| section | content |
|---|---|
| §1 | Phase E 全体 outcome (E-0 〜 E-3 の merged PR + smoke 観測) |
| §2 | Phase E 由来の永続 artifacts (monitoring tooling / kill switch / allowlist runtime / canon 追記) |
| §3 | deferred 項目 (もしあれば、E-5 以降の課題として handoff) |
| §4 | Phase E cleanup 完了確認 |
| §5 | 最終的な Production state (Mirror Channel が allowlist user に対して active、kill switch L1+L3 完備) |
| §6 | 追加 canon (Phase E で生まれた永続原則) |
| §7 | 次 phase hand-off (Mirror Channel 全 user 公開 OR 他機能展開 OR maintenance mode) |

---

## §7. Safety gates (Phase E 全期間横断、絶対遵守)

### 7.1 PII leak prevention

| gate | 実装 |
|---|---|
| Mirror text 生成時 PII scan (regex) | template stringにメール / 電話 / 名前 (高頻度) を含まない検証、CI で enforce |
| user-id 漏れ防止 | Mirror text に user.id を含めない (template 設計で保証) |
| Sentry event redaction | Mirror module の error report で user data redact (既存 Sentry pre-send hook 活用) |

### 7.2 false positive prevention

- Mirror engine が visible candidate を出すための **7-layer verification** (B-5b で確立、変更しない)
- forced_canary mode は E-1 のみ、E-2 以降では本物 engine 判定のみ
- E-2 期間中、Mirror render が **過剰頻度 (1 session で 5 回以上等)** ならアラート、即停止検討

### 7.3 user discomfort prevention

- `SleepUIToggle` (L4 kill switch、session-local) が常に表示、user が即 OFF にできる
- visible Mirror UI は `aria-live="polite"` (割り込まない通知)
- 「閉じる」/「黙ってもらう」button が分かりやすく配置 (B-5b 設計通り)
- 初回 visible Mirror render 時に **brief "what is this?" tooltip** 表示 (Claude 推奨、§11 §11.6)

### 7.4 console error prevention

- E-1 + E-2 開始前に CEO + Claude が DevTools Console review
- Production rollout 前に Sentry で error rate baseline 確認、Mirror enable 後の差分 monitor
- error 発生 → kill switch 即発動

### 7.5 service_role route 回避 (D-3-β-0 canon 継承)

- E-1 visible smoke: bottom sheet / intent UI / message 送信を **禁止** (D-4 と同じ)
- E-2 Production rollout: 通常 user 使用なので bottom sheet 操作が起きる可能性あり → `/api/coalter/handoff-events` service_role write は **意図された path** として許容、ただし監視
- D-3-β-0 audit §F.2 6 fact を Phase E でも canon として遵守 (本 docs §7.5 で再宣言)

---

## §8. Cleanup / rollback (sub-phase 別 matrix)

| Sub-phase | 通常 cleanup | rollback (FAIL 時) |
|---|---|---|
| E-0 | (docs only、cleanup なし) | docs PR revert |
| E-1 | canary env 6 件削除 + branch + worktree 削除 + Production unchanged 確認 | 同左 (FAIL も cleanup 同じ、原因 audit を別途) |
| E-2-α (CEO only) | Production env そのまま維持 (E-4 まで)、E-3 monitoring 下で運用 | Production env `MIRROR_CHANNEL_ENABLED` 削除 + Sentry 監視継続 |
| E-2-β (invited user) | allowlist env そのまま維持 (E-4 まで) | allowlist env から該当 user 削除 OR allowlist 全クリア |
| E-3 (monitoring/kill switch) | tooling は永続化 (kill switch は active、monitoring は continuous) | kill switch L1 or L3 発動、Sentry 通知 |
| E-4 (close) | (docs only) | N/A |

### 8.1 緊急 rollback の優先順位 (kill switch tier)

1. **L4 (user-level)**: 当該 user が SleepUIToggle で OFF → 即時、user 自身が操作
2. **L3 (runtime)**: CEO が Supabase Studio で `app_settings.mirror_channel_enabled=false` → <1 sec、全 user OFF
3. **L1 (env)**: CEO が `vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED production` → ~5 min、deploy 伝播

事象の重大度に応じて L3 (即時) または L1 (恒久) を選択。

### 8.2 Production DB row cleanup (E-2 期間中の `coalter_pair_states` activate)

E-2 期間中、allowlist user が CoAlterButton click → `coalter_pair_states` row insert (CEO-attributed と同じ pattern)。これは Production data として永続化。

cleanup 判断 (E-4 or 別 timing):
- (a) row 保持: Mirror 経由で pair が確立されたという履歴、削除しない
- (b) row 削除: smoke 専用と扱い、phase 終了で削除 (CEO 判断、SQL で個別削除)

Claude 推奨: **(a) 保持**。E-2 以降の Mirror は Production 機能扱いであり、smoke 用 row ではなく実 user データ。削除は user 体験の連続性を壊す。

---

## §9. Production env touch policy (Phase E の構造的 pivot)

### 9.1 Phase D canon との関係

Phase D 全期間で「Production env touch なし」 canon を守ってきた。E-2 でこの canon を **Mirror Channel 限定で緩める**。

| canon | Phase D 期間 | Phase E-2 以降 |
|---|---|---|
| Production env (Vercel scope) 全 key touch なし | ✅ 厳格 | **Mirror Channel 関連 2 key のみ touch 可** (CEO 直接承認の上) |
| `SUPABASE_SERVICE_ROLE_KEY` の Production scope 変更 | ❌ 永続禁止 | ❌ 永続禁止 (継続) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` の Production scope 変更 | ❌ 永続禁止 | ❌ 永続禁止 (継続) |
| 任意の Production 既存 env の value 変更 | ❌ 永続禁止 | ❌ 永続禁止 (継続) |
| **新規 Mirror 関連 env の Production scope 追加** | ❌ (Phase D は canary scope のみ) | **✅ 許容** (E-2-α で CEO 直接承認、§4.5 表に列挙の 2 key のみ) |

### 9.2 Production env touch を許容する追加 condition

E-2 着手前に以下を **すべて満たす**:

1. E-1 visible smoke が 3 gates 全 PASS、reflection-only canon 遵守確認済
2. kill switch L1 + L3 が **drill 済**
3. allowlist 実装 (Option A env-based) が runtime code に着地、tests PASS
4. CEO 直接承認 (PR description で明示、AskUserQuestion 等)
5. Sentry baseline error rate 記録済

### 9.3 Production env touch の **ロールバック** 容易性

- 投入 env (`NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` + `_ALLOWLIST_USER_IDS`) は **新規 key**、既存 env を上書きしない
- ロールバックは「新規 key を削除」のみ → 既存 Production state 完全保持
- `SUPABASE_*` (125d ago) は永続的に不変

---

## §10. Phase E exit criteria

Phase E が **正式 close** (E-4 進入) するための条件:

| # | 条件 | 判定 |
|---|---|---|
| 1 | E-1 visible smoke 3 gates + 7 PASS conditions すべて達成 | CEO 実機判定 |
| 2 | kill switch L1 + L3 drill 成功 | E-3 で記録 |
| 3 | E-2-α (CEO のみ) 連続 7 日 incident なし | Sentry + 観測 log |
| 4 | E-2-β (invited user 1-3 名) 連続 7 日 incident なし | 同上 |
| 5 | PII leak 0 件 | 監視継続 + sample review |
| 6 | reflection-only canon 違反 0 件 | template review + regex enforcement |
| 7 | Mirror 関連 Sentry uncaught error 0 件 (7 日) | Sentry monitoring |
| 8 | 少なくとも 1 名の invited user から positive/neutral feedback | CEO による定性 interview |
| 9 | Mirror runtime / kill switch / monitoring tooling が Production 機能として永続化 | E-3 完了時点 |
| 10 | E-4 close docs (Phase E 全体総括) が main に着地 | E-4 PR merged |

---

## §11. Claude 自立推論 — 人間を超越するアイデア

CEO 提示 6 項目以外に、本 Phase E でこそ盛り込みたい設計・logic のアイデア。各 idea は §11.x 参照、E-3 / E-4 等で sub-PR として具体化する候補。

### 11.1 reflection-only canon の構造的 enforcement (CI gate)

**問題**: Mirror text が Question/Proposal/Suggestion に drift する事故は人間 review では検出漏れリスクあり。

**アイデア**: `tests/unit/coalter/mirror/reflectionCanonInvariant.test.ts` を新規作成。Mirror engine が emit する template 全 ID の text に対して、以下を CI で構造的 enforce:

- ❌ "〜ませんか" (Question style) → fail
- ❌ "〜してみよう" / "〜したらどう" (Proposal style) → fail
- ❌ "おすすめ" / "提案" / "助言" (Suggestion vocab) → fail
- ✅ "〜のようだ" / "〜という気配" (hedged reflection) → pass
- ✅ 第三人称的観察 ("見えた" / "そう見える") → pass

新 template 追加 PR で test が gate になり、canon 違反 template は merge 不能。**Phase E-1 完了時に着地推奨**。

### 11.2 multi-tier kill switch with structural decoupling

**問題**: env-based kill switch (L1) は伝播に時間がかかる。緊急時は危険。

**アイデア**: §5.2 の L3 (Supabase runtime flag) を E-3 で**必ず実装**、L1 は backup として残す。decoupling:

- `MirrorHost` が render 開始時に Supabase から `app_settings.mirror_channel_enabled` を 1 read (boot cache)
- false なら null return (即 OFF)
- 5 sec interval で軽量 polling (or WebSocket 経由 push、E-3 で決定)

trade-off: 毎 page load で 1 query 追加 (Supabase 負荷)。許容範囲。

### 11.3 dry-run via DIAGNOSTIC_EXPOSE for allowlist user

**問題**: invited user に visible Mirror を見せる前に、その user の data + engine state がどう動くか CEO 側で観測したい。

**アイデア**: 既存 `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE` flag を活用:

- E-2-β 着手前に、当該 user に対して `_DIAGNOSTIC_EXPOSE=true` (彼ら個別の build に branch-scoped env 投入 - 不能 / 全 Preview に 投入 - 過剰) → 現実的ではない
- 代替: CEO が当該 user の生 data で **Stargazer engine output review** を実施 (Supabase Studio で当該 user の cells / observations を読む)、Mirror が出すであろう text を mental simulation

このアイデアは現実的には Stargazer 観測の精度に依存。E-3 で実装可能性を再評価。

### 11.4 A/B-style measured rollout (E-2 内部、optional)

**問題**: allowlist user に対して visible mode で出すべきか、shadow mode で出すべきか、効果測定したい。

**アイデア**: E-2-β に enter する user を 50/50 で visible-mode (`MIRROR_VISIBLE_FOR_USER_IDS=user2`) と shadow-mode (mount するが visible 出さない) に split、4 週間後に engagement / churn / sleep-click rate 比較。

trade-off: implementation cost 中、観測期間長い。E-2 が小規模 (1-3 user) では統計的有意性なし → **E-2 では deferred、E 後継 phase で検討**。

### 11.5 reflection text catalog + offline review pipeline

**問題**: Production で Mirror が emit した text を後から監査したい。

**アイデア**: E-3 で `coalter_mirror_events` table (新規 migration) を作成、Mirror emit 時に anonymized event を log:

| column | 内容 |
|---|---|
| event_id | uuid |
| user_id | (anonymized hash) |
| session_id | uuid |
| template_id | Mirror engine template 識別子 |
| text_emitted | 実際の Mirror text (anonymized: PII redacted) |
| visible_or_shadow | visible だったか shadow だったか |
| close_clicked | true if user clicked 閉じる |
| sleep_clicked | true if user clicked 黙ってもらう |
| emitted_at | timestamp |

CEO が定期的に query して text の品質を review。template_id 別 emission 頻度 / close click rate / sleep click rate を集計。

**追加 safety**: PII redact は emit 前に runtime で実施 (regex で email / phone / 高頻度 name redact)、log に raw text を入れない。

### 11.6 user onboarding tooltip (first-time visible Mirror)

**問題**: invited user が初回 visible Mirror を見たとき「これは何?」と驚く / 不快に思うリスク。

**アイデア**: 初回 visible Mirror render 時に、画面上部に控えめな tooltip:

> "観測の気配"
> あなたの傾向の一片を、そっと映しています。閉じても消えます。

tooltip は 1 度表示で localStorage に flag (`__mirror_intro_seen`)、以後表示しない。user は dismiss 可。

trade-off: localStorage を Mirror が touch する (現状 No-Effect Contract に **抵触**)。これは canon update 提案: "user 体験の onboarding 限定で localStorage 1 key 許容、Mirror engine の本体 logic は変わらず No-Effect"。

**E-3 で実装判断**。

### 11.7 failure-injection drill in canary

**問題**: kill switch L1 / L3 が文字通り動くか、本番直前まで検証されない。

**アイデア**: E-3 内で **failure injection drill** を canary 環境で実施 (E-1 cleanup 後に E-1 用 branch を一時 revive):

1. canary に Mirror flag true で再 deploy
2. CEO が偽の "Mirror critical error" alert を Sentry に投げる (Sentry API 経由)
3. tabletop: alert を見た operator (Claude or CEO) が kill switch L1 を発動、伝播時間を計測
4. tabletop: kill switch L3 を発動、即時 OFF を確認
5. drill 結果 (alert → mitigation 時間、L1/L3 各々の動作確認) を decision-log に記録

**E-2-α 着手前の必須 gate**。drill PASS なしで Production env 触らない。

### 11.8 phased rollout with explicit "soft launch" canon

**問題**: Phase E-2 で「invited user に拡大」のとき、いつ・どう招待するかが曖昧。

**アイデア**: 招待 protocol を canon 化:

| stage | invited user | onboarding |
|---|---|---|
| E-2-α | CEO 本人のみ | (CEO 自身) |
| E-2-β-1 | CEO 近親 1 名 (e.g., kumi、既に talk thread あり) | CEO 直接コミュニケーション、Mirror の性質を口頭説明 |
| E-2-β-2 | CEO 信頼ネットワーク 1-2 名 | onboarding tooltip + 短 FAQ ページ (canon: 観測の気配) |
| E-2-γ | 拡大判断、CEO 判定 | wider onboarding strategy 起票 |

各 stage で 7+ 日 incident なしを gate。incident あれば前 stage に rollback。

### 11.9 reflection quality scoring (semi-automated)

**問題**: Mirror text の品質は human review に依存、scale しない。

**アイデア**: E-3 以降で reflection text を LLM (Anthropic Claude or in-house Stargazer model) に semi-automated rate させる:

- input: emitted Mirror text + user の Stargazer profile sample (anonymized)
- output: reflection-only score (0-100)、PII risk score (0-100)、user resonance score (0-100、深い反映なのか浅いのか)

評価 cron job (e.g., 毎日 00:00) で過去 24 時間の text を batch eval、低 score を CEO alert。

trade-off: LLM cost、PII を LLM に渡すリスク (anonymization 必須)。**E-3 で実装可能性検討、Phase E では deferred**。

### 11.10 Stargazer mission alignment monitor

**問題**: Mirror は Aneurasync 設計思想に沿うべき (中心問い「第二の自己として必要か」/ 最高体験「自分って、そういう人間だったのか」)。

**アイデア**: E-3 で **alignment monitor** を CEO judgment と組み合わせ:

- 月次で Mirror emit 集計、CEO が "alignment review" 実施
- 観点: Mirror text が "気づき" を生んだか / 単なる装飾だったか / うっとうしさを増やしたか
- 結果を `docs/coalter-aoo-phase-e-monthly-review.md` に追記、template tuning にフィードバック

**E-3 で実装、Phase E 全期間継続**。

---

## §12. Open questions for CEO judgment (本 PR review 時に CEO 判定希望)

| # | 質問 | 推奨 default |
|---|---|---|
| Q1 | E-2 で Production env を touch する canon 緩和を承認するか | YES (§9 制限付き) |
| Q2 | allowlist 実装方法 (Option A / B / C、§4.4) | Option A (env-based) |
| Q3 | kill switch L1 + L3 両方実装するか、L1 のみで足りるか | 両方 (§5.2 + §11.2) |
| Q4 | E-1 visible smoke で close/sleep button click を試すか、表示確認のみか | 表示確認のみ (D-4 と同じ最小 smoke 方針) |
| Q5 | reflection-only canon CI test (§11.1) を E-1 と同時に着地させるか | YES (Phase E 全期間の safety net) |
| Q6 | user onboarding tooltip (§11.6) を E-2-β で導入するか | YES (canon update 含む) |
| Q7 | failure injection drill (§11.7) を E-2-α 前に実施するか | YES (kill switch 動作確認の必須 gate) |
| Q8 | reflection text catalog (§11.5) を E-3 で実装するか、Phase E 後継 phase に deferred するか | E-3 で実装 (Production rollout の audit trail) |
| Q9 | A/B rollout (§11.4) を E-2 内部で実施するか | Deferred (Phase E では小規模、統計的有意性なし) |
| Q10 | Phase E 全体期間 (3-4 週間 目安) は許容範囲か、加速 / 減速の希望あるか | 目安通り (CEO 判断で加減速) |

---

## §13. 不可侵境界 (Phase E 全期間)

### 13.1 Phase D canon の継承 (永続)

| 項目 | Phase E でも維持 |
|---|---|
| `lib/supabase` の anon-only contract (canon §2.1) | ✅ 永続 |
| Mirror runtime の No-Effect Contract (`MirrorHost` / `useMirrorEngine`) | ✅ 永続 (§11.6 tooltip は別 component で実装、Mirror runtime には触らない) |
| Supabase ref canon (D-3-α) の 2 ref role | ✅ 永続 (新 ref 追加なら canon §4 protocol) |
| anti-patterns canon (D-2 / D-3-α / D-1 fix 由来) | ✅ 永続 |
| D-1 verification の 3 gates 必須実行 | ✅ 任意 canary smoke で必須 |
| canary smoke PR template の checklist 充足 | ✅ 必須 |

### 13.2 Phase E で **新たに不可侵化** する原則

| 新 canon (E-1 着地時点で永続化) | 内容 |
|---|---|
| Mirror visible smoke は **forced_canary mode を canary でのみ**使う | Production では forced_canary 使用禁止 (本 docs §3.4) |
| Production env への Mirror 関連 env 追加は **CEO 直接承認 + §9.2 5 condition 満たし時のみ** | 任意 Production env 変更を**自動化しない** (Phase D canon 緩和の制限付き継承) |
| kill switch は **L1 + L3** 両層を必ず持つ | L1 のみは不十分、L3 (即時) 必須 |
| reflection-only canon は **CI test で構造的 enforce** | template merge には test gate (§11.1) |
| `coalter_pair_states` 等の Production DB write は **anon + RLS 経由のみ** | service_role write はinventory済 route 以外で禁止 (D-3-β-0 canon 継承) |

### 13.3 Phase E で **絶対に行わない** こと

- ❌ Mirror runtime の No-Effect Contract 違反 (`MirrorHost` / `useMirrorEngine` に I/O / state / timer 等追加)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` の任意 scope 追加投入
- ❌ Supabase schema 変更を Phase E 範囲外の機能と bundle (Mirror event log table 追加なら別 PR、独立)
- ❌ Mirror に Question / Proposal / Suggestion 機能を追加 (本 phase は reflection-only canon 維持 phase)
- ❌ 全 user 公開 (Phase E は allowlist 限定、全体公開は Phase E 後継 phase で別判断)
- ❌ `vercel.json` ignoreCommand の変更 (D-2 確定版を維持)
- ❌ D-1 verification logic の変更 (Phase D canon、変更は別 phase で別 PR)

---

## §14. Phase E 起票 (本 PR) 完了後の次 action

1. CEO が本 docs (§12 Q1-Q10) に answer
2. answer に基づき E-1 visible smoke PR を Claude が起票 (`feat/coalter-e1-visible-smoke-canary`)
3. E-1 期間中、E-3 monitoring tooling の **設計検討** を並列 (実装は E-2 開始後)
4. E-1 PASS → E-2-α (CEO only Production env 投入) を CEO 直接承認
5. E-2-α 観測 7 日 → E-2-β (invited user)
6. monitoring period 完了 → E-4 close

**Phase E 全期間の Claude 行動原則**:
- 各 sub-phase 開始前に CEO 直接承認を必ず仰ぐ (env 投入 / Production touch 含む)
- read-only 観測 + 計画立案 + smoke 補助 を Claude 主導、env 投入は CEO 手動
- 各 sub-phase 完了報告を Phase D pattern で作成 (decision-log + close docs)
- canon 違反 / drift 兆候を観測時、即停止して CEO に上申

---

**End of Phase E-0 plan.** 

本 docs は Phase E の **永続 reference**。Phase E sub-phase 起票 PR は本 docs §X.X を参照し、設計逸脱がないか自己 audit すること。
