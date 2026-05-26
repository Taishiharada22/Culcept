# Stage R1 — Audit Result: Production vs Repo CREATE TABLE Diff

**実施日**: 2026-05-26
**実施者**: AI 執行部（Build Unit）
**親 phase**: `migration-debt-phase` → `migration-debt-repair` → Stage R1
**現 branch**: `feat/migration-debt-phase-readiness`
**linked**: `aljavfujeqcwnqryjmhl`（production, read-only access のみ）
**status**: ✅ audit 完了、 結論固定済
**後続**:
- Stage R1.5（real_face_sessions 単独 anomaly 調査）
- Stage R2-redesign（カテゴリ別補完設計）

---

## §1 audit 実施状態

- 採用 Step（readiness §2 Step 2 分岐）: **Step 2-B（psql metadata query）**
- 採用理由: CEO 補足「table 名 diff の段階では metadata query を第一候補」を反映
- Step 1 dry-run で確認した pg_dump invocation flag: `--schema-only --quote-all-identifier --schema=public --no-owner --no-publications`（data 非含有を確認済）
- Step 5（DDL 抽出）: **未実施**（CEO 判断保留中、 R2-redesign 設計後に着手）
- 一時 file: 保持中（cleanup は result doc 化後）

### sanitize 強化適用

- credential 漏洩を一度発生させた（Step 1 初回試行で `PGPASSWORD` を表示）→ CEO 判断で `supabase logout` → 再 login で rotate 済
- 以後、 `eval` + 直接処理 + `unset` で credential を一切画面表示せず

---

## §2 数値サマリ（最終確定 = v3）

| 区分 | v1 (regex bug) | v2 (multi-line 補正) | **v3 (確定)** |
|---|---|---|---|
| production CREATE TABLE 総数 | 397 | 397 | **397** |
| repo unique CREATE TABLE 総数 | 152 | 248 | **247** |
| **prod-only**（補完候補） | 250 | 154 | **154** |
| repo-only | 5（`IF` 偽含む） | 5（`IF` 偽含む） | **4** |
| both（正常） | 147 | 243 | **243** |

### regex 補正履歴

| 版 | 補正内容 | 結果差分 |
|---|---|---|
| v1 | 初版 `CREATE TABLE` 大文字限定、 single-line | 96 件取りこぼし |
| v2 | perl 多行対応 + lowercase 許容 | +96 件、 IF 偽 1 件残存 |
| v3 | name 後 `(` or `AS` 必須化 + IF/NOT/EXISTS 弾き | IF 偽消失、 真値固定 |

---

## §3 prod-only 154 件 — カテゴリ別正式表

### prefix 集計（上位 20）

| 順位 | prefix | 件数 | 代表 table |
|---|---|---|---|
| 1 | collab | 21 | collab_drop_events, collab_drop_partners, collab_drop_items, ... |
| 2 | user | 10 | user_locations, user_sns_profile, user_style_profile, ... |
| 3 | live | 9 | live_sessions, live_streams, live_jobs, ... |
| 4 | stargazer | 8 | stargazer_core_star, stargazer_profiles, stargazer_observations, ... |
| 5 | style | 7 | style_items, style_cards, style_swaps, ... |
| 6 | drop | 7 | drop_listings, drop_bids, drop_embeddings, ... |
| 7 | recommendation | 6 | recommendation_scores, recommendation_actions, ... |
| 8 | pc | 5 | pc_profile, pc_swatches, pc_answers, ... |
| 9 | item | 5 | item_features_v2, item_measurements, ... |
| 10 | community | 5 | community_threads, community_boards, ... |
| 11 | trend | 4 | trend_tags, trend_user_scores, ... |
| 12 | shop | 4 | shop_follows, shop_reviews, ... |
| 13 | sg | 4 | sg_blocks, sg_likes, sg_matches, sg_reports |
| 14 | personality | 4 | personality_answers, personality_dimensions, ... |
| 15 | match | 3 | match_feedback_events, match_scores_cache, ... |
| 16 | date | 3 | date_fits, date_fit_feedback_events, ... |
| 17 | aneurasync | 3 | aneurasync_conversation_logs, aneurasync_eval_scores, ... |
| 18-25 | 2-prefix 9 種 | 計 18 | weather_*, tag_*, saved_*, product_*, fit_*, external_*, diagnostic_*, body_* |
| 26+ | **1-prefix 29 種** | 計 29 | **profiles, conversations, messages, notifications, app_admins, brands, ...** |

