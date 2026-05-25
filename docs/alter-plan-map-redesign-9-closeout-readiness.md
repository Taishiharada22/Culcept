# Plan Map Redesign — 9 Closeout Readiness (= flag 削除 + 旧 path 物理削除 + 単一 path 化)

**Status**: 着手前 readiness (= CEO 採用待ち)
**Date**: 2026-05-25
**Author**: Build Unit (Claude)
**設計書系列**: spec v3 → readiness v2 → 9a-impl 4 step + corrective → 9b-1〜9b-6 → **本 9 closeout readiness**

---

## 1. 背景

### 1.1 9b 完了状況 (= 全 7 step 完了)

| step | commit | 内容 | 判定 |
|---|---|---|---|
| 9b-1 | c665898d | selected pin title overlay + icon 中心微調整 | 採用 |
| 9b-2 | 9dc9eb7e | spatial binding 強化 (= pin 真上寄り + Y clamp) | 採用 |
| 9b-3 | cac68b89 | visual polish (= cafe/home redesign + drop-shadow) | 採用 |
| 9b-4 | e7afc125 | layout 整理 (= sheet open 時 panel hide) | 採用 |
| 9b-5 | ec07808c + 6670d48a | string audit (= 真の混在 0、 docs-only) | 採用 |
| 9b-6 | 3363b48c | sheet slide-up animation (= 250ms iOS-like easing) | 採用 |

### 1.2 9 closeout の目的

flag-based 二重実装を**単一 path に統合**:
- `MAP_NEW_SURFACE_ENABLED` const 削除
- 全 flag check 削除 (= `{!MAP_NEW_SURFACE_ENABLED && (...)}` / `MAP_NEW_SURFACE_ENABLED ? ... : ...` 全廃)
- 旧 UI components 物理削除
- 単一 path に統一 (= 「常に新 surface」)

---

## 2. Scope (= 削除 + 変更 inventory)

### 2.1 flag 削除

| file | 内容 |
|---|---|
| `lib/plan/map/featureFlags.ts` | **全 file 削除** (= `MAP_NEW_SURFACE_ENABLED` const のみの module、 用済み) |
| 全 import 文 | `import { MAP_NEW_SURFACE_ENABLED } from ...` 削除 |
| 全 reference | `MAP_NEW_SURFACE_ENABLED` 参照削除 + condition 解消 |

### 2.2 旧 UI sub-component 削除 (= MapTab.tsx 内、 2086 lines → 推定 1200-1400 lines)

| function | line range | 用途 (= flag OFF path 限定) | 削除 |
|---|---|---|---|
| `SelectedAnchorCard` | ~1414-1730 | 旧 selected anchor 詳細 card | ✅ |
| `CategoryGrid` | ~1731-1784 | 9 categories grid | ✅ |
| `CategoryCard` | ~1785-1927 | grid 内 card (= CategoryGrid 子) | ✅ |
| `UnresolvedAnchorsSection` | ~1928-2034 | 場所未確定 anchor section | ✅ |
| `StaticAlterSuggestionCard` | ~2035-2067 | 静的 Alter suggestion placeholder | ✅ |
| `MapPlaceholder` | ~1389-1413 | failsafe placeholder | **維持** (= newMode でも key 不在時に表示) |
| `DaySwitcher` | ~689-776 | day 切替 button | **維持 or 削除判断** (= newMode で hide 中、 機能再導入の可能性検討) |

### 2.3 MapTab 内 旧 state / handlers 削除

- `selectedAnchorId` state (= 旧 legacy、 newMode で `newSelectedPinId` に置換済み)
- `selectedAnchorForCard` useMemo (= fallback to dayAnchors[0]、 旧 UX)
- `handlePinTap` handler (= 旧)
- 旧 handler 経由の `setSelectedAnchorId` 全 call site
- 旧 sub-component への props pass-through (= SelectedAnchorCard / CategoryGrid 等)
- `dayAnchorsOverlapSet` (= SelectedAnchorCard hasOverlap 用、 newMode 不使用)
- expandedTransitionIndices (= DayGraphTimeline 用、 newMode 不使用) → 慎重判断

### 2.4 PlanMapView 内 legacy 削除

- CIRCLE marker logic 削除 (= `iconStyle` の else 分岐 = SymbolPath.CIRCLE)
- 旧 marker label logic 削除 (= newMode SVG embed のみで十分)
- newMode prop 自体不要 (= 常に新挙動) → 但し prop API 互換性のため残す or 削除判断

### 2.5 PlanClient.tsx 改変

- `import { MAP_NEW_SURFACE_ENABLED }` 削除
- `useNewShell = LIST_NEW_TIMELINE_ENABLED || MAP_NEW_SURFACE_ENABLED` → **`useNewShell = LIST_NEW_TIMELINE_ENABLED || activeTab === 'map'`**
  - **理由**: Map は単一 path で常に新 shell。 LIST が flag OFF でも、 Map tab 時は新 shell が必要
  - これにより Map = 常に新 / List = LIST flag 制御 / Calendar = LIST flag 制御 (= 既存)

