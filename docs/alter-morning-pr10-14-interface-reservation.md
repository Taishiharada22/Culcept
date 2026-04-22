# Alter Morning — PR-10〜14 Interface Reservation（Phase 0）

**ステータス**: Phase 0 型予約のみ — 実装禁止 / CEO レビュー待ち
**作成日**: 2026-04-22
**目的**: PR-8 rev 3 / PR-9 が参照すべき **後続 PR の型と handoff 契約** を予約する。PR-8/PR-9 実装中に「PR-10 以降の型が見えない」ことで手戻りが起きないように。
**原則**: 本文書で定義した型は **interface のみ**。実装は当該 PR で行う。各 PR の冒頭 commit で本文書が参照される。

---

## 0. PR 階段（北極星まで）

| PR | 初めて可能になるもの | 入力契約 | 出力契約 |
|----|-------------------|---------|---------|
| PR-10 transport | event 間に移動手段 + 経路 | 2 event の coordinates（PR-9） | `TransportSegment` が event 間に挿入される |
| PR-11 who | 「A さん」の正規化 | event.who 生文字列 | `PersonRef` への同定 |
| PR-12 end time | 時間点 → 時間区間 | event.when.startTime | event.when.endTime が確定 |
| PR-13 map pin | 地図に pin が立つ | 全 event の coordinates | Map UI に `MapPin[]` が描画 |
| PR-14 timeline | 1 日の流れが 1 画面 | PR-13 描画層 + PR-10 経路データ | Timeline UI に区間 + 連結線 |

---

## 1. PR-10 — Transport Staircase

### 1.1 型

```ts
// lib/alter-morning/transport/types.ts (PR-10)
export type TransportMode =
  | "walk"
  | "car"
  | "public_transit"
  | "bicycle"
  | "taxi"
  | "unknown";

export interface TransportSegment {
  /** この segment の前の event */
  fromEventId: string;
  /** この segment の後の event */
  toEventId: string;
  /** 移動手段（LLM 推論 or ユーザー明示 or default） */
  mode: TransportMode;
  /** 経路推定所要時間（分） */
  estimatedDurationMin: number | null;
  /** 距離（m、Routes API 由来 or 直線距離概算） */
  distanceM: number | null;
  /** 確定度 */
  confidence: "explicit_user" | "route_api" | "inferred" | "default";
  /** 推定ソース（analytics / debug） */
  source: "user_utterance" | "routes_api" | "distance_heuristic" | "default_walk";
}
```

### 1.2 Handoff

- **入力**: `fromEvent.where.coordinates` + `toEvent.where.coordinates`（PR-9 完了が前提）
- **出力**: `MorningPlan.items` に `kind: "travel"` item が挿入（既存 kind 活用、新 kind 追加しない）
- **DialogState 連動**: ユーザーが「車で移動」と発話した場合 `conversationStatus` に `asking_transport` は作らない。transport は clarify 対象にしない（雑音源になる）。default+LLM 推論+ユーザー明示の3系統で埋める

### 1.3 OUT（非スコープ）

- 経路最適化（ランチの場所を移動時間で選ぶ等）— 将来の別 PR
- リアルタイム交通情報（電車遅延）— 将来検討

---

## 2. PR-11 — Who Staircase

### 2.1 型

```ts
// lib/alter-morning/who/types.ts (PR-11)
export interface PersonRef {
  /** 一意 ID（user scope、別ユーザーとは共有しない） */
  personId: string;
  /** 正規化された表示名（「A さん」「お母さん」等） */
  canonicalName: string;
  /** 別名（発話揺れ: 「A ちゃん」「A」等） */
  aliases: string[];
  /** 関係ラベル（任意、family / friend / colleague 等） */
  relation: string | null;
  /** cross-session 参照可能か（session ローカル or persistent） */
  scope: "session" | "persistent";
  /** 作成元 session */
  createdInSession: string;
}

export interface PersonRefExtraction {
  /** 抽出文字列（「A さんと」） */
  rawMention: string;
  /** 正規化された candidate ref（既存 match or 新規） */
  resolved: PersonRef | null;
  /** 一致確信度 */
  confidence: "exact" | "fuzzy" | "new";
}
```

