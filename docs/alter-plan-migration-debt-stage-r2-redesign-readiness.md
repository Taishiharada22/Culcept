# Stage R2-redesign — カテゴリ別補完設計 Readiness

**起草日**: 2026-05-26
**起草者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R2-redesign
**現 branch**: `feat/migration-debt-phase-readiness`
**status**: CEO 承認待ち（設計起草、 着手前停止）
**先行**: Stage R1 audit 完了（154 件 prod-only + base schema 不在仮説確定）
**後続**: Stage R3（staging リセット + 全 push 検証） / Stage R4（production schema_migrations 履歴調整）

---

## §0 — Stage 定義 / 範囲

### 何をするか

prod-only 154 件の補完を、 **1 file 一括ではなく Layer / カテゴリ別に段階的**に設計する。

具体的:
1. 154 件を **Layer 1 / Layer 2 / Layer 3** に分類
2. 各 Layer 内で sub-stage を切る
3. 各 sub-stage の手順雛形を定義
4. staging リセット戦略を確定
5. anomaly（real_face_sessions）は Stage R1.5 と統合方針

### 何をしないか（本 Stage / 全 Stage 共通）

- ❌ **本 Stage は doc only**（補完 migration file の起草は次 sub-stage R2-1 以降で個別実施）
- ❌ **production schema を変更しない**（read-only のみ、 schema_migrations 履歴調整は Stage R4）
- ❌ **staging を初期化しない**（Stage R3 で実施）
- ❌ **154 件一括 dump しない**（Layer / Stage 単位で個別 pg_dump -t）
- ❌ **自律 migration repair 禁止**
- ❌ **既存 172 file の delete / rename 禁止**

---

## §1 — 前提（Stage R1 audit 結果から）

### 1.1 確定事実

| item | 値 |
|---|---|
| production CREATE TABLE 総数 | 397 |
| repo unique CREATE TABLE 総数 | 247 |
| prod-only（補完対象） | **154** |
| repo-only | 4（うち 3 は LOCAL only 6 file 由来、 1 は real_face_sessions anomaly） |
| both | 243 |
| 仮説確定 | production base schema が repo 不在 |

### 1.2 解明済の事実（D-1〜D-3）

- 154 件は **機能群単位**で集中（collab 21, user 10, live 9, stargazer 8, ...）
- sample 20 件中 70% が「repo 完全痕跡なし」、 30% が「言及あり / CREATE なし」
- **主要 application table**（profiles, conversations, messages, notifications, app_admins, brands）が含まれる
- 廃止 / DROP の痕跡なし（除 real_face_sessions）

### 1.3 本 Stage で扱う core 課題

「154 件をどの粒度・どの順序で、 どの形式で repo に補完するか」を確定する。

---

## §2 — Layer 設計

### Layer 1 — Core Application Base（最優先、 必須）

> **CEO 補正 2026-05-26（2 回目、 3 回目、 さらに 4 回目）**:
> - 2 回目: 初版「Layer 1 = 6 件」を `.from()` 数で決定したが、 product 優先度 / replay 必要度を混同 → 3 区分構造（L-A / L-B / L-C）に変更
> - 3 回目: 2 回目の「Frozen Compatibility Layer」表現は強すぎる → L-C を Unknown / Legacy-candidate に変更、 削除禁止原則を明文化
> - 4 回目: 5 軸 audit + 軸 5 拡張で **shops/orders/conversations/messages/drops は Runtime evidence あり + non-blocker** と判明。 これらは active なので L-A 昇格 NG、 ただし最優先土台でもないので **新 Layer L-D** を新設。 同時に profiles + notifications も軸 5 拡張で **Replay-blocker** と確定し L-A 固定。 **4 区分構造（L-A / L-B / L-C / L-D）に再変更**

#### ⛔ 絶対原則（CEO 確定 2026-05-26）

