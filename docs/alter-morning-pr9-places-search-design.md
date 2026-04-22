# Alter Morning — PR-9 Places Search 設計書（骨子 / Phase 0 → rev 2）

**ステータス**: rev 2（2026-04-23 CEO 承認）— commit 1 docs delta 着手
**作成日**: 2026-04-22（rev 1）/ 2026-04-23（rev 2 改訂）
**依存**: PR-8 rev 3 merge（`SearchQueryDraft` 契約 + `conversationStatus="search_handoff_blocking"` 到達条件）
**原則**: 本文書は **interface と handoff 契約のみ** を固定する。実装詳細は PR-9 本体の別 commit で詰める。

## 🎯 PR-9 冒頭 invariant（rev 2 / CEO 確定 2026-04-23）

1. **where-first**: PR-9 は where slot 専用の最小実装。ConversationStatus / reducer action / status 命名は **where 専用命名を維持**（`search_candidates_presented` / `SEARCH_CANDIDATES_PRESENTED` / `SEARCH_CANDIDATE_SELECTED` / `SEARCH_ZERO_CANDIDATES`）。汎用化（`candidates_presenting` / `SLOT_CANDIDATE_SELECTED` 等）は **禁止**。
2. **既存 Places インフラ再利用**: `placesApiClient.ts` / `placeCacheStore.ts` / `placeResolver.ts` は既に稼働中（Phase A-2 / B-1 / B-2）。PR-9 は新規構築ではなく、これらを DialogState 経路から呼ぶ adapter 層のみ追加する。
3. **candidate source 限定**: user-facing 候補列挙は `cache + places_api` のみ。既存 `placeResolver.ts` が返す `source: "web_search"` の候補は **混ぜない**。
   - 理由: fixed 昇格には `placeId / coordinates / displayName` の安定性が必要。web_search は coordinates 欠落率が高く、昇格後の map pin 描画（PR-13）が成立しない。
4. **future-proof 化は最小境界のみ**: picker component の props 形 / docs 契約の書き方 / payload の軽い余地に留め、state machine や reducer を generic にしない。slot ごとに解決方式が違う（where=外部 search / transport=推論 / who=同定 / time=範囲 / what=活動具体化）— 共通 framework 化しない。
5. **flag gate**: `ALTER_MORNING_FLAGS.placesSearch && ALTER_MORNING_FLAGS.dialogStateV2` の **AND gate**。どちらか OFF なら PR-9 経路は dead code。

---

## 0. なぜ PR-9 が必要か（北極星に対する位置づけ）

CEO 最終ビジョンは「全ての予定を map にピンでマッピング」。これを成立させるには event の `where` に **lat/lng 座標** が入っている必要がある。

座標が入る経路は 3 通り:

| 経路 | 発話例 | 使える場面 |
|------|-------|-----------|
| (a) baseline / known_base 参照 | 「自宅」「オフィス」 | baseline 登録済みのみ |
| (b) 固有名詞一意同定 | 「サドヤ」「Tully's 甲府昭和店」 | 名前で一意 |
| (c) **anchor + category/chain → 候補提示 → 選択** | 「甲府のスタバ」「駅前のカフェ」 | **圧倒的多数** |

PR-9 は (c) の経路を開く。PR-8 rev 3 で `SearchQueryDraft` が揃うまで一切動けない（依存）。

---

## 1. スコープ / 非スコープ

### IN（PR-9 本体 / rev 2）
- **既存 Places インフラを再利用する adapter 層**（`lib/alter-morning/search/placesHandoff.ts` 新設）
  - 既存 `placesApiClient.ts`（Text Search）と `placeCacheStore.ts`（L1+L2 cache）を内部で呼ぶ
  - `SearchQueryDraft` → Places Text Search query 変換（anchor + chain/category）
  - 返り値 `NormalizedPlaceCandidate[]`（既存 `PlaceCandidate` からの adapter、source が `cache` or `places_api` のもののみ通す）
- 候補 list の UI（「暫定」plan item にぶら下がる形、where 専用 picker component）
- ユーザー選択で `where.place_ref` + `where.coordinates` + `placeType="exact_proper_noun"` + `sharpness="fixed"` に昇格
- `conversationStatus`: `search_handoff_blocking` → `search_candidates_presented` → `stable` 遷移（where 専用命名維持）
- PR-8 rev 3 の `search_handoff_blocking` を **user-facing 化** する（Alter voice 準拠の短文、14-30 文字目安）
- reducer 新 action: `SEARCH_CANDIDATES_PRESENTED` / `SEARCH_CANDIDATE_SELECTED` / `SEARCH_ZERO_CANDIDATES`（全て where 専用 payload）
- flag gate: `placesSearch && dialogStateV2` AND gate

