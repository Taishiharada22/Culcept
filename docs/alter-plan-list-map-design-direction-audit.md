# Plan List / Map Design Redesign Direction Audit

**作成日**: 2026-05-24
**branch**: `docs/plan-list-map-design-direction-audit`
**前提**: N-3a impl `d55aab5f` 着地後、 CEO + GPT 合議で「Plan / Home レイアウト・デザイン刷新」 phase 着手承認
**性質**: docs only (= 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0、 設計方向の固定のみ)
**入力**: CEO 共有参考画像 2 枚 (= ANEURASYNC ALTER 想定 design)、 既存 plan UI の現状スクショ、 GPT design audit (= 詳細監査結果)
**範囲**: List + Map の design redesign direction (= Calendar は CEO 明示で一旦放置)

---

## 0. Executive Summary

### 0.1 本 audit の目的

CEO 指示「**最適解が出るまで自律推論を繰り返す**」 に従い、 思考原則 ①②③④ を最大限適用して以下を整理:

- GPT design audit の **妥当性評価** + 補完論点の自律推論
- 世界トップアプリ literature からの **抽出 principle**
- Aneurasync **思想** との統合 (= 単なる美化ではなく世界観の transformation)
- List + Map の **redesign direction** 固定
- 実装着手前の **CEO 判断項目** 明示

### 0.2 結論先出し

| 観点 | 結論 |
|---|---|
| GPT 監査の妥当性 | **概ね妥当**、 但し 7 補完論点を自律追加 |
| redesign の本質 | 「データ管理画面」 → 「**観測される 1 日**」 への transformation (= 美化ではなく世界観転写) |
| 1 画面 1 主役 (= GPT) | **採用**、 但し Aneurasync 解釈: List = 時間軸主役、 Map = 空間軸主役、 両者で「**同じ 1 日を 2 軸で観測**」 |
| 既存規約との整合 | wave 1/2/3/3a 規約 24-extended **完全保持** (= 機械保証 40 件) |
| 実装着手 | 本 audit 着地 → 別 sub-phase plan audit → 実装、 即実装は **不可** |
| 既存 N phase との関係 | design redesign は N-3a と N-3b の **間** に挿入 (= 自律提案) |

### 0.3 CEO 判断項目 (= §17 で詳細、 6 件)

1. 「観測される 1 日」 framing を採用するか
2. 1 画面 1 主役 (= List 時間軸 / Map 空間軸) の採用
3. 「ALTER MORNING」 等の section label 採用判断
4. image source の決定 (= 別 audit 必要、 placeholder で start か)
5. design redesign を N phase の どこに位置付けるか
6. 次 sub-phase audit (= design system extraction) への進行承認

---

## 1. CEO 共有参考画像の構造分析

### 1.1 参考画像 ①「地図」 の構造

| 領域 | 要素 | 設計意図 |
|---|---|---|
| 最上部 | `ANEURASYNC ALTER` ロゴ + メニュー + 星アイコン | brand identity 明示 |
| section label | `ALTER MORNING` (= 紫の小キャプス) | 時間帯 / モードの明示 (= 朝・昼・夜で content 変化を示唆) |
| 主見出し | 「今日のプラン」 | 画面の identity (= 「Plan」 ではなく「今日のプラン」) |
| subtitle | 「場所を地図で確認して、 流れをつかみましょう。」 | action 指向 + Alter 視点 |
| toggle | 地図 / リスト (= right) | 視点切替の明示 |
| 地図 area | 4 pins (= 09:00 カフェ 紫 / 12:00 ランチ オレンジ / 14:00 オフィス 青 / 18:00 帰宅 緑) | **時間ラベル + category 色 + icon の 3 重 encoding** |
| route | dashed line で pin 接続 | 1 日の流れを地図上に可視化 |
| 凡例 (= bottom-left) | カフェ / ランチ / オフィス / 帰宅 | category 色の意味 (= legend) |
| controls | +/-/現在地 button | 地図操作 |
| bottom sheet | 09:00 カフェ + 住所 + Alter 補助文 + image + 「詳細を見る」 / 「ここへの経路」 | 選択中スポットの詳細 + 意味付け + 行動 CTA |
| bottom tab | 今日のプラン / インサイト / AI メモ / 設定 | global nav |

### 1.2 参考画像 ②「リスト」 の構造

| 領域 | 要素 | 設計意図 |
|---|---|---|
| 最上部 | 同上 | — |
| section label | `ALTER MORNING` | — |
| 主見出し | 「今日のプラン」 | — |
| subtitle | 「時間の流れを把握して、 心地よい 1 日に。」 | action 指向 + Alter 視点 |
| toggle | 地図 / リスト | — |
| date selector | `< 6月12日 (木) >` | 日付ナビ |
| timeline | 左に時刻 (= 09:00) + 中央縦線 + 右に card | **時間軸を視覚的 spine 化** |
| event card | 09:00-11:00 カフェ + 場所 + Alter 補助文 + image | 1 イベント = 意味を持った unit |
| transition chip | 「移動・リフレッシュ」 (= 薄い chip + 時刻 range) | 予定の **間** の時間を表現 |
| summary card | 78% バランス良好 (= circle progress) + 補助文 + 「リズムを整えるヒント ›」 CTA | 1 日全体への観測 |
| bottom tab | — | — |

### 1.3 参考画像の構造的強み (= 自律分析)

| # | 強み | 構造的理由 |
|---|---|---|
| 1 | **「今日のプラン」 が画面 identity** | 主語が「Plan」 (= データ) ではなく「今日」 (= 体験) |
| 2 | **時刻が timeline の spine** | 視線誘導が「時間 → イベント」 で自然 |
| 3 | **category 色の 3 重 encoding** (= icon / pin / card border) | 一目で「どんな性質の予定か」 が伝わる |
| 4 | **Alter 補助文の存在** | 各イベントに「意味」 が付与される |
| 5 | **image の統一サイズ** | visual consistency + 「行きたくなる」 感情誘発 |
| 6 | **transition chip** で「移動 / リフレッシュ」 を可視化 | 1 日が「予定の集合」 ではなく「流れ」 |
| 7 | **bottom sheet (= map)** の存在感 | 選択中スポットが画面の主役の 1 つ |
| 8 | **summary card** が「1 日全体の観測」 を提示 | Alter の存在感を visual に転写 |

### 1.4 参考画像で **慎重に解釈すべき** 点 (= 自律補完)

