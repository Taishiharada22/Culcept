# CoAlter — Supabase Project Ref Canon (永続 source-of-truth)

**ステータス**: 永続 canon (Phase D-3-α 起点)
**作成日**: 2026-05-19
**根拠**: Phase D-3 project-ref authority audit (`docs/decision-log.md` 2026-05-19 D-3 entry)
**目的**: CoAlter / Mirror canary 関連で出現する Supabase project ref の役割を**単一 source-of-truth**として固定し、role の drift を構造的に防止する。

---

## §0. なぜ本 canon が必要か (Phase D-3-α origin)

### 0.1 経緯

- Phase C C-4 BLOCKED で **`hjcrvndumgiovyfdacwc.supabase.co` (Alter staging)** が Mirror canary build に baked-in される事故が発生 (`docs/decision-log.md` C-4 entry §4)。
- 原因は `npx vercel --force` の git attribution 欠落 (Phase D-1/D-2 で構造的に解消済)。
- Phase D-3 env 分離戦略 plan 起草時に「`aljavfujeqcwnqryjmhl` は Production か canary 専用か」「`hjcrvndumgiovyfdacwc` は Alter staging か Production か」**role 表現の drift** が観測された。
- CEO 補正 (2026-05-19 D-3 audit): D-3-β env 投入の前に **ref の role canonicalization** を実施する。

### 0.2 本 canon の射程

- 本 canon は **Supabase project ref の role 表現の単一 source-of-truth** である。
- 本 canon を変更する PR は **CEO 直接承認必須**。
- D-1 verification script / D-2 `.canary-trigger.json` / canary-smoke PR template / anti-patterns doc / 関連 tests はすべて本 canon と一致しなければならない (`tests/unit/coalter/supabaseRefCanon.test.ts` で構造的に enforce)。

### 0.3 本 canon が **しない** こと

- ref 文字列 (project ref) を application runtime code に inject すること: **しない**。lib/supabase は env から読む。本 canon は **docs + test の整合判定 source** にとどまる。
- Supabase project の生成 / 削除: **しない**。本 canon は既存 project の role を記述するのみ。
- env の投入 / 変更: **しない**。D-3-β で別途、CEO 承認後に branch-scoped Preview にのみ実施。

---

## §1. Canonical refs (machine-readable JSON)

下記 fenced code block は machine-readable canon。`tests/unit/coalter/supabaseRefCanon.test.ts` がこの JSON block を parse して整合検証する。

```json
{
  "version": 1,
  "updated_at": "2026-05-19",
  "refs": {
    "aljavfujeqcwnqryjmhl": {
      "role": "production",
      "display_name": "Aneurasync Production Supabase",
      "host": "aljavfujeqcwnqryjmhl.supabase.co",
      "origin": "Production deploy 起源 (125 日以上前から稼働)",
      "mirror_canary_role": "expected",
      "vercel_env_scope_normal": "Production env (touch 禁止)",
      "mirror_canary_data_use_note": "production-equivalent smoke では本 ref の Production data を使うが、Production env (Vercel env scope) には書き込まない / 触らない"
    },
    "hjcrvndumgiovyfdacwc": {
      "role": "alter_staging",
      "display_name": "Alter staging Supabase",
      "host": "hjcrvndumgiovyfdacwc.supabase.co",
      "origin": "Alter Plan A-2 RLS smoke 起源 (Alter 別作業 work-stream)",
      "mirror_canary_role": "forbidden",
      "vercel_env_scope_normal": "Preview > All branches (Alter 別作業の正当 scope、touch 禁止)",
      "mirror_canary_data_use_note": "Mirror canary build に baked-in されれば C-4 BLOCKED と同型事故。D-1 verify-canary-deploy script が即停止 gate する"
    }
  },
  "mirror_canary": {
    "expected_ref": "aljavfujeqcwnqryjmhl",
    "forbidden_refs": ["hjcrvndumgiovyfdacwc"]
  }
}
```

---

## §2. Detailed role description (human-readable)

### 2.1 `aljavfujeqcwnqryjmhl` = Aneurasync Production Supabase

| 観点 | 内容 |
|---|---|
| role | **production** |
| host | `aljavfujeqcwnqryjmhl.supabase.co` |
| 起源 | 125 日以上前から稼働、Aneurasync 本番 deploy が向く project |
| 確認 source (本 canon 起草時に audit 済) | `next.config.js:19` (image hostname allowlist) / `supabase/.temp/project-ref` (CLI link target) / `scripts/run-migration-p4.mjs:51` (migration target) / `scripts/pe-e2e-test.mjs:82` / `scripts/pe-p18-baseline.mjs:178` (production smoke scripts) / `docs/decision-log.md` C-4 entry / `docs/coalter-aoo-canary-deploy-anti-patterns.md` §1 / `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` §5.4 |
| **Vercel env scope (Production deploy)** | Production scope (125 日前から設定済、touch 禁止) |
| **Mirror canary における role** | **expected** — canary build はこの ref が baked-in されることを期待 (= production-equivalent smoke の前提) |
| **Mirror canary が Production data を使う**ことの意味 | (i) read: CEO 個人 + 本番 user data に anon key 経由でアクセス。(ii) write: anon key + RLS により CEO 自身の row のみに限定される。**`SUPABASE_SERVICE_ROLE_KEY` を canary scope に投入しない**限り破壊的 write は構造的に不可能。 |