### 2.6 test 影響範囲 (= 24 件 testid 参照)

旧 testid を参照する test:
- `plan-map-fab` (= FAB testid、 旧 UI)
- `plan-map-day-switcher` (= DaySwitcher、 newMode で hide 中)
- 他

→ 旧 UI 削除 → 旧 testid を持つ test を **更新 or 削除**。 全 test PASS 維持。

---

## 3. atomic vs partitioned

### 3.1 CEO + GPT 判定 (= readiness 訂正時、 2026-05-25)

> 旧 UI file 削除は 9 closeout (= flag 削除 + 単一 path 化) と同時 atomic が正解

→ **atomic 1 commit が原則**。 段階分割せず。

### 3.2 規模感

- 削除 line 数: 推定 800-900 lines (= MapTab.tsx 内 sub-components + helpers + flag check + state/handler)
- 追加 line 数: ほぼ 0 (= 統合のみ、 新規 logic なし)
- 影響 test file: 5-10 file (= 旧 testid 参照箇所 update)

### 3.3 atomic で何が garantees される

- 中間状態に存在しない (= flag OFF path が壊れた状態を avoid)
- branch merge 時 1 commit = 1 review unit
- rollback = 1 commit revert で元に戻る
- test suite が atomic に green 維持

---

## 4. Risk + Mitigation

### 4.1 Risk

| Risk | 確率 | 影響 |
|---|---|---|
| 旧 sub-component から helper への hidden dependency | 中 | tsc error or runtime error |
| 旧 testid を参照する test の breakage | 高 | test fail (= 修正で吸収) |
| `useNewShell` 変更による LIST 側挙動変化 | 低 | List test fail (= LIST 8b-7-B 影響範囲) |
| PlanMapView newMode prop 削除時の旧 caller (= 仮にあれば) | 低 | tsc error |

### 4.2 Mitigation

1. **削除前確認 grep**: 各 component の全 caller を grep で発見、 削除漏れ防止
2. **段階 commit (= 内部 atomic 但し work-in-progress 中)**: ローカルで段階削除、 最後 1 commit にまとめる
3. **tsc + vitest 各段階で実行**: green 維持確認しながら進める
4. **test update**: 旧 testid を持つ test は新 testid に update or 削除
5. **smoke 必須**: closeout 後 dev server 起動 → 旧挙動の sanity check
6. **CEO 承認後 commit**: closeout は production user 体験変更、 CEO 確認必須

---

## 5. 9b-5 deferred 8 件の扱い (= CEO 補正準拠)

9b-5 audit doc で deferred とした 8 件:
- PlanMapView 内 placeholder / overlay text (= 「pin」 「baseline」 「地理」 等)
- map div aria-label 「地図 (選択日の予定の場所)」 (= newMode で DaySwitcher hide で 「選択日」 不正確)

CEO 補正: 「flag ON 通常体験で見える」 を closeout で整理対象に。

**判定**:
- 9 closeout で **通常 path で見える text を統一**
- placeholder (= key 不在 / loading) → 「マップ」 統一 or 維持
- overlay text (= pin 0 / api 不可) → 「ピン」 「拠点」 等の natural Japanese 化
- aria-label → 「マップ (今日の予定の場所)」 等の正確化

scope に含めるかは CEO 判断 (= atomic の scope 拡大 vs 後段別 patch)。

---

## 6. 進行プロトコル

1. **本 readiness 承認** (= CEO 判断)
2. branch 切替 (= `feat/alter-plan-map-impl-9-closeout`)
3. ローカル段階削除 + 各段階 tsc/vitest 確認
4. atomic commit (= 全削除 + 全更新 1 commit)
5. dev server 起動 + smoke (= 旧 path 復活させず、 単一 path 確認)
6. CEO 採用判定
7. branch merge 候補 (= /plan complete までは frozen 維持の方針継続)

---

## 7. 不変原則 (= 9b から carry)

- 中立文体 (= 命令形 / 評価形容詞 / 推奨語 なし)
- 規約 24-extended (= focus-visible:border-slate-300)
- 絵文字 0 (= 全 SVG icon)
- imageUrl 常に undefined (= adapter で保証、 placeholder β 維持)
- 既存 frozen file 不触 (= googleMapsLoader.ts etc.)

---

## 8. CEO 判断仰ぐ 3 点

| Q | 内容 | 推奨 |
|---|---|---|
| **Q1** | atomic 1 commit でよい? それとも sub-step (= 9-closeout-1 flag check 削除 / 9-closeout-2 file 削除 等) | **atomic** (= CEO + GPT 既判定) |
| **Q2** | 9b-5 deferred 8 件 (= placeholder/overlay text 統一) を 9 closeout scope に含める? | **含める** 推奨 (= clean migration の機会、 但し scope 拡大) |
| **Q3** | `DaySwitcher` 削除 vs 維持 (= newMode で hide 中だが、 day 切替機能再導入の可能性) | **維持** 推奨 (= 機能損失なし、 hide 戻し容易) |