| # | 慎重項目 | Aneurasync 思想との照合 |
|---|---|---|
| 1 | 「整理しましょう」 / 「掴みましょう」 (= 命令形 copy) | 命令形は user 主導の **push 寄り** 表現になる risk。 「整理する余白」 「掴める時間」 等の **名詞形 / observation 寄り** に書き換え検討 |
| 2 | 「78% バランス良好」 (= 評価 score) | 「悪い日もある」 という暗示が **optimization** に寄る risk。 「バランスを観測中」 等の **観測 framing** に書き換え検討 |
| 3 | 「リズムを整えるヒント」 (= CTA) | 「整える」 「ヒント」 は弱 push 寄り。 「リズムを見る」 等の **observation 寄り** に書き換え検討 |
| 4 | 「集中しやすい静かなカフェで、 今日の計画を整理しましょう」 | 「整理しましょう」 は弱 push、 「集中しやすい」 は **観測**。 後半を観測形に書き換え検討 |

→ 参考画像の **structural design は採用**、 但し **copy tone は Aneurasync 思想に再 alignment** が必要 (= GPT 監査も copy 弱点を指摘済)。

---

## 2. GPT 監査結果の妥当性評価 (= 自律推論で各論点を評価)

### 2.1 GPT 主要主張の妥当性 (= 10 項目)

| # | GPT 主張 | 私の評価 | 補完 |
|---|---|---|---|
| 1 | 「データ管理画面」 → 「1 日体験画面」 | ✅ **妥当**、 さらに「**観測される 1 日**」 に深化可 | 単なる体験ではなく Aneurasync 固有の「観測」 |
| 2 | 1 画面 1 主役 | ✅ **妥当**、 List = 時間軸、 Map = 空間軸 | 両 tab で「同じ 1 日を 2 軸で観測」 (= toggle の意味付け) |
| 3 | 二重表現の排除 | ✅ **妥当**、 上下カード重複は整理 | 「1 表現 1 責務」 に統一 |
| 4 | 各予定カードに意味追加 | ✅ **妥当**、 Alter 補助文 + image | 補助文の tone は Aneurasync 整合必要 (= §1.4) |
| 5 | 余白 / コントラスト強化 | ✅ **妥当**、 のっぺり → 強弱 | type scale + spacing scale を別 audit で確定 |
| 6 | Empty day の見せ方 | ✅ **妥当**、 「観測の余地」 として | N-3a 「ALTER で見る ›」 を default visible で実装済、 visual design 確定が次 |
| 7 | Map が Google Map 埋め込み感 | ✅ **妥当**、 pin/route/sheet で物語化 | base map provider は維持、 上 layer を強化 |
| 8 | 「今日の地理」 が弱い | ✅ **妥当**、 1 日の流れが地図に出ない | pin に時間ラベル + category 色 + dashed route |
| 9 | 選択状態 / 詳細の階層 | ✅ **妥当**、 「今どこを見ているか」 強化 | bottom sheet を draggable / persistent に |
| 10 | Map UI のプロダクト体験化 | ✅ **妥当**、 地図補助 UI → 物語 UI | pin / route / sheet が「**今日の地理 story**」 を構成 |

### 2.2 GPT 監査の総合評価

**概ね妥当** (= 10/10 主要主張に同意)。 design audit として高品質。 但し補完論点が 7 件あり (= §3)、 これらを統合した上で direction を確定。

---

## 3. 自律推論で抽出した補完論点 (= GPT 監査の盲点 7 件)

### 3.1 補完 ①: タイポグラフィの **具体的 type scale**

GPT は「文字の強弱を強くする」 と指摘したが、 **具体的 type scale** は提案していない。

自律提案 (= world-class apps 参照):

| level | size (= mobile) | weight | line-height | 用途 |
|---|---|---|---|---|
| Display | 28-32 | semibold (= 600) | 1.2 | 主見出し (= 「今日のプラン」) |
| Title L | 20-24 | semibold | 1.3 | event card title |
| Title M | 16-18 | medium (= 500) | 1.4 | section label |
| Body | 14-15 | regular (= 400) | 1.6 | 補助文 |
| Meta | 12-13 | regular | 1.5 | 時刻 / 住所 / chip |
| Caption | 11-12 | regular | 1.4 | label / legend |

注: 現状 plan/ 内は `text-xs` / `text-sm` / `text-base` の Tailwind size しか使われていない (= 12/14/16px)。 redesign で `text-xl` / `text-2xl` (= 20/24px) 以上の display サイズ導入が必要。

### 3.2 補完 ②: brand color (= indigo / purple) との関係明示

GPT は「グレーを減らす」 と指摘したが、 **brand color の使い分け** は未触れ。

Aneurasync 整合の brand color usage:

| 使い方 | 採用 | 例 |
|---|---|---|
| selection state (= 選択中、 selected) | ✅ OK | event card selected border-indigo-500 |
| hover state (= mouse hover) | ✅ OK | hover:border-indigo-300 |
| **focus surface** (= focus-visible) | ❌ **禁止** (= 規約 24-extended) | focus-visible:slate-* のみ |
| primary CTA button | ✅ OK | 「ここへの経路」 等の CTA |
| brand identity (= logo, header) | ✅ OK | `ANEURASYNC ALTER` logo |
| category 色 (= 紫/オレンジ/青/緑) | ✅ OK | event の category encoding |
| ambient gradient (= 背景の控えめ色) | ✅ OK | empty state や section bg の subtle gradient |
| warning / alert | ❌ **禁止** | amber / orange / red 禁止維持 |

### 3.3 補完 ③: image source の論点

GPT は「写真 or semantic visual」 と提案したが、 **image source の決定** は未触れ。

選択肢:
| option | 採用 | trade-off |
|---|---|---|
| A. Google Places Photos API | ⚠️ Routes/外部 API 禁止と整合確認必要 | 自動取得可、 但し API 依存 |
| B. user upload | ❌ DB/storage 追加必要 | 個別性は高い、 但し infra 拡大 |
| C. Unsplash / public CDN | ⚠️ 外部 dependency 追加 | 美しいが Aneurasync 固有性なし |
| D. **semantic visual** (= category-based illustration / icon) | ✅ **推奨** | image source 不要、 Aneurasync 固有 visual 構築可能 |
| E. **ambient gradient** (= category × 時間帯で決まる gradient) | ✅ **推奨** (D と併用) | 軽量、 visual rhythm 形成 |

自律推奨: **D + E hybrid** (= semantic visual + ambient gradient) で start。 後段で image API 統合検討。

これは別 audit が必要 (= image source decision audit)。

### 3.4 補完 ④: a11y の確定方針

GPT は a11y を未触れ。