### 2.2 `hjcrvndumgiovyfdacwc` = Alter staging Supabase (Alter 別作業)

| 観点 | 内容 |
|---|---|
| role | **alter_staging** |
| host | `hjcrvndumgiovyfdacwc.supabase.co` |
| 起源 | Alter Plan A-2 RLS smoke 用 (Alter 別作業 work-stream) |
| 確認 source (本 canon 起草時に audit 済) | `staging.env.example:27` (`STAGING_SUPABASE_PROJECT_REF` 例値) / `docs/alter-plan-a2-rls-smoke.md:209` (staging ref 直接記載) / `docs/decision-log.md` C-4 entry §4 (Alter staging Supabase 明記) |
| **Vercel env scope (Alter 用途)** | Preview > All branches (Alter 別作業の正当 scope、Alter 担当が運用、touch 禁止) |
| **Mirror canary における role** | **forbidden** — canary build にこの ref が baked-in されたら C-4 BLOCKED と同型事故。D-1 verify-canary-deploy script の Gate 3 で即停止 |
| **Mirror canary が触らない**ことの意味 | (i) data: 本 ref の data には canary は一切アクセスしない。(ii) env: 本 ref を canary scope に投入しない / all-Preview scope の値を削除も変更もしない。Alter 別作業に影響 0。 |

### 2.3 Production env vs Production data の明示区別 (CEO 補正、2026-05-19)

D-3-β で Option C-prime (Mirror canary が `aljavfujeqcwnqryjmhl` を向く) を採用する場合、以下の **2 つを別概念として扱う**:

| 概念 | 状態 | 説明 |
|---|---|---|
| **Production env (Vercel env scope)** | **touch 0** | Vercel project の Production scope env (`NEXT_PUBLIC_SUPABASE_URL` 等) は **変更しない**。Production deploy の挙動は不変。 |
| **Production Supabase data** | **使う** | canary branch scope に `NEXT_PUBLIC_SUPABASE_URL=https://aljavfujeqcwnqryjmhl.supabase.co` 等を投入することで、canary build は **`aljavfujeqcwnqryjmhl` の data を読み書きする**。これが production-equivalent smoke の意味。 |

**曖昧にしてはいけない事実**: Production env を変更しない (env scope レベルで Production を touch しない) ことと、Production Supabase data を使う (canary が本番 data に anon key + RLS 経由で touch する) ことは **別の話**。production-equivalent smoke では CEO 本人の Production Supabase data を使う。これが「production-equivalent」の定義である。

---

## §3. Mirror canary における expected / forbidden 規約

### 3.1 D-1 verification script (`scripts/coalter/verify-canary-deploy.ts`)

| CLI 引数 | 値 (Mirror canary smoke 時) |
|---|---|
| `--expected-supabase` | `aljavfujeqcwnqryjmhl` |
| `--forbidden-supabase` | `hjcrvndumgiovyfdacwc` |

### 3.2 D-2 `.canary-trigger.json`

| field | 値 |
|---|---|
| `expected_supabase_ref` | `aljavfujeqcwnqryjmhl` |
| `forbidden_supabase_ref` | `hjcrvndumgiovyfdacwc` |

### 3.3 canary-smoke PR template (`.github/PULL_REQUEST_TEMPLATE/canary-smoke.md`)

「Expected / Forbidden env 値」section に上記 expected/forbidden を **本 canon の表記と同一文字列**で記載。

### 3.4 anti-patterns doc (`docs/coalter-aoo-canary-deploy-anti-patterns.md`)

§4 の `verify_canary_supabase` bash snippet 内に **本 canon の expected/forbidden を同一文字列**で記載。

---

## §4. 変更 protocol (本 canon の書き換え)

### 4.1 本 canon を書き換えうる shifts

| shift | 例 |
|---|---|
| (a) 新規 Supabase project を追加 | D-3-β で Option A (NEW Mirror canary 専用 project) を CEO が採用する場合、新規 ref を `refs` に追加 |
| (b) ref の役割を変更 | (Production を移管する等の極端な shift。通常発生しない) |
| (c) mirror_canary の expected / forbidden を変更 | D-3-β で Option A を採用する場合、`mirror_canary.expected_ref` を新規 ref に変更 |
| (d) forbidden_refs に追加 | (b)(c) と組み合わせで、Production も forbidden 化する等の shift |

