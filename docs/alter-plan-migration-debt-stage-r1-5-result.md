# Stage R1.5 — `real_face_sessions` Anomaly Result（standalone）

**実施日**: 2026-05-26
**実施者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R1.5
**現 branch**: `feat/migration-debt-phase-readiness`
**linked**: `aljavfujeqcwnqryjmhl`（production, read-only access のみ）
**status**: ✅ Step 1-3 完了、 仮説確定（precision 制約あり）、 復旧方針 α-later 採用済
**先行**: Stage R1 audit（154 件 prod-only + 1 件 anomaly 発覚）
**後続**:
- B-2: production application error 観測（CEO 判断）
- Stage R2-redesign Layer 4（anomaly track 統合）
- α-soon 緊急例外: production 障害 active 確認時に再判断

---

## §0 — scope / standalone 化の理由

### 何を扱うか

`real_face_sessions` table の **「migration 履歴上 applied / production schema 不在」矛盾**の単独調査結果を 1 file に固定する。

### standalone 化の理由（CEO 判断 2026-05-26）

- 154 件の一般ケース（base schema 不在問題）とは **別種** anomaly
- applied 履歴あり / table 不在 / DROP 痕跡なし / **active code 利用中** という強い anomaly
- 後で R2-redesign / R3 / R4 / production repair のどこからでも参照しやすい証跡として独立化

### 154 件一般ケースとの差異

| 軸 | 154 件（base schema 不在） | `real_face_sessions`（anomaly） |
|---|---|---|
| migration file | repo に存在しない | repo に存在する |
| schema_migrations | 未登録 | applied 登録あり |
| production schema | table 存在 | table 不在 |
| 起源仮説 | Supabase Studio 手動構築 | migration repair で フラグだけ立てた（最有力） |
| 修復方針 | base schema 補完 migration 起草 | 標準 push で自然修復 or 緊急 repair revert |

---

## §1 — 既知事実（Stage R1 audit からの継承）

| 確認項目 | 結果 |
|---|---|
| repo file 存在 | ✅ `supabase/migrations/20260319100000_real_face_sessions.sql` |
| repo file 内 CREATE 文 | ✅ `CREATE TABLE IF NOT EXISTS real_face_sessions (...)` |
| 同 file 内 INDEX / RLS / POLICY | ✅ あり（idx_real_face_sessions_*、 RLS + 4 policy） |
| production migration list | ✅ `20260319100000` REMOTE 列に timestamp 記録（applied 済） |
| production schema 実在 | ❌ 不在（psql `pg_tables` で含まれない） |
| git history DROP TABLE | ❌ 0 件 |
| git log --diff-filter=D（migration file 削除） | ❌ 0 件 |
| 他 migration file での言及 | ❌ なし（この file のみ） |

---

## §2 — Step 1-3 実行結果

### Step 1: schema_migrations 直接 query ❌（permission denied）

```
ERROR:  permission denied for schema supabase_migrations
```

- `cli_login_postgres` user は `supabase_migrations` schema へのアクセス権限なし
- `version`, `statements`, `applied_at` の直接読み取り **不可**
- service role key 経由なら可能（後段 B-1 案、 ただし B-2 優先）

→ 仮説 A/B/C を **直接の SQL 証拠**で精確分離する手段は本 Step では取れず。

### Step 2: pg_class 全 schema 確認 ✅

```sql
SELECT n.nspname, c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relname = 'real_face_sessions';
```

→ **0 行**（全 schema 不在）

**判定**: **仮説 D（別 schema 作成）を否定確定**。

### Step 3: application code 利用確認 ✅（🔴 active）

#### 直接 query

| 利用箇所 | 内容 |
|---|---|
| `lib/realFaceSessions.ts` | `.from("real_face_sessions")` × **4 箇所** |

#### 関連 file（10+）

```
app/(culcept)/body-color/avatar/page.tsx
app/(culcept)/body-color/avatar/_components/EmbeddedFaceHub.tsx
app/api/account/delete/route.ts
app/api/body-color/real-face-submit/route.ts
app/api/body-color/real-face-session/route.ts
app/api/personal-color/real-face/route.ts
lib/realFaceStorage.ts
lib/realFacePersonalColor.ts
lib/realFaceSessions.ts
components/body/RealFaceCaptureInput.tsx
```

#### 関連 API route（4）

```
app/api/personal-color/real-face/
app/api/body-color/real-face-submit/
app/api/body-color/real-face-session/
app/api/aneurasync/face-phenotype  ← 関連だが別 table の可能性
```

**判定**: **dead code ではない**。active feature として production に存在する。

---

## §3 — 仮説判定（precision 制約付き）