Aneurasync 整合の a11y:
- 規約 24-extended 継承 (= focus-visible:slate-* + brand-color 不使用)
- `aria-label` 全 interactive surface に
- keyboard navigation 完全対応 (= Tab / Shift+Tab / Enter / Esc)
- screen reader: 各 event card に semantic role (= `article` or `listitem`)
- contrast ratio: WCAG AA 以上 (= type scale 改善で自動的に向上見込み)
- focus 順序: timeline の自然順序 (= 時刻順) を尊重
- ARIA live region: 選択変更時の発話 (= bottom sheet update)

### 3.5 補完 ⑤: responsive 設計

GPT は mobile/desktop を未触れ。

Aneurasync は MEMORY.md 上「Next.js 15 + Tailwind」 で、 plan/ は主に mobile 起点設計と推定。 但し desktop でも使える必要。

redesign での responsive 原則:
- mobile first (= 既存 plan/ UI と整合)
- tablet (= md:): 2 column 化 検討 (= list + bottom sheet 同時表示)
- desktop (= lg:): 3 column 検討 (= side nav + main + detail panel)
- 但し本 audit では **mobile design を固定**、 tablet/desktop は別 audit

### 3.6 補完 ⑥: performance

GPT は performance を未触れ。

redesign での performance 制約:
- bundle size: image asset 追加禁止 (= semantic visual で start)
- lazy load: bottom sheet / detail panel は dynamic import
- animation: framer-motion (= 既存依存) のみ、 新規 motion library 追加禁止
- map render: base map provider は変更しない (= 既存 Mapbox/Google を維持)
- N+1 query: anchor list は既存の fetch pattern を維持

### 3.7 補完 ⑦: 既存規約との完全整合 (= 規約 24-extended)

GPT は既存規約との整合を未触れ。 但しこれは **必須**:

- wave 1 (= focus ring): 全 surface 維持
- wave 2 (= ring 規約 24 plan 全展開): 維持
- wave 3 (= border surface 規約 24-extended): 維持
- wave 3a (= L 453 residual 解消): 維持
- 機械保証 40 件 regression test: 維持

redesign で新規追加する interactive surface は:
- 規約 24-extended 遵守 (= focus-visible: + slate-*)
- TARGET_FILES に追加 (= regression test 拡張)
- brand-color focus 復活禁止

---

## 4. 世界トップアプリ literature リサーチ (= 抽出 principle)

### 4.1 timeline / list UI の reference

| app | 学べる point | Aneurasync への適用 |
|---|---|---|
| **Things 3** (= Cultured Code) | 左 sidebar + 中央 task list + 右 detail panel、 余白の大胆さ、 微細な animation | timeline spine + event card + bottom sheet (= mobile では sheet) |
| **Fantastical** | 自然な timeline + 時刻の visual hierarchy + month → day drill-down | 時刻を **大きく**、 visual spine 化 |
| **Sunrise** (= Microsoft 旧) | weather + map + timeline 統合の sidebar | section label (= 「ALTER MORNING」) で時間帯 context |
| **Notion Daily Standup** | block-based event + emoji semantic + light copy | event card 内の Alter 補助文を block 構造化 |
| **Calm / Headspace** | today screen の emotional copy + visual journey | 「観測される 1 日」 の framing、 emotional 但し命令形でない |

### 4.2 map UI の reference

| app | 学べる point | Aneurasync への適用 |
|---|---|---|
| **Apple Maps** | bottom sheet の draggable / persistent + location card に意味付け | bottom sheet を 3 段階 (= peek / half / full) に |
| **Citymapper** | route as story (= journey の timeline 化) | dashed route + 時間ラベル付き pin で「今日の地理 story」 |
| **Google Maps Explore** | category-based pin + filter chip | category 色 + legend |
| **Pelago / TripAdvisor** | itinerary as visual narrative + image card | semantic visual + ambient gradient |
| **Foursquare City Guide** | place card の意味付け (= 「集中向き」 等の tag) | Alter 補助文 (= 「集中しやすい静かなカフェ」 等) |

### 4.3 抽出 principle (= 5 件、 redesign の core)

| # | principle | 出典 (= app reference) | Aneurasync 解釈 |
|---|---|---|---|
| **P1** | **Subject as identity** (= 「Plan」 ではなく「今日のプラン」) | Things 3 / Fantastical | 「観測される 1 日」 が画面の主語 |
| **P2** | **Time as spine** (= 時刻が視覚的 axis) | Fantastical / Calendly | timeline で「**時間として観測される 1 日**」 |
| **P3** | **Cards with meaning** (= 各 card が「行きたくなる」) | Notion / Apple Maps | event card に **Alter 補助文** + semantic visual |
| **P4** | **Visual journey** (= 1 日が visual に繋がる) | Citymapper / Pelago | timeline transition chip + map dashed route |
| **P5** | **Bottom sheet as drill-down** (= 詳細は sheet で) | Apple Maps / Citymapper | draggable / persistent sheet (= mobile)、 detail panel (= desktop) |

---

## 5. Aneurasync 思想との統合

### 5.1 中心問い (= MEMORY.md 由来)

> 「この機能は、 ユーザーの第二の自己として必要か?」
>
> 最高体験: 「自分って、 そういう人間だったのか」 とユーザー自身が気づく瞬間

### 5.2 design redesign が思想に与える transformation

| 旧 (= データ管理) | 新 (= 観測される 1 日) | 思想接続 |
|---|---|---|
| Plan = データ表示画面 | Plan = 1 日の **観測 surface** | 「**観測の入口** + user 選択尊重」 (= N-3 哲学整合) |
| 予定 = データ行 | 予定 = **観測される行動** | 「行動 = 観測の単位」 (= Aneurasync 中心問い接続) |
| 1 日 = 集約された予定 | 1 日 = **観測される時間の流れ** | 「自分って、 そういう 1 日を組み立てる人間だったのか」 |
| Alter 不在 | Alter 補助文 (= 控えめ、 push しない) | 「**観測の幕間**」 = entry visible だが modal user initiated |
| empty day = 「予定なし」 (= 否定) | empty day = 「**観測の余地**」 (= 肯定) | 「観測の幕間」 を入口に明示 |
| 評価 score (= 78% バランス) | **観測中** chip (= §11.5 確定) | optimization / push の語彙排除 |
| 時間帯限定 section label (= `ALTER MORNING`) | **「観測中」 section label** (= §11.5 確定、 動的 / 時間帯独立) | brand 重複 / 思想不整合 解消 |

### 5.3 「観測される 1 日」 framing の意味

これは GPT の「1 日体験画面」 を Aneurasync 固有性で **深化** したもの:
- 「体験」 = 一般的 (= 多くのアプリが目指す)
- 「観測」 = Aneurasync 固有 (= 「user 自身が user の 1 日を観測する」 = 自己観測)

→ user が plan を開く行為 = **自己観測の行為**。 各 event card = **観測の単位**。 1 日全体 = **観測の流れ**。

