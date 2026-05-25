# Map Redesign Spec Audit (= CEO 画像深層分析統合版)

**日付**: 2026-05-24
**作成判断**: CEO 「この前提で、 Map spec audit をさらに具体化してください」 (= 参考画像 1 枚を構造 / 役割 / 視線 / 情報密度 / 品の作り方まで分解した分析を提示後)
**前提**: List redesign closeout audit 完了 + CEO 画像深層分析
**status**: **spec freeze candidate (= v3)** (= CEO + GPT 概ね採用、 3 点補正反映済、 CEO 明示採用前は 「freeze candidate」 として扱う)
**revision**: v3 (= v1 8 論点 → v2 CEO 画像分析統合 → v3 CEO 3 点補正反映: 表現 softening + label policy 明文化 + sheet state 固定)

---

## §0 本質 (= CEO 一文要約)

> **Map は 「場所の流れを見る面」、 意味と行動は選択中の sheet に集約する。**

Map は予定一覧の別表示ではない。 **1 日の予定を、 空間の流れとして見るための主画面**。

### 役割分担

| 要素 | 役割 |
|---|---|
| **Map** | どこへ、 どう流れるか |
| **Pin** | その場所の節点 |
| **Route** | 1 日の空間的な流れ |
| **Bottom sheet** | 選択中予定の **意味と行動** |
| **Legend / controls** | 補助 |

### 重要原則

**地図上には最低限だけを置き、 意味と行動は下の sheet に寄せる。**

これが Map 全項目の根本。 全 spec はこの原則の派生。

---

## §1 Background + Scope

### 1.1 なぜ Map redesign が必要か

- List redesign sub-phase 8 (= 16 commit) で 「当日のプラン」 + tabs 構造確立
- List 側 mock 整合 (= CEO smoke PASS)
- **Map tab は List と同密度で詰められていない**
- 既存 `app/(culcept)/plan/tabs/MapTab.tsx` は 1673 lines、 Phase 2-C / M-3d 等で実装済だが List redesign の文体規約 / 視覚規約 / SVG icon system に未追随

### 1.2 本 audit の scope

- **画面本質と 4 レイヤー構造** (= §0 + §3)
- **15 spec 項目** (= §4-§17、 CEO 分解表採用)
- **List rule との対比** (= §16 持ち込み OK / NG)
- **既存 MapTab inventory + 不触判定** (= §18)
- **v1 8 論点 1 次案 → CEO 補正マッピング** (= §19)
- **readiness 結論 + 次 phase 候補** (= §20)

### 1.3 やらないこと

- Map 実装 (= 本 audit は readiness、 impl は CEO 判断後別 phase)
- Google Maps API integration 再設計 (= 既存仕様不触)
- List 残課題 (= 8d は別領域、 本 audit 範囲外)
- Map score / 評価 logic (= List と同じく解釈レイヤーで凍結)

### 1.4 重要条件 (= GPT 明示 + CEO 補正)

> List の設計 rule を Map にそのままコピーしない。 Map 固有の論点を先に定義する。
> Map の完成度は **selected pin sheet の質** で決まる。

---

## §3 4 レイヤー構造 (= CEO 画像分析)

### Layer A: 画面意味づけヘッダー

| 要素 | 内容 |
|---|---|
| 上左 | ハンバーガー |
| 上中央 | ANEURASYNC ALTER ロゴ |
| 上右 | sparkle アイコン |
| section label | ALTER MORNING |
| title | 「今日のプラン」 (= List と共通) |
| **subtitle** | 「場所を地図で確認して、 流れをつかみましょう。」 (= **空間軸**、 List 「時間の流れを把握して、 心地よい 1 日に。」 と差別) |
| toggle | カレンダー / リスト / マップ |

#### Layer A spec

- title は主役、 subtitle は薄く小さく
- subtitle は **空間軸** を言う (= 「場所」 「流れ」 「つかむ」)
- List の文体をそのままコピーしない (= GPT 明示)
- 「マップ」 表記統一 (= §17 詳細)

### Layer B: Map 主体レイヤー