### 1.2 Handoff

- **入力**: `event.who[]` の生文字列（現在はここに「A さん」等の string が直接入る）
- **出力**: `event.who[]: PersonRef[]`（型変更 → breaking、rev 3 で予約した type migration と同様に version bump で対応）
- **DialogState 連動**: fuzzy match が複数当たった場合のみ clarify を立てる（「A さんって、前言ってた A さん？それとも別の？」）

### 1.3 OUT

- Rendezvous 側の人物と接続（relation bridge）— 将来、CEO 判断
- 会社組織情報との紐付け — 対象外

### 1.4 独立性

PR-11 は PR-9 / PR-10 / PR-12 と **直交**。where / when に依存しない。PR-9 と並行実装可能（roadmap §2.2）。

---

## 3. PR-12 — End Time Staircase

### 3.1 型

既存の `WhenSlot` に endTime を追加:

```ts
// lib/alter-morning/comprehension/eventSchema.ts (PR-12 で拡張)
export interface WhenSlot {
  startTime: string | null;      // HH:mm、既存
  endTime: string | null;         // ★ PR-12 追加 — HH:mm
  timeHint: TimeHint | null;      // 既存
  durationMin: number | null;     // ★ PR-12 追加 — 明示されない場合の推定
  provenance: Provenance;
}
```

### 3.2 Sharpness 拡張

```ts
// compute*Sharpness を拡張、新規 fn ではなく既存を rev up
export function computeWhenSharpness(when: WhenSlot): SlotSharpness {
  // PR-12 後の規則:
  // - startTime && endTime        → fixed
  // - startTime && durationMin    → fixed（endTime は計算で埋める）
  // - startTime のみ              → vague（point only、区間なし）★ rev up
  // - timeHint のみ               → vague
  // - どれもなし                   → missing
}
```

### 3.3 Handoff

- **入力**: 既存 `startTime`
- **出力**: `endTime` or `durationMin` の確定
- **DialogState 連動**: staircase は不要（where のように narrowStep を増やさない）。初回発話 or 明示 clarify のみ
- **blocking 拡張**: `whenSharpness="vague"` が `startTime のみ` ケースで blocking となる（改訂 3 blockingSlots 改訂）

### 3.4 後方互換

PR-12 merge 前に startTime のみで plan 昇格していた event は、PR-12 merge 時点で **blocking** 扱いになる。session schema version bump + reset で処理（rev 3 と同じ戦略）。

---

## 4. PR-13 — Map Pin Rendering

### 4.1 型

```ts
// lib/alter-morning/map/types.ts (PR-13)
export interface MapPin {
  /** 対応する event */
  eventId: string;
  /** 座標（PR-9 で埋まったもの） */
  coordinates: { lat: number; lng: number };
  /** 表示ラベル（時刻 + 活動の短縮） */
  label: string;
  /** 時系列順序（1 始まり、sequenceIndex と同じ） */
  ordinal: number;
  /** 色 / アイコン（activity カテゴリ由来、Zone color system 準拠） */
  visualStyle: {
    color: string;
    iconKind: "work" | "meal" | "leisure" | "move" | "meeting" | "other";
  };
  /** confirmationState（PR-8 rev 1 由来、暫定 pin は薄く） */
  confirmationState: "confirmed" | "provisional" | "needs_answer";
}

export interface MapRenderData {
  pins: MapPin[];
  /** PR-10 の transport segment を map 上に線で描画するためのデータ */
  polylines: Array<{
    fromPinOrdinal: number;
    toPinOrdinal: number;
    mode: TransportMode;
  }>;
  /** 地図の初期 view（全 pin が入る bbox） */
  initialBounds: { north: number; south: number; east: number; west: number };
}
```

### 4.2 Handoff