### Layer 別分類（R2-redesign の入力、 **CEO 補正 2026-05-26 反映、 3 回目補正後**）

> 初版で「Layer 1 = Core Application Base」を 1 軸（.from() 数）で決定したが、 CEO 指摘により誤判定と判明。
> 2 回目補正で「Frozen Compatibility Layer」と命名したが、 3 回目補正で **「frozen 確定」表現を撤回**。
> 真実: 現時点で「凍結確定」「未使用確定」とは言えない。**Unknown / Legacy-candidate** に変更。

#### ⛔ 絶対原則（CEO 確定 2026-05-26）

- ❌ **削除判断は禁止**
- ❌ **「未使用確定」と言わない**
- ❌ **「frozen 確定」と言わない**
- ✅ Unknown は **そのまま残す**、 確認の上に確認

#### 2 軸構造

| 軸 | 値 |
|---|---|
| **軸 1: product 上の優先度** | Active core / Maybe active / Unknown / Legacy-candidate |
| **軸 2: migration replay 上の必要度** | Replay blocker / Replay-adjacent / Not needed |

#### 3 区分の Layer 構造

| Layer | 内容 | 件数 | 扱い |
|---|---|---|---|
| **L-A: Runtime Active Layer** | profiles / notifications | 2 件（確定） | 完全な CREATE TABLE + INDEX + RLS + POLICY 補完 |
| **L-B: Replay Blocker Candidate Layer** | L-A 以外で、 後続 172 migration の ALTER / FK / policy が前提とする table | 要 audit | 完全補完（Step 4 以降で audit） |
| **L-C: Unknown / Legacy-candidate Layer** | shops / orders / conversations / messages / drops 系（"主役ではない可能性"段階） | 推定 30-50 件 | **7 軸 audit 完了まで判定保留**、 削除禁止、 補完判断未定 |
| その他（154 件中の残り） | Stargazer / Rendezvous / 機能群 | 残り | Layer 2-Q として段階補完 |

#### L-A の usage 根拠（最終更新日ベース、 2026-05-26 確認）

| table | 最終更新日 | 用途 |
|---|---|---|
| profiles | 2026-05-20 | stargazer / genome / my-page で現役 |
| notifications | 2026-04-19 + 2026-04 以降 counselor C1-2/C7 関連 commit | Stargazer / Counselor の核心と直結 |

#### L-C Unknown の観察（未確定、 削除禁止）

> .from() 累積数 と 最終更新日 のみでは「未使用」とは言えない。 観察データは下記、 判定保留中。

| table | 観察 | 状態 |
|---|---|---|
| shops | 2026-03-30 全 file 同一 commit | Unknown |
| orders | 2026-04-04 stripe webhook + cron expire のみ | Unknown |
| conversations | 2026-03-30 / 2026-02-02 旧 commerce 交渉 messaging | Unknown |
| messages | 2026-02-02 4 ヶ月前、 file 1 つのみ | Unknown |
| drops 系 | commerce 由来 | Unknown |

#### L-C audit 必要 7 軸（Step 4-pre で実施）

| 軸 | 内容 |
|---|---|
| 1. route 到達性 | UI button / page / API endpoint から到達するか |
| 2. import / call graph | code 内で import / 呼び出しされるか |
| 3. feature flag | flag が ON になり得るか |
| 4. cron / webhook / cleanup 経路 | バックグラウンドジョブで呼ばれるか |
| 5. FK / function / trigger / policy 依存 | DB 層で参照されるか |
| 6. 本番ログ上の痕跡 | Vercel / Sentry / route log での実利用 |
| 7. 現在 UI からの導線 | user 操作で到達可能か |

#### audit 結果による分類（後段判定、 現在は保留）

