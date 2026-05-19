# Alter Plan W1-Y — RPC Atomicity Mini Design

**作成日**: 2026-05-19
**Status**: 採択（W1-Y 実装の起点）
**関連**:
  - `docs/alter-plan-a2-atomicity-tradeoff.md` (W1-Y で解消する負債)
  - `supabase/migrations/20260519100000_create_external_anchor_bundle.sql`
**実装範囲**: 同一 PR (`feat/alter-plan-w1y-rpc-atomicity`) で着地、**staging only**

---

## 1. 目的

A-2 で best-effort atomicity (`createSourceWithAnchors` の client-side
sequential + compensating delete) を採択した。発生確率は極めて低いが、
**orphan source** が理論上残る可能性があった。

W1-Y では PostgreSQL function `create_external_anchor_bundle()` を新規追加し、
**1 transaction 内で source + anchors の INSERT を行う**ことで orphan source
発生を物理的に消滅させる。

---

## 2. CEO 補正反映（最重要）

**RPC-only ではなく RPC-first + fallback パターン**：

- production DB には W1-Y migration を **適用しない**（staging only、CEO 判断）
- main に RPC-only を merge すると production deploy 時に function missing で API が壊れる
- → **RPC-first + fallback**:
  - function が存在 → RPC 経由で atomic INSERT
  - function 不在 (production) → client-side sequential + compensating delete (A-2 既存実装)
- production migration apply は **W1-Y 後の別 wave**

---

## 3. Fallback トリガー判定（厳密）

### 設計原則（CEO 補正 2026-05-19）

**Fallback は「function が DB に存在しない」class に限定する**。

理由:
- function が存在するが authentic に拒否された error (auth / RLS / CHECK / parse) を
  sequential path に流すと、同じ拒否を別経路で再発させるか、**RPC 実装バグを
  client-side path で隠蔽する**ことになる
- 観測性が壊れ、本来 main 着地後に修正すべき RPC 側バグが production fallback path で
  silent に動き続ける危険がある
- PGRST100 (parse error) は payload 構築バグの signal、fallback で握り潰してはならない

### Fallback する条件（function 不在）

| code | 意味 | fallback すべき |
|------|------|--------------|
| `PGRST202` | "Could not find the function …" (PostgREST schema cache miss) | ✅ Yes |
| `42883` | PostgreSQL `undefined_function` | ✅ Yes (PostgreSQL レベルで function 不在) |
| message ベース安全網 | error.code 欠落時に `"could not find the function"` を含む message | ✅ Yes (十分限定的) |

### Fallback **しない**条件（実 error はそのまま伝播）

| code | 意味 | fallback してはならない理由 |
|------|------|--------------|
| `PGRST100` | PostgREST query string / request parse error | RPC payload 構築バグの可能性。fallback で隠さず伝播。 |
| `PGRST203` | function name ambiguous (overload 衝突) | function は存在する。fallback は誤った経路。 |
| `42501` | insufficient_privilege (auth / RLS 拒否) | sequential path も同じ拒否を受ける。伝播。 |
| `23502` | not_null_violation | DB NOT NULL 違反。fallback も同じ違反。伝播。 |
| `23514` | check_violation | DB CHECK 違反。同上。 |
| `23505` | unique_violation | UNIQUE 違反。同上。 |
| `23503` | foreign_key_violation | FK 違反。同上。 |
| その他 PostgrestError | network / 5xx 等 | 伝播。 |

### Structured fallback log

```typescript
logger({
  kind: 'rpc_fallback',
  reason: 'function_missing',  // 単一値 (CEO 補正後)
  rpcCode: code,               // 'PGRST202' | '42883' | undefined (message-based)
  rpcMessage: message,
  userId,
});
```

→ production で「fallback 発火数 = 0」を観測可能、production migration 完了の判断材料。
→ `reason` は単一値 `function_missing` に narrowing (PGRST100 を fallback から外したため
   `rpc_unavailable` ラベルは不要)。

---

## 4. Function 設計

完全 SQL は `supabase/migrations/20260519100000_create_external_anchor_bundle.sql` を参照。要点：

| 項目 | 内容 |
|------|------|
| name | `create_external_anchor_bundle(p_user_id UUID, p_source JSONB, p_anchors JSONB)` |
| return | `JSONB`: `{ source: <row>, anchors: [<row>, ...] }` |
| security | **`SECURITY INVOKER`**（caller の権限で実行、RLS 通常発火） |
| auth check | 冒頭で `auth.uid() <> p_user_id` を明示拒否、`RAISE EXCEPTION ... ERRCODE = '42501'` |
| permissions | `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` |
| validation | function 内では行わない。DB CHECK / RLS / NOT NULL が発火 |
| transaction | function 全体が 1 transaction、任意の段階で例外 → 自動 ROLLBACK |
| anchors[] | jsonb_array_elements で展開、source_id を共通注入、空配列なら 0 行 INSERT |
| exception_dates | jsonb_array_elements_text → date[] に変換 |
| confirmed_at | function 内で NOW() (memory / sequential 実装と同等) |
| 冪等性 | `CREATE OR REPLACE FUNCTION` で再 apply 安全 |
| Rollback | `DROP FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB);` |