| 要素 | 内容 |
|---|---|
| 地図 | 背景、 薄め、 彩度低め |
| pin | 涙型 + semantic color + 白抜き icon |
| route | 細い中立色 破線 |
| ラベル | 時刻 + 短 title のみ |

#### Layer B spec

- 地図は背景でありつつ流れを読む土台
- map 上に **長文 / provenance / source semantics 載せない**
- 詳細情報は全部 sheet に寄せる

### Layer C: 補助 UI レイヤー

| 要素 | 位置 |
|---|---|
| 凡例 | 左下 |
| zoom in/out | 右側 |
| current location | 右下 |

#### Layer C spec

- すべて脇役
- 白背景 + 軽 shadow + 角丸
- map 主役を邪魔しない
- 触れる が 目立ちすぎない

### Layer D: Bottom sheet (= Map 完成度の中心)

| 要素 | 内容 |
|---|---|
| handle | 上部 |
| 大 category icon | 左 |
| time + title + location | 中央 |
| image | 右 |
| meaning text box | 下段 |
| CTA × 2 | 下段末尾 |
| bottom nav | 最下部 |

#### Layer D spec

- sheet は 「詳細」 ではなく **「意味の面」**
- map で不足する情報をここに集約
- **pin は軽く、 sheet は深く**

---

## §4 Pin spec

### 4.1 形状
- **涙型 pin** (= 先端下指)
- 軽い shadow
- map 上で埋もれない
- 派手すぎない

### 4.2 色 (= semantic color)
- cafe = 紫 (indigo)
- meal = 橙 (orange)
- work = 青 (blue)
- home = 緑 (emerald)
- other = 中立 slate

### 4.3 色のルール
- pin の色は強くてよい
- 画面全体を塗らない
- **強い色は pin と time に集中**
- 面では薄く使う

### 4.4 アイコン
- **白抜き** (= stroke="currentColor" + text-white)
- pin 中央配置
- 一瞬で意味が分かるもの
- **絵文字禁止、 UI icon のみ**

### 4.5 必須 icon
| category | icon source |
|---|---|
| cafe | CategoryCafeIcon (= 既存) |
| meal | MealIcon (= 8b-6 inline) |
| work | BriefcaseIcon (= 8b-7-A inline) |
| home | CategoryHomeIcon (= 既存) |
| other | CategoryUnknownIcon (= 既存) |

### 4.6 selected state
- 軽いラベル (= time + 短 title)
- pin の上方に吹き出し
- 派手にしない

---

## §5 Route spec

### 5.1 役割
**ナビではなく、 1 日の流れの可視化線**。

CEO 「map の line に交通情報や正確経路を背負わせすぎると重くなる。 ここから、 ここへ、 こう流れる を見せるだけに留めている」

### 5.2 見た目
- **細い**
- **中立色** (= slate-300 等)
- **破線寄り** (= List transition chip と統一)
- **少し曲がる** (= 直線でなく自然 curve)
- pin と pin をやさしく結ぶ

### 5.3 やらないこと (= 重要)
- 交通手段を強く表示しない
- 所要時間を主張しない
- **List の 「移動 chip」 を map 上にそのまま持ち込まない**
- 太すぎる線にしない
- category 色で route を塗らない

### 5.4 結論
map では移動は **chip ではなく線** が主役。

---

## §6 Map 上ラベル spec

### 6.1 含む情報
- time
- short title (= 4-8 文字想定)

### 6.2 含まない情報
- 長い説明
- 住所全文
- provenance
- CTA
- 評価文

### 6.3 見た目
- 白背景
- 小 shadow
- 角丸
- pin の近く
- 軽い吹き出し感

### 6.4 役割
- 選択中 / 重要 pin を一目で認識
- ただし map を汚さない

### 6.5 表示条件 (= 8b-7 CEO 補正 #2、 ラベルをいつ出すか明文化)

