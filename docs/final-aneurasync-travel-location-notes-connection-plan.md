# Final Aneurasync Connection Plan — Travel Day Detail / Location Notes / Calendar 日次詳細

- **日付**: 2026-06-20
- **担当**: Build Unit（設計）／ **承認**: CEO
- **種別**: **docs-only 設計書**（本書では実装・DB migration・main 接続・Supabase 書込・写真権限・production flag ON・push/deploy を一切行わない）
- **前提**: 正本プレビューは `f356a6911` をもって **FREEZE GO（freeze close）**。本書は freeze 済みプレビューを Aneurasync 本体へ**安全に接続するための段階設計**。
- **正本（freeze 済み・接続元）**:
  - 画面: `app/(culcept)/calendar/_components/travel/`（Concierge Dashboard 7画面＋ `locationNotes/` 9タブ＋ `LocationDetailSheet`）
  - 状態: `app/(culcept)/calendar/_components/travel/state/ItineraryContext.tsx`
  - データ/型: `app/(culcept)/calendar/_lib/travel/{types,sampleTrip,locationNotesData,itineraryConvert,flags}.ts`
  - 導線: `CalendarPageClient.tsx`（`isTravelDayDetailEnabled()` gate）／ `DayDetailSheet.tsx`（「旅の詳細を見る」）／ 検証ルート `app/stargazer-travel-preview/page.tsx`（`notFound()` gate 済）
- **規約準拠**: Supabase RLS は **owner-only `auth.uid() = user_id`**（select/insert/update/delete の4ポリシー・service_role 非前提・cross-user 不可。例: `supabase/migrations/20260611130000_create_lifeops_structured_sources.sql`）。migration 命名 `YYYYMMDDHHMMSS_description.sql`。正本データは `lib/shared/` パターン（正本のみ・UIロジック禁止）に倣う。

## スコープ
**対象**: Calendar 日次詳細 / Travel Day Detail / Itinerary・Reservations・Budget・Move・Meal・Memories / Location Notes / 旅程追加 / 保存 / 写真 / 旅行後 Memory 化。
**対象外**: Stargazer 全体・Rendezvous・Alter/Plan 本流の大改造・production deploy・DB migration 実行・main 本接続実装。

---

## 1. 接続フェーズ分解（A→G）

各フェーズは**前フェーズ完了＋ゲート通過**を条件に進む。B までは DB 不要（migration ゲート前）。C 以降は migration/production 再開ゲートが要る。

### Phase A — preview freeze close 後の準備（DB 不要）
- 目的: 接続の足場固め。**コード変更は最小**（抽象境界の用意のみ）。
- 作業:
  - A-1: `ItineraryContext` の内部を **Repository インターフェース**越しに読むよう薄く整形（§3）。公開フック `useTravelItinerary` / `useMergedSchedule` のシグネチャは不変。
  - A-2: Location Notes の local state（`savedIds` / `userItems`）も同様に **Saved / Notes Repository** インターフェース化（実装は当面 in-memory）。
  - A-3: fixture アクセス（`getSampleTripDay` / `getLocationNotes`）を **DataSource 境界**でラップ（実体は fixture のまま）。
  - A-4: 本書のデータモデル（§2）を確定し CEO レビュー。
- 完了判定: 公開 API 不変・tsc 0・既存プレビュー挙動不変。

### Phase B — localStorage 接続（DB 不要・最小スコープ・推奨着手点）
- 目的: 保存(heart) と 旅程追加 と AddView 下書き/投稿を **端末内で永続化**。reload を跨いで残る。
- 作業:
  - B-1: `LocalStorageItineraryRepo` / `LocalStorageSavedRepo` / `LocalStorageNotesRepo` を実装し、Provider が flag/env で in-memory↔local を選択。
  - B-2: versioned key（例 `aneurasync.travel.itinerary.v1` / `…saved.v1` / `…notes.v1`）。AddView の下書きキー `aneurasync.travel.locationNotes.draft.v2` は既存流用。
  - B-3: SSR 安全（lazy initializer＋try/catch）・容量超過時 fail-soft。
- 非対象: 写真 binary は localStorage に置かない（objectURL は揮発のまま。永続は Phase F）。
- ゲート: なし（DB・auth・production 不要）。**ここまでは即着手可**。

