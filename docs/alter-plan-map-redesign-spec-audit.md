# Map Redesign Spec Audit (= Map 固有 8 論点 1 次案 + 既存 MapTab inventory + List 設計 rule との対比)

**日付**: 2026-05-24
**作成判断**: CEO + GPT 「List closeout 採用 + 次 A: Map spec audit + 設計 rule そのままコピー禁止 + map 固有 8 論点先定義」
**前提**: List redesign closeout audit (= 別 file) 完了済
**status**: **readiness 段階** (= CEO 採用判断仰ぐ前の 1 次案)

---

## §1 Background + Scope

### 1.1 なぜ Map redesign が必要か

- List redesign sub-phase 8 で 「当日のプラン」 + tabs カレンダー / リスト / マップ 構造が確立
- List 側は 8a / 8b / 8c / 8c-2 で mock 整合まで到達 (= CEO smoke PASS)
- **マップ tab に切り替えた時の体験はまだ List と同密度で詰められていない**
- 既存 MapTab.tsx は 1673 lines、 Phase 2-C / M-3d 等で実装済だが、 List redesign の文体規約 / 視覚規約 / SVG icon system に未追随

### 1.2 本 audit の scope

- **Map 固有 8 論点の 1 次案整理** (= CEO + GPT 明示)
- **List 設計 rule との対比** (= 持ち込み / 上書き / 別扱い の判断)
- **既存 MapTab inventory** (= 何を残し、 何を置換、 何を不触)
- **readiness 結論** (= 次 phase 候補、 IA audit / Spec audit / impl の進行案)

### 1.3 本 audit でやらないこと

- Map 実装 (= 本 audit は readiness、 impl は CEO 判断後別 phase)
- Google Maps API integration の再設計 (= 既存仕様 不触)
- List の残課題 (= 8d は別領域、 本 audit 範囲外)
- Map の score / 評価 logic (= List と同じく解釈レイヤーで凍結)

### 1.4 重要条件 (= GPT 明示)

> List の設計 rule を Map にそのままコピーしない。 Map 固有の論点を先に定義する。

→ 本 audit は **Map 固有性を先に詰める** ことを最優先する。 List rule は §10 で対比表として最後にまとめる (= 「持ち込む / 持ち込まない」 判断を保留しつつ、 影響範囲を可視化)。

---

## §2 論点 1: pin の情報密度

### 2.1 問い

Map 上の pin は、 何を 「見せる / 隠す」 べきか? List の EventCard と同じ情報量? それとも Map らしく削ぎ落とすか?

### 2.2 List 側 EventCard の情報軸 (= 参考)

| 軸 | List 表現 | Map で再利用? |
|---|---|---|
| 時刻 range | 時刻 col + EventCard 内 startTime-endTime | pin tooltip / selected sheet |
| title | EventCard title text-base font-semibold | pin label or selected sheet |
| location | SVG pin + 短文 | pin 自体が location なので別軸 |
| alterNote | ✨ + 1 行自然な日本語 | selected sheet で表示 |
| category | 左 border + 背景 tint + spine icon | pin 色 / 形 |
| source (= origin) | SourceIndicator compact | pin 上で出さない (= 詳細 sheet) |
| execution counts | ExecutionLayerChip | 出さない (= 8c-2 で確定) |

### 2.3 Map 固有 制約
- pin は **緯度経度** に bind される → 位置が固定
- 同一座標に複数 anchor がある可能性 (= clustering)
- 画面解像度に対して pin が混雑する可能性

### 2.4 設計選択肢

**案 A**: pin に最小情報 (= category 色 + icon のみ)、 詳細は selected pin → bottom sheet
**案 B**: pin に title 短縮 (= 4-6 文字) を載せる、 視覚密度 up
**案 C**: zoom 級別に密度切替 (= 遠視 minimal / 近視 title 付き)

### 2.5 Claude 1 次案

**案 A 寄り**: pin は色 + icon のみ、 title / 時刻 / alterNote は bottom sheet。 理由:
- mock 1 日表示 (= 数 pin) なら混雑しないが、 複数日分にすると pin 密集
- 「マップ = 位置の俯瞰、 List = 内容の俯瞰」 の役割分担と整合
- List 側で title text-base を出している → Map で重複出す必要なし

ただし **case 確認**: 4-6 pin (= 1 日分) なら案 B も視覚的に richで OK。

→ **CEO 判断仰ぐ**: 案 A / B / C どれを基本方針にするか

---

## §3 論点 2: route / flow の見せ方

### 3.1 問い

