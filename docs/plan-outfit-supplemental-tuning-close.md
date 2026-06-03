# D3: bag / accessory supplemental tuning — close（2026-06-01）

**承認**: CEO 最終 PASS（2026-06-01 / branch `claude/loving-pike-fa227a`、 D3 全実装完了・技術的 close）

D2 で engine に通した bag / accessory を、 TPO・天気・季節に応じて賢く選ぶチューニングフェーズ。 全 4 段階（D3-1〜D3-4）を退化 0 で完了し、 close とする。

> ⚠️ **触らない領域** （D3 全体共通）:
> scoreCandidate 本体 / D1 helper (`ensureThreeProposals` 等) / outfitEngineAdapter / useCalendarOutfit /
> OutfitCollage / UI 全体再設計 / mock 構造 / My-Style persistence / cutout / quota cleanup / weather route /
> 既存 item 再処理 / server purge / IndexedDB 削除 / localStorage 削除 / Supabase / DB / migration /
> server-sync / external API / package 追加 / push / deploy / production canary

---

## D3 位置づけ（D2 との関係）

```
D2: bag / accessory を supplemental として proposal に含める
D3: いつ・どの bag を出すか、 いつ scarf を優先するか、 dress時に accessory を複数にするか、
    雨日に防水bagを選ぶか、 hydrate_mock path でも bag/accessory が実画像に置換されるか を磨く
D4以降: subcategory 別 gate / diff 主軸 / scoreCandidate 進出 等の精緻化（別フェーズ）
```

---

## D3 累計 commit（4 commits）

| | commit | 役割 |
|---|---|---|
| 1 | `a974e486` | **D3-1 bag tuning** — travel を needsBag whitelist 追加 / rain 防水 hard filter / smart/dress で backpack 後退 / `selectBagPool` pure helper（pool 事前 partition、 scoreCandidate 不接触） |
| 2 | `538da0c2` | **D3-2 accessory tuning** — cold day (`temp_max < 15`、 既存 needsOuter 境界に整合) で scarf sub-pool 優先 pick / dress 最大 2 件 / subcategory 重複禁止 / `selectAccessories` + `isColdDay` pure helper |
| 3 | `19423094` | **D3-3 hydrate path 修正** — audit で hat migration ギャップ発見 → `slotOfWardrobe` に `case "hat": return "accessory"` 1 行追加 / engine D2-1 と整合 / hydrate path の bag/accessory + cutout 優先を test で固定 |
| 4 | （本コミット） | **D3-4 close docs** — 本ドキュメント + decision-log 1 行 |

---

## 確定した実装仕様（D3 結論）

### D3-1: bag tuning（travel / rain / formality）

#### selectedItemsNeedsBag — whitelist 拡張
- 旧（D2-2）: `work / meeting / date / party`
- 新（D3-1）: `work / meeting / date / party / **travel**`（外出確定として追加）
- 除外維持: `casual / outdoor / sports`（在宅可能性 + 多義性のため安全側）
- 未知 event_type も false（過剰広げ防止）

#### selectBagPool — 優先順位 partition（pure・scoreCandidate 不接触）
| 条件 | 動作 |
|---|---|
| **rain** | `item.attributes?.water === "waterproof" \| "repellent"` で **hard filter**（既存 shoes パターンと同形）。 防水ゼロなら全件保持 |
| **travel** | `subcategory.endsWith("shoulder")` を後ろへ partition（backpack / tote / crossbody を前） |
| **smart / dress** | `subcategory.endsWith("backpack")` を後ろへ partition |
| **casual** | 並べ替えなし |
- **filter ではなく stable partition**（rain 以外）: bag 1 種のユーザーでも必ず候補が残る。 supplemental 不変
- pickBest はそのまま流用（scoreCandidate 非接触）

### D3-2: accessory tuning（cold scarf / dress 2件 / subcategory 重複禁止）

#### isColdDay — 既存 needsOuter 境界に整合
- `weather.temp_max != null && weather.temp_max < 15`
- 独自閾値を作らず `getRecommendedThickness` の `needsOuter` 境界をそのまま流用（「アウターが要る寒さ = scarf が活きる」根拠）
- `temp_max=null` は cold 扱いしない（過剰防寒回避）

#### selectAccessories — pure helper
- **cold day**: 1 件目を **scarf sub-pool に限定して pick**（pickBest の同点再ソート + seed 選択に潰されない設計）
- scarf 無し → 通常 pick fallback（**accessory 全体を消さない**・supplemental 不変）
- **dress: 最大 2 件 / smart: 最大 1 件**（既存 D2-2 gate と整合）
- **subcategory 重複禁止**（jewelry 2 個などの過剰回避・`usedSubcats: Set<string>`）
- 2 件目が無ければ 1 件で成立、 pool 空でも proposal は null にならない

#### accessory subcategory（taxonomy 値、 prefix 形式）
`subcategory.scarf` / `subcategory.hat` / `subcategory.belt` / `subcategory.jewelry`

### D3-3: hydrate path で bag/accessory が実画像に置換される