### Phase C — Supabase schema docs（設計のみ・適用しない）
- 目的: §2 のテーブル群を **migration ドラフト文書**として確定（DDL は docs に置くが**作成・適用はしない**）。
- 作業: テーブル定義・FK・index・RLS（owner-only）・enum を文書化し、CEO/Build で schema レビュー。
- ゲート: **migration 適用は別ゲート**（§8 G-DB）。本フェーズは紙上のみ。

### Phase D — local DB dry-run（ローカル Supabase のみ・production 非対象）
- 目的: ローカル Supabase（`supabase start`）で schema を**ローカル限定**適用し、Repository の Supabase 実装を結線して dry-run。
- 作業: `SupabaseItineraryRepo` 等を local Supabase に対して動作確認（RLS・楽観更新・rollback）。fixture とのデータ整合を検証。
- 制約: **production への migration/接続は行わない**。あくまで開発機の検証。
- ゲート: schema レビュー承認（Phase C）＋ローカル環境のみ。

### Phase E — Calendar 本接続（dev/flag ON 限定）
- 目的: Calendar の特定日 → 実データの `TravelDayDetail` を開く（§4）。
- 作業:
  - E-1: `getTravelDayForDate(userId, date)` を DataSource 経由で実装（travel_trips/days/itinerary_items 等を合成）。fixture fallback は dev 限定で残す。
  - E-2: `CalendarPageClient` の `onOpenTravel` を「旅行日のみ有効」に（§4 判定）。flag/gate 維持。
- ゲート: Phase D 完了＋dev 限定（production flag は依然 OFF）。

### Phase F — 写真 / Memory 化（§6・§7）
- 目的: 手動アップロード→撮影時刻候補→位置情報候補→自動挿入 の段階導入と、旅行後 Memory 化。
- 作業: travel_photos（Supabase Storage）と travel_memories の結線、PhotoSlot の source 表示活用、Memory Detail 化（§4-旅行後）。
- ゲート: 写真権限ゲート（§8）・Storage RLS・Phase E 完了。

### Phase G — Location Notes 投稿・共有化
- 目的: ＋投稿の永続化と、（将来）他ユーザーへの共有・公開。
- 作業: location_notes の owner-only 永続（自分の投稿）→ 共有可視性導入時に moderation/visibility 設計（§8）。
- ゲート: moderation・source trust・privacy ゲート（共有を始める時のみ）。owner-only の自分メモ永続は Phase D/E と同等ゲート。

---

## 2. データモデル案（設計のみ・未適用）

> 以下 DDL は**設計の表現**であり、本タスクでは migration 作成も適用もしない。全テーブル **RLS owner-only**（`auth.uid() = user_id`・select/insert/update/delete 4ポリシー）。`id uuid default gen_random_uuid()`、`user_id uuid not null references auth.users`、`created_at/updated_at timestamptz default now()` を共通とする。

### 2.1 `travel_trips` — 旅（Trip 正本）
- 対応: `types.ts` `Trip`。
- 主キー列: `title`, `destination_label`, `start_date date`, `end_date date`, `party_size int`, `status`（planned/active/archived）。
- 用途: Calendar の旅行日判定の親。

### 2.2 `travel_days` — 旅の1日（TripDay 正本）
- 対応: `TripDay`。`trip_id → travel_trips`, `date date`, `day_index int`, `theme text`, `theme_subtitle`, `weather jsonb`, `hero_photo_id → travel_photos`（nullable）, `walking jsonb`。
- 制約: `unique(user_id, date)`（1日1旅行日）。Calendar は `date` で引く。

### 2.3 `travel_itinerary_items` — 旅程項目（ScheduleItem 正本）
- 対応: `ScheduleItem`。`day_id → travel_days`, `start_time text`(空=未定枠), `end_time`, `name`, `subtitle`, `categories text[]`, `description`, `duration_min int`, `photo_id`, `coords jsonb`, `address`, `reservation_id → travel_reservations`(nullable), `sort_order int`, `source_kind`（fixture/user_added/imported）, `source_location_note_id`（追加元・nullable）。
- 用途: `useMergedSchedule` の実体。「旅程に追加」はここへ insert（§3）。