- ❌ **削除判断は禁止**（application code / migration file / table いずれも）
- ❌ **「未使用確定」と言わない**
- ❌ **「frozen 確定」と言わない**
- ✅ 確認の上に確認を行う、 7 軸の audit が完了するまで判定保留
- ✅ Unknown は **そのまま残す**

#### L-A: Runtime Active Core（確定 2 件、 Replay-blocker 確認済）

product 上 active core + 軸 5 拡張 audit で **Replay-blocker と確定**（既存 172 migration が前提とする）。

| name | category | 最終更新日 | 軸 5 拡張依存 | 用途 |
|---|---|---|---|---|
| `profiles` | core user | 2026-05-20 | **7**（ALTER 6 + body 1） | stargazer / genome / my-page 現役利用 |
| `notifications` | core notification | 2026-04-19 + counselor C1-2/C7 | **2**（ALTER 1 + body 1） | Stargazer / Counselor 核心 |

完全な CREATE TABLE + INDEX + RLS + POLICY 補完が必要。

#### L-B: Replay Blocker（確定 5 件、 2026-05-26 audit 完了）

L-A 以外で後続 172 migration が前提とする table。 **全て Stargazer 系**で、 CLAUDE.md 最優先テーマと一致。

| name | 依存件数 |
|---|---|
| `stargazer_resolved_types` | 6 |
| `stargazer_core_star` | 5 |
| `stargazer_orbit_snapshots` | 4 |
| `stargazer_profiles` | 3 |
| `stargazer_observations` | 2 |

完全補完（INDEX / RLS / POLICY 含む）が必要。

#### L-C: No blocker evidence yet（142 件、 audit 完了 / non-blocker）

> ⚠️ **削除禁止 / 補完不要ともまだ言わない**。
> migration blocker 確認では non-blocker と判明。 active 度は未確認（軸 1-4 未実施）。

現状: 154 件 − 12 件（L-A 2 + L-B 5 + L-D 5）= **142 件**。

L-B audit (2026-05-26) で「後続 172 migration から touch されない」と判明。staging replay 上は **補完不要**（理論上）。 ただし staging で機能再現するには応じて補完必要。

##### audit 待ち軸（Step 4 以降の対象）

| 軸 | 内容 |
|---|---|
| 1. route 到達性 | UI button / page / API endpoint から到達するか |
| 2. import / call graph | code 内で import / 呼び出しされるか |
| 3. feature flag | flag が ON になり得るか |
| 4. cron / webhook / cleanup 経路 | バックグラウンドジョブで呼ばれるか |
| 5. ALTER / INDEX / POLICY / TRIGGER / FK / body | DB 層で参照されるか |

##### audit 後の遷移先（CEO 承認後）

| 結果 | 遷移先 |
|---|---|
| Runtime evidence あり + Replay-blocker | **L-A**（追加 active core） |
| Runtime evidence あり + non-blocker | **L-D**（追加） |
| Runtime evidence なし + Replay-blocker | **L-B**（補完必要） |
| Runtime evidence なし + non-blocker | **未確定**（保留、 削除しない） |

#### L-D: Runtime evidence あり / non-blocker（新設、 audit 済 5 件）

軸 1-4 で active 利用、 軸 5 拡張で **non-blocker**（後続 172 migration が前提としない）。
**使ってる、 でも最優先土台ではない**。L-A / L-B より補完優先度は低い。

| name | runtime evidence | 軸 5 拡張依存 | category |
|---|---|---|---|
| `shops` | page 1 + .from()=35 + files=66 | **0** | core commerce |
| `orders` | page 1 + .from()=13 + cron 2 + webhook 6 | **0** | core commerce |
| `conversations` | page 2 + api 2 + .from()=5 + files=25 | **0** | core messaging |
| `messages` | page 3 + api 2 + .from()=3 + files=101 + cron 8 | **0** | core messaging |
| `drops` | page 1 + .from()=72 + files=107 + webhook 2 | **0** | commerce 関連 |

##### 補完優先度