Map 上で 1 日の 「流れ」 (= 出発 → 予定 → 予定 → 帰宅) をどう表現するか?

### 3.2 List 側 (= 参考)
- TimelineSpine 1 本軸 + 移動 chip + dashed line
- 時間順 + spine line で 「線」 表現
- 「移動」 はラベル 1 つ (= 距離 / 所要時間は表示せず)

### 3.3 Map 固有 制約

- pin 間に **物理的距離** がある (= List と違って distance 自明)
- 順序を示すには **番号** か **線** が必要
- Google Maps Polyline で route 描画可能

### 3.4 設計選択肢

**案 A**: pin に **番号** (= 1, 2, 3...) で訪問順
**案 B**: pin 間に **細い線** で flow (= 直線 / 曲線 / Polyline)
**案 C**: 案 A + B 併用 (= 番号 + 線)
**案 D**: hover / selected pin で **次の pin にハイライト線**

### 3.5 Claude 1 次案

**案 C 寄り**: 番号 + 細い線。 ただし線は **直線細 dashed** (= List の transition dashed と整合) で 「正確な route」 を主張しすぎない (= GPT 「truth なき semantics 主張禁止」 適用)。

理由:
- List で 「移動」 を抽象的に表現した思想と整合
- 実 route (= 経由地 / mode / 所要時間) は別 truth、 現段階で持たない
- 番号で 「順序」 を示し、 線で 「繋がり」 を示す

→ **CEO 判断仰ぐ**: route の truth (= Google Directions API 呼出) を取りに行くか / 抽象 line で留めるか

---

## §4 論点 3: map 上での source semantics の見せ方

### 4.1 問い

EventCard の SourceIndicator (= origin axis) を Map pin で表現するか? しないか?

### 4.2 List 側 (= 参考、 第 12 補正 #2 hierarchy)
- main card (= compact): user origin → null、 imported → slate-500 dot + 📄、 alter_proposed → indigo-400 dot + ✨、 alter_accepted → null (= dot 消滅)
- detail sheet (= full): 全 origin 表示 + 「Alter 提案を受け入れ済」 caption

### 4.3 Map 固有 制約
- pin は 既に category 色を使う → source 色を併用すると混乱
- pin サイズ が小さい → dot 追加は視覚密度 up
- selected pin → bottom sheet で詳細表示可能

### 4.4 設計選択肢

**案 A**: pin 上は source 一切出さない、 bottom sheet (= selected) で SourceIndicator full
**案 B**: pin に小さい source badge (= 角に 📄 / ✨)、 詳細は bottom sheet
**案 C**: imported / alter_proposed のみ pin に視覚 marker、 user origin は marker なし

### 4.5 Claude 1 次案

**案 A**: pin は category 色のみ、 source は bottom sheet で full 表示。 理由:
- 第 12 補正 #2 hierarchy (= main card で user 同等視) を Map にも持ち込む (= ただし bottom sheet を List の 「詳細 sheet」 相当として位置付ける)
- pin 視覚密度を最小化、 category 色を強化
- bottom sheet で SourceIndicator full variant (= 既存 sub-phase 6 で実装済) を活用 = List との一貫性

→ **CEO 判断仰ぐ**: pin 上の source 表示は完全 0 で OK か / proposed (= 未受け入れ) のみ marker 付与か

---

## §5 論点 4: selected pin と bottom sheet の関係

### 5.1 問い

Map で pin を tap した時、 何をどう表示するか? 既存 SelectedAnchorCard の構造を活かすか?

### 5.2 既存 MapTab SelectedAnchorCard inventory
- 1001-1280 行、 bottom sheet 風 card
- title / location / 時刻 / 詳細 / unconfirmed banner / source badges / overlap banner / undo 等
- 既に複雑、 wave 1/2/3/J-6e 等 多次重ね

### 5.3 設計選択肢

**案 A**: 既存 SelectedAnchorCard を維持 + List の EventCard / SourceIndicator full / alterNote をそのまま統合
**案 B**: 既存 SelectedAnchorCard を新 BottomSheet に置換 (= List EventCard 縦長版)
**案 C**: 既存維持 + flag ON で別 view (= 二重表示防止 hard rule で排他、 案 1b pattern 流用)

### 5.4 Claude 1 次案

**案 C**: flag 制御 (= MAP_NEW_BOTTOM_SHEET_ENABLED 等) で新旧切替、 既存 SelectedAnchorCard を flag OFF default で維持。 理由:
- 既存 1001-1280 行の機能が wave 1-3 で詰められている (= 失わない)
- 新 bottom sheet を新規実装 (= List EventCard と同密度 + SourceIndicator full + alterNote)
- 案 1b pattern 流用 (= flag OFF 完全不変、 ON で同責務範囲置換)