### 2.4 `travel_movement_legs` — 移動区間（MoveLeg / TransportLeg 正本）
- 対応: `MoveLeg` / `DayMove`。`day_id → travel_days`, `time`, `endpoint_kind`(depart/arrive), `name`, `sub`, `mode`, `mode_label`, `duration_text`, `distance_text`, `fare_text`, `is_destination bool`, `sort_order`。
- 用途: Move 画面・スケジュール間コネクタ。

### 2.5 `travel_reservations` — 予約（Reservation 正本）
- 対応: `Reservation`。`day_id → travel_days`(nullable), `trip_id`, `category`(宿泊/食事/交通/体験), `name`, `status`, `confirmation_code`, `time_label`, `address`, `phone`, `changeable bool`, `needs_action bool`, `tags jsonb`, 交通/宿泊用列（transit_*, check_in/out, party_size, seat）, `actions jsonb`, `coords jsonb`, `photo_id`。
- 注意: `actions[].url` は提供時のみ（捏造リンク禁止＝honesty 維持）。

### 2.6 `location_notes` — ロケーションノート（LocationItem 正本）
- 対応: `LocationItem`。`kind`(trip/spot), `prefecture`, `title`, `area_label`, `classification`(classic/hidden/standard), `source_type`（§5）, `author jsonb`, `genre`, `theme_keys text[]`, `tags text[]`, `rating numeric`, `rating_count int`, `description`, `photo_id`, `duration_label`, `spot_count`, `stops text[]`, `hours`, `price_level`, `why_special`, `why_hidden`, `tagline`, `match_pct`, `match_reasons text[]`, `visibility`（private/shared/public・既定 private）, `moderation_status`（pending/approved/rejected・shared 以上で使用）。
- RLS: owner-only（自分の投稿）。**共有/公開は visibility＋moderation で別途**（§8）。Match 等の「他者ノート閲覧」は将来の公開 feed 設計時に read policy を拡張。

### 2.7 `location_note_saves` — 保存(heart)
- `location_note_id → location_notes`, `unique(user_id, location_note_id)`。heart トグルの正本。owner-only。

### 2.8 `location_note_to_itinerary` — ノート→旅程 追加履歴
- `location_note_id`, `itinerary_item_id → travel_itinerary_items`, `day_id`, `unique(user_id, location_note_id, day_id)`（重複追加ガード＝現 `hasAdded` の DB 版）。owner-only。

### 2.9 `travel_photos` — 写真メタ（TravelPhoto 正本）
- 対応: `TravelPhoto`。`source`（auto/user/placeholder・既存 enum）, `storage_path`（Supabase Storage・user 写真時）, `url`（外部/署名URL）, `label`, `tone`, `captured_at timestamptz`(撮影時刻候補用), `caption`, `coords jsonb`(位置候補用), `linked_kind`(day_hero/itinerary/reservation/memory/note), `linked_id`。
- binary は **Supabase Storage**（owner-only バケット）。`placeholder` は path/url なし＝blank/サンプル維持。

### 2.10 `travel_memories` — 旅の思い出（MemoriesNote 正本＋旅行後拡張）
- 対応: `MemoriesNote` ＋旅行後。`day_id`/`trip_id`, `text`, `photo_ids uuid[]`, `summary`（旅行後 AI 要約・任意）, `highlights jsonb`, `next_learnings jsonb`（次回学習）, `phase`（before/during/after）, `origin_synced bool`（Origin/Memory 反映済みフラグ）。
- owner-only。`origin_synced` は Stargazer Origin/Memory への反映ハンドオフ点（§7・実装は対象外）。

---

## 3. Provider 差し替え設計（消費側を変えない）

### 現状（freeze 済み）
`ItineraryContext.tsx`：`useState<AddedEntry[]>` を内部に持ち、公開は
`useTravelItinerary() = { addedItems, addedCount, addToItinerary(item):boolean, removeAdded(sourceId), hasAdded(sourceId) }` と `useMergedSchedule(day): ScheduleItem[]`。
消費側（`ConciergeDashboard` / `ScheduleDetailScreen` / `LocationNotesScreen` / `LocationDetailSheet`）はこの公開 API のみに依存。

### 差し替え方針 — Repository 注入（公開フック不変）
1. **Repository インターフェース**を定義（UI 非依存・`lib/shared` 流儀）:
   ```ts
   interface ItineraryRepository {
     list(dayId: string): Promise<ScheduleItem[]> | ScheduleItem[];
     add(dayId: string, item: LocationItem): Promise<{ ok: boolean }> | { ok: boolean };
     remove(dayId: string, sourceId: string): Promise<void> | void;
   }
   ```
