# R2-SCOPE-CORRECTION — clean production schema 最小確定（2026-06-24）

> CEO 補正レンズ（fashion/commerce=archive・rows不要・genome=救済・replace優先）で旧監査 must_keep=15 を再分類。
> read-only / docs-only。production 非接続（前 audit の cached snapshot + local main コード解析）。worktree=local main `3762969c9`。
> **本書は `production-clean-rebuild-audit-20260624.md` の「現コードが read だから本体に残す」過剰判定を是正する**（CEO 指摘の過剰救済パターン）。

## 0. 決定的結論（headline）
**production-only gap 146 のうち、clean production に新規 migration として追加が必要なのは実質 `stargazer_star_maps` 1 本だけ。**
- 本線 must-keep 14 は **staging migration に既存**（staging 昇格でカバー）。
- personality_* 4 は **replace**（migrated axis_snapshots/profiles fallback で代替・現コードは欠損耐性済み）。
- fashion/commerce/drops 系 7 は **archive**（復活させない）。
- rendezvous prototype 3 は **discard**（genome は空/default で graceful）。
- → **clean production = staging 274 migration + `stargazer_star_maps` schema。fashion 復活ゼロ・rows 移植ゼロ。**

## 1. 5 分類サマリ
| 分類 | 件数(13 named 中) | table | clean prod |
|---|---|---|---|
| **must_keep_plan_core** | 1 | `stargazer_star_maps`（login/baseline gate） | ✅ schema 追加（rows 不要） |
| **replace_instead_of_restore** | 4 | `personality_dimensions`/`personality_insights`/`personality_sync_level`/`stargazer_personality_profile` | ❌ 除外（migrated で代替） |
| **archive_only** | 7 | `curated_cards`/`recommendation_actions`/`recommendation_impressions`/`recommendation_ratings`/`reports`/`product_analytics`/`ops_action_logs` | ❌ 除外（fashion/drops 遺物・復活せず） |
| **discard_rows** | 3 | `swipe_events`/`pre_matches`/`match_feedback_events` | ❌ 除外（genome は null/[] graceful） |
| **rendezvous_separate** | — | `rendezvous_matches`/`rendezvous_candidates` | ❌ 別 project |

## 2. genuine must-keep for /plan 本線（最終 15・全て schemaNeeded・rowsNeeded=false）
| table | gap? | 役割 | clean prod |
|---|---|---|---|
| **`stargazer_star_maps`** | 🔴 GAP（要新規 migration） | **login/baseline gate**（requireBaseline.ts:29 / page.tsx:42,59）。空 table でも初回観測 upsert で row 生成→login 成立 | 新規 migration |
| `profiles` | staging 在 | 全機能の base user table（FK 親） | staging |
| `stargazer_profiles` | staging 在 | profile 正本（sync/archetype fallback 元） | staging |
| `stargazer_axis_snapshots` | staging 在(`20260307170000`) | 軸正本（Travel/Plan/genome fallback 元） | staging |
| `stargazer_observations` / `stargazer_core_star` / `stargazer_orbit_snapshots` | staging 在 | 観測/archetype/時系列 | staging |
| `genome_connections` / `talk_threads` / `talk_messages` | staging 在(`20260320600000`) | **Genome Card 交換 + Talk(DM)**（CEO 救済中核・writer 実在） | staging |
| `body_profile` / `user_style_vector` / `face_phenotype` / `taste_layers_cache` / `pref_profile` | staging 在 | genome physical/behavioral 層 + My-Style/Calendar 本線 | staging |

→ **新規 migration 化が必要なのは `stargazer_star_maps` のみ**（他 14 は staging 昇格でカバー。`profiles`/`stargazer_profiles` は staging 実在を昇格前に二重確認）。