| 候補 | 条件 | 評価 |
|---|---|---|
| **A. 全 pin に常時表示** | always | ❌ 視覚密度過剰、 map が汚れる |
| **B. selected pin のみ** | tap で選ばれた 1 pin に label | ✅ **採用方向** (= 参考画像準拠、 mock 整合) |
| **C. tap toggle** (= tap で出る、 再 tap で消える) | per-pin state | ❌ 操作モデル複雑、 selected と排他関係不明確 |
| **D. zoom 級別** (= 近視 全 pin、 遠視 selected only) | viewport zoom | ⚠ 将来検討、 v3 では採用しない |

**v3 採用**: **B. selected pin のみ** (= 参考画像準拠、 1 pin 1 label、 selected が変わると label 移動)

理由:
- 参考画像で 1 pin のみ label
- 全 pin 表示は map 汚す (= CEO 「地図上には最低限だけを置き」 原則)
- tap toggle は selected と排他関係不明確
- zoom 級別は future、 v3 scope 外

### 6.6 selected state 切替

- pin tap → 既 selected ならそのまま (= 別 pin tap で selected 移動)
- selected pin の label のみ render、 他 pin は label なし
- bottom sheet も selected pin に同期して内容更新

---

## §7 Legend spec

### 7.1 位置
左下

### 7.2 含むもの
- icon
- label
- dropdown / collapse affordance

### 7.3 役割
- semantic color とカテゴリの対応を補助説明
- map 上の色の意味を支える

### 7.4 スタイル
- 白い小 panel
- 角丸
- shadow 小
- 縦並び
- compact
- 「読ませる」 より 「見れば分かる」 に寄せる

### 7.5 ルール
- 目立たせすぎない
- map 主役を壊さない
- 常時表示でも邪魔にならない size

---

## §8 Map controls spec

### 8.1 zoom
- `+` / `-`
- 1 つの白い縦パネル内

### 8.2 current location
- 独立した小ボタン

### 8.3 ルール
- 右側にまとめる
- すべて white surface
- shadow 軽く
- タップしやすいが派手でない

---

## §9 Bottom sheet spec (= Map 完成度の中心)

### 9.1 sheet 全体
- map の下からせり上がる
- 上部に handle
- 丸すぎず柔らかい角丸
- 背景は白
- 上品な shadow
- map との境界は自然

### 9.2 上段構造
| 配置 | 内容 |
|---|---|
| 左 | 大きい category icon circle (= List の TimelineSpine 円形を流用) |
| 中央 | time + title + location row |
| 右 | image |

### 9.3 下段構造
| 配置 | 内容 |
|---|---|
| 全幅 | meaning text box (= 淡背景、 spark + 2 行) |
| 末尾 | CTA × 2 (= secondary + primary) |

### 9.4 設計原則
- pin は軽く、 sheet は深く
- **Map の完成度は sheet の質で決まる** (= CEO 強調)
- ここに List EventCard 相当の情報密度を集約

### 9.5 sheet state 仕様 (= 8b-7 CEO 補正 #3、 readiness 前固定)

bottom sheet の段階的状態。 Map impl で 「どこまで扱うか」 を **本 spec 段階で固定** (= readiness で先にぶれないように、 CEO 明示)。

| state | high-level | 高さ目安 | 表示内容 |
|---|---|---|---|
| **collapsed** | handle + 最小限 | 80-100px (= peek) | handle + title + time のみ |
| **half** | デフォルト展開 | 40-50% viewport | 上段全要素 (= icon / time / title / location / image) + meaning text 1 行 |
| **expanded** | フル展開 | 75-85% viewport | 上段 + meaning text 全 + 2 CTA + (= 将来) 追加 detail |

#### 9.5.1 v3 採用範囲

**v3 採用**: **half + expanded の 2 段階** (= collapsed は v3 scope 外)

理由:
- collapsed (= peek) は 「pin tap で sheet 起動」 fluent flow との相性が悪い (= 1 段余分、 UX 複雑)
- half = デフォルト初期 state、 必要十分な情報密度
- expanded = ユーザーが drag up したら全情報、 CTA も visible
- collapsed は **将来検討** (= map 主役の時、 sheet 邪魔しない peek)、 v3 では map と sheet が排他切替 (= sheet open / closed)

#### 9.5.2 state 切替