- L-A / L-B より低い
- staging リセット時に応じて補完するかは Step 4 で判断
- 削除しない、 application code touch しない
- 後続 172 migration が touch しないため、 補完しなくても push は通る可能性

#### 初版 6 件の再分類（4 回目補正、 現確定）

| name | 初版 | 2 回目 | 3 回目 | **4 回目（確定）** |
|---|---|---|---|---|
| profiles | Layer 1 | L-A | L-A | **L-A** |
| notifications | Layer 1 | L-A | L-A | **L-A** |
| shops | Layer 1 | L-C (凍結) | L-C Unknown | **L-D**（Runtime evidence あり） |
| orders | Layer 1 | L-C (凍結) | L-C Unknown | **L-D**（Runtime evidence あり） |
| conversations | Layer 1 | L-C (凍結) | L-C Unknown | **L-D**（Runtime evidence あり） |
| messages | Layer 1 | L-C (凍結) | L-C Unknown | **L-D**（Runtime evidence あり） |

#### Layer 関係図（5 回目補正、 L-B audit 完了）

```
L-A (Active + Blocker)     = 2 件確定: profiles, notifications
L-B (Blocker のみ)          = 5 件確定: stargazer_resolved_types, _core_star, _orbit_snapshots, _profiles, _observations
L-D (Active + Non-blocker) = 5 件確定: shops, orders, conversations, messages, drops
L-C (No blocker evidence yet) = 142 件: 残り、 staging 機能再現用は応じて補完

合計: 2 + 5 + 5 + 142 = 154 件 ✅

staging replay 最低限必要補完 = L-A 2 + L-B 5 = 7 件
```

#### Stage R2-0 で除外した候補（変更なし、 Layer 2/3 段階補完）

| name | 除外理由 |
|---|---|
| `brands` | `.from() = 0`、 別経路 / dormant |
| `items` | files=726 で false positive ノイズ大 |
| `app_admins` | `.from()=0`、 files=0、 dead/dormant |
| `stripe_events` | `.from()=0`、 files=0、 dead/dormant |
| 残り 20 件 singleton prefix | 高い使用度 sign なし |

### Layer 2 — 機能群（段階補完）

機能リリース時に Supabase Studio で初期 SQL を実行した groups。Layer 2-A 〜 2-Q として 17 カテゴリに分離。

| Stage | category | 件数 | 代表 table |
|---|---|---|---|
| R2-2-A | collab | 21 | collab_drop_events, collab_drop_partners, ... |
| R2-2-B | user | 10 | user_locations, user_sns_profile, ... |
| R2-2-C | live | 9 | live_sessions, live_streams, ... |
| R2-2-D | stargazer | 8 | stargazer_core_star, stargazer_profiles, ... |
| R2-2-E | style | 7 | style_items, style_cards, ... |
| R2-2-F | drop | 7 | drop_listings, drop_bids, ... |
| R2-2-G | recommendation | 6 | recommendation_scores, ... |
| R2-2-H | pc | 5 | pc_profile, pc_swatches, ... |
| R2-2-I | item | 5 | item_features_v2, item_measurements, ... |
| R2-2-J | community | 5 | community_threads, community_boards, ... |
| R2-2-K | trend | 4 | trend_tags, trend_user_scores, ... |
| R2-2-L | shop | 4 | shop_follows, shop_reviews, ... |
| R2-2-M | sg | 4 | sg_blocks, sg_likes, ... |
| R2-2-N | personality | 4 | personality_answers, ... |
| R2-2-O | match | 3 | match_feedback_events, ... |
| R2-2-P | date | 3 | date_fits, ... |
| R2-2-Q | aneurasync | 3 | aneurasync_conversation_logs, ... |

合計 Layer 2: **108 件**

### Layer 3 — その他 small prefix（最終）

2-prefix 9 種（18 件）+ 1-prefix 残り 29 件 - Layer 1 対象 = **約 35-40 件**