これが Aneurasync が他の予定管理アプリと **構造的に異なる** 点。

---

## 6. 統合 vision: 「観測される 1 日」 として redesign

### 6.1 redesign vision statement (= 1 文)

> **/plan は予定管理アプリではない。 ユーザー自身が自分の 1 日を「時間軸」 (= List) と「空間軸」 (= Map) の 2 視点で観測する surface である。**

### 6.2 vision を支える 5 principles (= §4.3 から)

1. **Subject as identity**: 主語は「Plan」 ではなく「今日のプラン」、 究極は「**観測される 1 日**」
2. **Time as spine (= List)**: timeline で時間軸を視覚的に spine 化
3. **Space as spine (= Map)**: 地図で空間軸を視覚的に spine 化、 dashed route で 1 日を story 化
4. **Cards with meaning**: 各 event = 観測の単位、 Alter 補助文 + semantic visual で「行きたくなる」
5. **Bottom sheet as drill-down**: 詳細は sheet で drill-down、 主画面は overview を保持

### 6.3 vision からの除外 (= やらないこと)

| 除外 | 理由 |
|---|---|
| 「78% バランス良好」 等の評価 score | optimization 寄り、 思想違反 |
| 「リズムを整える」 等の push 系 CTA | push しない原則違反 (= N-3 哲学整合) |
| 「予定なし」 という否定的 empty 表現 | empty = 観測の余地、 否定しない |
| **写真 (= 外部 image)** の即実装 | source 決定が別 audit、 まずは semantic visual で start |
| Stargazer pivot / 大規模 engine 接続 | scope 外、 別 phase |
| Calendar tab の redesign | CEO 明示で一旦放置 |

---

## 7. 現状 UI 構造分析 (= 影響範囲 assess)

### 7.1 現状 file 規模

| file | line | 役割 |
|---|---|---|
| `app/(culcept)/plan/page.tsx` | 53 | Plan page entry (= server component or wrapper) |
| `app/(culcept)/plan/tabs/CalendarTab.tsx` | 688 | Calendar 表示 (= redesign 範囲外) |
| `app/(culcept)/plan/tabs/FlowTab.tsx` | 772 | List 表示 (= redesign 対象) |
| `app/(culcept)/plan/tabs/MapTab.tsx` | **1673** | Map 表示 (= redesign 対象、 最大規模) |
| `app/(culcept)/plan/components/AddAnchorModal.tsx` | (未計測) | anchor 追加 modal (= 直接 redesign 対象外、 整合は必要) |
| `app/(culcept)/plan/components/AnchorFormFields.tsx` | wave 3 frozen | **触らない** |
| `app/(culcept)/plan/components/ProposalChip.tsx` | wave 3 frozen | **触らない** |
| `app/(culcept)/plan/components/PlaceCandidatesPanel.tsx` | wave 3a frozen | **触らない** |

### 7.2 redesign で影響する範囲

| 影響度 | file 群 |
|---|---|
| **高** (= 大幅 refactor) | `FlowTab.tsx` (= timeline 構造変更) / `MapTab.tsx` (= bottom sheet / pin / route 強化) |
| **中** (= 部分修正) | `plan/page.tsx` (= section label / header 追加可能性) |
| **低** (= 触らない or 整合のみ) | Calendar / 既存 frozen file / lib/plan/ |
| **新規** | 共通 design tokens (= e.g., `lib/plan/design-tokens.ts`) / 新規 component (= EventCard, TimelineSpine, MapBottomSheet 等) |

### 7.3 frozen 維持必須 (= 触らない)

- wave 1 全 file (= focus ring)
- wave 2 全 file (= ring 規約 24 plan 全展開)
- wave 3 frozen (= AnchorFormFields / ProposalChip)
- wave 3a frozen (= PlaceCandidatesPanel L 453)
- N-3a frozen (= lib/plan/emptyDayObservation.ts + test)
- 規約 24-extended regression test 14 件 + ring regime 26 件 = **40 件機械保証 維持**

### 7.4 自律 risk 評価 (= 現状 UI からの redesign 距離)

| risk | level | 根拠 |
|---|---|---|
| 既存 wave 規約違反復活 | medium | redesign で新規 focus surface 追加 → 規約 24-extended 遵守要 |
| 機能変更 (= 既存 anchor flow 破壊) | medium | timeline / bottom sheet refactor で event card click / add flow に触る |
| performance 低下 | low | bundle / animation 制約あり、 既存依存内 |
| copy 思想違反 (= 「整理」 等) | medium | tone を Alter 整合に書き換え必要 |
| image source 決定遅延 | medium | semantic visual で start、 後段 audit |
| accessibility 低下 | low | 規約 24-extended + ARIA で担保 |
| Calendar tab への波及 | low | CEO 明示で一旦放置、 触らない |

---

## 8. List redesign direction (= 詳細方針)

### 8.1 List の vision (= §6.1 specialized)

> **List は「予定の一覧」 ではなく、「**時間として観測される 1 日**」 のタイムラインである。**

### 8.2 List 構造案 (= 上から下)

```
┌─────────────────────────────────────────┐
│ [header]                                 │
│   ANEURASYNC ALTER (= brand, fixed)      │
├─────────────────────────────────────────┤
│ [section label]                          │
│   観測中 (= subtle 紫 caps、 §11.5 確定)   │
├─────────────────────────────────────────┤
│ [title block]                            │
│   今日のプラン (= display large)          │
│   時間として観測する 1 日。 (= subtitle、  │
│     §11.5 確定、 観測 framing)            │
├─────────────────────────────────────────┤
│ [toggle]                                 │
│   地図 | リスト (= right-aligned)         │
├─────────────────────────────────────────┤
│ [date selector]                          │
│   < 6月12日 (木) >                        │
├─────────────────────────────────────────┤
│ [timeline spine]                          │
│   09:00 ●──┐ ┌──────────────────────┐   │
│            ├─┤ event card #1          │   │
│            │ │ 09:00-11:00 カフェ     │   │
│            │ │ 場所 / Alter 補助文     │   │
│            │ │ semantic visual        │   │
│            │ └──────────────────────┘   │
│            │                              │
│   ── 移動・余白 ── ── ── ── 11:00-12:00 │
│            │                              │
│   12:00 ●──┤ ┌──────────────────────┐   │
│            ├─┤ event card #2          │   │
│            │ │ ...                    │   │
│            │ └──────────────────────┘   │
│   ...                                     │
├─────────────────────────────────────────┤
│ [empty day entry] (= empty 日のみ)        │
│   「ALTER で見る ›」 (= N-3a 連携)        │
├─────────────────────────────────────────┤
│ [summary card]                            │
│   観測中 (= §11.5 確定、 評価 score 排除)  │
│   集中と休息の時間が、 今日に流れています。│
│   「リズムを見る ›」 (= observation CTA)  │
├─────────────────────────────────────────┤
│ [bottom tab nav]                          │
│   今日のプラン / インサイト / Alter メモ / 設定 │
└─────────────────────────────────────────┘
```

