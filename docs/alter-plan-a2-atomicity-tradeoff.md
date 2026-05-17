# Alter Plan A-2: Atomicity Trade-off (best-effort)

**作成日**: 2026-05-17
**Status**: 採択（A-2 期間中）
**関連**: `docs/alter-plan-foundation-design.md` §2.1, §11.2
**実装**: `lib/plan/external-anchor-repository-supabase.ts`

---

## 1. 何を決めたか

`createSourceWithAnchors(userId, { source, anchors })` の Supabase 実装を、**best-effort atomicity** で運用する。

- 厳密な atomicity（PostgreSQL TRANSACTION 内での source + anchors 同時 commit）は採用しない
- 代わりに **client-side sequential + compensating delete** で運用する
- 観測可能性（observability）と将来の完全 atomic 化への道筋を明文化する

これは A-2 期間中の暫定方針であり、将来 W1-Y で Postgres RPC（`create_external_anchor_bundle()`）による完全 atomic 実装に置き換える。

---

## 2. なぜ完全 atomic にしないのか

### 制約

A-2 の制約として CEO から以下が指示されている：

- **migration 追加禁止**
- production / .env.local / service_role 不接触
- Home / W1-6 / W1-8 不変更

完全 atomic を実現する経路：

| 方法 | 制約適合性 | 採否 |
|------|-----------|------|
| A. Postgres RPC `create_external_anchor_bundle()` を追加 | ❌ migration 追加 | **A-2 では不可** |
| B. PostgreSQL Edge Function でラップ | △ supabase/functions/ 配下、migration とほぼ同等の運用負荷 | A-2 では不可 |
| C. supabase-js だけで TRANSACTION 制御 | ❌ supabase-js は cross-table transaction を提供しない | **物理的に不可能** |
| D. client-side sequential + compensating delete | ✅ migration 不要 | **採用** |

A-2 では D が唯一の選択肢。

### 参考

