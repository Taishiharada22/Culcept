# Plan Map Redesign — 9b Readiness (= 視覚仕上げ + carry 修正)

**Status**: 着手前 readiness (= CEO 採用待ち)
**Author**: Build Unit (Claude)
**Date**: 2026-05-25
**設計書系列**: spec audit v3 → impl readiness v2 → 9a-impl 4 step + corrective → **本 9b readiness**

---

## 1. 9a-impl 完了状況 (= 採用判定済み、 carry 1 件)

### 採用 (= CEO + GPT 判定)

| step | commit | 内容 | 判定 |
|---|---|---|---|
| α | `92ca364d` | shell 統一 + map 埋め込み + controls 衝突修正 | ✅ PASS |
| β | `5f1c239b` | bottom sheet 再設計 (= 8 段構造 + CTA 2 + image slot β + handle) | ✅ PASS |
| γ | `79c36733` | 独自 pin (= 涙型 + 白抜き SVG icon + 時刻 embed) | ✅ PASS (= 条件付き、 title 未達 carry) |
| δ | `355756dc` | 左下 DayItemsPanel (= 凡例 + 当日リスト hybrid + selected sync) | ✅ PASS |
| δ-corr | `38840548` | map full-bleed + pin redesign (= label 上 + icon 中心修正) | ✅ PASS (= 概ね採用) |

### Carry 項目 (= 9b 先頭 patch で処理)

| 項目 | 現状 | 9b 修正方針 |
|---|---|---|
| **selected pin title ラベル の sheet 隠れ問題** | 時刻 label は SVG 内 embed (= pin 上)、 title 表示なし | **overlay として title ラベルを表示**、 sheet open 時 Y 位置を **sheet top より上に clamp**、 必要なら **map auto-pan** で selected pin を sheet 領域外に持ち上げ |
| **pin icon の中心微ズレ** | corrective で transform (11, 25) に修正済みだが、 各 icon path 内部の visual center 微調整余地 | 9b patch で軽く一緒に修正 (= 各 icon path 微調整、 大規模 redesign 不要) |

---

## 2. 9b 範囲 (= 視覚仕上げ + carry + spec v3 残項目)

### 2.1 carry 修正 (= 先頭 patch)

#### 2.1.1 Selected pin title overlay (= sheet 隠れ防止)

**問題**:
- 現状: 時刻 label は SVG 内 embed、 全 pin pin の上に表示
- title は表示なし → CEO「selected pin には時刻 + title の白ラベル」 未達
- 表示する場合: SVG 内 embed では sheet 開いた時に隠れる懸念

**設計方針**:
- selected pin の **title 白カードラベル を React HTML overlay** で実装
- map.LatLng → pixel 変換で position 計算
- **Y 位置を sheet top よりも上に clamp** (= sheet 高さ ≈ 280-320px の上端より上)
- 必要なら map auto-pan で selected pin を sheet 領域外 (= 画面上半分) に move
- 通常 pin (= unselected) の時刻 label は SVG embed 維持 (= 現状不変)

**実装案**:
- 新 component: `MapSelectedPinLabel.tsx` (= HTML overlay、 fixed position 計算)
- props: anchor (= MapPinViewModel)、 mapInstance (= for projection)、 sheetTop (= clamp 用)
- map.getProjection().fromLatLngToPoint() で pixel 計算
- Y = max(pinPixelY - LABEL_HEIGHT - PIN_HEIGHT, sheetTop - LABEL_HEIGHT - GAP)

#### 2.1.2 Pin icon 中心微調整

- 各 icon SVG path 内部 visual center を pixel 単位で再確認
- 必要なら +/- 1-2px の transform 微調整
- 簡素な fix、 大規模 redesign 不要

### 2.2 spec v3 残項目 (= 9b で対応)

| 項目 | spec v3 | 9b 対応 |
|---|---|---|
| 旧 UI 削除 | flag ON 時非表示 → file 自体削除 | `SelectedAnchorCard` / `CategoryGrid` / `UnresolvedAnchorsSection` / `StaticAlterSuggestionCard` の使用箇所 + 必要なら file 削除 |
| FAB 再検討 | 9a で hide のみ、 9b で削除 or 統合判断 | flag ON 時の FAB 完全削除 or sheet 内に統合 |
| 文字列統一 | 「マップ」 vs 「地図」 等の表記混在解消 | 残り文字列 5 件程度の統一 (= 9c だったが 9b に統合検討) |

### 2.3 視覚仕上げ (= mock fidelity 完成)

| 項目 | 現状 | 9b 改善 |
|---|---|---|
| pin デザイン磨き | 涙型 + 白抜き icon (= corrective で基礎完成) | 微妙な proportion / shadow / stroke 等、 mock 比較 細部仕上げ |
| sheet open animation | 即時表示 (= drag なし) | 軽い slide-up animation (= framer-motion or CSS keyframe) |
| pin tap animation | 即時 selected | 軽い scale animation (= 0.95 → 1.2、 200ms) |
| 左下 panel 視覚 | 既存 first-pass | mock 比較で字間 / icon size / 余白 微調整 |

### 2.4 9 closeout 範囲 (= 9b 完了後)

| 項目 | 内容 |
|---|---|
| flag 削除 | `MAP_NEW_SURFACE_ENABLED` const 削除、 全 flag check 削除、 旧 path code 削除 |
| 旧 file 削除 | `SelectedAnchorCard` / 旧 layout 関連 file 物理削除 |
| 完成形 commit | 単一 path 化、 二重実装解消、 docs update |

---

## 3. 段階分割 (= 9b sub-step 候補)

