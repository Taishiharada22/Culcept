# D5: outfit proposal diff axis split — close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01 / branch `claude/loving-pike-fa227a`）

D1 `ensureThreeProposals.diffScore` を **main-axis required + supplemental as tie-breaker**（CEO 推奨 B 案 + 補正）に分離。 bag/accessory が差分主軸化するリスクを構造的に排除。

> ⚠️ **触らない領域**:
> scoreCandidate / outfitEngine 本体 / outfitEngineAdapter / useCalendarOutfit / OutfitCollage /
> UI 全体 / mock 構造 / D2/D3/D4 selection logic / My-Style persistence / cutout / quota / weather route /
> 既存 item 再処理 / migration / push / deploy / production canary

---

## D5 commit

| | commit | 役割 |
|---|---|---|
| 1 | `a92f870e` | **D5 実装** — diffScore を `mainAxisDiff + (mainAxisDiff >= 1 ? supplementalDiff : 0)` に分離。 `mainAxisDiff` / `supplementalDiff` 純関数を export。 |
| 2 | （本コミット） | **D5 close docs** |

---

## 採用方針（CEO 推奨 B + 補正）

```
mainAxisDiff = tops/bottoms/shoes/outer の id 対称差 + outer 有無差 ×0.5
supplementalDiff = bag/accessory の id 対称差 ×0.5

if mainAxisDiff < 1:
  diffScore = mainAxisDiff   // outer 0.5 単独 / bag/accessory のみは supplemental 加点しない
else:
  diffScore = mainAxisDiff + supplementalDiff
```

**閾値 ≥ 1.0 で「意味ある差分」（D1 と同じ運用）**。

### CEO 推奨補正の核心
- `outer 有無 0.5 + bag/accessory 差` で閾値を超えるリスクを排除（`mainAxisDiff >= 1` を要求）
- これにより bag/accessory は構造的に**主軸化不可能**

### 採用しなかった案 A
- 「supplemental 合計を 0.5 cap」は将来の閾値変更で誤って通る可能性が残るため不採用

---

## main-axis / supplemental-axis 分類

VM の `category` 完全一致で判定（CalendarOutfitItemVM には `categoryMain` フィールドが無いため `category` 日本語 label を採用。 adapter / wardrobeToOutfit / mock の 3 経路すべて同値で確定）。

| axis | VM.category 値 |
|---|---|
| **main-axis** | `"トップス"` / `"ボトムス"` / `"シューズ"` / `"アウター"` |
| **supplemental** | `"バッグ"` / `"小物"` |

`MAIN_AXIS_LABELS` / `SUPPLEMENTAL_LABELS` `Set` で判定（誤判定回避・substring 不使用）。

---

## outer 有無差分の扱い
- **main-axis 内で 0.5**（既存 D1 セマンティクス完全保持）
- 既存 D1 outer test 「a に outer 追加 → 1.5（id 差 1 + outer 0.5）」は **D5 後も同値で PASS**（test ⑨ で固定）

### CEO 推奨補正の効果（具体例）
| ケース | mainAxisDiff | supplementalDiff | diffScore | 閾値 ≥ 1.0 |
|---|---|---|---|---|
| bag だけ違う | 0 | 1.0（無効化） | **0** | ❌ → mock pad |
| accessory だけ違う | 0 | 1.0（無効化） | **0** | ❌ → mock pad |
| bag + accessory だけ違う | 0 | 2.0（無効化） | **0** | ❌ → mock pad |
| outer 有無差のみ + bag 違い | 0.5 | 1.0（無効化） | **0.5** | ❌ → mock pad |
| tops 1 件入れ替えのみ | 2 | 0 | **2** | ✅（既存 D1 互換） |
| tops 違い + bag 違い | 2 | 1.0 | **3** | ✅（tie-breaker 加算） |
| outer 追加 + tops 違い + bag 違い | 2.5 | 1.0 | **3.5** | ✅ |

---

## bag/accessory だけ違う候補が通らないこと（構造的保証）
- `diffScore = 0` で確実に閾値未満
- `enforceDiff` 内で mock pad に置換される（既存 D1 ロジック流用・無改修）
- 統合 test ⑦ で「engine main + casual(bag だけ違い) + dressy(bag だけ違い) → 端 2 件が mock pad」固定

---

## scoreCandidate に触っていないこと
- D5 全体で **`scoreCandidate` 関数本体は 1 文字も変更なし**
- 差分判定（D1 helper）のみの変更で、 engine の scoring には一切影響なし

## UI に触っていないこと
- `OutfitCarousel` / `OutfitCard` / `CalendarOutfitDashboard` / `OutfitCollage` 未接触
- `outfitEngineAdapter` / `useCalendarOutfit` / mock 構造 未接触
- D2-1〜D3-3 / D4 の selection logic も未接触

---

## 検証結果
- 新テスト `ensureThreeProposalsDiffAxis.test.ts`: **18/18 PASS**（mainAxisDiff 4 + supplementalDiff 3 + diffScore 新ルール 8 + ensureThreeProposals 統合 2 + 既存 D1 outer 互換 1）
- 既存 D1 `ensureThreeProposals.test.ts`: **32/32 PASS**（**退化 0**）
- plan 全テスト: **3532 PASS**（D5 開始時 3514→3532、 +18、 **退化 0**）
- Calendar 全テスト: **297 PASS**（**退化 0**）
- eslint: **clean**
- tsc: 全体 **1116（baseline 維持）/ 自分のファイル 0**（差分内 0）

---

## D6 / Maintenance との関係
- **D6**: scoreCandidate への bag/accessory 限定 weighting — 高リスク、 別 design gate 必須。 D5 完了報告と同時に D6-0 設計/risk audit を提出
- **Maintenance**: localStorage quota cleanup / 既存 item 再処理 / weather route 404 — 独立トラック

---

## GO / NO-GO
- **D5: CLOSE（CEO 承認・技術的完了・実装＋ docs）**
- D6 着手は CEO の D6-0 設計/risk audit GO 後
