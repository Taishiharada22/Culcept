# Map Impl Readiness (= v3 spec freeze candidate ベース、 sub-phase 計画書)

**日付**: 2026-05-24
**作成判断**: CEO + GPT 「v3 (= commit c14e7778) 補正方向は正しかった」 + 既定の A → C → impl の C 段階着手
**前提**: Map spec audit v3 (= spec freeze candidate) + List closeout audit + sub-phase 8 全 16 commit + 30+ accumulated commit
**status**: **readiness v2 (= CEO + GPT 3 点補正反映済)** (= 採用 + 9a-pre GO 確認済、 9a-pre で停止条件)
**revision**: v2 (= v1 1 次案 → v2 3 点補正: flag 名 SURFACE / selected state 同期表 / route fallback)

---

## §1 Background + Scope

### 1.1 readiness の役割

Map spec audit v3 で **設計原則 + 4 レイヤー + 15 spec 項目 + 4 領域大枠** を採用方向で確定。 本 readiness は **実装計画書** として、 v3 spec の各領域を impl 段階で 「ぶれない」 ように細部まで落とし切る。

### 1.2 readiness で扱う 4 + 1 領域 (= CEO + GPT 明示)

- selected pin label policy 細部 (= §2.1)
- sheet state 細部 (= §2.2)
- route rendering source (= §2.3)
- legend / controls / CTA 優先順位 (= §2.4)
- + 既存 MapTab 改修計画 (= §3)

### 1.3 やらないこと

- Map 実装着手 (= readiness の役目は計画、 impl は CEO 採用判定後 sub-phase 9a から)
- v3 spec の大枠変更 (= 4 領域は v3 で採用方向、 細部のみ readiness で詰める)
- 既存 PlanMapView + 3 hooks の改修計画 (= 全て不触対象)
- LLM 接続 / score 算出 / 強い評価文 (= List と同じく凍結)

---

## §2 v3 spec → impl 4 領域 落とし切り

### 2.1 selected pin label policy 細部 (= v3 §6.5 「selected pin のみ」 を impl 言語化)

#### 2.1.1 起動 trigger
- pin tap → 該当 pin を selected 状態に
- 既 selected pin tap → state 維持 (= 何も起こらない)
- map 空白 tap → selected 解除 (= label 消失 + sheet closed)

#### 2.1.2 dismiss
- 別 pin tap → selected 移動 (= 旧 label 消失、 新 label 表示、 sheet 内容更新)
- map 空白 tap → selected 解除 (= label 消失、 sheet closed)
- sheet close (= drag down / handle tap) → selected 維持 + label 維持 (= ラベルだけ残す)

#### 2.1.3 表示制限
- title: **最大 8 文字**、 超過は `…` (= ellipsis)
- time: HH:MM (= 5 文字固定)
- label 全体幅: 最小 80px、 最大 160px (= viewport 依存)

#### 2.1.4 z-index 関係
- label: z-30 (= pin 上層、 ただし sheet より下)
- pin: z-20
- map base: z-0
- sheet: z-40 (= label より上、 タップ干渉防止)
- controls / legend: z-10 (= map 上、 label より下)

#### 2.1.5 animation
- fade in / out: 150ms (= subtle)
- position change (= 別 pin tap): instant (= 旧 fade out → 新 fade in)
- 規約 24-extended は label に直接 apply 不要 (= label は非 interactive)

#### 2.1.6 selected state 同期表 (= 8b-7 CEO 補正 #2、 7 場面で確定)

各 user 操作で **selected pin** + **sheet state** がどう変わるかを固定。 ぶれ防止。

| 場面 | selected pin | sheet state |
|---|---|---|
| **初期** (= Map tab 開いた直後) | なし (= null) | closed |
| **pin tap** | 該当 pin に設定 | closed → **half** (= 250ms slide up) |
| **selected pin 再 tap** | 維持 (= 同 pin) | half → **expanded** (= 200ms slide up) |
| **sheet close** (= handle drag down / map tap on sheet outside) | **selected 解除** (= 同時に消す) | half/expanded → **closed** |
| **day switch** (= DaySwitcher ‹ ›) | **selected 解除** (= 異 day の pin) | half/expanded → **closed** |
| **map pan / zoom** | **維持** (= 同 selected) | 維持 |
| **background tap** (= map 上の pin / control 以外 area tap) | **selected 解除** | half/expanded → **closed** |

#### 2.1.7 同期表の根拠
- 「pin tap → selected + sheet」 を bind することで 「selected と sheet 内容の同期」 を保証
- 「再 tap → expanded」 (= no-op ではなく) で sheet の deeper exploration を 1 tap で
- 「day switch / background tap → 解除」 で stale state 回避
- 「map pan/zoom → 維持」 で user が地理を見ながら同 pin の sheet 参照可能