2. 実装を段階交換（Provider が flag/env で選択）:
   - `InMemoryItineraryRepo`（現状・Phase A/B 既定）
   - `LocalStorageItineraryRepo`（Phase B）
   - `SupabaseItineraryRepo`（Phase D/E・react-query で fetch/mutation）
3. **`useTravelItinerary` / `useMergedSchedule` のシグネチャは不変**。内部で repo を呼ぶだけ。→ **消費側ゼロ改修**。
4. 同期/非同期両対応: 公開フックの戻りは現状同期。Supabase 化時は内部キャッシュ（react-query）で**同期的な現在値**を返し、mutation は背後で非同期化（UI は楽観値を即時表示）。

### optimistic update / rollback / error toast
- `addToItinerary(item)`: ①即 optimistic に `addedItems` へ反映＋`hasAdded` true（現挙動と同じ体感）→ ②背後で repo.add → ③失敗時は optimistic を rollback し `onToast("旅程への追加に失敗しました", info)`（既存 shared toast＝成功/情報出し分けを流用）。
- `toggleSave` / `removeAdded` も同型（optimistic→失敗 rollback→toast）。
- 重複は repo 側 unique 制約＋クライアント `hasAdded` の二重ガード。
- 変換責務は `itineraryConvert.ts`（`locationItemToScheduleItem`）に集約済み＝LocationItem→travel_itinerary_items の DTO 変換もここを正本に。

### Saved / Notes も同型
`SavedRepository`（heart）・`NotesRepository`（Location Notes 取得＋＋投稿）を同じ注入パターンで。`LocationNotesScreen` の `savedIds` / `userItems` を repo 経由に置換（公開 props 不変）。

---

## 4. Calendar 接続設計

### 旅行日判定
- `getTravelDayForDate(userId, date): { trip, day } | null`
  - 実装: `travel_days` を `unique(user_id, date)` で引き、親 `travel_trips` を join。なければ null（通常日）。
  - dev fallback: 実データ無し かつ dev/flag ON のとき `getSampleTripDay(date)`（fixture）を返す。**production は fixture を返さない**。
- Calendar セルに **旅行日マーカー**（trip があれば小バッジ）。

### 旅行がある日だけ TravelDayDetail を開く
- `CalendarPageClient`：`onOpenTravel = isTravelDayDetailEnabled() && travelDay ? () => open : undefined`。
- `DayDetailSheet`「旅の詳細を見る」は `travelDay != null` のときのみ表示。通常日は従来の日次詳細のまま（退行ゼロ）。

### 旅行前/中/後で表示を変える（dayPhase）
- `dayPhase(date, today) = before | during | after`（trip の期間と today の比較）。
  - **before（しおり）**: 予定中心の Concierge Dashboard（現状）。「旅程に追加」「保存」活性。
  - **during（行動支援）**: 今日の行程・移動・予約・予算をライブ表示（現状の Dashboard/Schedule）。
  - **after（Memory）**: `travel_memories` があれば **Memory Detail** に変化（写真・要約・思い出・次回学習）。Concierge Dashboard ではなく回想ビュー。
- Memory Detail は §7 で定義。Dashboard 7画面の資産（PhotoSlot/カード/トークン）を流用。

### fixture fallback をどこまで残すか
- **dev/flag ON のみ** fixture fallback を残す（dogfood・デモ）。
- **production / flag OFF** は実データのみ。実データ無し＝旅行日でない（通常日）。
- 検証ルート `/stargazer-travel-preview` は引き続き `notFound()` gate（dev 限定）。

---

## 5. Location Notes 接続設計