#### audit 結果（既存対応済の事実確定）
- `slotOfWardrobe`: `categoryMain="bag"→"bag"` / `categoryMain="accessory"→"accessory"` / legacy `"accessories"→"accessory"` 対応済
- `SHAPE_TO_SLOT`: mock `shape="bag"→"bag"` / `shape="watch"→"accessory"` 対応済
- `hydrateOutfitVM`: bucket/cursor で 3 候補にまたがって分配（同一画像の重複緩和）
- `wardrobeItemToSlotVM` の `imageUrl: getWardrobeDisplayImageUrl(item)` → C1L-5 経由で **cutoutUrl 優先**が hydrate path にも生きる
- mock 3 候補は全て `shape="bag"` を含み、 smart proposal (index 1) のみ `shape="watch"` を含む

#### hat migration gap を hydrate path でも修正
- **発見した唯一のギャップ**: legacy `category="hat"` が `slotOfWardrobe` で `undefined` を返していた → engine 側 D2-1 で hat→accessory pool に migration 済だったが hydrate 側が追従していなかった
- **最小修正**: `slotOfWardrobe` の legacy switch に **`case "hat": return "accessory"` 1 行追加**
- これで engine と hydrate の slot mapping が完全に揃った
- 既存 wardrobeToOutfit.test.ts の B-1 時代に固定された 2 件を D3-3 仕様に追従更新

---

## D3 で触らなかった領域（不変原則の達成証拠）

| ファイル / 領域 | D3 全体での扱い |
|---|---|
| `outfitEngine.ts` の `scoreCandidate` 関数本体 | **1 文字も変更なし** |
| `ensureThreeProposals.ts`（D1 helper） | 未接触 |
| `outfitEngineAdapter.ts` の production code | 未接触 |
| `useCalendarOutfit.ts` | 未接触 |
| `OutfitCarousel.tsx` / `OutfitCard.tsx` / UI 全般 | 未接触 |
| `OutfitCollage.tsx` / `outfitCollagePlacement.ts` | 未接触（複数 accessory も既存 z+offset で安全描画と監査済） |
| `mockCalendarOutfit.ts`（mock 構造） | 未接触 |
| My-Style persistence / cutout / quota / weather route | 未接触 |
| Supabase / DB / migration / server-sync / external API / package | 未接触 |
| push / deploy / production canary | 未実行 |

scoreCandidate は CEO 補正で「D3 では触らない」と確定済。 pool 事前 partition（bag）/ sub-pool pick（accessory cold）/ helper 内 dedup（accessory dress）で全て scoring 不接触で実現。

---

## 検証総括

### test 数
- D3-1: 15 新規 cases（`outfitEngineBagTuning.test.ts`）
- D3-2: 18 新規 cases（`outfitEngineAccessoryTuning.test.ts`）
- D3-3: 12 新規 cases（`hydrateBagAccessory.test.ts`）+ 既存 2 件更新（`wardrobeToOutfit.test.ts`）
- 累計新規: **45 cases**

### 全テスト退化総括
- Calendar 全テスト: **269 PASS**（D3 開始時 236→269、 **+33 = 新規分のみ、 退化 0**）
- plan 全テスト: **3514 PASS**（D3 開始時 3501→3514、 **+13 = 新規分のみ、 退化 0**）
- eslint: **clean**
- tsc: 全体 **1116 baseline 維持** / 自分のファイル **差分内 0**

---

## D4 以降の候補（情報のみ・着手は CEO 判断）

### D4: accessory subcategory 別 gate
| subcategory | 推奨条件 |
|---|---|
| **hat** | 季節 / 天気依存（夏 UV 対策 / 雨 / 冬防寒。 formality 軸より event 軸） |
| **belt** | casual 可（カジュアルパンツのアクセント。 D2-2 の smart/dress 限定 gate を緩める候補） |
| **jewelry** | dress 寄り（smart/dress 専用に絞る候補） |
| **scarf** | cold 強化済（D3-2 完了）。 必要なら微修正 |
- 影響範囲: `selectAccessories` の pick 段階に subcategory 別 weight 追加。 scoreCandidate 不接触のまま実現可能

### D5: bag/accessory を diff 主軸に入れるか検討
- D1 helper `ensureThreeProposals.diffScore` への限定変更
- 「bag だけ違う候補」を意味ある差分と扱うか
- wardrobe density が育ってからの慎重な判断（CEO ルールどおり）

### D6: scoreCandidate への bag/accessory 限定 weighting
- D3 で不可触だった `scoreCandidate` への限定解除
- リスクが最も高いため後回し（Calendar 共用範囲に波及）

### Maintenance（独立トラック）
- **localStorage quota cleanup**（My-Style 永続化 close で残課題化）
- **既存 item 再処理**（C1L-6 deferred）
- **weather route 404**（`/api/weather/subscription` 別件）

---

## State Safety
- 本ドキュメントは docs-only commit（D3-4）
- D3-1〜D3-3 は実装 commit。 各 commit で Section 8 三点確認、 個別 file add、 一時 instrumentation は commit しない原則を厳守
- D3 全体で `push` / `deploy` は未実行

---

## GO / NO-GO
- **D3 全体: CLOSE（CEO 承認・技術的完了）**
- 次フェーズ着手は CEO の D4 design gate GO 後
