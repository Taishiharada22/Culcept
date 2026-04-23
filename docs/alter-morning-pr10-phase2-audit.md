# W3-PR-10 Phase 2 C1 Audit — display-first 可否判定

- **branch**: `feat/alter-morning-wave3-pr10-phase2-audit`
- **base**: `origin/main @ b3f1ab2d`（PR #20 merge 後の Phase 1 着地済み状態）
- **scope**: C1 監査のみ。C2〜C4 の実装には踏み込まない（CEO 承認範囲）
- **判定対象**: R1 = 「Path A の現行 UI には `PlanItem.kind === "travel"` の renderer が存在せず、
  display-first で travel PlanItem を注入しても描画されない」が真か偽か
- **CEO 方針**: R1 が true なら Phase 2 は display-first で進めず「consumer-first PR / PR-13・14」に再定義する。
  selector-only mini-PR にはフォールバックしない（観測可能な価値が無く canonical 健全性を証明できないため）

---

## 結論（先出し）

| 項目 | 結論 |
| --- | --- |
| **R1** | **FALSE** |
| Path A 現行 UI の `kind === "travel"` renderer | **存在する**（`components/home/morning/MorningPlanCard.tsx:368-398`） |
| `normalizePlanItem` が travel shape を壊すか | **壊さない**（`...item` で kind / travelFrom / travelTo / travelTransport / durationMin を保持、renderer は normalize 前提フィールドを travel branch で参照しない） |
| 合成後の order と id を deterministic に保てるか | **保てる**（挿入位置は `from/to` event 隣接 pair で決まる／id は `TransportSegment.fromEventId + toEventId` から派生可能。現行 `insertTravelItems` の `Date.now()/Math.random()` 生成とは別系統） |
| Path B / persisted travel との衝突 | **構造的衝突は無い、ただし client 側 `regenerateTravel` との再衝突リスクあり**（下記 §4）|

したがって **Phase 2 は display-first で進行可能**。ただし client reorder 時の id 非決定性（§4.2）は C2 実装前に扱い方を決める必要がある。

---

## 1. Path A で `kind === "travel"` を描画する component / render path

### 1.1 render path

```
app/(culcept)/stargazer/alter-morning/...           ← 省略（ページ）
  └─ useAlterMorningChat (hook)
      └─ setMorningPlan(plan)                         ← plan.items に kind="travel" があればそのまま保持
          └─ <MorningPlanCard plan={...} />
              └─ plan.items.map(item => <PlanItemRow item={item} .../>)
                  └─ components/home/morning/MorningPlanCard.tsx:368-398
                     if (item.kind === "travel") { return <motion.div ... /> }
```

### 1.2 renderer 実体（`components/home/morning/MorningPlanCard.tsx:367-398`）

```tsx
// ── 移動アイテム: 専用の軽量表示 ──
if (item.kind === "travel") {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 py-1 px-3 rounded-lg bg-gray-50/30"
    >
      {/* スペーサー（チェックボックス/並べ替え幅に合わせる） */}
      <div className="w-5 flex-shrink-0" />

      {/* 時刻 */}
      <span className="text-[11px] text-gray-300 w-[42px] flex-shrink-0 font-mono">
        {item.startTime ?? "──"}
      </span>

      {/* 移動手段アイコン */}
      <TravelIcon transport={item.travelTransport} />

      {/* 移動テキスト（先頭の絵文字プレフィックスを除去） */}
      <span className="text-[11px] text-gray-400 flex-1 italic">
        {item.text.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
      </span>

      {/* 移動時間 */}
      <span className="text-[10px] text-gray-300 flex-shrink-0">
        {formatDuration(item.durationMin)}
      </span>
    </motion.div>
  );
}
```

**重要所見**:
- この travel branch は通常 item 描画よりも手前に置かれ、`normalizePlanItem(item)` の呼び出し（同ファイル 504 行目）**より先に return する**。
  つまり travel item は normalize を通らずに描画され、`confirmationState` / `whenSharpness` 等の PR-8 strict 化フィールドを UI は参照しない。