### OUT（別 PR or 本 PR で実装しない）
- 距離に基づく自動選択（ユーザー選択を常に要求）
- Stargazer / Relational によるランキング再重み付け（W2-5 以降）
- 複数候補から **Alter が推すべき 1 つ** を決める判断ロジック（次 PR）
- 徒歩/車/公共交通の所要時間計算（PR-10 transport staircase）
- **ConversationStatus / reducer action の汎用化**（where 専用命名を維持。`candidates_presenting` / `SLOT_CANDIDATE_SELECTED` 等は禁止）
- **`web_search` source の候補列挙への混入**（fixed 昇格安定性のため除外）
- 既存 `placeResolver.resolvePlace()` を **そのまま adapter 化** すること（multi-source を全部通してしまうため禁止）

---

## 2. Handoff 契約（PR-8 rev 3 → PR-9）

### 2.1 入力契約（PR-8 が保証する前提）

PR-9 の entry point が受け取る状態:

```ts
interface PR9Input {
  dialogState: DialogState;      // conversationStatus === "search_handoff_blocking"
  focus: {
    event_id: string;
    slot: "where";
    narrowStep: 2;               // 必ず terminal 手前
  };
  searchQueryDraft: {
    anchorRegion: string;        // non-null 保証
    categoryToken: string | null;
    chainToken: string | null;
    readyForHandoff: true;       // reducer が保証
  };
  session: MorningSession;
}
```

**PR-8 rev 3 の merge 条件で保証される不変条件**:
- `anchorRegion != null`（narrowStep≥1 で必ず captured）
- `categoryToken != null || chainToken != null`（narrowStep=2 で必ず一方が captured）
- `readyForHandoff === true`（reducer の auto-derivation）
- `session.dialogState.version === 1`（旧 session はこの経路に到達しない）

### 2.2 出力契約（PR-9 が返す状態）

```ts
type PR9Output =
  | {
      kind: "candidates_presented";
      dialogState: DialogState & {
        conversationStatus: "search_candidates_presented";
      };
      candidates: NormalizedPlaceCandidate[];
      message: string;  // 「3 件見つけたよ。どれにする？」等
    }
  | {
      kind: "zero_candidates";
      dialogState: DialogState & {
        conversationStatus: "clarifying";
        focus: { ...; narrowStep: 1 };  // narrowStep を 1 に戻す（地域を広げる clarify）
      };
      message: string;  // 「{anchor} で {chain} 見つからなかった。もう少し広げる？」
    }
  | {
      kind: "provider_error";
      dialogState: DialogState & {
        conversationStatus: "provider_recovering";
      };
      message: string;
    };
```

**不変条件**:
- 候補が 1 件もなければ `zero_candidates`（空配列で `candidates_presented` を返さない）
- `search_candidates_presented` は PR-9 で新規追加される state（PR-8 rev 3 には存在しない）
- API エラーは `provider_recovering` に合流（PR-8 rev 3 の復帰経路を再利用）

---

## 3. 型定義骨子

### 3.1 NormalizedPlaceCandidate

```ts
// lib/alter-morning/search/normalizedPlace.ts (PR-9)
export interface NormalizedPlaceCandidate {
  /** Places API の place_id（provider 依存、cache key） */
  placeId: string;
  /** 表示名（「スターバックス甲府駅前店」等） */
  displayName: string;
  /** 住所（市区町村以下） */
  address: string;
  /** 座標（必須、これが map pin の本体） */
  coordinates: { lat: number; lng: number };
  /** anchor 中心からの距離（m、表示ソート用） */
  distanceFromAnchor: number | null;
  /** カテゴリ（Places API types から正規化） */
  category: string | null;
  /** chain 所属（検出できた場合のみ） */
  chainToken: string | null;
  /** Places API 生データへの参照（debug / 追加情報取得用） */
  rawRef: { provider: "google_places"; placeId: string };
}
```

### 3.2 Query 変換