### 8.3 List の core elements

#### 8.3.1 event card design

| 要素 | 内容 | スタイル |
|---|---|---|
| 時間帯 chip | 09:00-11:00 | text-sm + category color (= 紫) |
| title | 甲府駅近くのカフェ | text-xl + semibold |
| location | 山梨県甲府市丸の内 1 丁目 1-8 近辺 | text-sm + text-slate-500 + map-pin icon |
| Alter 補助文 | 集中しやすい静かなカフェで、 今日の計画を観測する余白。 | text-sm + text-slate-600 + sparkle icon |
| semantic visual | category-based illustration | 80x80 rounded-2xl |
| card border (= left) | 4px category color | (= 紫/オレンジ/青/緑 で encoding) |
| card border (= other) | border-slate-100 (= 控えめ) | — |
| focus-visible | border-slate-300 (= 規約 24-extended) | — |
| hover | bg-slate-50 + shadow-sm | — |

#### 8.3.2 timeline spine design

| 要素 | スタイル |
|---|---|
| time label (= 09:00) | text-lg + category color + tabular-nums |
| spine line | 2px + bg-slate-200 + 縦に伸びる |
| event circle (= icon) | 32px + category color bg + category icon |
| transition chip (= 「移動」) | 薄い chip + text-xs + 時刻 range + 中央寄せ |

#### 8.3.3 summary card design (= 「観測中」 framing)

| 要素 | 内容 |
|---|---|
| 主表現 | 1 日を観測中 (= 「78% バランス良好」 を排除) |
| Alter 補助文 | 「観測される 1 日が今、 進行中です。」 (= observation framing) |
| CTA | 「リズムを見る ›」 (= 「整える」 排除) |
| visual | 控えめ circle progress (= 進捗のみ、 評価 score なし) |

### 8.4 List で削除すべきもの

- 上下カード重複 (= GPT 指摘の二重表現)
- 弱い空箱 (= 情報密度の低い card)
- 説明不足の予定 (= title + location のみ)
- 「予定なし」 否定表現 (= 「観測の余地」 に置換)
- optimization 寄り評価 (= 「整える」 「最適」 「バランス良好」)

---

## 9. Map redesign direction (= 詳細方針)

### 9.1 Map の vision (= §6.1 specialized)

> **Map は「場所の一覧」 ではなく、「**空間として観測される 1 日**」 の地理である。**

### 9.2 Map 構造案

```
┌─────────────────────────────────────────┐
│ [header / section label / title]          │
│   (= List と共通、 §11.5 確定 copy)        │
│   subtitle: 「空間として観測する 1 日。」 │
├─────────────────────────────────────────┤
│ [toggle / date selector]                  │
├─────────────────────────────────────────┤
│ [map area]                                │
│   ● pin 09:00 カフェ (= 紫)               │
│   ● pin 12:00 ランチ (= オレンジ)         │
│   ● pin 14:00 オフィス (= 青)             │
│   ● pin 18:00 帰宅 (= 緑)                 │
│   ··· dashed route で接続                 │
│   [legend (= bottom-left)]                │
│     カフェ / ランチ / オフィス / 帰宅     │
│   [controls (= right)]                    │
│     + / - / 現在地                        │
├─────────────────────────────────────────┤
│ [bottom sheet (= draggable, 3 段階)]      │
│   ── handle ──                            │
│   09:00 甲府駅近くのカフェ                 │
│   山梨県甲府市丸の内 1 丁目 1-8 近辺      │
│   集中しやすい静かなカフェで、 (= Alter)  │
│   今日の計画を観測する余白。              │
│   [semantic visual]                       │
│   [詳細を見る] [ここへの経路]              │
├─────────────────────────────────────────┤
│ [bottom tab nav]                          │
└─────────────────────────────────────────┘
```

### 9.3 Map の core elements

#### 9.3.1 pin design

| 要素 | スタイル |
|---|---|
| pin shape | round + 時間ラベル吹き出し |
| pin color | category color (= 紫/オレンジ/青/緑) |
| pin icon | category icon (= ☕ / 🍽 / 💼 / 🏠 等の semantic) |
| time label | text-xs + bg-white + shadow-sm + 吹き出し style |
| selected pin | 1.2x scale + ring + shadow-lg |
| accessibility | aria-label = "09:00 カフェ" |

#### 9.3.2 route design

| 要素 | スタイル |
|---|---|
| line style | dashed + slate-400 + 2px |
| direction | pin の時系列順 (= 09:00 → 12:00 → 14:00 → 18:00) |
| 移動 mode (= 後段) | 別 audit (= 徒歩/車/電車 で line style 変更) |

#### 9.3.3 bottom sheet design (= 3 段階)

| state | height | trigger | 内容 |
|---|---|---|---|
| peek | 80px | default | 選択中 pin の title + 時刻 |
| half | 50% viewport | drag up | + 住所 + Alter 補助文 + visual |
| full | 90% viewport | drag up more | + 詳細 + 関連 anchor + CTA |
| drag handle | 4x36px | top center of sheet | tap で peek ↔ half toggle |

#### 9.3.4 「今日の地理」 表現 (= GPT 指摘の本質)

- 地図は **背景**、 pin / route / sheet が物語の **主役**
- pin の時間ラベルで「**いつ**」 + category 色で「**何**」 + dashed route で「**流れ**」 = 1 日の地理 story
- bottom sheet で「**今選択中の場所の意味**」 (= Alter 補助文)

### 9.4 Map で削除すべきもの

- Google Map 埋め込み感 (= pin / route を強化して構造的に克服)
- 地図補助 UI 散乱 (= controls を sheet と分離整理)
- 弱い bottom sheet (= 主役化)

---

## 10. 共通 design system 方向 (= 別 audit 推奨)

### 10.1 共通要素 (= List + Map で共通化)

| 要素 | 共通化対象 |
|---|---|
| typography scale | §3.1 で確定、 別 audit で実装 token 化 |
| color palette | brand (= indigo, purple) + category (= 4 色) + slate scale |
| spacing scale | Tailwind default + 大胆な padding (= GPT 指摘) |
| motion | framer-motion 既存依存内、 reveal / drag / fade |
| icon set | category icon + control icon + Alter sparkle |
| shadow / elevation | card / sheet / button で thier 階層化 |
| border radius | rounded-lg (= 8px) / rounded-2xl (= 16px) で統一 |
| focus regime | 規約 24-extended 継承 |