- 描画が参照するのは `startTime` / `travelTransport` / `text` / `durationMin` の 4 フィールドのみ。
  これらはすべて PlanItem の base field であり、合成元の TransportSegment から決定論的に埋められる。

### 1.3 Path A は現在 travel item を items[] に持たない

`lib/alter-morning/legacyAdapter.ts:411-444` で組み立てている plan は `buildPlanAndSegmentsFromEvents(...).items` をそのまま渡しており、
`items` には `eventToPlanItem` が生成する `kind: "fixed" | "todo"` のみが入る（`lib/alter-morning/planning/planRebuild.ts:53-94`）。
Path A は `insertTravelItems` を呼んでいない。

→ Path A の items[] は **PR-8/9/10-Phase1 完了時点で travel 空**。合成は純粋な追加操作になり、既存 items の並びに破壊変更を入れない。

---

## 2. `normalizePlanItem` が travel shape を壊すか

### 2.1 現行実装（`lib/alter-morning/normalizedPlanItem.ts:64-85`）

```ts
export function normalizePlanItem(item: PlanItem): NormalizedPlanItem {
  const whenSharpness: SlotSharpness = item.whenSharpness ?? "missing";
  const whereSharpness: SlotSharpness = item.whereSharpness ?? "missing";
  const whatSharpness: SlotSharpness = item.whatSharpness ?? "missing";
  const confirmationState: ConfirmationState =
    item.confirmationState ?? "provisional";

  const whereVagueSubKind: WhereVagueSubKind | undefined =
    whereSharpness === "vague"
      ? item.whereVagueSubKind ?? "undecided"
      : undefined;

  return {
    ...item,                 // ← 既存フィールドは全て保持される
    confirmationState,
    whenSharpness,
    whereSharpness,
    whatSharpness,
    whereVagueSubKind,
  };
}
```

### 2.2 travel item を通したときの挙動

- `...item` により `kind: "travel"` / `travelFrom` / `travelTo` / `travelTransport` / `durationMin` / `startTime` / `text` / `id` はすべて保持される。
- 追加される `confirmationState = "provisional"` / `whenSharpness = whereSharpness = whatSharpness = "missing"` は
  travel renderer が **参照しない** フィールドなので UI に出ない。
- `whereVagueSubKind` は `whereSharpness === "vague"` でないため `undefined` に確定。副作用なし。

→ **normalizer は travel shape を破壊しない**。ただし normalizer は Path A の `legacyAdapter.ts:426-432` で `built.items.map(...)` に適用されるため、
Phase 2 で travel 合成を「`built.items` 内に組み込む」設計にすると normalizer も通ることになる。現仕様では無害だが、
将来 normalizer 側で「travel item は通さない」早期 return を入れる余地を残すのが clean（C2 で判断）。

### 2.3 ショートカット（短絡）経路

仮に normalizer を通さずに「legacyAdapter の plan 組み立て直前に synthesize → items の末尾に push」する構成にしても、
MorningPlanCard の travel branch は normalize 結果を前提にしていないため UI は問題なく描画できる。
つまり **C2 実装では normalize 前に synthesize しても normalize 後に synthesize しても UI は成立する**。設計余地あり。

---

## 3. interleave 後の順序と id の deterministic 性

### 3.1 順序

TransportSegment[] は `buildTransportSegments`（`planning/planRebuild.ts:119-147`）で **events の配列順に隣接 pair を走査**して生成される。
合成の論理順序は自然に以下になる:

```
items' = [
  eventItem(events[0]),
  travel(events[0] → events[1])?,   // 両端 coords 揃い時のみ
  eventItem(events[1]),
  travel(events[1] → events[2])?,
  eventItem(events[2]),
  ...
]
```

- events 配列順は legacyAdapter 内で **時系列 sort 済み** → 合成結果も時系列で安定
- coords 欠落 pair は skip（Phase 1 の pair invariant を継承）
- 既存 `eventToPlanItem` は orderHint を配列 index で渡しているため、合成 item にも同一規則で orderHint を与えれば表示層の sort 契約は維持可能