---

### 2.2 sheet state 細部 (= v3 §9.5 「half + expanded」 を impl 言語化)

#### 2.2.1 state transition timing
- closed → half: pin tap 直後、 250ms slide up
- half → expanded: drag up / sheet body tap 後、 200ms slide up
- expanded → half: drag down + drag threshold (= §2.2.2)
- half → closed: drag down + drag threshold、 200ms slide down

#### 2.2.2 drag threshold
- **expand**: 上方向 60px+ drag で expanded、 60px 未満は half に戻る (= snap back)
- **collapse**: 下方向 100px+ drag で closed、 100px 未満は half に戻る
- momentum (= velocity 高い時): threshold を 30px に軽減

#### 2.2.3 sheet 内 scroll vs sheet drag の判別
- expanded で sheet 内コンテンツが scroll 可能な場合:
  - sheet 内 scroll position が top (= scrollTop === 0) なら drag down で sheet collapse 候補
  - scrollTop > 0 なら content scroll 優先 (= sheet drag 無効)
- half では sheet 内 scroll なし (= content fit、 drag 100% sheet 制御)

#### 2.2.4 escape (= 緊急 close 手段)
- ESC キー (= デスクトップ Browser)
- back button (= mobile)
- handle double-tap (= optional、 v3 scope 外)

#### 2.2.5 v3 scope 外 (= 別 sub-phase で扱う)
- collapsed (= peek 80-100px) state
- swipe gesture (= 軽 swipe で next/prev pin)
- pull-to-dismiss
- sheet 内 scroll behavior 細部 (= momentum / snap point)

---

### 2.3 route rendering source (= v3 §5 「抽象線」 を impl 技術選択)

#### 2.3.1 候補比較

| 候補 | source | 利点 | 欠点 |
|---|---|---|---|
| **A** | Google Maps Polyline (= 既存 PlanMapView 流用) + 実 route truth (= Directions API) | 正確な道路 route | API call 増、 truth 主張 (= v3 spec 「ナビ ではない」 と矛盾)、 cost |
| **B** | inline SVG line (= 緯度経度 → canvas 座標、 直線 / Bezier 描画) | 完全抽象、 既存 PlanMapView 不触 | SVG layer の map 上 overlay 必要、 viewport 変化に追従 logic |
| **C** | Google Maps Polyline + 抽象化 (= 既存 Polyline を gray dashed simple 直線で render、 Directions API なし) | 既存 PlanMapView 流用、 抽象 spec 整合 | Polyline option の制御 |

#### 2.3.2 推奨: **C**

理由:
- 既存 frozen file `PlanMapView` (= Google Maps integration) **不触維持** (= readiness §3.2 / List redesign 全 phase で守った規約)
- v3 spec §5 「ナビではなく 1 日の流れ可視化線」 「正確経路を背負わせすぎない」 と整合
- Polyline option (= `strokeOpacity`, `strokeWeight`, `geodesic`, `icons` で dash pattern) で抽象線を実現可
- pin 間を **直線** (= geodesic false) で接続、 stroke gray + dashed pattern

#### 2.3.3 不採用理由
- 案 A: Directions API call が v3 spec 「ナビ禁止」 と矛盾、 cost + truth 主張過剰
- 案 B: SVG overlay layer は map zoom / pan に追従が複雑、 既存 PlanMapView との同期 layer 必要

#### 2.3.4 route fallback 定義 (= 8b-7 CEO 補正 #3、 polyline 状況別 fallback 固定)

「polyline が取れない / 弱い時の fallback」 を readiness で固定。 route が **何も出ない状態を避ける** (= 流れの可視化が常に成立)。

| polyline 状況 | render 方法 | 内容 |
|---|---|---|
| **強** (= 既存 PlanMapView Polyline が有効、 緯度経度 確定) | 細い中立破線 Polyline | strokeColor: gray (= slate-300 相当 `#cbd5e1`)、 strokeWeight: 1.5、 strokeOpacity: 0.8、 dash pattern (= Polyline icons オプション) |
| **弱** (= Polyline option 一部不可、 緯度経度 一部欠落) | 抽象直線 (= 緯度経度 confirmed pin 間のみ接続) | 同色 同 weight、 confirmed pin のみ繋ぐ (= 不明 pin は skip)、 流れの主要部だけ保つ |
| **使えない** (= Google Maps 自体 unavailable、 API key なし) | sheet 内 fallback text + map placeholder で route render 自体 skip | map placeholder 状態で route は出さない (= map がない時に route 線だけ表示しても意味なし) |

