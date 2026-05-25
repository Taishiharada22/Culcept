# 9b-5 String Audit — Map Redesign NEW Path 文字列統一監査

**Status**: 監査結果報告
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**前提**: CEO + GPT 「A 採用」 後の 9b-5 = 文字列統一 scope

---

## 1. 監査範囲

flag ON path (= MAP_NEW_SURFACE_ENABLED=true、 新 Map 表示) で **ユーザーが見る** 全 UI 文字列。

**対象 file**:
- `app/(culcept)/plan/PlanClient.tsx` (= useNewShell 経路の header / tabs / subtitle)
- `app/(culcept)/plan/tabs/MapTab.tsx` (= newMode JSX、 一部 PlanMapView 内 shared)
- `components/plan/map/MapBottomSheet.tsx` (= 新 sheet)
- `components/plan/map/DayItemsPanel.tsx` (= 新 panel)
- `components/plan/map/MapSelectedPinLabel.tsx` (= 新 overlay label)
- `lib/plan/list/categoryMeaning.ts` (= sheet meaningText 動的内容)

**対象外**:
- flag OFF path 専用文字列 (= SelectedAnchorCard / CategoryGrid / UnresolvedAnchorsSection / FAB)
- 9 closeout で旧 file 削除と同時に整理
- PlanMapView 内 placeholder / overlay text (= 両 path 共有、 OFF path 不触原則)

---

## 2. 検出結果サマリー

| 評価 | 件数 |
|---|---|
| ✅ Consistent | 大多数 |
| ⚠️ Intentional variation | 2 件 |
| ⚠️ Cosmetic | 1 件 |
| 🔴 真の混在 | **0 件** |

→ **NEW path は largely consistent**。 当初 readiness 「残 5 件程度」 は過大推定だった。

---

## 3. 文字列インベントリ + 評価

### 3.1 PlanClient header (= useNewShell)

| 文字列 | 場所 | 評価 |
|---|---|---|
| `ALTER · PLAN` | category badge | ✅ |
| `今日のプラン` | h1 title | ✅ |
| `時間の流れを把握して、心地よい1日に。` | subtitle (flow / calendar) | ✅ |
| `場所を地図で確認して、流れをつかみましょう。` | subtitle (map) | ✅ |
| `カレンダー` / `リスト` / `マップ` | tab labels | ✅ |

### 3.2 MapBottomSheet (= 新 sheet)

| 文字列 | 場所 | 評価 |
|---|---|---|
| `詳細を閉じる` | close button aria | ✅ |
| `詳細を見る` | secondary CTA | ✅ |
| `ここへの経路` | primary CTA | ✅ |
| `この予定の詳細を見る` | secondary CTA aria | ✅ |
| `この場所への経路を Google Maps で開く` | primary CTA aria | ✅ |
| `経路を開けません (場所が未解決)` | disabled aria | ✅ |
| `{title} の詳細` | dialog aria-label | ✅ |

### 3.3 DayItemsPanel (= 新 panel)

| 文字列 | 場所 | 評価 |
|---|---|---|
| `カフェ` / `ランチ` / `オフィス` / `帰宅` / `その他` | category display names | ✅ mock 整合 |
| `{表示名} の予定を選択` | row aria | ✅ |
| `当日リストを折りたたむ` / `当日リストを展開` | chevron aria | ✅ |

### 3.4 MapSelectedPinLabel (= 新 overlay)

| 文字列 | 場所 | 評価 |
|---|---|---|
| `選択中: {title}` | aria-label | ✅ |

### 3.5 Current location button (= newMode)

| 文字列 | 場所 | 評価 |
|---|---|---|
| `現在地を中心に表示` | aria-label | ✅ |

---

## 4. ⚠️ Intentional variation (= 修正不要)

### 4.1 「マップ」 vs 「地図」

- 「マップ」: tab label (短く、 punchy)
- 「地図」: subtitle / aria-label (自然な日本語、 文の中で読みやすい)

**判定**: mock 整合、 context-aware 使い分け。 統一する必要なし。

### 4.2 「家」/「帰宅」、 「仕事」/「オフィス」

- 「帰宅」/「オフィス」: DayItemsPanel display names (mock 整合、 短いラベル)
- 「家」/「仕事」: CategoryMeaning 文中 (= 自然な文体)

**判定**: 文体 vs ラベルの context 差、 統一不要。

---

## 5. ⚠️ Cosmetic finding (= 9b-5 で fix 候補)

### CategoryMeaning 文体の文末バラつき

25 entries 中:
- 「ましょう」 系: ~14 件
- 体言止め (= 「〜時間」 「ひと休み」 等): ~6 件
- 「ゆったりと」 等 副詞止め: ~5 件

**例**:
- cafe.morning: 「静かなカフェで、今日の計画を整理しましょう」 ← 「ましょう」
- cafe.evening: 「夜のカフェで、静かに過ごす時間」 ← 体言止め
- cafe.late_night: 「夜更けのカフェで、ゆったりと」 ← 副詞止め

**判定**: 文体バリエーション (= 単調を避ける設計とも解釈可)。 統一すべきか CEO 判断仰ぐ。

**選択肢**:
- A. 全て 「ましょう」 系に統一 (= consistent、 やや monotone)
- B. 体言止めに統一 (= 簡潔、 但し全 entry の reshape 必要)
- C. **現状維持** (= 文体多様性を意図と解釈、 推奨)

---

## 6. 🔴 真の混在 (= 9b-5 で fix 必要)

**該当なし**

NEW path UI 文字列に「修正必要な混在」 は見つからなかった。

---

## 7. 🚧 Deferred: 9 closeout 対象

以下は newMode 時にも一部表示されるが、 PlanMapView 内 shared (= OFF path 影響) のため 9b-5 で触らない:

| 文字列 | 場所 | 9 closeout で改善 |
|---|---|---|
| `地図の表示には API キーが設定されていません` | MapPlaceholder (= key 不在時) | 「地図」 → 統一語 (= 「マップ」 or 維持) |
| `地図を読み込んでいます...` | MapPlaceholder (= script load 中) | 同 |
| `あなたの地理を確認中...` | overlay (= loading) | 「地理」 → 「マップ」 or 「今日の予定」 |
| `予定 + baseline を設定すると、ここに並びます` | overlay (= pin 0 + baseline 0) | 「baseline」 → 「拠点」 / 「居住地」 |
| `予定を追加すると、{baseline} の pin として並びます` | overlay (= pin 0 + baseline あり) | 「pin」 → 「ピン」 / 「印」 |
| `予定は baseline 周辺の概算 pin として表示されます` | overlay (= apiAvailable=false) | 「pin」 / 「baseline」 同 |
| `地図 (選択日の予定の場所)` | map div aria-label | newMode は DaySwitcher hide で 「選択日」 不正確、 「今日の予定の場所」 候補 |
| `📍 場所未確定の予定` / `📂 場所が曖昧 / 未指定` | UnresolvedAnchorsSection | 旧 UI、 9 closeout で削除 (= 結果として消える) |

---

## 8. 結論

- NEW path UI は **大多数 consistent**
- 真の混在 0 件
- Cosmetic finding 1 件 (= CategoryMeaning 文体)
- Deferred 8 件 (= 9 closeout で OFF path と一緒に整理)

**9b-5 推奨アクション**:
- **Option A**: docs-only (= 本 audit doc commit のみ、 code 変更なし) ← 推奨
- Option B: CategoryMeaning 文体統一 (= cosmetic polish)
- Option C: 9b-5 skip + 9b-6 (animation) 着手承認

CEO 判断仰ぐ。