### 3.2 id の決定性

TransportSegment は `id` 自体を持たないが、`fromEventId` と `toEventId` は **event_id（stable / session 間 hash 安定）** に依存して決まる。
したがって synthesize 時の PlanItem.id は以下で決定論的に生成できる:

```
id = `travel__${seg.fromEventId}__${seg.toEventId}`
```

- 同じ events 入力で何度再 build しても同じ id（pure）
- React reconciliation の key 安定性を満たす
- 現行 `travelTimeEngine.ts:289-302` の `travel_${Date.now()}_${Math.random()}` 生成とは **完全に別系統**（衝突しない prefix `travel__` を使えば collision 回避）

### 3.3 結論

順序・id ともに deterministic に保てる。**interleave は pure function として C2 で実装可能**。

---

## 4. Path B / persisted travel との衝突

### 4.1 Path B（`processMorningMessage` / `buildDayPlan` / `insertTravelItems`）

- Path B は `lib/alter-morning/planningEngine.ts:579` で `buildDayPlan` を呼び、そこから `insertTravelItems`（同 688）が走る。
- Path B が走るのは Path A と排他的な経路（**同じ morningSession に A と B が同時に書き込まない**）。
- Phase 1 では Path B 側の挙動を一切変えない契約が確定している（`planRebuild.ts` コメント §非責務参照）。
- よって Path A に Phase 2 合成を入れても、Path B の items[] には触れない。**構造的衝突はゼロ**。

### 4.2 client 側 `regenerateTravel`（`MorningPlanCard.tsx:775-791`）

```ts
const regenerateTravel = useCallback((nonTravelItems: PlanItem[], prevPlan: MorningPlan): PlanItem[] => {
  const existingTravel = prevPlan.items.find(i => i.kind === "travel");
  const transport = existingTravel?.travelTransport
    ?? prevPlan.flowContext?.transport
    ?? prevPlan.dayConditions?.mainTransport
    ?? "car";
  const goOut = prevPlan.flowContext?.goOut ?? nonTravelItems.some(i => i.location);
  const withTravel = insertTravelItems(nonTravelItems, transport, goOut);
  return recalculateSchedule(withTravel, {
    departureTime: prevPlan.departureTime,
    arrivalTime: prevPlan.arrivalTime,
  });
}, []);
```

- ユーザーの並べ替え / 開始時刻変更 / 所要時間変更で **client 側**が travel を `insertTravelItems`（Date.now + Math.random id）で再生成する。
- つまり「サーバから決定論的 id で届いた travel item」が、client 操作直後に「非決定的 id + `insertTravelItems` ロジック由来の interleave」に置き換わる。
- **構造的衝突ではないが、Phase 2 の「canonical TransportSegment が決定論的 id を保つ」契約は client reorder の瞬間に途切れる**。

### 4.3 リスクランク

| ケース | 影響 | 判定 |
| --- | --- | --- |
| server →（最初の描画）→ 決定論 id で travel 表示 | 正常 | OK |
| user reorder → client `regenerateTravel` → random id の travel に差し替え | 同 MorningPlanCard セッション内のみ | **許容（Phase 2 スコープ外）** |
| 次回 user 発話 → server 再生成 → 決定論 id に戻る | 正常 | OK |

→ **C2〜C4 を阻害しない**。client 側の振る舞いは既存契約維持のため触らない。「server canonical が決定論」と
「client reorder 中の一時的 id 揺れ」は別レイヤーの話として分離できる。必要なら PR-13 以降で統一を検討する。

### 4.4 persisted travel（DB / session 跨ぎ）

- `morningSession` は client-authoritative（`docs/alter-morning-comprehension-first-v1.3plus.md`）。
- `processMorningMessage` / selection route はいずれも `plan.items` を **入力値の pass-through or 置換**として扱い、DB 側で travel item 固有の schema は持たない。
- 従って session 跨ぎで「旧 random id の travel が残る」ケースはあるが、次ターン server 応答で canonical 置換される（`selection/route.ts:224-230` の `_passthroughPlan` 破棄 + rebuilt plan 返却と同じ契約）。
- **持続的衝突なし**。