#### 2.3.5 不変原則
- 常に **ナビ精度を主張しない** (= 細線 + dashed + neutral 色)
- **距離 / 交通手段を強く出さない** (= label / overlay / tooltip 0)
- map が表示できる時は **route が何も出ない状態を避ける** (= 強 / 弱 のどちらかで必ず出す)
- map 自体が出ない時は route も skip (= 整合性、 map placeholder で代替 message)

---

### 2.4 legend / controls / CTA 優先順位 (= v3 §21 「sheet 優先」 を impl 順序化)

#### 2.4.1 impl 優先順位 (= sub-phase 内の commit 順)

| 優先 | 領域 | 理由 |
|---|---|---|
| **最優先 (= sub-phase 9a)** | BottomSheet 新規 (= half + expanded、 中身 4 段構造) | CEO 「sheet で完成度決まる」 |
| 高 (= 9a) | Pin SVG (= 涙型 + 白抜き + selected ラベル) | sheet と表裏一体 |
| 高 (= 9a) | Route 線 (= 抽象 dashed) | pin 揃ったら線で繋ぐのが自然順序 |
| 中 (= 9b) | Legend (= 左下、 collapse 可) | 補助、 sheet/pin 完成後 |
| 中 (= 9b) | Controls (= zoom / current location 位置調整) | 補助 |
| 低 (= 9c) | 文字列統一 (= 5 件 「地図」 → 「マップ」) | 仕上げ |

#### 2.4.2 既存 SelectedAnchorCard との切替 timing
- flag ON: 新 BottomSheet render (= 既存 SelectedAnchorCard 非表示)
- flag OFF default: 既存 SelectedAnchorCard 維持
- 二重表示防止 hard rule (= List 8a-impl pattern 流用)

#### 2.4.3 既存 CategoryGrid + CategoryCard の扱い
- mock に存在しない (= map main view に category grouping なし)
- **flag ON で削除**、 flag OFF 維持
- ただし 「9 categories grouping」 機能自体は別 view (= 詳細 / 別 tab) で残す可能性、 9c 以降で判断

#### 2.4.4 FAB の Map での扱い
- List で flag ON 削除済 (= sub-phase 8b-7-B / 8b-8)
- Map でも **flag ON で削除** (= 同 pattern、 「+ 教える」 button 不要 / mock に無い)
- flag OFF 維持

---

## §3 既存 MapTab 改修計画

### 3.1 改修対象 (= flag ON で新規 render or 置換)

| component | 改修内容 | sub-phase |
|---|---|---|
| SelectedAnchorCard (= 1001-1280 行) | flag 切替で **新 BottomSheet** と排他、 既存維持 | 9a |
| DaySwitcher (= 544-630 行) | List date picker (= ‹ 📅 ›) と **統一** or 別維持 | 9a |
| CategoryGrid + CategoryCard (= 1318-1500 行) | flag ON で **削除** (= mock 無し)、 OFF 維持 | 9b |
| FAB (= 521 + 関連) | flag ON で **削除** (= List 同 pattern)、 OFF 維持 | 9b |
| 文字列 5 件 (= 859 / 869 / 920 / 1534 / 1535) | 「地図」 → 「マップ」 | 9c |

### 3.2 不触 (= 既存 frozen 維持)

| 対象 | 理由 |
|---|---|
| PlanMapView (= 632-975 行 Google Maps render) | Google Maps integration 中核、 spec 外、 v3 §18.3 |
| `_useMapTabMovementDisplay.ts` | L-4d-b1 movement display、 既存仕様 |
| `_useMapTabFeasibilityDisplay.ts` | M-3d feasibility、 既存仕様 |
| `_usePlanGeocode.ts` | geocoding hook、 既存仕様 |
| コメント内 「地図」 (= 1529 / 1530) | user 非可視、 触らない |
| `PlanClient.tsx` 旧コメント | 履歴コメント、 触らない |
| `YourSelfSection.tsx` 「自分を知る旅の地図」 | 別領域、 比喩、 触らない |

### 3.3 新規 file 候補 (= 9a-9c で作成)