| 仮説 | 内容 | 判定 | 根拠 |
|---|---|---|---|
| A | migration repair で applied フラグだけ立てた | 🟡 **検証不可、 最有力** | DROP 痕跡なし + apply 履歴 + table 不在 |
| B | apply 後に手動 DROP | 🟡 検証不可 | DROP 痕跡なし、 application active なら考えにくい |
| C | SQL silent failure（migration 実行時 error） | 🟡 検証不可 | file 内 SQL は IF NOT EXISTS で安全 |
| D | 別 schema 作成 | ❌ **否定確定** | pg_class 全 schema 確認 |

### A/B/C 精確分離の限界

- `supabase_migrations` schema は cli_login_postgres user では読めない
- 精確判定には **service role key 経由の直接 query**（B-1）が必要
- ただし CEO 判断: B-1 は今の最優先ではない（root cause 分離より production 影響観測が先）

### 確定している重要事実

- production application **active code** に `real_face_sessions` 依存あり
- production schema に **table 不在**
- → application は **table 不在で 500 error または silent failure を起こしている可能性が高い**
- これが「構造問題」か「現在進行形の本番障害」かは **B-2（error log 観測）**で確定

---

## §4 — 復旧 Option 評価

| Option | 内容 | 判定 |
|---|---|---|
| α-soon | 今すぐ `migration repair --status reverted 20260319100000` + 即 production push | ⏸ 障害 active 確認時の緊急例外 |
| **α-later** | Stage R3 / R4 の標準フロー内で自然修復 | ⭐ **CEO 採用**（2026-05-26） |
| β | 放置 | ❌ NG（application active なので障害継続） |
| γ | repo file 削除（廃止） | ❌ NG（active feature、 廃止判断なし） |

### α-later 採用の根拠（CEO 判断）

1. 現時点で確定しているのは「table 不在」まで。**実際の本番障害規模は未確認**
2. `real_face_sessions` は **Layer 4 anomaly track** で R3 / R4 標準フローの中で自然修復可能
3. 今ここで production 単独 repair すると、 migration debt 本体の整理フローから外れた**例外処理**になりやすい

### α-later の自然修復フロー

```
[Stage R3: staging リセット + 一括 push 検証]
  ↓ 既存 172 file の中に 20260319100000_real_face_sessions.sql が含まれる
  ↓ staging では `real_face_sessions` table が正規に作成される
  ↓
[Stage R4: production schema_migrations 履歴調整]
  ↓ production の schema_migrations から `20260319100000` row を CEO 手動で revert
  ↓ supabase migration repair --status reverted 20260319100000 --linked
  ↓ その後 production 再適用 で table が production にも作られる
  ↓ → 自然修復完了
```

### 緊急例外条件（α-soon 再判断）

以下のいずれかが B-2 で確認されたら α-soon に切り替え:
- production の `real_face_sessions` 系 API が継続的に 500 を返している
- ユーザーが触る導線で active に壊れている
- 障害が軽微ではない（影響範囲広い / 頻度高い）

---

## §5 — 新たな運用 risk（B-2 観測対象）

### 想定 risk

`real_face_sessions` table 不在で **active code が動作不能**の可能性:

| API route | 想定 user 操作 | 不在時挙動（予測） |
|---|---|---|
| `app/api/personal-color/real-face/` | パーソナルカラー診断 real face capture | 500 error or silent failure |
| `app/api/body-color/real-face-submit/` | 身体色 face submit | 500 error |
| `app/api/body-color/real-face-session/` | session 取得 / 作成 | 500 error |
| `app/api/account/delete/` 内の cleanup | account 削除時の face session cleanup | 部分失敗 / silent skip |
| `app/(culcept)/body-color/avatar/` | avatar 生成 flow | 500 error or 空画面 |

### B-2 で確認したい事項（CEO 観測）

1. Vercel dashboard / Sentry / route log で `real_face_sessions` 由来 error の頻度
2. 直近 7-30 日の error 数
3. 影響ユーザー数
4. user-facing 障害（500 page / 空画面 / 機能不全）の報告有無

### CEO 操作領域

私（AI）は Vercel dashboard / Sentry に直接 access できないため、 観測は CEO 操作:
- Vercel Project → Deployments → Production → Logs filter `real_face` or `relation .* does not exist`
- Sentry（設定があれば）→ project → search `real_face_sessions`
- User feedback / support ticket の確認

---

## §6 — Layer 4 統合方針（Stage R2-redesign）

### Layer 4 — Anomaly Track

| name | issue | 対応 Stage |
|---|---|---|
| `real_face_sessions` | applied 履歴 vs table 不在 | Stage R3（staging 一括 push）+ Stage R4（production repair revert + re-apply） で自然修復 |