### 10.2 design tokens の格納場所 (= 提案)

`lib/plan/designTokens.ts` (= 新規):
- `CATEGORY_COLORS` (= 4 category の Tailwind class)
- `SECTION_LABEL_TEXT_CLASS` (= ALTER MORNING の caps style)
- `EVENT_CARD_VARIANTS` (= card variant の class 合成)
- 等

但しこれは別 sub-phase audit (= **design system extraction audit**) で詳細化。

---

## 11. Empty day の visual design (= N-3a 連携)

### 11.1 N-3a foundation の活用

N-3a で実装済:
- `EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›"` const
- `isEmptyDay(anchors): boolean` helper
- `EmptyDayEntryViewModel` type
- 規約 24-extended 整合

### 11.2 redesign での visual

| 状態 | visual |
|---|---|
| empty day (= List) | timeline spine が「観測の余地」 を表現、 entry "ALTER で見る ›" が default visible |
| empty day (= Map) | 地図上に pin なし、 bottom sheet に「観測の余地」 + entry |
| entry tone | text-sm + text-slate-500 + 控えめ chevron |
| entry placement | event card がない場所に直接、 push しない |

### 11.3 entry tap の挙動 (= N-3b 以降)

本 audit では entry の **visual** のみ確定。 tap 挙動 (= modal 起動) は N-3b 以降で別 plan audit。

---

## 11.5 Copy contract 自律確定 (= CEO 指示「ALTER MORNING はおかしい」 受けた再構築)

### 11.5.1 背景

CEO 指示 (= 2026-05-24): 「見出しや、 ラベル、 最上部の文言等は、 君のリサーチの上で、 違う内容にしてください。 少なくとも、 alter morning の文言はおかしいです。 文言系は変えるようにしてください。 変えなくてもいいと判断したらそれでいいです。」

→ 「ALTER MORNING」 の問題点を自律推論 + 世界トップアプリ literature で再構築。 「変えなくてもいい」 判断と「変える」 判断を外科的に分離。

### 11.5.2 「ALTER MORNING」 の問題点 (= 5 件、 自律分析)

| # | 問題 | 詳細 |
|---|---|---|
| 1 | **時間帯限定** | 朝限定の表現だが、 「今日のプラン」 は朝 / 昼 / 夜 全てを含む — 時間帯不整合 |
| 2 | **英語混在の不自然さ** | 主見出し「今日のプラン」 が日本語、 section label が英語のみ — 読みづらさ |
| 3 | **意味の曖昧さ** | 「ALTER の朝」 = 「Alter の朝モード」 という意味か明確でない |
| 4 | **brand redundant** | header に既に「ANEURASYNC ALTER」 存在、 もう一度「ALTER」 を出すのは冗長 |
| 5 | **思想不整合** | 「観測される 1 日」 vision (= 1 日全体) と「MORNING」 限定が矛盾 |

### 11.5.3 リサーチ (= 世界トップアプリの hero label patterns)

| app | hero label | 性質 |
|---|---|---|
| Things 3 | TODAY | 全大文字、 simple |
| Fantastical | Today | Title case、 simple |
| Apple Health | Summary | 全大文字 |
| Calm | TODAY + emotional copy | hybrid |
| Headspace | Today + mood label | hybrid |
| Notion Daily | (= label なし) | 日付主体 |

→ 世界トップアプリは **「TODAY」 系 simple universal label** が多数。 「ALTER MORNING」 は独自すぎ + 時間限定 + brand 重複 で参照に値しない。

### 11.5.4 採用案 (= 自律確定)

**section label「ALTER MORNING」 → 「観測中」**

理由:
- 「観測される 1 日」 vision (= §6.1) と直接接続
- 時間帯限定なし (= 1 日全体カバー)
- brand 重複なし (= ANEURASYNC ALTER と差別化)
- 動的 variant 可能 (= 「観測中」 / 「観測済」 / 「観測前」、 詳細は別 audit)

visual spec:
- subtle 紫 (= indigo-500/600 系) + caps (= 既存参考画像と整合)
- letter-spacing 広め
- size: text-xs - text-sm

### 11.5.5 全 copy contract 自律確定 (= 本 audit 範囲、 14 項目)

| 位置 | before (= 参考画像) | after (= 自律修正) | 修正理由 |
|---|---|---|---|
| header brand | `ANEURASYNC ALTER` | (= 維持) | brand identity |
| **section label** | **`ALTER MORNING`** | **「観測中」** | §11.5.2 の 5 問題点解消 |
| 主見出し | 「今日のプラン」 | (= 維持) | 1 日 framing、 参考画像と整合 |
| **subtitle (List)** | 「時間の流れを把握して、 心地よい 1 日に。」 | **「時間として観測する 1 日。」** | 命令形 / optimization 排除、 観測 framing |
| **subtitle (Map)** | 「場所を地図で確認して、 流れをつかみましょう。」 | **「空間として観測する 1 日。」** | 命令形 排除、 framing 統一 |
| toggle | 「地図」 / 「リスト」 | (= 維持) | universal 用語、 既に observation 中立 |
| date selector | `< 6月12日 (木) >` | (= 維持) | 標準 UX、 修正不要 |
| **transition chip** | 「移動・リフレッシュ」 / 「移動」 | **「移動・余白」 / 「移動」** | 「リフレッシュ」 = optimization 排除、 「余白」 = 観測 framing |
| **summary 主表現** | 「78% バランス良好」 | **「観測中」** | 評価 score 排除 (= 「良い/悪い」 暗示なし) |
| **summary 説明** | 「集中と休息のバランスが取れた良いプランです。」 | **「集中と休息の時間が、 今日に流れています。」** | 評価 / 命令 排除、 観測 framing |
| **summary CTA** | 「リズムを整えるヒント ›」 | **「リズムを見る ›」** | push 排除 (= 「整える」 → 「見る」 = observation) |
| **Alter 補助文 example** | 「集中しやすい静かなカフェで、 今日の計画を整理しましょう。」 | **「集中しやすい静かなカフェで、 今日の計画を観測する余白。」** | 命令形 → 名詞形 + 「整理」 → 「観測」 で Aneurasync 思想 framing 強化 (= §9.2 統一) |
| CTA buttons | 「詳細を見る」 / 「ここへの経路」 | (= 維持) | observation + functional、 修正不要 |
| **bottom tab #3** | **「AI メモ」** | **「Alter メモ」** | 「AI」 (= generic) → 「Alter」 (= brand integration、 「第二の自己」 思想接続) |
| bottom tab 他 | 「今日のプラン」 / 「インサイト」 / 「設定」 | (= 維持) | 既存整合 |

