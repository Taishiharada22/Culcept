# PRM Migration Readiness Plan（A1-7-10・**docs-only・migration file は作らない**）

設計: `docs/prm-persistence-schema-design.md`（A1-7-5）/ `docs/prm-review-flow-design.md`（A1-7-6）/ §10.5〜10.10
状態: **設計のみ**。**migration file 作成 / DB schema 実装 / DB write / Supabase apply・local reset / route / Home / persistence 実装 / production / env / remote / PR は一切しない**。

> 本書は「実際に migration を作る前の readiness plan」。下記の SQL は **設計の図示**であり、`supabase/migrations/` に file は作らない。実 file 作成は §10 最終 stop gate（CEO 承認）後。

---

## 0. 前提（A1-7-0〜7-9 で確定・全 dry-run / no-persist）

- 学習 chain: events(7-0) → patterns(7-1) → proposals(7-3) → dev-report(7-4)。**patterns/proposals は events の純関数（保存しない）**。
- review flow: contract(7-7) → helper(7-8) → preview(7-9)。**review 決定だけが PRM model の入口**。
- 永続化は未実装。本 plan は permanent store を**安全・可逆・段階的**に作るための手順書。

---

## 1. Migration 段階分割（順序・各段は独立 migration / 独立に revert 可能）

| 段階 | migration | 内容 | 依存 | risk |
|---|---|---|---|---|
| **M1** | `*_prm_learning_events` | 源泉 signal log（append-only facts） | なし | 最低（新規 table・既存無変更） |
| **M2** | `*_prm_review_decisions` | review 決定（PRM 入口） | なし（fingerprint 参照のみ） | 低 |
| **M3** | `*_prm_model_entries` | review 済 tendency＝実 PRM | M2（review_decision_id FK） | 中（FK・constraints） |

- **M1 を先に**: events を持てば patterns/proposals/review は再導出可能。M1 だけで **実データ蓄積を shadow 開始**でき、M2/M3 は review flow 検証後。
- 各段は **別 migration file**（独立に review・apply・revert）。一括しない。

---

## 2. 各テーブルの役割と最小カラム（設計図示・file ではない）

### M1 `prm_learning_events`（源泉・append-only）
```
id uuid pk default gen_random_uuid()
user_id uuid not null                      -- RLS owner
handle text not null                       -- opaque（一方向 hash・seedRef でない）
action text not null check (action in ('accept','dismiss','later'))
signal text not null check (signal in ('adoption','non_adoption','deferral'))
desired_date date
band text check (band in ('morning','afternoon','evening'))
confidence_band text not null check (confidence_band in ('high','medium','low'))
duration_min int
source_kind text not null check (source_kind in ('seed_explicit','correction'))
acted_at timestamptz not null
captured_at timestamptz not null default now()
expires_at timestamptz                     -- TTL（§9）
-- raw / seedRef / source_ref / 発話本文 / 性格 column は **存在しない**（§8）
```

### M2 `prm_review_decisions`（review 入口）
```
id uuid pk default gen_random_uuid()
user_id uuid not null                      -- RLS owner
proposal_fingerprint text not null         -- dimension:value:dominantAction
decision text not null check (decision in ('approved','rejected','deferred'))
reviewed_by text not null check (reviewed_by in ('operator','user'))
proposal_snapshot jsonb not null           -- review 時点 evidence/counter/certainty（再現性）
reviewed_at timestamptz not null
retracted_at timestamptz                   -- 撤回（rollback）
-- 自動 approve 禁止（decision は app が人間入力からのみ insert）
```

### M3 `prm_model_entries`（review 済 tendency＝実 PRM）
```
id uuid pk default gen_random_uuid()
user_id uuid not null                      -- RLS owner
context_dimension text not null check (context_dimension in ('band','durationBucket','confidence','source'))
context_value text not null
tendency_direction text not null check (tendency_direction in ('adoption','non_adoption','deferral'))  -- 傾向（trait でない）
favored_hypothesis text not null
still_possible jsonb not null default '[]'
evidence_count int not null
counter_count int not null
certainty text not null check (certainty in ('low','tentative'))   -- ★ high 不可（§4）
review_decision_id uuid not null references prm_review_decisions(id)  -- ★ review 必須（§4）
supersedes_id uuid references prm_model_entries(id)                  -- versioning / rollback
user_visible boolean not null default true
user_correction jsonb                       -- ユーザー訂正（強い override）
decay_weight real not null default 1.0      -- recency
created_at timestamptz not null default now()
retracted_at timestamptz                    -- 論理削除（rollback）
-- personality / trait / fixed_preference column は **存在しない**（§4）
```