### タブ＝location_notes へのクエリ（VIEW 的取得）
全タブは `location_notes`（＋ `location_note_saves` / `location_note_to_itinerary`）への **prefecture フィルタ＋ソート/分類** で表現。`getLocationNotes(prefecture)` を DataSource 経由に置換。
- **都道府県**: `prefecture` で絞り込み（現状の追従挙動を DB 化）。都道府県マスタは静的参照（`lib/shared/location.ts` / `municipalityData.ts` と整合）。データ未整備県は空状態（現挙動維持）。
- **Match**: パーソナライズ・ランキング。初期は `rating`/`rating_count`/recency の決定的順、将来 Stargazer 嗜好シグナルで重み付け（嗜好の参照のみ・Stargazer 改造はしない）。`match_pct`/`match_reasons` は当面 fixture→後で算出。
- **旅行 / スポット**: `kind` で分割。各タブ内「地元民から / 旅行者から」は `source_type` でセクション分割（現挙動）。
- **王道 / 穴場**: `classification`(classic/hidden) で抽出。
- **テーマ**: `theme_keys` 配列でフィルタ＋「あなたにも合うテーマ」関連。
- **検索**: `title/area/genre/tags/author` への部分一致（初期はクライアント、規模拡大時に Postgres FTS）。
- **＋投稿**: `location_notes` へ insert（owner-only）。AddView の項目（提供者/タイプ/区分/時間帯/ルート/タグ/写真）をそのままマッピング。投稿直後は自分のノートとして即表示（optimistic）。

### source type
`source_type enum`: `local`（地元民）/ `traveler`（旅行者）/ `book`（本）/ `sns`（SNS）/ `search`（検索）/ `self_memo`（自分メモ）。
- 現 UI の `LocationSource`(local/traveler) を拡張。表示バッジ・「人気の情報ソース」セクションと整合。
- **source trust**（§8）: source_type ごとに信頼度メタを持たせ、共有 feed 化時のランキング/表示に反映（自分メモは自分のみ可視）。

### 可視性
- 既定 **private（owner-only）**。「保存」「旅程に追加」「自分メモ」は private で完結＝Phase D/E ゲートで可。
- **共有/公開（shared/public）**は moderation＋visibility＋source trust のゲート通過後（Phase G の後半）。Match 等で他者ノートを見せるのは公開 feed 設計が要る。

---

## 6. 写真設計（blank 方針維持）

`TravelPhoto.source`（auto/user/placeholder）と `captured_at`/`coords` は freeze 済み型に既にある＝段階導入は型変更なしで可能。

1. **手動アップロード（Phase F-1）**: PhotoSlot の「＋写真を追加」→ファイル選択→Supabase Storage（owner-only）→ `travel_photos(source=user, storage_path)`。現 AddView は objectURL プレビューのみ＝ここで実アップロードに差し替え。
2. **撮影時刻ベース候補（F-2）**: ユーザー許可のうえ、`captured_at` を旅程項目の時刻帯と突き合わせ「この時間の写真」を**候補提示**（自動挿入はしない・ユーザー確定）。
3. **位置情報許可ベース候補（F-3）**: `coords` と訪問地の近接で候補精度向上（**位置権限ゲート**§8）。
4. **自動挿入（F-4）**: 高信頼候補のみ `source=auto` の**下書き**として挿入（ユーザーが差し替え/削除可）。最終確定は常にユーザー。
5. **blank 方針**: 候補が無い枠は無理に埋めず「＋写真を追加」blank のまま。placeholder は「サンプル」印で実写真と区別（honesty）。

---

## 7. Memory 化

### 旅程フェーズ
- **旅行前＝しおり**: 保存・旅程・予約・予算の計画。`location_note_saves` と `travel_itinerary_items` が中心。
- **旅行中＝今日の行動支援**: 当日の行程/移動/予約/予算/MEAL をライブ表示（現 Dashboard/Schedule/Move/Budget/Meal）。
- **旅行後＝Memory**: `travel_memories` に 写真・要約・思い出・次回学習 を蓄積。Calendar の after 日は **Memory Detail** へ変化（§4）。

### Memory Detail（after ビュー）
- 構成: ヒーロー（その日の代表写真）＋タイムライン回想（行程＋写真）＋ `summary`（任意 AI 要約）＋ `highlights` ＋ `next_learnings`。
- 資産流用: PhotoSlot・cards・ConciergeHeader・トークン。新規 UI は最小。

### Origin / Memory への反映（ハンドオフのみ・本書では実装しない）
- 旅行後の `travel_memories`（嗜好・行動・満足度の手がかり）を **Stargazer Origin/Memory へイベントで反映**する接点を `origin_synced` フラグで管理。
- 反映ロジック自体は **Stargazer 側の責務＝対象外**。本接続では「travel_memories を Origin が consume できる形で置く」までを設計に含め、実装はしない。
- 既存メモの「Origin signals cron（CEO 判断待ち）」と整合させる（cron 設計は別決裁）。