→ **CEO 判断仰ぐ**: 案 A / B / C どれが妥当か (= 既存維持 vs 新規置換 vs flag 切替)

---

## §6 論点 5: list と map の役割分担

### 6.1 問い

List と Map の使い分けはどうあるべきか? 完全並列 (= 同じ情報の表示違い)? 補完関係?

### 6.2 List 側 役割 (= 8c で確定)
- 時間の流れ (= timeline) を主役に
- 1 日の構造 (= 出発 / 予定 / 移動 / 帰宅) を縦並びで把握
- 「集中と休息のリズム」 等の解釈レイヤー
- SummaryFooter で 1 日全体を俯瞰

### 6.3 Map 候補 役割

**役割 A**: **空間の俯瞰** (= 1 日の予定が物理的にどこに分布しているか)
**役割 B**: **場所の探索** (= 候補地探し、 「ここに何を入れるか」)
**役割 C**: **route 検証** (= 訪問順 / 移動距離 / 物理的実現性)

### 6.4 設計選択肢

**案 X**: Map は空間俯瞰のみ (= 役割 A、 シンプル)
**案 Y**: Map は俯瞰 + route 検証 (= A + C)
**案 Z**: Map は 3 役割全部 (= A + B + C、 複雑)

### 6.5 Claude 1 次案

**案 X 寄り** (= 役割 A の俯瞰中心)。 理由:
- 役割 B (= 場所探索) は List + Add modal (= 「+ 教える」) で代替可能
- 役割 C (= route 検証) は Map 上の番号 + 抽象線で最低限可、 詳細 API は scope 外
- 「マップ = 空間の地理感を取り戻す」 がシンプルで mock 整合

→ **CEO 判断仰ぐ**: Map の主役割を絞るか / 複数役割を共存させるか

---

## §7 論点 6: map における 「移動」 の扱い

### 7.1 問い

List で 「移動 ----- 時刻」 と表現した transition を、 Map ではどう表現するか?

### 7.2 List 側 (= 参考、 sub-phase 8b-8 / 8c-2)
- TransitionChip: 「移動」 pill (= rounded-md bg-white border-slate-200) + dashed line + 時刻 + 詳細 button
- 出発 → 予定 / 予定 → 予定 / 予定 → 帰宅 全箇所
- 抽象的 「移動」 ラベル (= 距離 / mode の truth なし)

### 7.3 Map 固有 制約
- 移動は **2 pin 間の距離** で物理化される
- List の 「時刻 range」 (= 例 11:00-12:00) は Map では時間軸非表示
- 線 (= §3 案 B / C) があれば 「流れ」 は表現可能、 「移動」 ラベルが別途必要か

### 7.4 設計選択肢

**案 A**: 線のみ (= 「移動」 ラベル不要、 線が flow を示す)
**案 B**: 線 + 線中央に小 「移動」 label (= 時刻 range なし)
**案 C**: 線 + selected pin に 「次への移動 = N 分」 ラベル (= Google Directions API)

### 7.5 Claude 1 次案

**案 A**: 線のみ (= 抽象 dashed)、 「移動」 ラベルは Map に出さない。 理由:
- Map の役割は空間俯瞰 (= 役割 A)、 「移動」 強調は List の領分
- 線が流れを示す → ラベル冗長
- 「N 分」 等の truth は scope 外

→ **CEO 判断仰ぐ**: 案 A / B / C のどれが Map らしいか

---

## §8 論点 7: map でも 「意味文」 をどう使うか

### 8.1 問い

List で alterNote (= ✨ + 自然な日本語) を確立した。 Map でも同様に意味文を出すか? どこに?

### 8.2 List 側 (= 参考、 sub-phase 8b-8)
- EventCard 内 ✨ + 1 行自然な日本語
- CategoryMeaning / getNarrative で deterministic 生成
- 例: 「静かなカフェで、 今日の計画を整理しましょう」

### 8.3 Map 固有 制約
- pin 上に意味文を出すと **視覚密度 up + 重複** (= List で既出)
- bottom sheet (= selected pin) で出すなら自然 (= List の詳細 sheet 相当)
- Map 全体の解釈 (= List の SummaryFooter 相当) を Map にも置くか別問題

### 8.4 設計選択肢

**案 A**: pin に出さない、 bottom sheet で alterNote 表示 (= List EventCard 流用)
**案 B**: 案 A + Map 全体に 「空間の解釈」 SummaryFooter 相当 (= 「予定が南北に分布しています」 等の中立解釈)
**案 C**: pin tap 時 hover で 1 行表示