### 11.5.6 統計

- **変更**: 8 件 (= section label / List subtitle / Map subtitle / transition chip / summary 主 / summary 説明 / summary CTA / Alter example / bottom tab AI メモ — 計 9 unique copy contract 更新)
- **維持**: 6 件 (= header brand / 主見出し / toggle / date selector / CTA buttons / bottom tab 他 3)
- **合計**: 14 項目 確定

### 11.5.7 N-3a empty day entry との整合

- `EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›"` (= N-3a `d55aab5f` 確定)
- 「ALTER」 = brand integration、 §11.5.5 の「Alter メモ」 と整合
- 「で見る」 = 観測 framing、 §11.5.5 の「リズムを見る」 と整合
- 「›」 = tap UX 慣習、 §11.5.5 の summary CTA / Alter example と整合
- → **N-3a foundation と本 copy contract は完全整合** ✅

### 11.5.8 詳細 copy contract は別 audit

本 §11.5 で **方向性 copy 14 項目** を自律確定。 以下は別 audit で完全列挙:
- 全 page copy (= settings / インサイト / Alter メモ tab 内 等)
- micro-copy (= empty state、 loading、 error message)
- tooltip / aria-label
- date variants (= 過去日 / 未来日 / today の section label 動的 variant)

→ **copy contract audit** (= 別 doc、 別 branch) で詳細化。

---

## 12. 既存資産との整合 (= wave 1/2/3/3a 規約 24-extended 維持)

### 12.1 必須整合項目

| 項目 | 状態 | 維持方法 |
|---|---|---|
| wave 1 focus ring 規約 | frozen | 既存 file 不触 |
| wave 2 ring 規約 plan 全展開 | frozen | 既存 file 不触 |
| wave 3 border 規約 24-extended | frozen | 既存 file 不触 |
| wave 3a L 453 residual 解消 | frozen | 既存 file 不触 |
| 機械保証 40 件 regression | 維持必須 | 新規 file は規約 24-extended 適用 + TARGET_FILES 追加 |
| N-3a empty day pure foundation | 維持 | redesign 後の UI で entry を visual に転写 |

### 12.2 新規 component の規約遵守

- 全 interactive surface (= card / button / chip / sheet handle) は規約 24-extended
- `focus-visible:` + `slate-*` (= brand-color 不使用)
- `focus:outline-none` 維持
- regression test に追加 (= TARGET_FILES に新規 component path 追加)

### 12.3 既存 anchor data model との整合

- 既存 anchor type (= `ExternalAnchor` 等) は **変更しない**
- 新規 view model (= EventCardViewModel 等) は anchor を input として transform
- API endpoint は **変更しない** (= 既存 fetch pattern 維持)

---

## 13. 実装順序 (= sub-phase 分割、 既存 N phase との関係)

### 13.1 全体順序 (= 自律提案)

| # | phase | 内容 | docs/impl | 規模 |
|---|---|---|---|---|
| 1 | ✅ N-3a | empty day observation pure foundation | impl | 完了 (= `d55aab5f`) |
| 2 | ★ **本 audit** | List / Map design redesign direction | docs | 着地中 |
| 3 | **次** | Design system extraction audit (= tokens / typography / motion) | docs | 中 |
| 4 | | List redesign plan audit | docs | 中 |
| 5 | | List redesign impl (= sub-phase 分割: timeline spine → event card → empty entry 視覚化) | impl | 大 |
| 6 | | List closeout audit | docs | 小 |
| 7 | | Map redesign plan audit | docs | 中 |
| 8 | | Map redesign impl (= sub-phase 分割: pin/route → bottom sheet → 統合) | impl | 大 |
| 9 | | Map closeout audit | docs | 小 |
| 10 | | N-3b (= empty day entry UI 接続、 redesign 後の UI に整合) | impl | 中 |
| 11 | | N-3c-e | impl | — |
| 12 | | N-3 closeout | docs | — |
| 13 | | N-4 (= Pattern Truth Layer + Counter-Factual Observation) | — | — |
| 14 | | N-5 (= /plan final closeout) | — | — |

### 13.2 N phase との関係 (= 自律提案)

design redesign は N completion audit §3.3 の本来 phase mapping に **新規挿入** が必要。 但しこれは CEO 判断項目:

| 選択肢 | 内容 | trade-off |
|---|---|---|
| A. design redesign を **N-2 の延長**として扱う | N-2 = polish + redesign で expand | scope 膨張、 N-2 を再 open |
| B. design redesign を **N-3 の前置**として扱う | N-3 着手前に visual 完成 | N-3a と矛盾 (= N-3a 完了済) |
| C. **新規 phase 「N-2.5」 or 「N-3a.5」 を挿入** | redesign を独立 phase に | phase 番号体系の拡張 |
| D. **「N-pre-3b」 or 「N-design」 として独立** | 自由命名 | clearest |

自律推奨: **D** (= 独立 phase 命名)、 但し CEO 判断必要。

### 13.3 連続 GO 不可

design redesign は大規模 refactor を含むため:
- 各 sub-phase で CEO smoke 必須
- 連続 GO 不可
- 各 sub-phase 着地後に CEO 判断

---

## 14. 禁止事項 (= 永続 + redesign 固有)

### 14.1 永続禁止 (= 全 N phase + redesign 継承)

- Arrival Risk Memory
- Counter-Factual generation (= Observation は OK)
- 「おすすめ」 / 「これをした方がいい」 / 「最適」 / 「最適化」 / 「推奨」 / 「改善」 / 「警告」 / 「危険」 / 「注意」 / 「リスク」
- amber / orange / red 警告色
- icon / badge / warning box
- localStorage / persist
- DB / env / package / dependency 変更
- runtime telemetry sink
- fetch / push / gh / reset / restore / stash / branch delete
- Routes API / 実 API
- Deploy readiness / Stargazer pivot / Rendezvous / Genome pivot / 初期ユーザー獲得

### 14.2 redesign 固有禁止

- 既存 wave 1/2/3/3a frozen file への追加変更 (= 規約 24-extended 違反復活)
- 「予定なし」 否定的 empty 表現 (= 「観測の余地」 に置換)
- 命令形 copy (= 「整理しましょう」 「掴みましょう」 → 観測 framing)
- 評価 score (= 「78% バランス良好」 → 「観測中」 framing)
- push 系 CTA (= 「整える」 「ヒント」 → 「見る」 framing)
- 外部 image 即実装 (= source 別 audit、 semantic visual で start)
- 大規模 motion library 追加 (= framer-motion 既存依存内)
- base map provider 変更 (= 既存維持)
- Calendar tab redesign (= CEO 明示で一旦放置)
- N-3b 以降 の機能 を先取り実装 (= design 確定後)