---

## 8. リスクとゲート

| 項目 | リスク | ゲート / 緩和 |
|---|---|---|
| **privacy** | 旅程・予約・写真・位置は機微情報 | 全テーブル RLS owner-only。位置/写真は明示許可。共有は既定 OFF |
| **RLS** | cross-user 漏洩 | `auth.uid() = user_id` 4ポリシー徹底（house 規約）。service_role 非前提。Storage も owner-only バケット |
| **投稿 moderation** | 共有ノートの不適切投稿 | private 既定。shared/public 化は `moderation_status` 必須＋審査フロー設計後のみ |
| **source trust** | 出典の信頼差（SNS/本/地元民/自分メモ） | `source_type` メタ＋trust 重み。自分メモは自分のみ可視 |
| **写真権限** | カメラロール/位置の許可 | F-2/F-3 で都度許可。未許可は手動のみ。blank 維持 |
| **migration** | 破壊的スキーマ変更 | **G-DB ゲート**: schema レビュー承認＋ローカル dry-run（Phase D）通過まで production migration 禁止 |
| **production flag** | 想定外の本番露出 | `isTravelDayDetailEnabled()` は production hard block 維持。flag ON は CEO 別決裁 |
| **push / deploy** | 早期公開 | GitHub suspended（local only）解除後のみ。本書は push/PR/deploy を含まない |

### 主要ゲート（明文）
- **G-DB（DB に進む前のゲート）**: §2 schema の CEO レビュー承認 ＋ RLS/owner-only 設計承認 ＋ privacy/moderation 方針決定 ＋ ローカル Supabase dry-run（Phase D）成功 ＋ GitHub/production 再開。**いずれか未達なら migration 適用へ進まない**。
- **G-PHOTO**: 写真権限・Storage RLS・自動挿入の honesty（自動は下書き止まり）方針の承認。
- **G-SHARE**: Location Notes を private 超で共有する時のみ。moderation＋visibility＋source trust の実装承認。
- **G-PROD**: production flag ON / deploy は本書スコープ外・CEO 別決裁。

---

## 9. サマリ

### 接続フェーズ一覧
- **A** preview freeze close 後の準備（抽象境界・DB 不要）
- **B** localStorage 接続（保存/旅程/下書き永続・DB 不要）★最小着手点
- **C** Supabase schema docs（設計のみ・未適用）
- **D** local DB dry-run（ローカル Supabase のみ）
- **E** Calendar 本接続（dev/flag ON 限定）
- **F** 写真 / Memory 化
- **G** Location Notes 投稿・共有化

### 最初に実装してよい最小スコープ
**Phase B（localStorage 接続）**。理由: migration・auth・production・写真権限が**一切不要**で、freeze 済み UX を壊さず、「保存」「旅程に追加」「AddView 下書き/投稿」を reload を跨いで永続化でき、Repository 注入（§3）の動作実証になる。公開フック不変＝消費側ゼロ改修。次点で Phase A（抽象境界の整形）を B と同時または直前に。

### DB に進む前のゲート（G-DB）
1. §2 データモデルの CEO/Build schema レビュー承認
2. RLS owner-only（`auth.uid()=user_id`・4ポリシー）設計承認
3. privacy / moderation / source trust 方針の決定
4. ローカル Supabase での dry-run（Phase D）成功・fixture 整合確認
5. GitHub/production 再開（現 suspended）
- 上記すべて充足まで **migration 作成・適用、main 接続、Supabase 書込は行わない**。

---

## 10. 付録 — 参照
- freeze 監査: `docs/product-freeze-audit-travel-day-detail.md`（判定 FREEZE GO・`f356a6911`）
- 正本コード: `app/(culcept)/calendar/_components/travel/`・`_lib/travel/`・`state/ItineraryContext.tsx`
- 規約: `supabase/migrations/20260611130000_create_lifeops_structured_sources.sql`（RLS 例）、`lib/shared/`（正本パターン）
- 関連メモリ: `project_travel-concierge-preview`、`project_shared-style-domain`、`project_github-suspended-local-only`、`project_travel-mode-direction`