### 8.5 Claude 1 次案

**案 A + B 検討**: bottom sheet に alterNote + Map 全体 解釈 footer。 ただし Map 全体解釈は 「空間」 の解釈 (= List の 「時間」 解釈と別軸)、 文体方針も別途検討必要。

→ **CEO 判断仰ぐ**: Map 全体 解釈 footer の要否 + 文体方針

---

## §9 論点 8: 「地図」 → 「マップ」 表記統一

### 9.1 現状 inventory (= grep 結果)

| file | line | 文字列 |
|---|---|---|
| MapTab.tsx | 859 | "地図の表示には API キーが設定されていません" |
| MapTab.tsx | 869 | "地図を読み込んでいます..." |
| MapTab.tsx | 920 | aria-label="地図 (選択日の予定の場所)" |
| MapTab.tsx | 1529 | "これら anchor は baseline pin として地図に出ている" (= コメント) |
| MapTab.tsx | 1530 | "これら anchor は地図に出ていない" (= コメント) |
| MapTab.tsx | 1534 | "地図に表示されています" |
| MapTab.tsx | 1535 | "地図に出せなかった予定" |
| PlanClient.tsx | 116 | 旧コメント (= "聖地"→"地図") |

**別領域 (= 不触)**:
- components/home/YourSelfSection.tsx 473 「自分を知る旅の地図」 (= 比喩、 触らない)

### 9.2 設計選択肢

**案 A**: 全 「地図」 → 「マップ」 統一 (= comment 含む)
**案 B**: ユーザー目視可能 string (= aria-label / placeholder text) のみ統一、 コメントは不触
**案 C**: tab label のみ統一 (= 既に 8b-9 で実施)

### 9.3 Claude 1 次案

**案 B**: ユーザー目視 string のみ統一 (= MapTab.tsx 859 / 869 / 920 / 1534 / 1535 の 5 件)、 コメント不触 (= 1529 / 1530)、 PlanClient 旧コメント不触 (= 116)

→ **CEO 判断仰ぐ**: 案 A / B / C どこまで統一範囲を広げるか

---

## §10 List 設計 rule との対比 (= GPT 「そのままコピー禁止」 反映)

### 10.1 持ち込み妥当 (= List rule をそのまま適用、 共通基盤)

| 領域 | List rule | Map 適用 妥当性 |
|---|---|---|
| 規約 24-extended (= focus-visible:slate-300) | 全 component | ✅ 持ち込み妥当 |
| 禁止語 10 件 grep | 全 component | ✅ 持ち込み妥当 |
| 文体 (= 命令形 0 / 評価形容詞 0 / 数値 0) | CategoryMeaning + SummaryFooter | ✅ 持ち込み妥当 (= bottom sheet / map 解釈 footer) |
| SVG icon system (= CategoryCafe/Home/Office/Unknown + Briefcase/Meal/LocationPin/Calendar/List/MapPin) | TimelineSpine / EventCard / PlanClient | ✅ 持ち込み妥当 (= Map pin icon / category card) |
| flag 制御 pattern (= 案 1b コード内 const / default false / OFF 完全不変) | featureFlags.ts | ✅ 持ち込み妥当 (= MAP_NEW_BOTTOM_SHEET_ENABLED 等) |
| testing pattern (= renderToStaticMarkup contract) | 全 component test | ✅ 持ち込み妥当 |
| pure module adapter (= ExternalAnchor → ViewModel) | externalAnchorAdapter | ✅ 持ち込み妥当 (= ExternalAnchor → MapPinViewModel) |

### 10.2 上書き / 別扱い (= Map 固有性のため List rule をそのまま使わない)

| 領域 | List rule | Map 別扱い 理由 |
|---|---|---|
| category 表現 | EventCard 背景 tint + border + spine icon | Map は pin 色 + 形のみ (= 背景 tint なし、 §2) |
| timeline 軸 (= 1 本軸 + dashed line) | TimelineSpine items-stretch | Map は緯度経度軸、 timeline 軸なし (= §3 線で flow 代替) |
| 出発 / 帰宅 virtual events | adapter convertExternalAnchorListWithDayBookends | Map では出発 / 帰宅 pin の表現が別 (= 物理座標が同 = 自宅、 重複可能性、 §6) |
| 「移動」 chip | TransitionChip | Map では §7 で別軸 (= 線のみ / ラベルなし) |
| 1 日表示 (= date picker 左右 nav) | FlowTab daysToRender slice | Map 既存 DaySwitcher を維持 / 統一? (= §11 で検討) |
| SummaryFooter (= 解釈レイヤーの器、 下部固定) | List 上 | Map 用 「空間の解釈」 footer は別軸 (= §8) |

