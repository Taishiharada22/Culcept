# Staging Environment Safety Runbook（A1-5-ENV-1）

> **目的**: production（`aljav`）汚染を防ぎ、A1-5-8-5 Stargazer Surface Direct E2E Smoke を**将来1回だけ安全に**実行できる環境状態を確立する。
> **本 runbook は CEO 手動操作用**。AI は CLI re-link / DB write / smoke 実行を**しない**（CEO 明示許可が必要）。
> 最終更新: 2026-06-06（A1-5-ENV-1・doc-only・read-only audit）

---

## 0. canonical mapping（混同防止）

| 環境 | project ref | 役割 |
|---|---|---|
| **staging** | `hjcrvndumgiovyfdacwc`（hjcr） | smoke / 検証はここのみ |
| **production** | `aljavfujeqcwnqryjmhl`（aljav） | **絶対に触らない（denylist）** |

出典: `lib/plan/shift/devFixtureHost.ts`（`STAGING_PROJECT_REF` / `PRODUCTION_PROJECT_REF`）。

---

## 1. 現状 audit（2026-06-06・read-only・秘密値は presence のみ）

### ⚠⚠ 危険所見: Supabase CLI が **production（aljav）に link**
- `supabase/.temp/project-ref` = **`aljavfujeqcwnqryjmhl`（production）**
- → この環境の**既定 DB パスは production**。不用意な `supabase db push` / `db reset` / `migration repair` は **production を汚染し得る**。

### smoke 必要 env key: **全て MISSING**
| env key | 状態 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | MISSING | app runtime URL（=hjcr 必須） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | MISSING | anon public key（**service_role 禁止**） |
| `STAGING_SUPABASE_PROJECT_REF` | MISSING | production guard 照合（=hjcr） |
| `STAGING_USER_A_EMAIL` | MISSING | sign-in |
| `STAGING_USER_A_PASSWORD` | MISSING | sign-in |
| `REALITY_CAPTURE_SURFACE` | MISSING | gate（=`true` 必須） |
| `PLAN_CANARY_USER_IDS` | MISSING | gate canary allowlist（USER_A の auth UUID） |
| `REALITY_CAPTURE_KILL` | MISSING（=OK・false 既定） | kill switch（false/unset 必須） |
| `NODE_ENV` | UNSET（=OK・≠production） | gate（≠production 必須） |

> **重要な区別**: A1-5-8-5 smoke は **app runtime path**（`NEXT_PUBLIC_SUPABASE_URL` + anon key + `signInWithPassword`）で動き、**Supabase CLI を使わない**。
> ゆえに「CLI が production link」と「smoke の env creds 不在」は**別の懸念**。両方を解消する。

---

## 2. CEO が手動で設定すべき内容（env・`.env.local`）

`.env.local`（git 管理外）に以下を設定（**値は CEO のみが扱う・docs/AI には渡さない**）:

```
# ── staging app runtime（hjcr のみ）──
NEXT_PUBLIC_SUPABASE_URL=https://hjcrvndumgiovyfdacwc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging hjcr の anon public key>   # service_role は絶対に使わない
STAGING_SUPABASE_PROJECT_REF=hjcrvndumgiovyfdacwc

# ── staging test user（USER_A）──
STAGING_USER_A_EMAIL=<staging テストユーザーの email>
STAGING_USER_A_PASSWORD=<staging テストユーザーの password>

# ── reality surface gate（smoke 用）──
REALITY_CAPTURE_SURFACE=true
PLAN_CANARY_USER_IDS=<STAGING_USER_A の auth UUID>   # email ではなく auth.users.id（UUID）
# REALITY_CAPTURE_KILL は設定しない（false 既定のまま）
# NODE_ENV は production にしない
```

確認ポイント:
- `NEXT_PUBLIC_SUPABASE_URL` の host が `hjcrvndumgiovyfdacwc.supabase.co`（aljav が一切出ないこと）。
- anon key に文字列 `service_role` が**含まれない**こと（含まれると harness が fatal で停止）。
- `PLAN_CANARY_USER_IDS` は **USER_A の UUID**（sign-in 後の `auth.getUser().id` と一致する値）。