- **入力**: 全 event が coordinates を持つ状態（PR-9 完了後）
- **出力**: Map UI が `MapRenderData` を受けて描画
- **DialogState 連動**: map 上で pin をタップ → 対応 event の clarify に focus 移動（逆方向フロー、PR-14 で timeline 連動）

### 4.3 OUT

- ピンのドラッグ移動で場所修正 — 将来
- 周辺情報レイヤ（駅, POI）— 将来
- 経路ナビ起動（Google Maps app への intent）— 将来

---

## 5. PR-14 — Timeline UI

### 5.1 型

```ts
// lib/alter-morning/timeline/types.ts (PR-14)
export interface TimelineSegment {
  kind: "event" | "travel" | "gap";
  eventId: string | null;         // kind="event" | "travel" のみ
  startTime: string;              // HH:mm
  endTime: string;                // HH:mm（PR-12 で必須化）
  durationMin: number;
  label: string;
  visualStyle: {
    color: string;
    opacity: number;              // confirmationState で変化
  };
}

export interface TimelineRenderData {
  segments: TimelineSegment[];
  /** 1 日の開始 / 終了時刻（描画範囲） */
  dayWindow: { start: string; end: string };
  /** event 間の連結線 UI（PR-10 transport + PR-9 coordinates 両方必要） */
  transportBadges: Array<{
    fromSegmentIndex: number;
    toSegmentIndex: number;
    mode: TransportMode;
    durationMin: number;
  }>;
}
```

### 5.2 Handoff

- **入力**: PR-13 の `MapRenderData`（pin と polyline）+ PR-12 の endTime
- **出力**: Timeline + Map 2 面 UI（map と timeline が同期）
- **DialogState 連動**: timeline 上で segment タップ → map pin ハイライト（双方向）

### 5.3 OUT

- 他ユーザーとの共有 schedule 表示 — Rendezvous 側
- 過去 日の timeline 振り返り — 将来別画面

---

## 6. 依存関係 Matrix

| 型 / 機能 | 依存する PR |
|----------|-----------|
| `TransportSegment` | PR-9（coordinates） |
| `PersonRef` | なし（独立） |
| `WhenSlot.endTime` | なし（独立） |
| `MapPin` | PR-9（coordinates） |
| `MapRenderData.polylines` | PR-10（TransportSegment.mode） |
| `TimelineRenderData.transportBadges` | PR-10 + PR-12 |
| Map × Timeline 連動 | PR-13 + PR-14 |

---

## 7. 型の凍結規則

本文書で予約した型は **PR-8 rev 3 merge 時点で `lib/alter-morning/` に空 interface として landing** する（実装コードは throw `new Error("reserved")`）。これにより:

- PR-8/PR-9 実装中に import path が見える
- 後続 PR で interface 変更が必要になった場合、本文書の rev up が必須
- interface 変更なしで実装できた PR はスムーズに merge、変更が必要なら design 層で議論

landing 先（PR-8 rev 3 commit 13 の範囲）:

```
lib/alter-morning/
├── dialog/              (PR-8 rev 3 本体)
│   ├── dialogState.ts
│   ├── reducer.ts
│   ├── taxonomy.ts
│   └── derivePendingClarify.ts
├── search/              (PR-9 予約)
│   └── types.ts         (NormalizedPlaceCandidate 型のみ)
├── transport/           (PR-10 予約)
│   └── types.ts
├── who/                 (PR-11 予約)
│   └── types.ts
├── map/                 (PR-13 予約)
│   └── types.ts
└── timeline/            (PR-14 予約)
    └── types.ts
```

各 `types.ts` は **型定義のみ**。関数 export 禁止、class 禁止。これで互換性維持が型検査で保証される。

---

## 8. 参照

- `docs/alter-morning-strict-confirmation-design.md`（PR-8 rev 3、§3.7 以降）
- `docs/alter-morning-roadmap.md`（北極星 + PR 階段 + 依存）
- `docs/alter-morning-pr9-places-search-design.md`（PR-9 骨子、本文書と対）
