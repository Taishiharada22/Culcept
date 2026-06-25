# R3-VERIFY — clean production minimal schema verification（2026-06-24）

> read-only / docs-only。production 非接続（staging cached snapshot + local main コード精読）。worktree=local main `1e73266ee`。
> 目的: 「`stargazer_star_maps` 1本だけ補完すれば clean production が成立するか」を最終確認。rows を移さず空起動で login/baseline/plan/genome が成立するか・fashion/personality 系を復活させない方針で落ちないかを実コードで検証。

## 0. 結論（仮説は確定）
**clean production に新規 schema として必須なのは `stargazer_star_maps` ただ 1 本。** rows 移植不要。fashion/commerce/personality-legacy/swipe 系は復活させなくても本線は落ちない（全て graceful degrade を実コードで確認）。

## 1. staging 既存 must-keep 確認（cached staging table 照合）
| table | staging | 備考 |
|---|---|---|
| profiles / stargazer_profiles / stargazer_axis_snapshots / stargazer_observations / stargazer_core_star / stargazer_orbit_snapshots | ✅ 在 | Stargazer 正本 |
| genome_connections / talk_threads / talk_messages | ✅ 在 | **genome 救済中核**（Card 交換 + Talk DM） |
| user_style_vector / face_phenotype / taste_layers_cache / pref_profile | ✅ 在 | genome physical/behavioral + My-Style |
| **stargazer_star_maps** | ❌ **不在**（migration CREATE 0・gap 該当） | **要補完（唯一）** |
| body_profile（単数） | ❌ 不在 | 但し genome graceful（§4）→ schema 不要 |

→ genome 救済の正規 schema（genome_connections/talk_threads/talk_messages + stargazer 軸 + physical/behavioral 層）は **`body_profile` 以外すべて staging 在**。

## 2. `stargazer_star_maps` consumer 検証（schema 必須・rows 不要）
- **login/baseline gate（graceful）**: `lib/baseline/requireBaseline.ts:29` は `.maybeSingle()` で star_maps を読み、`if (profile?.baseline_completed_at || starMapRow) return; redirect("/baseline")`。**table 不在でも `.maybeSingle()` は `{data:null}` を返し throw しない**→ starMapRow=null → `/baseline` へ redirect。**gate 自体は落ちない**。
- **🔴 初回観測 upsert（schema 必須の根拠）**: `app/api/stargazer/observations/route.ts:343` が `.from("stargazer_star_maps").upsert(payload,{onConflict:"user_id"})`。**table 不在だと upsert がエラー→`criticalErrors.push("star_map:...")`→L455 `return apiError("保存に失敗しました",500)`**＝ユーザーが初回観測を保存できず baseline を完了できない＝**login flow が前に進めない**。
- → **star_maps は schema 必須**（空 table で可。ユーザーが初回観測完了時に upsert で row 生成→login 成立）。**rows 移植不要**。

## 3. rows 不要で成立するか
✅ 成立。新規/空ユーザーは: 空 star_maps table → 初回観測 upsert で row 生成 → baseline 完了 → home/plan 到達。old production の rows（test data）は一切不要。

## 4. personality_* 4本 不在時の挙動（落ちない＝復活不要）
genome `lib/genome/assembleForUser.ts` が batch read 後に **null 耐性処理**:
- `personality_dimensions`: `(dimensionsRes.data || []).map()` → 不在で `[]` → さらに L62 で **`stargazer_axis_snapshots` から再構成 fallback**（migrated・データ有）。
- `personality_insights`: `(insightsRes.data || []).map()` → `[]` graceful。`insights/route.ts:17` も table 不在を try/catch で空 cards に degrade（コメント明記）。
- `personality_sync_level`: `assembleForUser` が `stargazer_profiles`(session/observation count)から導出 fallback。collabBridge `?? 0`。
- `stargazer_personality_profile`: `profile/route.ts:486` が `else if (hasAxisEvidence)` で axis-snapshot path に完全 fallback。mergeAnonymous/my-style は non-fatal。
- → **4本とも不在で 42P01 を投げず graceful degrade**（Supabase は `{data:null,error}` を返し throw しない・コードは `data||[]`/`?? x`/fallback で吸収）。**復活不要・schema 不要**。

## 5. curated_cards / recommendation_* 不在時の挙動（落ちない）
- **新 /plan calendar は curated_cards を bypass**: `app/(culcept)/plan/tabs/_calendar-outfit/`（`mockCalendarOutfit.ts` + `weatherSource.ts`(Open-Meteo) + `outfitEngineAdapter.ts` + wardrobe）で完結。`CalendarTab.tsx` は `lib/calendar/generator.ts`(curated_cards 参照)を import しない。
- `lib/calendar/generator.ts:305` の curated_cards は **旧 /calendar route 専用**（/plan 非依存）。
- recommendation_* は `/api/recommendations/*`（fashion 遺物・本線露出ゼロ）+ 空時 graceful。
- → **不在で /plan calendar は落ちない**。復活不要。

## 6. swipe_events / pre_matches / match_feedback_events 不在時の genome 挙動（落ちない）
- `assembleForUser` が `(swipeRes.data || [])` 等 + `personaGenome.ts` の null/[] 既定で処理。
- genome card / talk / profile は genome_connections/talk_*/stargazer 軸（全 staging 在）で成立。swipe 系は enrichment のみ・空で graceful。
- → **不在で genome 落ちない**。本線に戻さない方針で問題なし。

## 7. clean production に必要な最小 schema
**staging 274 migration + `stargazer_star_maps`（新規 migration 1本）**。
- genome 救済・Stargazer・login・My-Style・Calendar・Travel・LifeOps の正規 schema は staging 既存でカバー。
- `body_profile`(単数) は genome graceful（空 physical 層）ゆえ schema 不要。完全な genome physical 層が欲しい場合は **legacy `body_profile` 復活でなく consumer を migrated `user_body_profiles` へ refactor**（code 修正・任意・別タスク）。

## 8. `stargazer_star_maps` 1本で本当に足りるか
✅ **足りる**（本線の hard requirement は star_maps schema のみ）。検証で 42P01 crash 箇所は star_maps upsert を除き存在せず、他は全て graceful degrade。
- 唯一の留保: genome physical 層（body_profile）と一部 enrichment は空になる（落ちないが薄くなる）。本線体験（login/baseline/plan/Stargazer 深層観測/genome card・talk）は star_maps + staging schema で成立。

## 9. 次フェーズ: `stargazer_star_maps` idempotent migration plan（案・本書では作成しない）
- schema ソース = production の実 star_maps schema を read-only 抽出（`supabase db dump` or information_schema・別タスク）。code の upsert payload（`starMapPayload`: user_id 主・core_star/live_sky/resolved_types/dimensions 等の JSONB column）が補助根拠。
- migration 形 = `create table if not exists public.stargazer_star_maps (...)` 冪等 + owner-only RLS（兄弟 stargazer_* と同形）+ `user_id` unique（upsert onConflict）。
- 適用先 = local main / staging（昇格前）。**production への apply は B-7 rehabilitation + 別 CEO GO**。
- **本書では migration を作成・適用しない**（次フェーズ）。

## 10. 留保（CEO 判断 / 別 GO）
- star_maps schema の確定抽出（production read-only or staging 確認）。
- body_profile(単数) を genome で空許容するか `user_body_profiles` へ refactor するか。
- clean production 実構築（staging 昇格 + star_maps migration + cutover）は CEO GO + DB owner 同席。

---
本書は read-only / docs-only。production 非接続・DB write/apply/seed ゼロ・migration 作成なし。
