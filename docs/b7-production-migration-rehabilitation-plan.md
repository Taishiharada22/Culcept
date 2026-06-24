# B-7 CLOSE-PLAN — production migration rehabilitation（分離案件・docs-only）

> 2026-06-24・CEO 判断で確定。**production apply / deploy は一旦停止**。本書は B-7 を「production migration rehabilitation」として**本線から分離**して記録するもの。
> **本書時点で production への apply / repair / write / db push は一切していない**（INT-10 は read-only link→確認→即 unlink のみ）。

## 0. CEO 認識（確定）
- production は現在**かなり古い legacy 環境**。最新資産は **local main / staging 側**にある。
- production を消すわけではないが、**今の正本ではない**。
- **production に合わせて最新実装を巻き戻さない**（退化させない）。
- `supabase db push` で **pending 32本を雑に流すことは絶対にしない**。
- **origin/main push もまだしない**（production deploy 回避継続）。

## 1. production migration の事実（INT-10 read-only 確認）
- production ref = `aljavfujeqcwnqryjmhl`。read-only link→`migration list`/`inspect db table-stats`→**即 unlink** で確認（write/apply ゼロ）。
- **production `schema_migrations` の最終記録適用 = `20260502100000`**。
- **記録上の pending = 32本**。production 総 table = 397。
- **History drift（記録ズレ）**: `external_anchors` / `profiles` / `stargazer_profiles` / `user_style_summary` / `external_anchor_sources` 等は **production に実在するのに該当 migration が記録上「未適用」**（過去に別経路で apply・`schema_migrations` に version 未記録）。`migration list` は記録比較のため、これらが pending 32本を膨らませている。
- **真に未適用（object 不在）**: freeze-roundup 15 table（`travel_trips`/`travel_days`/`travel_itinerary_items`/`travel_photos`/`travel_reservations`/`travel_movement_legs`/`travel_memories`/`location_notes`/`location_note_saves`/`location_note_to_itinerary`/`plan_coalter_sessions`(+participants/messages/read_cursors)/`duration_confirmations`）+ 他機能（`plan_seeds`/`prm_learning_events`/`prm_review_decisions`/`prm_model_entries`/`lifeops_structured_sources`/`plan_drift_events` 等）。
- **pending 32本の内訳** = freeze-roundup **8本** + 他機能 **24本**（layer1 基盤[drift]・user_style/stargazer prereq[drift]・external_anchors variants[drift]・calendar OAuth(ics/google/microsoft)・shift import・plan_seeds・prm 3本・lifeops_structured 等）。drift と真の未適用が混在。

## 2. freeze-roundup 8本だけの単純 apply は不可
- production の pending には freeze-roundup 8本以外の 24本（drift + 他機能）が混在。
- `supabase migration up` / `db push` は **pending を順に全適用**しようとするため、8本だけを選択的に当てる単純手順は存在しない（version 順依存 + CLI は全 pending 対象）。
- 個別 SQL を手で当てるのも、production の drift 状態を悪化させるリスク（記録と実体の乖離拡大）。

## 3. `supabase db push` 禁止理由（production）
1. **非冪等 migration × drift**：記録上未適用だが object 実在の古い migration（layer1/user_style/external_anchors 等）に、非冪等な DDL（`CREATE TABLE`(IF NOT EXISTS なし) / `ADD COLUMN`(IF NOT EXISTS なし) 等）が当たると**実行時エラーで途中失敗**し、production schema が中途半端な状態になりうる。
2. **他機能巻き込み**：freeze-roundup 以外の genuinely-pending（plan_seeds/prm/lifeops_structured/calendar/shift 等）も**同時に適用**される。これらは freeze-roundup スコープ外で、各機能の production 投入可否は別判断。
3. **scope 不明瞭な一括変更**は production リスク（ロールバック困難・影響範囲不明）。

## 4. 正本の所在（確定）
- **最新正本 = local main / integration `648be2832`（= staging 適用済みと一致）**。
- staging（`hjcrvndumgiovyfdacwc`）は migration version / table / index / unique / columns / RLS / policies / FK まで最新を反映済み（B-5 で全照合 green）。
- **production（`aljavfujeqcwnqryjmhl`）= legacy / later rehabilitation 対象**として保存（消さない・但し今の正本ではない）。
- **今後の開発 base = `648be2832`**（local main）。

## 5. 将来 production を復旧/昇格する場合の選択肢（今は実行しない）

### 選択肢 1: 旧 production を repair + backup + selective apply で rehabilitation
- 手順: ①production backup（schema + data dump）②drift の version を `migration repair --status applied <version>` で記録補完（実在 object の migration を「適用済み」に）③真に未適用のうち production に出すものを scope 確定 ④backup 後に対象のみ apply ⑤構造検証 ⑥unlink。
- **利点**: 既存 production データ（user/profiles/stargazer 等の本番資産）を保持したまま最新化。URL/ref 不変でユーザー影響最小。
- **リスク**: drift の repair は慎重な version 同定が必要（誤れば schema と記録の乖離悪化）。非冪等 migration の手当てが要る場合あり。DB owner 同席・段階適用・各 migration 検証が必須で工数大。

### 選択肢 2: staging を新 production 相当に昇格
- 手順: staging を本番運用に切り替え（DNS/env/ref を staging に向ける）or staging の schema を新環境の基準とする。
- **利点**: 最新 migration が全適用済み（clean）の staging をそのまま使えるため migration 整理が不要。
- **リスク**: staging には**本番ユーザーデータが無い**（test/dummy seed）。本番データ移行（profiles/stargazer/external_anchors 等の production 資産）を別途実施しないとユーザー消失。data migration が新たな大案件。env/ref 切替の周知も必要。

### 選択肢 3: 新 Supabase production project を clean migration history で再構築
- 手順: 新規 Supabase project 作成 → local main の全 migration を clean に `db push`（drift なしの白紙からなので順当に通る）→ 本番データを旧 production から移行 → env/ref 切替。
- **利点**: migration history が clean（drift ゼロ）で将来の保守が最も楽。最新実装が前提の綺麗な土台。
- **リスク**: 本番データ移行が必要（選択肢 2 と同様の data migration 大案件）。新 project の課金/設定/Storage/Auth 移行・ref 変更の全面切替。最も大掛かり。

### 選択肢の比較サマリ
| 選択肢 | 既存 prod データ保持 | migration 整理コスト | data 移行 | 総合リスク |
|---|---|---|---|---|
| 1 repair+selective apply | ◎ 保持 | 大（drift 同定・非冪等手当） | 不要 | 中〜大（慎重作業） |
| 2 staging 昇格 | ✕ 要移行 | なし（staging clean） | 大 | 中（data 移行が肝） |
| 3 新 project 再構築 | ✕ 要移行 | 最小（白紙 push） | 大 | 大（全面切替） |

→ **どれを採るかは CEO 判断**（本番ユーザーデータ量 / ダウンタイム許容 / 保守性の優先度で決まる）。現時点では**いずれも実行しない**（apply/repair/write/data 移行ゼロ）。

## 6. 今やらないこと（厳守）
- production への apply / repair / migration up / db push / SQL write / seed / DB write を**一切しない**。
- production への継続 link を残さない（INT-10 で unlink 済）。
- origin/main push / production deploy をしない。
- **古い production に合わせたコード巻き戻しをしない**（local main `648be2832` が正本）。

---
本書は docs-only の記録・計画。production DB への変更はゼロ。B-7 は本線（freeze-roundup 統合）から分離した独立案件として、CEO GO + DB owner 同席で将来着手する。