---

## 5. 追加所見（C2 設計で効いてくる項目）

### 5.1 合成の責任配置

候補 2 案:

| 案 | 配置 | pros | cons |
| --- | --- | --- | --- |
| **A. planRebuild で合成** | `buildPlanAndSegmentsFromEvents` の出力 items[] に travel を interleave して返す | pure / 一元化 / flag ON 時だけ差分 | 出力型の互換性維持（travel 含む items[] を caller が想定していない場合の回帰） |
| **B. adapter 層で合成** | `buildPlanAndSegmentsFromEvents` は items / segments を分離のまま返し、`legacyAdapter.ts` と `selection/route.ts` が各々合成 | 既存 T1/T2 を揺らさない / caller が合成 on/off を制御できる | 合成ロジックの 2 箇所実装 → drift リスク |

→ **A が T2 原則（consumer 直叩き禁止、builder 未公開）に素直**。C2 は A 案で合成関数を `planRebuild.ts` 内に追加し、公開 API は `buildPlanAndSegmentsFromEvents` 1 本のまま保つ設計を優先候補とする。

### 5.2 flag OFF byte-diff ゼロ

Phase 1 の T3 を継続するため、合成関数は `enableTransportV2=false` では **1 行も items[] に追加しない**契約を保持。既存の conditional spread 構造に乗る。

### 5.3 test 影響（CEO 指示範囲に準拠）

| テスト | 影響 | 判定 |
| --- | --- | --- |
| `planRebuild.test.ts`（C6 flag OFF, C7 flag ON） | 既存 items 数は維持。flag ON では items.length が `events.length + segments.length` に増える | **flag ON Path A の items[] 期待値だけ更新可**（CEO 承認範囲内） |
| `legacyAdapter` / selection route の travel interleave 検証 | 新規追加 | **追加 OK** |
| flag OFF 契約（items 不変・transportSegments key 不在） | 一切変えない | **不可侵** |
| Path B 系（travelTimeEngine / phaseC-integration / ceoScenario） | 不干渉 | **不可侵** |

---

## 6. 判定

- R1 = **FALSE**
- 条件 (a)「renderer 存在 AND normalizer が travel を壊さない」= **両方満たす**
- 条件 (b)「R1 true 時の凍結」= 発動せず。Phase 2 は display-first で継続可能
- 条件 (c)「test 期待値変更は flag ON Path A のみ」= C2 実装時に満たせる見通し

**推奨**: CEO が Phase 2 を display-first で進めることを最終承認した時点で C2 着手（`synthesizeTravelItems` pure 関数追加 + `planRebuild` 合成 + Path A items[] 合成出力 + flag ON 契約テスト追加）。
C2-C4 の具体スコープは本監査では踏み込まず、承認後に別メモで提示する。

---

## Appendix — 主要 file reference

- `components/home/morning/MorningPlanCard.tsx:368-398` — travel renderer
- `components/home/morning/MorningPlanCard.tsx:504` — normalize 呼び出し（travel branch はここより手前で return）
- `components/home/morning/MorningPlanCard.tsx:775-791` — client 側 `regenerateTravel`
- `lib/alter-morning/normalizedPlanItem.ts:64-85` — `normalizePlanItem`
- `lib/alter-morning/legacyAdapter.ts:411-444` — Path A plan 組み立て（Phase 1 着地版）
- `lib/alter-morning/planning/planRebuild.ts:119-147` — `buildTransportSegments`（未 export、T2）
- `lib/alter-morning/planning/planRebuild.ts:181-194` — `buildPlanAndSegmentsFromEvents`（公開 API）
- `lib/alter-morning/transport/types.ts:37-56` — `TransportSegment` 型
- `lib/alter-morning/travelTimeEngine.ts:289-302` — 既存 `insertTravelItems`（非決定 id、Path B / client reorder 専用）
- `lib/alter-morning/planningEngine.ts:579-688` — Path B（不干渉）