---

## 3. Supabase CLI を staging（hjcr）へ向ける安全手順（CEO 手動）

> **AI は実行しない**。CEO が明示的に実行する。`db push` / `db reset` / `migration repair` は本手順に**含めない**。

```bash
# (1) 現状確認（read-only）
cat supabase/.temp/project-ref          # 期待: 今は aljav（production）

# (2) staging へ re-link（CEO 実行・access token + DB password を要求される）
supabase link --project-ref hjcrvndumgiovyfdacwc

# (3) re-link 結果の検証（read-only・最重要）
cat supabase/.temp/project-ref          # 期待: hjcrvndumgiovyfdacwc（hjcr）
#   → aljav のままなら STOP（再 link 失敗・以降の操作禁止）

# (4) read-only 確認のみ（write しない）
supabase migration list                 # local vs remote migration の照合（read-only）
```

**re-link 後も**: smoke 自体は CLI を使わない（app runtime path）。CLI re-link は「将来の migration 等で誤って production に push しない」ための安全化。

---

## 4. A1-5-8-5 smoke 再開の GO 条件（**全て満たすこと**）

1. `supabase/.temp/project-ref` === `hjcrvndumgiovyfdacwc`（hjcr）。
2. `NEXT_PUBLIC_SUPABASE_URL` の host ref === hjcr（aljav が一切出ない）。
3. `NEXT_PUBLIC_SUPABASE_ANON_KEY` SET ∧ `service_role` 非含有。
4. `STAGING_SUPABASE_PROJECT_REF` === hjcr。
5. `STAGING_USER_A_EMAIL` / `STAGING_USER_A_PASSWORD` SET。
6. `REALITY_CAPTURE_SURFACE` === `true` ∧ `REALITY_CAPTURE_KILL` unset/false。
7. `PLAN_CANARY_USER_IDS` に USER_A の UUID を含む。
8. `NODE_ENV` ≠ production。
9. sign-in 後の `auth.getUser().id` === requested user id（USER_A・self-pin）。
10. cleanup 戦略成立（seed delete → evidence FK cascade → reality rows=0 を検証可能）。
11. file capture / redacted report を最初から設計（raw/source_ref/UUID/prompt/response 本文/apiKey 非出力）。
12. **CEO の smoke 実行 GO**（A1-5-8-5 再開は別 GO）。

→ 上記が全て満たされた状態で、§8.53（connection-design）の harness を**原則1回**実行。

---

## 5. production 事故防止 STOP 条件（**1つでも該当したら即停止**）

- `supabase/.temp/project-ref` が `aljavfujeqcwnqryjmhl`（aljav）または hjcr 以外。
- `NEXT_PUBLIC_SUPABASE_URL` の host ref が aljav、または hjcr 以外、または解決不能。
- anon key に `service_role` が含まれる / service_role key を使おうとする。
- `STAGING_SUPABASE_PROJECT_REF` が hjcr 以外。
- sign-in user id ≠ requested user id。
- RPC call が 2 回以上に増える / seed・evidence 以外に write しようとする。
- cleanup 不能 / cleanup 失敗 / reality rows が 0 に戻らない。
- `NODE_ENV` === production。
- 秘密値（anon key / password / service_role token）/ raw / source_ref / UUID が report・log に出る。

### 絶対禁止コマンド（本 runbook の範囲では一切実行しない）
- `supabase db push`
- `supabase db reset`
- `supabase migration repair`
- production（aljav）への任意の write
- service_role を使う任意の操作

---

## 6. 未解消事項

- A1-5-8-5 smoke は **未再開**（本 runbook は env/CLI 安全化の手順提示のみ）。
- env creds の provision（§2）と CLI re-link（§3）は **CEO 手動**。完了後に A1-5-8-5 再開 GO で smoke を1回実行。
- surface chain のコードは**完成・piecewise 検証済**（A1-5-7-5 real read + A1-5-8-0/1/2/3・A1-5-7-6 fake）。gap は単一 real-data E2E pass のみで、原因は **env（本 runbook で解消）**。