### Layer 4 単独 sub-stage は不要

- Stage R2 で補完 migration を起こす対象ではない（repo file は既に存在）
- 自然フローで修復されるため、 Layer 4 entry を R2-redesign readiness §2 / §3 に明示するだけで足りる
- 単独 sub-stage（R2-Z-anomaly 等）は **作らない**

### Stage R4 での具体操作（CEO 手動実行）

```bash
# 前提: Stage R3 で staging 検証完了済

# 1. production link 確認
cat supabase/.temp/project-ref  # aljavfujeqcwnqryjmhl

# 2. CEO 手動実行
supabase migration repair --status reverted 20260319100000 --linked
# → schema_migrations.row 削除

# 3. 既存 file の正規 apply（Stage R3 完了後、 Stage R4 内で他補正と一括）
supabase db push --linked
# → 20260319100000_real_face_sessions.sql が正規 apply
# → table 作成

# 4. 検証
psql 経由で pg_tables に real_face_sessions 含まれる確認
```

---

## §7 — Stage R1.5 closeout 判断

### CEO 判断（2026-05-26）

| 軸 | 判断 |
|---|---|
| A 復旧 Option | **α-later** 採用、 緊急例外条件あり |
| B 追加検証 | **B-2**（production error 観測） |
| C result doc | **C-1**（standalone doc 化、 本 doc） |

### closeout 状態

- ✅ Step 1-3 実行完了
- ✅ 仮説 D 否定確定
- ✅ application active 利用確認
- ✅ Layer 4 統合方針確定
- ✅ standalone doc 起草完了（本 doc）
- ⏸ B-2 production error 観測（次の Step、 CEO 操作領域）
- ⏸ α-soon / α-later の最終判断（B-2 結果待ち）

---

## §8 — 数字 / 事実 unify

| item | 値 |
|---|---|
| 調査対象 table | 1 件（real_face_sessions） |
| 関連 migration | 1 file（`20260319100000_real_face_sessions.sql`） |
| repo CREATE 文 | あり |
| production migration list applied | YES |
| production schema 内存在 | NO |
| DROP 痕跡 | なし |
| 全 schema 確認結果 | 0 行（不在確定） |
| application code 直接 query | 4 箇所（`lib/realFaceSessions.ts`） |
| 関連 file | 10+ |
| 関連 API route | 4 |
| 仮説判定 | A/B/C 検証不可（permission 制約）、 D 否定確定 |
| 復旧採用 | α-later |
| 緊急例外条件 | B-2 で active 障害確認時 |
| Layer 4 entry | `real_face_sessions` 単独 |

---

## §9 — 次の Step

### B-2: production error 観測（CEO 操作領域）

私（AI）は Vercel / Sentry に直接 access できないため、 以下を CEO に依頼:

1. **Vercel Project Logs**
   - filter: `real_face` or `relation "real_face_sessions" does not exist` or `42P01`
   - 直近 7-30 日 の error 頻度
2. **Sentry**（設定がある場合）
   - search: `real_face_sessions`
   - 影響ユーザー数 / event 数
3. **User feedback**
   - パーソナルカラー / body-color / avatar 関連の不具合報告

### 観測結果による分岐

| B-2 結果 | 次の判断 |
|---|---|
| 障害軽微 / 観測なし | **α-later 維持**、 R2-redesign R2-0（Layer 1 候補確定）へ |
| 障害 active | **α-soon に切替**、 緊急 production repair → R2-redesign 並行 |

### 並行進行可能なこと

私（AI）は B-2 観測結果を待つ間、 以下を**並行**できる:
- 私の側で repo 内 error tracking 実装の確認（後段 §10 補強情報）
- R2-redesign R2-0 readiness 準備（Layer 1 候補抽出の事前作業）
- ただし CEO 判断待ちで実行はせず、 待機する

---

## §10 — 補足: repo 内 error tracking 実装の事前確認（私の側で可能）

B-2 観測の精度を高めるため、 私の側で以下を事前確認可能:

1. `real_face_sessions` を query する code の error handling 実装
2. Sentry / Vercel Analytics の設定確認（`@sentry/nextjs`, `next/error` 等）
3. API route の error response pattern

これにより、 **不在時の挙動を予測**（500 か silent か）して、 CEO の Vercel/Sentry 観測の filter 精度を上げられる。

→ CEO が「補強情報出してくれ」と判断したら実施。

---

**Stage R1.5 暫定 closeout** — α-later 採用、 B-2 観測待ち。

α-soon 緊急例外は B-2 結果次第で再判断。