## 3. genome 救済スコープ（CEO 復活対象）
- 正式名 = **Persona Genome / Genome Card**（`app/(immersive)/aneurasync/genome/*` 3D DNA 4 層 + Genome Card 交換）。
- 救済対象 schema = `genome_connections`/`talk_threads`/`talk_messages`（交換+DM・migration 実在）+ stargazer 軸正本 + genome physical/behavioral 層（body_profile/user_style_vector/face_phenotype/taste_layers_cache/pref_profile・全 staging 在）。
- genome が read する **`swipe_events`/`pre_matches`/`match_feedback_events`（旧 rendezvous prototype）は discard**：`personaGenome.ts:451-489` が null/[] 既定で graceful＝救済不要。

## 4. archive only（fashion/commerce/drops・復活させない・production backup のみ）
`curated_cards`（旧 fashion outfit カタログ／**新 /plan calendar-outfit は generator を意図的に bypass**＝wardrobe + MOCK + Open-Meteo）・`recommendation_actions/impressions/ratings`（fashion swipe ログ・本線露出ゼロ・空時 graceful）・`reports`（drops 専用通報・targetType!=='drop' を 400 拒否）・`product_analytics`（shops 売上）・`ops_action_logs`（saved_drops/shops 監査・42P01 静黙無視）。
> **前 audit の是正**: `production-clean-rebuild-audit-20260624.md` が swipe_events/recommendation を「assembleForUser が read だから本体に残す」とした判定は、CEO 補正の過剰救済パターンそのもの＝**是正**（archive/discard へ）。

## 5. replace instead of restore（旧 schema 復活でなく置換）
| table | 置換手段 |
|---|---|
| `personality_dimensions` | migrated `stargazer_axis_snapshots`（assembleForUser L114-134 が空時 fallback 実装済） |
| `personality_insights` | 空 view/fixture/default（insights/route.ts:17 が table 不在を try/catch で空 cards に degrade） |
| `personality_sync_level` | migrated `stargazer_profiles` から導出（assembleForUser L163-181 fallback） |
| `stargazer_personality_profile` | axis-snapshot 駆動 path（profile/route.ts:486 `else if (hasAxisEvidence)` 完全 fallback） |
> 4 本とも **writer パスゼロ＝read-only legacy**。clean production 必須移植には入れない。安全のため「空 schema 残置（degrade 保険）」も選択肢だが、起動前に degrade 動作を検証すれば不要。

## 6. rows を捨ててよいもの（CEO: test data）
全 must-keep の rows（login は空 star_maps→初回観測 upsert で成立）・fashion swipe/rating 全件・analytics 集計・再生成可 cache（taste_layers_cache）・通報 rows。

## 7. 推奨 clean production 方針
**② staging 昇格 + `stargazer_star_maps` 追加**（MEMORY B-7 復旧 ②）:
1. staging（migration 274）を clean production の正本ベースに昇格（production-legacy/drift には合わせない・巻き戻し禁止）。
2. `stargazer_star_maps` を新規 migration として明文化・追加（最重要・login gate）。`profiles`/`stargazer_profiles` の staging 実在を昇格前に二重確認。
3. archive 7 + discard 3 + rendezvous 2 + replace 4 は clean production に含めない（fashion 復活せず・rendezvous 別 project・personality は fallback 代替）。
4. rows 移植せず空 table で起動。
5. **起動前検証**: personality_*/swipe_events 等を table 不在にした状態で login/baseline/profile/genome/calendar が degrade 動作することを確認（`.from()` が 42P01 で落ちないか・落ちるなら空 stub を追加 or consumer 修正）。
6. production 実体は全 backup 保存・削除しない（fashion 含む・将来再利用可能性）。

## 8. 未決（CEO 判断 / 別 GO）
- `stargazer_star_maps`/`stargazer_profiles`/`profiles` の schema 確定ソース（staging read で要確認・本書 read-only のため未接続）。
- personality_* を「空 stub 残置（degrade 保険）」とするか「完全除外」とするか（本案は除外＝replace 推奨・§7-5 検証次第）。
- production migration rehabilitation 本体（B-7）は別 CEO GO + DB owner 同席（`docs/b7-production-migration-rehabilitation-plan.md`）。