### 9b-1 完了 (= 採用)

| step | 内容 | commit | 判定 |
|---|---|---|---|
| **9b-1** | selected pin title overlay + icon 中心微調整 | `c665898d` | ✅ 採用 (= 「通すけど完成ではない、 残課題は次で詰める」) |

### 9b-1 残課題 3 件 (= CEO + GPT smoke 判定で記録、 後続 step に分配)

| 課題 | 内容 | 9b 担当 step |
|---|---|---|
| **A. selected label と pin の spatial binding 強化** | 現状: label は map 上部固定 (= visibility OK、 binding 弱) → 改善: connector line or label dynamic position (= pin 近く + sheet open 時のみ上 clamp) | **9b-2 (carry-2)** |
| **B. pin 品質仕上げ** | 現状: 涙型 + 白抜き icon (= 機能成立) → 改善: アイコン重心微調整 (= cafe/work 等)、 stroke / shadow / proportion で高級感 | **9b-3 (visual polish)** |
| **C. 左下 panel と sheet 競合整理** | 現状: 同じ下部領域取り合い → 改善: sheet open 時 panel 縮退 / z-index 整理 / 距離感 | **9b-4 (layout 整理)** |

### 完了 step

| step | commit | 内容 | 判定 |
|---|---|---|---|
| ✅ **9b-2 (carry-2)** | `9dc9eb7e` | spatial binding 強化 (= pin 真上寄り + Y clamp) | 採用 |
| ✅ **9b-3 (visual polish)** | `cac68b89` | pin 品質仕上げ (= cafe/home redesign + drop-shadow filter) | 採用 |
| ✅ **9b-4 (layout 整理)** | `e7afc125` | sheet open 時 DayItemsPanel hide (= 視線競合解消) | 採用 |

### 後続 step (= 訂正、 旧 UI 削除を 9 closeout に統合)

| step | 内容 | 規模 | 優先度 |
|---|---|---|---|
| **9b-5 (= 訂正、 旧 9b-6 を前倒し)** | 文字列統一 (= 「マップ」 vs 「地図」 等の表記混在解消、 残 5 件程度) | 小 | **次最優先** |
| **9b-6 (= 訂正、 旧 9b-7 を前倒し)** | animation (= sheet slide-up / pin tap scale) | 中 | 後 |
| ~~旧 9b-5 旧 UI file 削除~~ | **9 closeout に統合** (= flag 削除と同 atomic commit、 OFF path 同時廃止) | - | - |
| 9 closeout | flag 削除 + **旧 UI file 物理削除** + 旧 code path 削除 + 単一 path 化 | 大 | 最後 |

### 9b-5 旧 UI 削除を 9 closeout に統合した理由 (= CEO + GPT A 採用、 2026-05-25)

> 旧 UI file は **まだ flag OFF path で active に使われている**。
> `MAP_NEW_SURFACE_ENABLED = false` が default の現状で物理削除に入ると、 OFF path を壊す。
> したがって旧 UI file 削除は 9 closeout (= flag 削除 + 単一 path 化) と同時が正しい。

これにより 9 closeout が:
1. `MAP_NEW_SURFACE_ENABLED` const 削除
2. 全 flag check 削除 (= 旧 path code 削除)
3. 旧 UI file 物理削除 (= SelectedAnchorCard / CategoryGrid / UnresolvedAnchorsSection / StaticAlterSuggestionCard 等)
4. 単一 path に統一 (= 二重実装解消)

を atomic commit で行う clean migration になる。

---

## 4. 不変原則 (= 9a-impl から carry)

- flag ON / OFF 分離継続 (= 9 closeout 直前まで)
- state 分離継続 (= `selectedAnchorId` / `newSelectedPinId` 完全分離)
- 中立文体 (= 命令形 / 評価形容詞 / 推奨語 なし)
- 規約 24-extended (= focus-visible:border-slate-300)
- 絵文字 0 (= 全 SVG icon)
- imageUrl 常に undefined (= 9a-pre adapter、 image slot は placeholder β)
- 既存 frozen file 不触 (= googleMapsLoader.ts etc.)

---

## 5. 進行プロトコル (= CEO 承認後)

1. **9b-1 carry 着手承認** (= 本 readiness 後 CEO 判断)
2. 各 sub-step 独立 commit + 自己 dev 確認 + smoke + CEO 判定
3. 各 step 完了 → CEO 採用判定 → 次 step 着手承認
4. 9 closeout 着手前: closeout readiness 別途整理

---

## 6. CEO + GPT 補足 (= 進行判断調整)

> 「9a corrective に戻って停止」 ではなく
> 「9a はほぼ採用、 未解決 1 件だけ carry して次へ進む」

→ 本 readiness は 「9a 採用 + carry を 9b 先頭」 の進行方針を反映。
→ 9a で止まらず、 9b-1 で selected title overlay 修正を最初に処理。

---

## 7. 設計書 references

- `docs/alter-plan-map-redesign-spec-audit.md` v3
- `docs/alter-plan-map-redesign-impl-readiness.md` v2
- `decision-log.md` (= 9a-impl 4 step + corrective + carry 判定)
- `lib/plan/map/featureFlags.ts` (= `MAP_NEW_SURFACE_ENABLED`、 default false)
- `lib/plan/map/types.ts` / `lib/plan/map/pinSvg.ts` / `lib/plan/map/adapters/externalAnchorMapAdapter.ts`
- `components/plan/map/MapBottomSheet.tsx` / `DayItemsPanel.tsx`
- `app/(culcept)/plan/tabs/MapTab.tsx` (= PlanMapView newMode 分岐)