| 結果 | 分類 |
|---|---|
| 7 軸全て 0 痕跡 | **Confirmed Unused**（それでも削除しない） |
| 一部でも痕跡あり | **Active**（L-A 同等扱い、 完全補完） |
| audit 不能 | **Unknown 維持**（補完判断保留） |

#### L-B（Replay Blocker Candidate）audit 方針

Step 4 以降で実施:
- 既存 172 migration file 内の `REFERENCES "public"."xxx"` 全抽出
- 該当先が prod-only 154 件に含まれるか確認
- 含まれる場合は L-B 対象（完全補完必要）

合計 154 件。**Step 4 以降の優先順序**: L-A → L-B → L-C audit → 残り 機能群

---

## §4 各 table の CREATE TABLE SQL

**未抽出**（Step 5 保留）。

理由:
- CEO 補正により、 設計（R2-redesign）が固まる前に DDL を抽出すると「大量 SQL を抱える」リスクあり
- DDL 抽出は R2-redesign で Layer / Stage 単位に分割して個別 `pg_dump -t public."$table"` で実施予定

抽出予定の方針:
- pg_dump `--schema-only --no-owner --no-publications -t public."$table"` で個別実行
- 出力は Layer / Stage 単位の補完 migration file に直接記録
- 中間 file `/tmp/*.sql` は作らない（doc コピー後即削除）

---

## §5 repo-only 4 件 + LOCAL only 6 file 突合

### LOCAL only 6 file の CREATE TABLE 一覧（期待値）

| file | 生成 table |
|---|---|
| `20260430100000_external_anchors.sql` | `external_anchor_sources`, `external_anchors` |
| `20260430100000_coalter_memory_items_realtime.sql` | （ALTER PUBLICATION のみ、 CREATE TABLE なし） |
| `20260430110000_plan_drift_events.sql` | `plan_drift_events` |
| `20260430110000_coalter_memory_items_replica_full.sql` | （ALTER TABLE REPLICA IDENTITY、 CREATE TABLE なし） |
| `20260519100000_create_external_anchor_bundle.sql` | （未確認） |
| `20260520120000_coalter_mirror_app_settings.sql` | `app_settings`, `coalter_mirror_kill_switch_audit` |

期待される repo-only 件数: 5 + 不確定（`20260519100000` 内容次第）

### 実測 repo-only 4 件

| name | 原 file | 状態 |
|---|---|---|
| `app_settings` | `20260520120000_coalter_mirror_app_settings.sql` | ✅ expected |
| `coalter_mirror_kill_switch_audit` | 同上 | ✅ expected |
| `plan_drift_events` | `20260430110000_plan_drift_events.sql` | ✅ expected |
| **`real_face_sessions`** | `20260319100000_real_face_sessions.sql` | ⚠️ **anomaly**（applied 履歴ありなのに production table 不在） |

### 期待 vs 実測の差異

- 期待 5 件のうち実測 3 件（`app_settings`, `coalter_mirror_kill_switch_audit`, `plan_drift_events`）
- 期待 list に含まれない `external_anchor_sources`, `external_anchors` は実測 repo-only に**含まれない**
  - つまり production には既に存在する（手動作成済？） → R2-redesign で要確認
- 期待にない `real_face_sessions` が**追加**（applied 履歴 vs table 不在の別種 anomaly）

→ **Stage R1.5 で `real_face_sessions` を単独調査**

---

## §6 forensic sample 20 件結果

prod-only 154 件から代表 20 件を sample（核心 application + 主要 prefix 各 1-2 件）。

| 判定 | 件数 / 20 | 比率 | sample |
|---|---|---|---|
| 🟢 repo CREATE 有り（regex 漏れ） | 0 | 0% | （該当なし） |
| 🟡 repo 言及あり / CREATE 文なし | 6 | 30% | profiles, messages, notifications, stargazer_core_star, stargazer_profiles |
| 🔴 repo 完全痕跡なし | 14 | 70% | conversations, collab_drop_events, user_locations, live_sessions, style_items, drop_listings, recommendation_scores, brands, **app_admins**, weather_daily, community_threads, pc_profile 等 |

→ **prod-only 154 件のうち、 推定 80%+ は repo に CREATE 文が存在しない**（残り 20% は言及あり / ALTER のみ）

---