```ts
// lib/alter-morning/search/queryBuilder.ts (PR-9)
export function buildPlacesQuery(draft: SearchQueryDraft): PlacesQuery {
  // 優先順位:
  // 1. chainToken + anchorRegion → textSearch("スタバ 甲府")
  // 2. categoryToken + anchorRegion → textSearch("カフェ 甲府") + type filter
  // 3. anchorRegion のみ（category/chain 片方 null の補助経路）→ PR-9 では reject（PR-8 reducer の readyForHandoff=true 契約違反）
}
```

### 3.3 where slot 昇格（選択時）

ユーザーが候補を選んだ瞬間:

```ts
// commit 内で答える: legacyAdapter の新 action
type WhereResolveAction = {
  type: "WHERE_CANDIDATE_SELECTED";
  eventId: string;
  candidate: NormalizedPlaceCandidate;
};

// reducer の応答:
// - event.where.place_ref = candidate.displayName
// - event.where.coordinates = candidate.coordinates
// - event.where.placeType = "exact_proper_noun"
// - whereSharpness: vague → fixed
// - conversationStatus: "search_candidates_presented" → "stable"
// - capturedHistory に TURN_CAPTURED push（progressDelta="advanced"）
```

---

## 4. UI 構造（候補提示）

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  暫定                            │
│ ☐  08:00  スタバ [店舗暫定] コーヒー │
│   ↳ 近くの候補:                   │
│      ◉ スタバ甲府駅前店（徒歩3分） │
│      ○ スタバ甲府昭和店（徒歩8分） │
│      ○ スタバ甲府向町店（5km）    │
│      [どれでもない / 広げて探す]   │
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

**規律**:
- デフォルト選択なし（Alter は「推す」前に「出す」）
- 「どれでもない / 広げて探す」は `conversationStatus="clarifying"` に戻り narrowStep=1 から再開
- 最大 5 件まで表示（多すぎると選択負荷）

---

## 5. 不変契約 / Merge 条件

PR-9 merge 前に以下を満たす:

1. PR-8 rev 3 の `search_handoff_blocking` に到達した全ケースで PR-9 が応答する（silent drop なし）
2. 候補 0 件 → `clarifying` + narrowStep=1 回帰（無限ループ防止 = `providerFailureStreak` と別 counter で地域拡大 miss も上限）
3. ユーザー選択以外の経路で `where.coordinates` が埋まらない（LLM 判断での auto-fill 禁止）
4. `where.placeType === "exact_proper_noun"` 昇格は **このフロー経由のみ**（route.ts の直接代入禁止）
5. API エラーは `provider_recovering` 合流（PR-8 rev 3 の recovery 経路再利用、独自の retry 実装を追加しない）
6. **candidate source は `cache + places_api` のみ**。web_search source を user-facing 候補列挙に混入させない（rev 2 / CEO invariant）
7. **reducer action / ConversationStatus / status は where 専用命名を維持**。`SLOT_CANDIDATE_SELECTED` / `candidates_presenting` 等への汎用化は禁止（rev 2 / CEO invariant）
8. **flag は `placesSearch && dialogStateV2` の AND gate**。どちらか OFF なら PR-9 経路は dead code として動作（rev 2）

---

## 6. 非機能要件（rev 2）

- **API key**: `GOOGLE_MAPS_API_KEY` 環境変数（既に運用中）。server-side のみ、client 露出禁止
- **cache**: 既存 `placeCacheStore.ts` の L1 (in-memory) + L2 (Supabase) 2 層キャッシュを再利用。TTL 30 日（既存設定）
- **timeout**: 既存 `placesApiClient.ts` の挙動を踏襲。超えたら `provider_recovering` 合流（PR-8 rev 3 commit 24 latch と合流）
- **rate limit**: 既存配線が初期 beta 規模では問題化していない。PR-9 新経路でも同 cache を共有するため増加影響小。問題化時は PR-9.5 で throttle
- **flag gate**: `ALTER_MORNING_FLAGS.placesSearch && ALTER_MORNING_FLAGS.dialogStateV2` AND gate。kill switch として独立制御可

---

## 7. 参照

- `docs/alter-morning-strict-confirmation-design.md` §3.7（DialogState）/ §3.8（reducer）/ §3.9（taxonomy）
- `docs/alter-morning-roadmap.md` §1（PR 階段、PR-9 の「初めて可能になるもの」）
- `docs/alter-morning-pr10-14-interface-reservation.md`（PR-9 の後続）