### 10.3 保留 (= CEO 判断後決定)

- pin 上 source semantics (= §4)
- selected pin と bottom sheet 統合 / 置換 (= §5)
- 「マップ」 表記統一範囲 (= §9)

---

## §11 既存 MapTab inventory + 不触判定

### 11.1 既存 component (= app/(culcept)/plan/tabs/MapTab.tsx 1673 lines)

| 関数 | 役割 | redesign 影響 |
|---|---|---|
| MapTab (= main) | tab orchestration + DaySwitcher + PlanMapView + SelectedAnchorCard + FAB + CategoryGrid | 改修候補 |
| DaySwitcher | 日付 ‹ 日付 › today、 List date picker と同役割 | List date picker と統一検討 |
| PlanMapView | Google Maps + Polyline + pin render | 不触維持 (= Maps API、 spec 外) |
| MapPlaceholder | 「地図の表示には API キーが設定されていません」 等 | §9 表記統一 |
| SelectedAnchorCard | bottom sheet (= 1001-1280) | §5 で flag 切替 検討 |
| CategoryGrid + CategoryCard | category 別 grouping (= 9 categories) | mock に存在しない、 List redesign 後の Map 役割と整合確認必要 |
| FAB | 「+ 教える」 起動 | List で flag ON 削除済 (= 8b-7-B)、 Map でも同様検討 |

### 11.2 既存 hooks / 関連 file

- `_useMapTabMovementDisplay.ts` (= L-4d-b1 movement display)
- `_useMapTabFeasibilityDisplay.ts` (= M-3d feasibility)
- `_usePlanGeocode.ts` (= geocoding)

### 11.3 frozen 判定 (= List redesign 中触らずに来た範囲)

- PlanMapView (= Google Maps integration): 不触
- _useMapTabMovementDisplay / _useMapTabFeasibilityDisplay: 不触
- _usePlanGeocode: 不触
- → 改修対象は MapTab.tsx 内の SelectedAnchorCard / DaySwitcher / CategoryGrid + 文字列 string

---

## §12 readiness 結論 + 次 phase 候補

### 12.1 本 audit 1 次案サマリー

| 論点 | Claude 1 次案 |
|---|---|
| §2 pin 情報密度 | 案 A 寄り (= 色 + icon のみ、 詳細は bottom sheet) |
| §3 route / flow | 案 C (= 番号 + 細線 dashed、 抽象) |
| §4 source semantics | 案 A (= pin 上は 0、 bottom sheet full) |
| §5 selected pin sheet | 案 C (= flag 切替で既存維持 + 新規) |
| §6 list / map 役割分担 | 案 X (= 空間俯瞰中心) |
| §7 「移動」 扱い | 案 A (= 線のみ、 ラベルなし) |
| §8 意味文 | 案 A + B 検討 (= bottom sheet + Map 解釈 footer) |
| §9 表記統一 | 案 B (= ユーザー目視 string のみ) |

### 12.2 次 phase 候補

**A. Map IA Audit 着手** (= List と同 pattern、 拘束条件確立 + 1 次案を spec audit と分離)
**B. Map Spec audit 確定** (= 本 audit に CEO 採用判定を入れて確定、 spec として固定)
**C. Map impl readiness** (= 既存 MapTab inventory + 8 論点判断後、 impl 着手準備)

### 12.3 Claude 推奨

**B → C → impl** (= 本 audit を CEO 採用判定で spec として確定 → impl readiness → impl)。 理由:
- List で IA → Spec → impl の 3 段階を経たが、 Map は既存 MapTab inventory がある (= 完全新規ではない)
- IA Audit は新規構造に対して有効 (= List は新規 List 視点だった)、 Map は既存改修中心 → spec audit + impl readiness で十分
- 8 論点に CEO 判断が入れば spec として確定可能

### 12.4 CEO 判断仰ぐ事項

1. **本 audit 採用 OK か** (= 1 次案 spec として確定するか、 1 次案修正後採用か)
2. **8 論点それぞれの Claude 1 次案**: 採用 / 修正 / 別案
3. **次 phase 候補**: A / B / C どれを採用
4. **List 8d は今やらないという判断** の継続確認

---

**本 audit は readiness 1 次案**。 CEO 採用判断後、 spec として確定 + 次 phase 着手。
