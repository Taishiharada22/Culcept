# Alter Morning — PR-9 Places Search 設計書（骨子 / Phase 0）

**ステータス**: Phase 0 骨子 — 実装未着手 / CEO レビュー待ち
**作成日**: 2026-04-22
**依存**: PR-8 rev 3 merge（`SearchQueryDraft` 契約 + `conversationStatus="search_handoff_blocking"` 到達条件）
**原則**: 本文書は **interface と handoff 契約のみ** を固定する。実装詳細（API client, cache, 距離計算）は PR-9 本体の別 commit で詰める。

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

### IN（PR-9 本体）
- Places API 呼び出し client（Google Places API / 将来は他 provider 切替可能な interface）
- `SearchQueryDraft` → Places API `textSearch` / `nearbySearch` query 変換
- 候補 list の UI（「暫定」plan item にぶら下がる形）
- ユーザー選択で `where.place_ref` + `where.coordinates` を fixed に昇格
- `conversationStatus`: `search_handoff_blocking` → `search_candidates_presented` → `stable` 遷移
- PR-8 rev 3 の `search_handoff_blocking` を **user-facing 化** する（「近くのお店探そうか？」）

### OUT（別 PR）
- 距離に基づく自動選択（ユーザー選択を常に要求）
- Stargazer / Relational によるランキング再重み付け（W2-5 以降）
- 複数候補から **Alter が推すべき 1 つ** を決める判断ロジック（次 PR）
- 徒歩/車/公共交通の所要時間計算（PR-10 transport staircase）

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

---

## 6. 非機能要件（Phase 0 メモ）

- API key は `.env` に置き、server-side のみで呼ぶ（client 露出禁止）
- cache: placeId ベースで session 内メモ化（同じ query を 2 回飛ばさない）
- timeout: 3s（超えたら provider_recovering）
- rate limit: 初期 beta ユーザー規模なら問題化しない想定。問題化した場合は PR-9.5 で cache / throttle を追加

---

## 7. 参照

- `docs/alter-morning-strict-confirmation-design.md` §3.7（DialogState）/ §3.8（reducer）/ §3.9（taxonomy）
- `docs/alter-morning-roadmap.md` §1（PR 階段、PR-9 の「初めて可能になるもの」）
- `docs/alter-morning-pr10-14-interface-reservation.md`（PR-9 の後続）