## §7 anomaly: real_face_sessions（Stage R1.5 へ分離）

詳細は Stage R1.5 readiness 参照。本 §は概要のみ。

| 確認項目 | 結果 |
|---|---|
| repo file 存在 | ✅ `20260319100000_real_face_sessions.sql` に CREATE 文あり |
| production migration list | ✅ applied 済（REMOTE 列に timestamp） |
| production schema 実在 | ❌ **不在**（pg_tables に含まれない） |
| git history DROP TABLE | ❌ 0 件 |
| 他 file での言及 | ❌ なし |

**有力仮説**: `supabase migration repair --status applied 20260319100000` が過去に実行され、 SQL 実行されずに applied フラグのみ立った。

詳細調査・復旧手順は Stage R1.5 で扱う。154 件の一般ケースとは別種の問題のため、 R1 closeout からは分離。

---

## §8 結論: production base schema 不在問題

### 根本原因仮説（D-1 + D-2 + D-3 統合）

**production は Supabase Studio で初期 base schema が手動構築された後、 migration が repo に「差分のみ」追加された。**

### 根拠

1. **主要 application table が prod-only に含まれる**: `profiles`, `conversations`, `messages`, `notifications`, `app_admins`, `brands`
2. これらは production application の根幹 = 必ず最初期に作られた = repo に CREATE 文がない = **initial migration が repo に存在しない**
3. 21 件の collab、 10 件の user、 9 件の live 等の **機能群単位の集中**も「機能 release 時の初期 SQL を Supabase Studio で実行」パターンと一致
4. Stage B1 failure（`notification_preferences.sql` が `notifications` table を前提）もこの仮説と整合

### 何が起きていないか（除外仮説）

- ❌ 「特定 file が消えた」: git log --diff-filter=D で削除済 migration 0 件
- ❌ 「branch 別の merge 漏れ」: 全 commit を main branch 内で確認
- ❌ 「regex bug の取りこぼし」: v3 厳密化後も結果不変

### migration debt の本体

| 当初理解 | 実態 |
|---|---|
| `notifications` 1 件の手動作成（Stage B1 直前理解） | **154 件規模**の base schema 不在 |
| 不足 migration 補完で完結 | カテゴリ別段階補完 + anomaly 別管理が必要 |

---

## §9 後続 phase 引き継ぎ事項

### Stage R1.5 へ

- `real_face_sessions` を単独で調査
- migration repair 仮説の検証
- 復旧手段の選択肢（DROP migration repair / 再実行 / 手動 sync）

### Stage R2-redesign へ

- 補完を「1 file」ではなく **Layer / カテゴリ別**に再設計
- 優先順位: Layer 1（core）→ Layer 2（機能群）→ Layer 3（その他）
- 各 sub-stage で staging 検証 → CEO 個別承認
- 全 Layer 完了後に production schema_migrations 履歴調整

### scope 外（本 phase 全期間）

- ❌ Step 5（DDL 一括抽出）: R2-redesign で stage 単位に分割
- ❌ tmp cleanup: R2-redesign readiness 完了後に実施
- ❌ staging push: Stage R2-redesign 後の Stage R3 で
- ❌ production schema 変更: 全 Stage で禁止

---

## §10 数字 / 事実 unify（本 Stage の正本）

| item | 値 | 出典 |
|---|---|---|
| production CREATE TABLE 総数 | **397** | psql metadata query |
| repo unique CREATE TABLE 総数 | **247** | perl 多行 + 厳密化 regex |
| prod-only（補完候補） | **154** | comm -23 |
| repo-only | **4** | comm -13 |
| both | **243** | comm -12 |
| forensic sample 検証件数 | **20 / 154** | 13% |
| sample 🔴 完全痕跡なし | **14 / 20** | 70% |
| anomaly（migration repair 候補） | **1**（real_face_sessions） | Stage R1.5 へ |
| prefix カテゴリ数 | **54** | prefix prefix |
| 一時 file | 13 files in /tmp/r1-* | cleanup 保留 |

---

**Stage R1 audit 完了**。本 doc は forensic 結果の正本として固定する。

次は Stage R1.5 readiness + Stage R2-redesign readiness で復旧戦略を起草。