- **初期**: sheet closed (= map 全体表示)
- **pin tap**: sheet = half (= デフォルト展開、 上段 + meaning text 1 行)
- **handle drag up / sheet tap**: sheet = expanded (= 全情報 + CTA)
- **handle drag down / map tap**: sheet = closed (= map 全体表示に戻る)
- **別 pin tap (= selected 変更)**: sheet 状態維持 + 内容更新

#### 9.5.3 v3 scope 外 (= 別 phase で扱う)

- collapsed (= peek) state
- swipe gesture (= 軽 swipe で next/prev pin)
- pull-to-dismiss 等の advanced gesture
- sheet 内 scroll behavior の細かい制御

---

## §10 Sheet 内 time / title / location spec

### 10.1 time
- category 色
- title より小、 ただし十分目立つ
- List では時刻が左 column、 **Map では sheet 内** (= 空間が主役なので時間は detail 面)

### 10.2 title
- 黒
- 太
- sheet 内で最重要

### 10.3 location row
- ⚠ **絵文字 (= 📍) 禁止**
- **専用 UI icon** (= List で実装した `LocationPinIcon` 流用)
- メタテキストは灰色 (= text-slate-400 / -500)
- 主張しすぎない

---

## §11 Meaning text box spec

### 11.1 役割
- その予定が **1 日の中で何を意味するか**
- Alter が **静かに意味づけを返す場所**
- map 上ではなく、 **sheet で出す** (= CEO 「map では意味文は sheet 側に寄せる」)

### 11.2 構造
- 左に小さな sparkle (= ✨ or spark glyph)
- 淡い背景色 (= 例 indigo-50/30)
- 2 行前後
- 説明ではなく **意味**

### 11.3 文体方針 (= List CategoryMeaning と整合、 ただし Map 固有)
- 状態 / 解釈型
- 強命令 (= 「しなさい」 「しろ」) 0
- 評価形容詞 (= 「最適」 「重要」 「良い」) 0
- 過剰に長くしない
- 「ましょう」 OK (= List 8b-8 pattern)

### 11.4 例の方向性
- 「集中しやすい静かな時間」
- 「ひと息つける時間」
- 「午後に深く入る時間」
- 「余白に戻る時間」

(= List CategoryMeaning getNarrative 再利用候補、 ただし Map 固有 fine-tune を別途検討)

---

## §12 Image spec

### 12.1 役割
- 雰囲気補強
- detail 質感づくり
- title / meaning text の **裏付け**

### 12.2 ルール
- image を主役にしない
- 正方形寄り
- 角丸
- 右側に配置
- **image truth がない場合は無理に fake を出さない** (= GPT List 「画像 optional」 と整合)

### 12.3 結論
image は map の主役ではない。 **sheet 質感の底上げ補助要素**。

---

## §13 CTA spec

### 13.1 secondary
- `詳細を見る`
- outline / light surface
- 深掘り 用

### 13.2 primary
- `ここへの経路`
- semantic / brand に寄った強ボタン
- 行動 用

### 13.3 ルール
- 深掘り (= secondary) と 行動 (= primary) を分ける
- 並列だが強弱をつける
- 両方とも十分押しやすい size

---

## §14 Bottom nav spec

### 14.1 維持
下タブは Map 画面でも維持。 ただし主役ではない。

### 14.2 ルール
- active state 明確
- map 画面でも UI 一貫性
- sheet や CTA と競合しない高さ

---

## §15 色のルール (= 全項目横断 原則)

### 15.1 基本原則
**点で強く、 面で薄く。**

### 15.2 強い色を使う場所
- pin
- time
- 大 category icon
- primary CTA

### 15.3 薄く使う場所
- meaning text box 背景
- 軽 semantic tint
- 補助 surface

### 15.4 中立色を使う場所
- route
- location row
- secondary text
- control panel
- legend base

---

## §16 List rule との対比 (= GPT 「そのままコピー禁止」 + CEO 補正)

### 16.1 持ち込み OK (= 共通基盤)