#### 例

- weather_daily, weather_subscriptions
- tag_votes, tag_vote_agg
- saved_drops, saved_shops
- product_*, fit_*, external_*, diagnostic_*, body_*
- 単発 small table 群

### Layer 4 — Anomaly Track（別管理、 Stage R1.5 と連動）

| name | issue | 対応 Stage |
|---|---|---|
| `real_face_sessions` | applied 履歴 vs table 不在 | Stage R1.5 で単独調査 → 復旧 Option α/β/γ 判断 |

154 件には含まれない（repo-only 側）。

---

## §3 — Sub-Stage 計画

```
[Stage R2-redesign 本 readiness 完了]
  ↓ CEO 承認
[Stage R2-0: Layer 1 候補確定]  ← 1-prefix 29 種から core を抽出
  ↓ Stop（CEO 確認、 Layer 1 list 固定）
[Stage R2-1: Layer 1 補完]  ← 最優先（6-15 件）
  ├─ R2-1-a: pg_dump -t で各 table の DDL 抽出
  ├─ R2-1-b: 補完 migration file 起草（timestamp 提案 20260101000000_layer1_core_base.sql）
  ├─ R2-1-c: staging で適用検証（Stage R3 と連動）
  └─ R2-1-d: CEO 承認 + commit
  ↓ Stop
[Stage R2-2-A: collab 21 件]
[Stage R2-2-B: user 10 件]
... （17 sub-stage）
  ↓ Stop（各 sub-stage 毎）
[Stage R2-3: Layer 3 補完]
  ↓ Stop
[Stage R3: staging 完全初期化 + 全 push 検証]
  ↓ Stop
[Stage R4: production schema_migrations 履歴調整]
  ↓ Stop
[Stage R5: closeout]
```

各 sub-stage は **独立 readiness doc** + **CEO 個別承認** + **commit**。

---

## §4 — 各 sub-stage の手順雛形（R2-1 以降全 sub-stage 共通）

### Step 1: 対象 table 一覧確定

- 親 readiness で確定した list を Layer / Stage 単位に絞る
- name list を一時 file `/tmp/r2-stage-X-tables.txt` に保存

### Step 2: pg_dump -t による個別 DDL 抽出（範囲限定）

```bash
# linked = production 確認
cat supabase/.temp/project-ref  # aljavfujeqcwnqryjmhl

# eval で env、 各 table を個別 dump
eval "$(supabase db dump --linked --schema public --dry-run 2>/dev/null | grep '^export PG[A-Z]+=')"
OUT=/tmp/r2-stage-X-creates.sql
> "$OUT"

while IFS= read -r table; do
  echo "-- ============================" >> "$OUT"
  echo "-- table: $table" >> "$OUT"
  echo "-- ============================" >> "$OUT"
  pg_dump --schema-only --no-owner --no-publications \
    -t "public.\"$table\"" \
    >> "$OUT" 2>&1
done < /tmp/r2-stage-X-tables.txt

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
```

### Step 3: 補完 migration file 起草

- timestamp 提案: `20260101000000_<layer>_<stage>_<category>.sql`
- 例:
  - `20260101000000_layer1_core_base.sql`
  - `20260101010000_layer2_collab.sql`
  - `20260101020000_layer2_user.sql`
- 全 file が既存 172 file より前置になるよう `20260101000000` 系を base に
- `IF NOT EXISTS` 必須化（既存 environment 安全）
- OWNER / publication 行削除
- index / RLS は include しない（Stage R1.5-b 範囲外、 Layer ごとに別途）

### Step 4: 補完 file の sanitize 適用

- OWNER 行除去（`--no-owner` で抑制済、 念のため grep 確認）
- publication 行除去
- production-specific dependency 除去
- インデント / コメント整形

### Step 5: 補完 file commit（CEO 承認後）

- ファイル個別指定で `git add`
- atomic commit
- decision-log 更新