### 4.2 本 canon を書き換える PR の必須要件

1. **CEO 直接承認**: 本 canon は Production data / Mirror canary 安全の核心。CEO が PR description で明示承認するまで merge しない。
2. **同 PR で同期更新**: 以下の file を同 PR で同期 (drift 防止):
   - `.canary-trigger.json` (`expected_supabase_ref` / `forbidden_supabase_ref`)
   - `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` (Expected/Forbidden section)
   - `docs/coalter-aoo-canary-deploy-anti-patterns.md` (§4 verify snippet)
   - `tests/unit/coalter/supabaseRefCanon.test.ts` (hardcoded role assertions)
   - `tests/unit/coalter/canaryTriggerIgnoreCommand.test.ts` (expected ref assertion)
   - `tests/unit/coalter/verifyCanaryDeploy.test.ts` (fixture refs)
   - 必要に応じて `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` §5.4 / §5.5
3. **構造的 test**: 同 PR で `tests/unit/coalter/supabaseRefCanon.test.ts` を更新し、新規 role / 新規 ref を assertion 追加。
4. **既存 ref の独立性証拠**: 新規 ref を追加する場合、既存 ref と用途 / Vercel env scope / data 内容が独立であることを PR description に明記。
5. **runtime app code 0 diff**: 本 canon 変更 PR は **runtime app code を触らない**。env / Supabase migration / Production env 変更 / all-Preview env 変更 / Development env 変更も伴わない。env 投入は別 PR (D-3-β 系)。

### 4.3 本 canon の **編集禁止** 操作

- `aljavfujeqcwnqryjmhl` の role を `production` 以外に変更すること (Production deploy が向く本番 ref を別物として扱うことは、構造的に常に誤り)。
- `hjcrvndumgiovyfdacwc` の `mirror_canary_role` を `expected` に変更すること (Alter staging を Mirror canary expected として扱うのは C-4 BLOCKED と同型事故)。
- `tests/unit/coalter/supabaseRefCanon.test.ts` の hardcoded role assertion を緩める (`expect(...).toBe("production")` 等) こと (test が canon を **二重 lock** している意味が失われる)。

これらは `tests/unit/coalter/supabaseRefCanon.test.ts` で構造的に detect され、PR CI で fail する。

---

## §5. 本 canon が指し示す上位 docs (canonical cross-reference)

| 参照先 | 役割 |
|---|---|
| `docs/coalter-aoo-canary-deploy-anti-patterns.md` | canary smoke 全 phase の必読 canon。本 canon は §4 verify snippet の正本 ref source として参照される |
| `docs/coalter-aoo-phase-d0-canary-deploy-route-design.md` | Phase D 全 sub-phase の integration design。§5.4 / §5.5 / §6 で expected/forbidden を扱う |
| `docs/decision-log.md` 2026-05-19 entry (C-4 BLOCKED + D-3 audit) | C-4 root cause + D-3-α canon establishment の意思決定記録 |
| `scripts/coalter/verify-canary-deploy.ts` | D-1 verification script。expected/forbidden は CLI 引数、本 canon と一致した値を渡す |
| `.canary-trigger.json` | D-2 canary trigger file。expected/forbidden を本 canon と同一値で hardcode |
| `.github/PULL_REQUEST_TEMPLATE/canary-smoke.md` | canary smoke PR の必須 checklist。expected/forbidden を本 canon と同一値で記載 |

---

## §6. 本 canon の Reference: Production env vs Production data 区別の正例 / 反例

D-3-β option 選定文章で参照する用の正例 / 反例。

### 6.1 正例 (D-3-β で Option C-prime を採る場合の正しい言明)

- ✅ 「**Production env (Vercel env scope) は touch 0**」(Production scope の env 変更はしない)
- ✅ 「**Production Supabase data は使う**」(canary が `aljavfujeqcwnqryjmhl` を向くので、本番 data を read / RLS-bounded write する)
- ✅ 「これは production-equivalent smoke の定義そのものであり、Production env を変更することとは別概念」

### 6.2 反例 (本 canon が永続的に禁止する曖昧表現)

- ❌ 「Production touch 0」(env scope と data の両方を含意してしまう曖昧表現)
- ❌ 「Production に一切触らない」(canary が Production data を読むことすら否定する誤読を生む)
- ❌ 「Production-equivalent だが Production data には触らない」(構造的に成立しない。Production data に触らないなら production-equivalent ではない)

---

## §7. 関連 D-3 series

- **D-3-α** (本 PR): canon 確立 (docs + tests のみ、env touch 0)
- **D-3-β** (CEO 判断後、別 PR): env 投入 (Option A or C-prime、branch-scoped Preview のみ)
- **D-4** (D-3-β 後): production-equivalent CoAlter smoke 実施
- **D-5** (D-4 後): Phase D 完了 close + canon 永続化確認

---

**End of canon.** 変更時は §4 protocol 厳守。