### 14.3 本 audit で禁止 (= docs only)

- 実装着手 (= 新規 file 作成、 既存 file 改変)
- 別 sub-phase audit への独断進行 (= design system extraction は別 audit)
- frozen branches 追加 commit

---

## 15. smoke 観点 (= 各 sub-phase 共通)

### 15.1 visual smoke

| 観点 | 内容 |
|---|---|
| 「観測される 1 日」 framing | 主見出し / subtitle が観測 tone か |
| 1 画面 1 主役 | List 時間軸 / Map 空間軸が明確か |
| 二重表現排除 | 同情報の重複なし |
| event card 意味 | Alter 補助文が観測 framing で書かれているか |
| empty day 表現 | 「観測の余地」 + entry が default visible |
| copy tone | 命令形 / 評価 / push 系 NG |
| brand color 適切利用 | selection / hover OK、 focus 禁止 |
| 余白 / コントラスト | type scale / spacing scale 効いているか |

### 15.2 a11y smoke

| 観点 | 内容 |
|---|---|
| keyboard navigation | Tab / Shift+Tab / Enter / Esc 全動作 |
| focus visibility | 規約 24-extended (= slate-* focus-visible) |
| aria-label | 全 interactive surface に |
| semantic role | event card = article or listitem |
| contrast ratio | WCAG AA 以上 |

### 15.3 思想整合 smoke

| 観点 | 内容 |
|---|---|
| 観測の幕間 | mouse stuck visual / brand 焼き付き 排除 |
| user 選択尊重 | push しない、 entry visible だが user initiated |
| Aneurasync 中心問い | 「自分って、 そういう人間だったのか」 への接続感 |

### 15.4 機能不変 smoke

| 観点 | 内容 |
|---|---|
| 既存 anchor flow | add / edit / delete 動作不変 |
| 既存 wave 規約 | 40 件 regression PASS 維持 |
| API endpoint | 変更なし |

---

## 16. risk 評価

| risk | level | mitigation |
|---|---|---|
| 既存 wave 規約違反復活 | medium | 新規 component の規約 24-extended 遵守 + TARGET_FILES 追加 |
| 機能変更 (= 既存 flow 破壊) | medium | data model / API 触らず、 view model 層のみ refactor |
| copy 思想違反 | medium | 観測 framing の copy contract を別 audit で確定 |
| image source 決定遅延 | medium | semantic visual で start、 後段 audit |
| performance 低下 | low | bundle / motion 制約あり |
| a11y 低下 | low | 規約 24-extended + ARIA で担保 |
| scope 膨張 | high | sub-phase 厳密分割、 各 sub-phase で CEO smoke 必須 |
| N-3b 整合性低下 | medium | redesign 後 UI に entry を整合させる (= N-3b は redesign 後着手) |
| Calendar への波及 | low | CEO 明示で放置、 触らない |
| Stargazer pivot 越境 | low | data / engine 内部不触 |

---

## 17. CEO 判断項目 (= 報告で停止)

### 17.1 vision / framing

| # | 判断項目 |
|---|---|
| 1 | 「観測される 1 日」 framing 採用 (= GPT 「体験」 を Aneurasync 「観測」 に深化) |
| 2 | 1 画面 1 主役 (= List 時間軸 / Map 空間軸) 採用 |
| 3 | ~~参考画像の copy tone を Aneurasync 整合に書き換え~~ — **§11.5 で自律確定済** (= CEO 2026-05-24 指示受け、 14 copy contract 確定、 8 件変更 / 6 件維持) |

### 17.2 visual / structure

| # | 判断項目 |
|---|---|
| 4 | ~~「ALTER MORNING」 section label 採用~~ — **§11.5 で「観測中」 に変更確定済** (= 時間帯限定 + brand redundant 解消) |
| 5 | image source 決定 (= semantic visual + ambient gradient で start、 後段 audit) |
| 6 | bottom sheet 3 段階 (= peek / half / full) 採用 |

### 17.3 phase 配置

| # | 判断項目 |
|---|---|
| 7 | design redesign を N phase の どこに位置付けるか (= §13.2 の A/B/C/D) |
| 8 | 次 sub-phase audit (= design system extraction) への進行承認 |

### 17.4 後段論点 (= 別 audit)

- design system extraction (= tokens / typography / motion)
- copy contract audit (= 観測 framing の全 copy 確定)
- image source decision audit
- responsive design (= tablet/desktop) audit

---

## 18. 結論

### 18.1 本 audit の成果

1. GPT design audit の **妥当性評価** (= 10/10 主要主張に同意 + 7 補完論点)
2. 世界トップアプリ literature からの **5 principles 抽出**
3. Aneurasync 思想との **統合 vision** = 「**観測される 1 日**」
4. List / Map redesign direction の **詳細方針** 固定
5. 既存資産整合 + 実装順序 + 禁止事項 + smoke 観点
6. **8 CEO 判断項目** + **4 後段 audit** 明示 (= §17)
7. **Copy contract 自律確定 14 項目** (= §11.5、 CEO 2026-05-24 「ALTER MORNING はおかしい」 指示受けた再構築、 8 件変更 / 6 件維持)

### 18.2 redesign の本質 (= 1 文)

> /plan redesign は単なる UI polish ではなく、 「**データ管理画面**」 から「**自己観測 surface**」 への transformation である。

### 18.3 次のアクション (= CEO 判断後)

1. CEO 判断 (= §17 の 8 項目 + 後段 4 audit の優先順、 #3 / #4 は §11.5 で自律確定済)
2. 採用なら **design system extraction audit** に進む (= 別 audit、 別 branch)
3. その後 List redesign plan audit → impl の順
4. 各 sub-phase で CEO smoke 必須 (= 連続 GO 不可)
5. 詳細 copy contract (= micro-copy / error / date variants) は **copy contract audit** で完全列挙 (= 別 audit、 §11.5.8)

### 18.4 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: redesign (= 大規模) を sub-phase 厳密分割
- 「観測される 1 日」 framing を最初に確定すると、 後段 sub-phase で迷いなく進行
- 「予定管理アプリ」 ではなく「自己観測 surface」 という framing は **Aneurasync 固有性** の表現で、 競合との差別化 axis に直接接続
- frozen branches 影響 0、 既存資産活用 100% (= 規約 24-extended + N-3a foundation)

---

**完了**: Plan List / Map Design Redesign Direction Audit。 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0。 設計方向固定のみ。 CEO 判断待ち (= §17 の 8 項目)。