### Step 6: staging 検証（Stage R3 で実施、 sub-stage 完了時の単独検証は省略）

- 各 sub-stage 毎に staging push しない（複雑化回避）
- 全 sub-stage 完了後の **Stage R3 で一括 staging 検証**

### Step 7: tmp cleanup

- `/tmp/r2-stage-X-*` 削除

### Step 8: CEO 報告 + 次 sub-stage 着手判断

---

## §5 — Staging リセット戦略（Stage R3）

### 5.1 staging 初期化方針

現在の staging:
- 1 file partial applied (`experiment_assignments`)
- auth schema に 2 ユーザー + 40 session（テスト用）
- public schema は ほぼ空

R3 着手前に **staging を完全リセット**:

| Option | 内容 | 推奨度 |
|---|---|---|
| **Option 1**: Supabase Studio で project reset | 全 schema 初期化、 auth user も消える | 最も clean |
| **Option 2**: `supabase migration repair --status reverted` で schema_migrations row 削除 + 手動 DROP TABLE | application schema のみ初期化、 auth user 維持 | 中程度 clean |
| **Option 3**: 既存 partial state の上に push | 衝突 risk あり、 衛生悪 | 不採用 |

→ Stage R3 readiness で Option 確定

### 5.2 R3 での push 内容

- 補完 file 群（Stage R2-1 〜 R2-3 で起草、 ~ 60+ file 想定）
- 既存 172 file
- 合計 ~ 230+ file の一括 push

順序:
1. 補完 file（`20260101*`）が先に適用
2. 既存 172 file が timestamp 順に適用
3. 全成功なら staging clean state

### 5.3 R3 failure mode

- 途中失敗 → partial state（前 B1 と同じ）
- 即停止 + CEO 報告（Stage R3 readiness で詳細）

---

## §6 — 不変原則（全 sub-stage 共通）

| # | 原則 | 違反検出方法 |
|---|---|---|
| 1 | **production schema を変更しない** | linked ref + SQL audit |
| 2 | **既存 172 migration file を delete / rename しない** | git status 確認 |
| 3 | **補完 file は `20260101*` 系で前置** | timestamp prefix 確認 |
| 4 | **IF NOT EXISTS 必須**（既存 environment 安全） | grep IF NOT EXISTS 確認 |
| 5 | **OWNER / publication 行除去** | `--no-owner --no-publications` flag + grep 確認 |
| 6 | **個別 table の DDL 抽出のみ**（全 schema dump 禁止） | `pg_dump -t` 単独使用 |
| 7 | **credential を画面 / log に出さない** | sanitize 強化遵守 |
| 8 | **各 sub-stage で staging push しない**（Stage R3 一括） | command log audit |
| 9 | **自律 migration repair 禁止** | command log audit |
| 10 | **各 sub-stage 完了報告は CEO へ** | Stop 待機 |

---

## §7 — 開始条件 / Stop point

### 開始条件

- ✅ Stage R1 audit 完了（result doc 起草済）
- ✅ Stage R1.5 readiness 起草済（real_face_sessions track separate）
- ✅ linked は production
- ✅ branch は `feat/migration-debt-phase-readiness`
- ✅ sanitize 強化適用済

### Stop point

| Stop | 位置 | CEO 判断対象 |
|---|---|---|
| **Stop I** | 本 readiness 起草完了直後 | Stage R2-redesign 設計確定 + Stage R2-0（Layer 1 候補確定）着手 GO |
| **Stop R2-0** | Layer 1 候補 list 確定 | core table 6-15 件の最終 list 承認 |
| **Stop R2-1** | Layer 1 補完 file 起草完了 | DDL 内容承認 + commit |
| **Stop R2-2-*** | 各機能群 sub-stage 完了 | 各 commit 承認 |
| **Stop R2-3** | Layer 3 完了 | 全補完 file 完了承認 |
| **Stop R3** | staging リセット + 一括 push 検証完了 | Stage R4 着手 GO |
| **Stop R4** | production schema_migrations 履歴調整完了 | Stage R5 着手 GO |
| **Stop R5** | closeout 完了 | migration debt phase 完了承認 |