---

## 3. RLS 方針（owner-only・service_role 前提にしない・cross-user 不可）

- 3 table 全てに RLS 有効化。policy: SELECT/INSERT/UPDATE/DELETE とも `auth.uid() = user_id`。
- **service_role を前提にしない**: app は user-RLS client（anon JWT）で read/write。本機能で service_role を使わない。
- **cross-user 不可**: RLS が owner-only を強制。他 user の row は read/write 不能。

---

## 4. Constraints（過断定防止を DB level で構造化）

- **certainty high 禁止**: `prm_model_entries.certainty CHECK in ('low','tentative')`。app バグでも high を書けない。
- **review なし model entry 禁止**: `review_decision_id NOT NULL`（FK）。review 決定なしに PRM entry を作れない。
- **personality / fixed preference を入れない契約**: trait column を**作らない**。`tendency_direction`/`context_dimension` を enum CHECK で文脈束縛 tendency に限定。「あなたは X な人」を schema が表現不能。
- enum CHECK（action/signal/decision/reviewed_by/source_kind/band/confidence/context_dimension）で整合性。

---

## 5. Indexes（最小・read pattern 駆動）

- `prm_learning_events`: `(user_id, acted_at)`（recency 集約 read）/ `(user_id, expires_at) where expires_at is not null`（TTL sweep）。
- `prm_review_decisions`: `(user_id, proposal_fingerprint)`（proposal ごとの最新 decision）。
- `prm_model_entries`: `(user_id, context_dimension, context_value)`（lookup）/ `(user_id) where retracted_at is null`（active entry）。

---

## 6. Rollback / Down migration

- 各 migration に **down**（drop index → drop policy → drop table）。table は**新規追加のみ**（既存 table 無変更）ゆえ down = clean DROP（データ移行不要）。
- 順序: M3 down → M2 down → M1 down（FK 逆順）。
- 完全可逆: drop で PRM データは消えるが、本機能は flag-gated（既存 UI/route は本 table に依存しない）。drop 後は flag-off 挙動に戻るだけ。

---

## 7. Local-only smoke 方針（remote 触らない）

- 実 file 作成後（別段階）: **local DB のみ**で `supabase migration up`（local start / reset）。検証:
  - 3 table 作成・RLS 有効・policy owner-only（別 user で read 0 を確認）。
  - constraints: high certainty insert が reject される / review_decision_id NULL の model entry が reject される。
  - index 作成・down で clean drop。
- **local-only**（staging/production/remote apply は各段で CEO 承認まで禁止）。本 plan では smoke を**実行しない**（checklist 定義のみ）。

---

## 8. seedRef / raw text を保存しない保証

- column 設計に **seedRef / source_ref / raw / 発話本文 を含めない**（構造的に保存不能）。
- events.handle は opaque（一方向 hash）。reader（既存 consumed-seed-repository pattern）が redact 済。
- proposal_snapshot(jsonb) は redacted な proposal 由来（dimension/value/hypothesis/evidence/certainty のみ・seedRef なし）。

---

## 9. Retention / TTL / Deletion

- **TTL**: `prm_learning_events.expires_at`（例 180 日）。sweep（cron で expired 削除）は**別段階**（初期 migration に cron は含めない）。
- **deletion**: user 起点削除。FK `on delete cascade`（model→decisions は参照のみ・events は独立）+ app の delete 関数で user の全 PRM data 削除。GDPR 整合（owner-only）。
- **decay**: `prm_model_entries.decay_weight`（recency）+ `retracted_at` 論理削除。

---

## 10. Migration 作成前の最終 stop gate（**この順序を満たすまで file を作らない**）

1. **CEO が本 readiness plan（A1-7-10）+ review flow（A1-7-6〜9）+ proposal 品質（A1-7-4）を確認・承認**。
2. **どの段階から始めるか CEO 承認**（推奨: M1 `prm_learning_events` 単独から）。
3. **local smoke 手順を CEO 承認**。
4. ③承認後にのみ **M1 migration file 作成** → local smoke → **CEO が実 SQL を review**。
5. **remote/staging apply は別途 CEO 承認**（file 作成と apply を分離）。production apply は更に別承認。
- **①②未了の間は `supabase/migrations/` に file を作らない**。④まで local apply もしない。⑤まで remote/production apply しない。

---

## 11. しない（A1-7-10 の境界）

migration file 作成 / DB schema 実装 / DB write / Supabase apply・local reset / route / Home 本線 / persistence 実装 / production / env / remote / PR / deploy / 自動 review / 性格断定。