| 領域 | List rule | Map 適用 |
|---|---|---|
| 規約 24-extended (= focus-visible:slate-300) | 全 component | ✅ 持ち込み |
| 禁止語 10 件 grep | 全 component | ✅ 持ち込み |
| 命令しすぎない文体 (= 強命令 0、 評価 0) | CategoryMeaning + SummaryFooter | ✅ 持ち込み (= sheet meaning text) |
| semantic color system (= 4 + other) | EventCard tint + spine icon | ✅ 持ち込み (= pin 色) |
| SVG icon 統一設計 (= CategoryCafe/Home + Briefcase/Meal/LocationPin/Calendar/List/MapPin inline) | TimelineSpine / EventCard | ✅ 持ち込み (= pin icon / sheet category icon / location row icon) |
| flag 制御 pattern (= 案 1b コード内 const) | featureFlags.ts | ✅ 持ち込み (= MAP_NEW_*_ENABLED) |
| pure adapter pattern | externalAnchorAdapter | ✅ 持ち込み (= ExternalAnchor → MapPinViewModel) |
| testing pattern (= renderToStaticMarkup contract) | 全 component test | ✅ 持ち込み |
| location icon 専用 (= 📍禁止) | EventCard LocationPinIcon | ✅ 持ち込み (= sheet location row) |

### 16.2 そのまま持ち込まない (= Map 固有性、 別扱い)