---

## §8 — Risk

| risk | 影響 | 緩和策 |
|---|---|---|
| Layer 1 候補確定で「core でない」table を含めてしまう | scope mistake | Stop R2-0 で CEO 承認、 application code grep で利用確認 |
| 補完 file の DDL が production と微妙に異なる | clean environment で挙動差 | pg_dump -t 出力を一字一句使用、 IF NOT EXISTS 保証 |
| 補完 file の timestamp `20260101*` が将来の repo migration と衝突 | 順序破綻 | `20260101000000` から `20260101220000` まで 17 stage 分の slot 確保 |
| Layer 2 の機能群分類で名前が不一致 | sub-stage scope 不明 | prefix 集計を厳密に、 例外 case は **その他** sub-stage で吸収 |
| staging リセット時に CEO 同意なしで auth user 消失 | テスト環境破壊 | Stage R3 readiness で明示確認 |
| 全 sub-stage 完了が長期化 | 進捗管理困難 | sub-stage 単位で commit + decision-log、 並列着手禁止 |
| 17 sub-stage の Layer 2 が scope 過剰 | CEO 個別承認 17 回 | 機能群を統合（例: 関連 group を 1 sub-stage に） — CEO 判断 |
| `real_face_sessions` 以外にも anomaly がある | repair 後も不整合 | Stage R1.5-b で網羅調査（提案） |

---

## §9 — 数字 / 事実 unify

| item | 値 | 出典 |
|---|---|---|
| 補完対象 total | 154 件 | Stage R1 §10 |
| Layer 1 想定件数 | 6-15 件 | 本 doc §2.1 |
| Layer 2 想定件数 | 108 件 | 本 doc §2.2 |
| Layer 3 想定件数 | 35-40 件 | 本 doc §2.3 |
| Anomaly | 1 件（real_face_sessions） | Stage R1 §7 |
| Sub-stage 数 | 約 21（R2-0, R2-1, R2-2-A〜Q, R2-3） | 本 doc §3 |
| 補完 file 数（推定） | 20+ files（layer / category 単位） | 本 doc §4 Step 3 |
| 想定 timestamp range | 20260101000000 〜 20260101220000 | 本 doc §4 Step 3 |

---

## §10 — Stage R1 / R1.5 / R2-redesign 統合俯瞰

```
[Stage R1 audit 完了] ─→ result doc に固定
   │
   ├─→ [Stage R1.5: real_face_sessions 単独調査]
   │     └─→ Option α / β / γ 判断 → 復旧実行 or 放置
   │
   └─→ [Stage R2-redesign: 154 件カテゴリ別補完]
         │
         ├─→ [R2-0: Layer 1 候補確定]
         ├─→ [R2-1: Layer 1 補完 (6-15 件)]
         ├─→ [R2-2-A 〜 Q: Layer 2 機能群補完 (108 件)]
         ├─→ [R2-3: Layer 3 補完 (35-40 件)]
         ↓
[Stage R3: staging リセット + 一括 push 検証]
   ↓
[Stage R4: production schema_migrations 履歴調整]
   ↓
[Stage R5: closeout + decision-log]
   ↓
[元の Path β: staging に LOCAL only 6 file + P3-A-1 push 再開]
```

---

**Stop I** — 本 readiness 起草完了。

CEO 判断仰ぐ:
- **A**: Stage R2-redesign 設計確定 + Stage R2-0（Layer 1 候補確定）着手 GO
- **B**: 補正後着手（Layer 分け / sub-stage 数 / Staging リセット戦略 等の修正）
- **C**: Stage R1.5 を先に実施（real_face_sessions 確定後に R2-redesign）
- **D**: その他

判断後、 Stage R2-0 着手 or Stage R1.5 着手 or 補正実施します。