- supabase-js が cross-table transaction を提供しない件: [supabase/supabase-js #526](https://github.com/orgs/supabase/discussions/526)
- 完全 atomicity の正解は Postgres function: [Supabase docs — Database Functions](https://supabase.com/docs/guides/database/functions)

---

## 3. Best-Effort Atomicity の定義

「ほぼ atomic」とは以下を意味する：

1. **入力 validation** は pure 関数で DB call 前に実行（memory 実装と同一）。1 件でも invalid なら DB に一切書かない（=これは厳密 atomic）
2. **source INSERT 成功 → anchors INSERT 失敗時**、source を compensating DELETE する。失敗が anchors batch 中で発生したことを呼び出し側に通知する
3. **compensating DELETE 自体が失敗した場合**、orphan source（孤立した source 行）が DB に残る。この事象は構造化 log で発火する（`logger({ kind: 'orphan_source', ... })`）

### Orphan が発生する具体条件

以下の **すべて** が同時に起きた場合のみ orphan source が残る：

- source INSERT 成功
- anchors INSERT 失敗（DB CHECK 制約違反、network 切断、auth 期限切れ等）
- 同 client / 同 RLS context での compensating DELETE が失敗（network 切断の再発、RLS の race 等）

通常の運用で起きる頻度は **極めて低い**。発生時は audit log で検出可能。

### Orphan source の害

- DB 容量微増（source 1 行 = 数百バイト）
- listSources で「中身（anchors）が無い source」が見える
- UI 側で「空の source」が表示される可能性（W1-5 / W1-8 で対処）

これらは **データの破損ではない**。listAnchors との JOIN で検出・除去できる。

---

## 4. Compensating Delete のフロー

```
INSERT source       → 成功
                          ↓
INSERT anchors[]    → 失敗（例: 23514 check_violation）
                          ↓
log: compensating_delete_attempted
                          ↓
DELETE source WHERE id=? AND user_id=?
                          ↓
                  ┌──────┴──────┐
                  ↓             ↓
              成功             失敗
                  ↓             ↓
          ok=false        ok=false
          errors=[anchor_invalid]    + log: orphan_source
                  ↓
          source は消える           source は残る（孤立）
```

呼び出し側（API route）は `ok: false, errors: [...]` を見るだけ。orphan の有無は気にしない。観測は logger で行う。

---

## 5. Reconcile（孤立 source の回収）方針

A-2 ではまだ実装しない（観測のみ）。将来の運用候補：

### 5.1 Detection（検出）

```sql
-- 孤立 source（参照する anchor が 0 件）
SELECT s.id, s.user_id, s.captured_at, s.source_type
FROM external_anchor_sources s
LEFT JOIN external_anchors a ON a.source_id = s.id
WHERE a.id IS NULL
  AND s.captured_at < NOW() - INTERVAL '24 hours';
```

`INTERVAL '24 hours'` は、ユーザーが「source 作成 → anchors 作成までの猶予」を持つ運用も考えうるため、新規 source を即削除しないよう保護。

### 5.2 Cleanup（自動回収）

将来の cron / Edge Function 候補：

```sql
DELETE FROM external_anchor_sources
WHERE id IN (
  SELECT s.id
  FROM external_anchor_sources s
  LEFT JOIN external_anchors a ON a.source_id = s.id
  WHERE a.id IS NULL
    AND s.captured_at < NOW() - INTERVAL '7 days'
);
```

A-2 では cron 追加禁止のため、実装しない。

### 5.3 Logging-based Alerting

`logger({ kind: 'orphan_source', ... })` を Sentry / Datadog に流すことで人間が即時検知。W1-Y で観測パスを整備する。

---

## 6. 将来の完全 Atomic 化（W1-Y 候補）

migration 追加が許可される時点で、以下の Postgres function を追加する：

```sql
-- supabase/migrations/<future>_create_external_anchor_bundle.sql

CREATE OR REPLACE FUNCTION create_external_anchor_bundle(
  p_user_id UUID,
  p_source JSONB,
  p_anchors JSONB
)
RETURNS TABLE(source_row external_anchor_sources, anchor_rows external_anchors[])
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS を invoker (auth.uid()) の context で評価
AS $$
DECLARE
  v_source_id UUID;
  v_source external_anchor_sources;
BEGIN
  -- auth.uid() = p_user_id でないと拒否
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- INSERT source（RLS が auth.uid() = user_id を強制）
  INSERT INTO external_anchor_sources (...)
  VALUES (...)
  RETURNING * INTO v_source;

  v_source_id := v_source.id;

  -- INSERT anchors（同 TRANSACTION 内）
  INSERT INTO external_anchors (...)
  SELECT ... FROM jsonb_to_recordset(p_anchors) AS (...)
  RETURNING ...;

  -- 例外発生時は PostgreSQL が自動的に ROLLBACK
  RETURN ...;
END;
$$;
```

Client 側:

```typescript
const { data, error } = await client.rpc("create_external_anchor_bundle", {
  p_user_id: userId,
  p_source: source,
  p_anchors: anchors,
});
```

これにより `compensating delete` 不要、orphan 発生不可能。SupabaseExternalAnchorRepository は同 interface を保ったまま、内部実装だけ差し替え可能。

---

## 7. テスト戦略

### A-2（今）

- unit test: mock SupabaseClient で compensating delete / orphan source logging を verify（`tests/unit/plan/externalAnchorSupabaseRepository.test.ts`）
- integration test: 実 Supabase + RLS smoke で API 経由動作確認（Commit 3）

### W1-Y（将来）

- RPC migration のスキーマ smoke
- RPC 呼び出しでの atomicity verification（部分失敗が発生不可能であることを実証）

---

## 8. 移行手順（W1-Y 着手時）

1. migration `<future>_create_external_anchor_bundle.sql` を作成
2. staging で migration apply + smoke
3. `SupabaseExternalAnchorRepository` の `createSourceWithAnchors` を `client.rpc(...)` に置き換え
4. compensating delete / orphan logging を削除
5. unit test を RPC mock に更新
6. production migration apply（CEO 承認）

interface 不変なので、API route / UI / Repository 利用側のコード変更は不要。

---

## 9. 受容判定

A-2 PASS 条件としては以下を満たせばよい：

- ✅ unit test で compensating delete が呼ばれることを実証
- ✅ unit test で orphan source が logger に記録されることを実証
- ✅ integration smoke で正常系がすべて PASS
- ⚠️ orphan source が production で実際に発生した場合は W1-Y で対処（A-2 では受容）

orphan 発生時の UX 影響は「空の source が listSources に出る」のみ。データ破損ではない。

---

**結論**: A-2 では best-effort atomicity で前進する。完全 atomicity は W1-Y で migration を追加してから RPC で達成する。この trade-off は安全性ではなく **完璧主義** との trade-off であり、A-2 制約下では合理的選択である。