---

## 5. Repository 修正（RPC-first + fallback）

`lib/plan/external-anchor-repository-supabase.ts` の `createSourceWithAnchors`：

```typescript
async createSourceWithAnchors(userId, input) {
  // 1. validation (既存、pure validators)
  const errors = validate(...);
  if (errors.length > 0) return { ok: false, errors };

  // 2. RPC 試行
  const { data, error } = await client.rpc('create_external_anchor_bundle', {
    p_user_id: userId,
    p_source: sourcePayload,
    p_anchors: anchorsPayloads,
  });

  if (!error && data) {
    // RPC 成功
    return mapRpcResult(data);
  }

  // 3. Fallback 判定
  if (error && shouldFallback(error)) {
    logger({ kind: 'rpc_fallback', reason: 'function_missing', ... });
    return await runSequentialFallback(userId, sourcePayload, anchorsPayloads);
  }

  // 4. 実エラー（auth / RLS / CHECK 等）はそのまま伝播
  return mapRpcError(error);
}
```

`runSequentialFallback` は A-2 既存実装（source INSERT → anchors INSERT → compensating delete）をそのまま使う。**production migration 完了まで fallback path を残す**。

---

## 6. orphan logger 型の保持

`SupabaseRepoLogEvent` の `orphan_source` / `compensating_delete_attempted` は **production migration 完了まで keep**（CEO 補正）。理由：
- 現状の production は client-side path で動作
- orphan 発生可能性は production で継続
- 削除すると production 観測性が壊れる

production migration apply 後の別 wave で削除判断。

---

## 7. やらない（W1-Y 範囲外）

- **production migration apply**（別 wave、CEO 判断）
- service_role / DB password / connection string 使用
- `SECURITY DEFINER`
- RLS 迂回
- fallback path の削除
- orphan logger 型の削除
- Home / nav / 横スワイプ / W1-6 / W1-8 / DraftPlan

---

## 8. ファイル構成

```
supabase/migrations/20260519100000_create_external_anchor_bundle.sql   # 新規 migration
docs/alter-plan-w1y-rpc-atomicity-mini-design.md                       # 新規 mini design
docs/alter-plan-a2-atomicity-tradeoff.md                               # 更新: §9 「W1-Y で解消」追記
lib/plan/external-anchor-repository-supabase.ts                        # 拡張: RPC-first + fallback
lib/plan/supabase-error-mapping.ts                                     # 拡張: shouldFallback helper
tests/fixtures/mockSupabaseClient.ts                                   # 拡張: .rpc(name, args) 対応
tests/unit/plan/externalAnchorSupabaseRepository.test.ts               # 拡張: RPC + fallback case
scripts/staging-smoke/a2-rls-api-smoke.ts                              # （オプション）RPC path log assertion
```

---

## 9. CEO Staging Migration Apply 手順

### Step 1. PR #N (本 PR) merge 後

### Step 2. staging Supabase Dashboard で migration apply
1. https://supabase.com/dashboard/project/<staging-ref>/sql/new
2. ファイル内容を貼り付け: `supabase/migrations/20260519100000_create_external_anchor_bundle.sql`
3. "Run" 実行
4. 期待結果: `CREATE FUNCTION` 成功メッセージ + `REVOKE` + `GRANT` 完了

### Step 3. function 存在確認 (SQL Editor)
```sql
SELECT
  proname,
  prosecdef AS is_security_definer,
  prokind
FROM pg_proc
WHERE proname = 'create_external_anchor_bundle';
-- 期待: 1 行、is_security_definer = false、prokind = f
```

### Step 4. A-5 smoke で RPC path 動作確認
1. PR #N の Actions タブ → "Staging RLS API Smoke" を CEO 承認 + 実行
2. 18 行 PASSED を確認
3. （任意）/tmp/dev.log に `rpc_fallback` ログが出ていないことを確認

### Rollback（staging で問題発覚時）
```sql
DROP FUNCTION create_external_anchor_bundle(UUID, JSONB, JSONB);
```

---

## 10. 受容判定（DoD）

- ✅ migration ファイル新規作成
- ✅ Repository `createSourceWithAnchors` が RPC-first + fallback
- ✅ Fallback 判定が「function 不在」class のみ (`PGRST202` / `42883` / message-based)、`PGRST100` / `42501` / `23xxx` / `PGRST203` 等の実 error は伝播 (CEO 補正 2026-05-19)
- ✅ structured fallback log
- ✅ mock SupabaseClient に `.rpc()` 対応
- ✅ unit tests で RPC 成功 / fallback / 実 error 各 path を verify
- ✅ docs/alter-plan-a2-atomicity-tradeoff.md に W1-Y 解消反映
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `npx vitest run tests/unit/plan/` 全 PASS
- ✅ ローカル `npm run build` PASS
- ⏳ staging migration apply (CEO 操作) + RPC path smoke pass

---

**結論**: W1-Y で staging Atomicity が完成、production migration apply (別 wave) 後に fallback path を W1-Z で削除する 2 段着地パターン。