| 領域 | List rule | Map 別扱い 理由 |
|---|---|---|
| timeline 的 event row | TimelineSpine + 縦 spine line | Map は 緯度経度軸、 timeline 軸なし、 線は route で別表現 |
| transition chip | TransitionChip | Map では **線のみ**、 chip を map 上に持ち込まない |
| footer 主役構造 | SummaryFooter 下部固定 | Map では sheet が主役、 footer 構造の検討は別 (= §11 で sheet meaning が代替) |
| provenance 強主張 | List sub-phase 6 SourceIndicator | Map では sheet 内に統合、 pin 上に出さない (= 第 12 補正 #2 hierarchy 拡張) |
| map 上の長文 | EventCard alterNote 2 行 | Map 上ラベルは time + 短 title のみ、 alterNote は sheet meaning text |
| 出発 / 帰宅 virtual events | adapter convertExternalAnchorListWithDayBookends | 物理座標が同 = 自宅 で重複可能、 Map 表現は別検討 (= 同 pin に複数 / pin merge 等) |
| 1 日表示 + 左右 nav | FlowTab daysToRender slice + date picker | Map 既存 DaySwitcher と統一 / 別表示か検討 (= §18 で議論) |
| EventCard 全周 border + 左尖り | EventCard | sheet 内 detail は別 layout (= card 三角不要、 sheet は handle 表現) |

### 16.3 保留 (= CEO 採用判断後決定)

- pin 上 source semantics の最終扱い (= §4 で 「pin 上 0」 確定方向だが、 proposed 等の case 検討余地)
- selected pin → bottom sheet 起動アニメーション
- 「マップ」 表記統一範囲 (= §17 で 1 次案、 CEO 採用後確定)

---

## §17 文体 + 「マップ」 表記統一

### 17.1 文体方針 (= 全 Map UI 横断)

| UI 要素 | 文体 |
|---|---|
| subtitle | 「場所を地図で確認して、 流れをつかみましょう。」 (= 「マップ」 統一なら 「マップ」 / 「地図」 どちらに合わせるか §17.2) |
| sheet meaning text | List CategoryMeaning 流用 (= mock 文体準拠、 状態/解釈型) |
| CTA | secondary 「詳細を見る」 + primary 「ここへの経路」 |
| 凡例 | category 名 (= カフェ / 食事 / 仕事 / 帰宅 / その他) |
| 禁止 | 強命令、 評価形容詞、 数値表現、 score |

### 17.2 「マップ」 表記統一 inventory (= List 8b-9 で tab label のみ反映済)

| file | line | 文字列 | 案 |
|---|---|---|---|
| MapTab.tsx | 859 | "地図の表示には API キーが設定されていません" | 「マップの表示には…」 |
| MapTab.tsx | 869 | "地図を読み込んでいます..." | 「マップを読み込んでいます…」 |
| MapTab.tsx | 920 | aria-label="地図 (選択日の予定の場所)" | aria-label="マップ…" |
| MapTab.tsx | 1534 | "地図に表示されています" | 「マップに表示されています」 |
| MapTab.tsx | 1535 | "地図に出せなかった予定" | 「マップに出せなかった予定」 |
| MapTab.tsx | 1529-1530 | コメント "地図" | (= 不触、 user 目視不可) |
| PlanClient.tsx | 116 | 旧コメント "聖地→地図" | (= 不触、 履歴コメント) |
| YourSelfSection.tsx | 473 | 「自分を知る旅の地図」 | (= 不触、 比喩表現、 別領域) |

**統一範囲**: user 目視可能 5 件 (= MapTab.tsx 859/869/920/1534/1535)、 コメント 3 件不触

---

## §18 既存 MapTab inventory + 不触判定

### 18.1 既存 component (= 1673 lines)

| 関数 | 役割 | redesign 影響 |
|---|---|---|
| MapTab (= main) | tab orchestration + DaySwitcher + PlanMapView + SelectedAnchorCard + FAB + CategoryGrid | **改修候補** |
| DaySwitcher | 日付 ‹ 日付 › today | List date picker と統一検討 (= 案 X 統合 / 案 Y 別維持) |
| PlanMapView | Google Maps + Polyline + pin render | **不触維持** (= Maps API、 spec 外) |
| MapPlaceholder | placeholder text | §17.2 「マップ」 統一対象 |
| SelectedAnchorCard | bottom sheet (= 1001-1280) | **§9 で flag 切替で新 sheet 検討** (= 既存維持 + 新 sheet で同責務範囲置換) |
| CategoryGrid + CategoryCard | category 別 grouping (= 9 categories) | mock に存在せず、 List redesign 後の Map 役割と整合確認必要 |
| FAB | 「+ 教える」 起動 | List で flag ON 削除済 (= 8b-7-B + 8b-8)、 Map でも同様検討 |

### 18.2 既存 hooks

- `_useMapTabMovementDisplay.ts` (= L-4d-b1 movement display): 不触
- `_useMapTabFeasibilityDisplay.ts` (= M-3d feasibility): 不触
- `_usePlanGeocode.ts` (= geocoding): 不触

### 18.3 frozen 判定 (= List redesign 中触らずに来た範囲)
- PlanMapView (= Google Maps integration): 不触
- 3 hooks: 不触
- → 改修対象は MapTab.tsx 内の SelectedAnchorCard / DaySwitcher / CategoryGrid + 文字列 string

---

## §19 v1 8 論点 1 次案 → CEO 画像分析 補正後マッピング

| v1 論点 | v1 1 次案 | CEO 補正 | v3 採用方向方向 |
|---|---|---|---|
| §2 pin 情報密度 | 案 A 寄り (= pin 色 + icon、 詳細 sheet) | ✅ 「pin 上は軽くてよい。 詳細は sheet 側」 | **§4 採用方向** (= 涙型 + 白抜き + selected 軽ラベル) |
| §3 route / flow | 案 C (= 番号 + 線) | ⚠ 「線そのものの自然さが大事。 番号を強くしすぎない」 | **§5 採用方向** (= **番号は副、 線が主**、 細 中立 破線 少し曲がる) |
| §4 source semantics | 案 A (= pin 上 0、 sheet full) | ✅ 「pin 上では 0 に近くてよい。 source は sheet 側」 | **§4 + §9 採用方向** (= pin 上 0、 sheet 内に統合) |
| §5 selected pin sheet | 案 C flag 切替 | ✅ 「ここが主戦場。 map の完成度は sheet の質で決まる」 | **§9 採用方向** (= flag 切替 + 新 sheet を 4 段構造で実装) |
| §6 list / map 役割分担 | 案 X 空間俯瞰 | ✅ 「完全に正しい」 | **§0 + §3 採用方向** (= map = 空間、 list = 時間) |
| §7 「移動」 扱い | 案 A 線のみ | ✅ 「ラベルなしで線のみはかなり正しい」 | **§5 採用方向** (= chip 持ち込み禁止、 線のみ) |
| §8 意味文 | 案 A + B 検討 | ✅ 「bottom sheet が正解、 map 上ではなく sheet」 | **§11 採用方向** (= sheet 内 meaning box) |
| §9 「マップ」 表記 | 案 B (= user 目視 string 5 件) | (= 補正なし、 CEO 黙認) | **§17.2 採用方向** |

---

## §20 readiness 結論 + 次 phase 候補

### 20.1 本 audit v2 の到達状況

- ✅ §0 設計原則 確定 (= 「Map は場所の流れを見る面、 意味と行動は sheet に集約」)
- ✅ §3 4 レイヤー構造 確定 (= 上部意味づけ / 主体 / 補助 / sheet)
- ✅ §4-§17 15 spec 項目 1 次案 (= CEO 画像分析を spec 言語化)
- ✅ §16 List rule 持ち込み / NG マッピング
- ✅ §18 既存 MapTab inventory + 不触判定
- ✅ §19 v1 8 論点 → CEO 補正後 確定方向

### 20.2 次 phase 候補

**A. Map Spec 確定 (= 本 audit 採用 + CEO 採用判定で spec 凍結)**
**B. Map IA Audit 着手 (= List と同 3 段階 pattern、 IA で拘束条件を別 doc 化)**
**C. Map impl readiness (= spec 採用後、 既存 MapTab inventory に対する改修計画書を別 doc)**
**D. Map impl 直接着手 (= readiness 省略、 spec → impl)**

### 20.3 Claude 推奨

**A → C → impl** (= 本 audit を CEO 採用判定で spec 確定 → impl readiness → impl)

理由:
- 本 audit が CEO 画像分析を取り込んだ密度で、 IA Audit (= 案 B) 重複の必要性低
- List は新規 List 視点で IA 必要だったが、 Map は既存改修中心 → 直接 spec + impl readiness で十分
- 既存 MapTab inventory が明確 (= §18) なので、 改修範囲 / 不触範囲 判断可能

### 20.4 v2 → v3 補正履歴 (= CEO + GPT 3 点指摘反映)

| # | 指摘 | 反映箇所 |
|---|---|---|
| 1 | 「確定」 表現を弱める (= spec freeze candidate 扱い) | header status + §19 全項 「採用方向」 に softening |
| 2 | Map 上ラベル出し方明文化 (= 全 pin / selected / tap) | §6.5 + §6.6 で **selected pin のみ採用** 明文化 |
| 3 | bottom sheet 段階状態 readiness 前固定 | §9.5 で **half + expanded 2 段階採用、 collapsed v3 scope 外** 固定 |

### 20.5 CEO 採用判断仰ぐ 1 点 (= v3 補正反映後)

**本 audit v3 採用 OK か** (= 3 点補正済 spec freeze candidate)
→ OK なら **C: Map impl readiness 着手** (= 別 doc) で:
- selected pin label policy 細部 (= §6 で大枠採用済)
- sheet state 細部 (= §9.5 で大枠採用済)
- route rendering source (= Google Polyline / inline SVG line どれ、 §5 で大枠採用済)
- legend / controls / CTA 優先順位 (= §21 sheet 優先で大枠採用済)
- 既存 MapTab 改修計画 (= §18 inventory ベース、 sub-phase 候補)
- file mapping / sub-phase 候補 (= List sub-phase 8a-8c pattern 流用検討)

---

## §21 補足: 「sheet で完成度決まる」 の意味

CEO 強調点: **「Map の完成度は sheet の質で決まる」**

これは Map impl で最も重視すべき優先順位:

| 優先順位 | 項目 |
|---|---|
| **最優先** | §9 + §10 + §11 + §13 (= sheet 全体 / time/title/location / meaning / CTA) |
| 高 | §4 + §5 (= pin / route) |
| 中 | §6 + §7 + §8 (= map 上ラベル / legend / controls) |
| 低 | §17 文字列統一 |

impl 段階で sheet quality 不足なら、 spec 採用後でも 「sheet 詰め直し sub-phase」 を別途検討。

---

**本 audit v2 は CEO 画像分析統合済の 1 次案**。 CEO 採用判断後、 spec として凍結 → impl readiness or 直接 impl 着手。