| file | sub-phase | 内容 |
|---|---|---|
| `app/(culcept)/plan/components/map/MapBottomSheet.tsx` | 9a | 新 BottomSheet (= half + expanded、 4 段構造) |
| `app/(culcept)/plan/components/map/MapPin.tsx` | 9a | 涙型 SVG pin (= semantic color + 白抜き icon + selected ラベル) |
| `app/(culcept)/plan/components/map/MapRouteLine.tsx` or PlanMapView 内 Polyline 調整 | 9a | 抽象 dashed gray line |
| `lib/plan/map/adapters/externalAnchorMapAdapter.ts` | 9a-pre | ExternalAnchor → MapPinViewModel pure 変換 |
| `tests/unit/plan/map/externalAnchorMapAdapter.test.ts` | 9a-pre | adapter contract test |
| `tests/unit/plan/map/mapBottomSheetRenderContract.test.tsx` | 9a | sheet render contract |
| `tests/unit/plan/map/mapPinRenderContract.test.tsx` | 9a | pin render contract |
| `lib/plan/map/featureFlags.ts` **新規** | 9a-pre | `MAP_NEW_SURFACE_ENABLED` const、 default false (= CEO 補正 #1: timeline 語混在禁止、 list と分離した map module で管理) |

---

## §4 sub-phase 候補 (= List 8a-8c pattern 流用、 9a/9b/9c 分割)

### 4.1 sub-phase 9a (= 主要 component、 最優先)

- **9a-pre**: adapter (= ExternalAnchor → MapPinViewModel) + featureFlags 拡張 + contract test
- **9a-impl**: MapTab 内 flag 切替 (= 早期 return pattern 流用)、 新 MapBottomSheet / MapPin / Route line 統合

範囲:
- MapPin (= 涙型 + semantic color + 白抜き SVG icon)
- selected pin label
- Route line (= Polyline 抽象化 or 新 line)
- MapBottomSheet (= half + expanded 2 state、 4 段構造 = 大 icon / time/title/location / meaning / 2 CTA)
- 既存 SelectedAnchorCard との flag 排他

### 4.2 sub-phase 9b (= 補助 + 整理)

- Legend (= 左下、 collapse 可)
- Controls 位置調整 (= zoom / current location)
- CategoryGrid 削除 (= flag ON)
- FAB 削除 (= flag ON)

### 4.3 sub-phase 9c (= 仕上げ + 表記統一)

- 「地図」 → 「マップ」 5 件統一
- 任意 visual smoke 補正
- closeout audit

### 4.4 visual smoke タイミング (= List pattern 流用)

- 9a 完了後 1 回必須 (= sheet + pin + route の主要部確認)
- 9b 完了後 1 回 (= 補助確認)
- 9c 完了後最終 1 回 (= closeout 前)

---

## §5 機械保証 規約 (= List で確立、 Map 持ち込み)

- **vitest contract test** (= react-dom/server renderToStaticMarkup、 @testing-library なし)
- **tsc surface** = 0 error (= 新規 / 改変 file)
- **禁止語 10 件 grep** = 0 (= 本体 component、 test は negative assertion meta 可)
- **規約 24-extended grep** = focus-visible:border-slate-300 (= brand 色 focus 0)
- **flag OFF default 完全不変** (= 既存 user 影響 0、 全 sub-phase 期間 hard rule)
- **pure module** (= adapter / inference 系 LLM / API / DB / network 不使用)
- **frozen file 不触** (= PlanMapView + 3 hooks + 既存 SVG icon system 触らない)

---

## §6 next phase

### 6.1 readiness 採用判定 → sub-phase 9a 着手

1. CEO 採用判定 (= 本 readiness 1 次案 採用 OK か)
2. OK なら **branch 切替** (= `feat/alter-plan-map-impl-flowtab-9a` 等)
3. 9a-pre 着手 (= adapter + flag pure module + contract test、 sub-phase 8a-pre と同 pattern)
4. 報告と停止 → CEO 判断 → 9a-impl 着手

### 6.2 sub-phase 順序 (= 全体 timeline 候補)

| sub-phase | 内容 | smoke |
|---|---|---|
| 9a-pre | adapter + flag pure module + contract test | tsc + vitest |
| 9a-impl | MapTab flag 切替 + 新 component 統合 | 9a 完了後 visual smoke 1 回必須 |
| 9b | Legend / Controls / CategoryGrid 削除 / FAB 削除 | 9b 完了後 visual smoke 1 回 |
| 9c | 文字列統一 + 仕上げ | 9c 完了後最終 visual smoke 1 回 |
| 9 closeout | audit doc | docs-only |

### 6.3 CEO 採用判定仰ぐ 4 点

1. **本 readiness 採用 OK か** (= 1 次案 / 修正 / 別案)
2. **§2 4 領域細部** (= label / sheet state / route source / 優先順位) 各 OK か
3. **§3 既存 MapTab 改修計画** (= 改修対象 + 不触判定) OK か
4. **§4 sub-phase 9a/9b/9c 分割** OK か (= List 8a-8c pattern 流用)

---

**本 readiness は CEO 採用判定後、 sub-phase 9a 着手のための計画書**。
