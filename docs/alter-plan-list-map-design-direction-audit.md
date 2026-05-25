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

### 0.2 結論先出し (= 北極星補正版、 第 3 補正反映)

| 観点 | 結論 |
|---|---|
| GPT 監査の妥当性 (= 第 1+第 2+第 3 補正統合) | **概ね妥当**、 但し補完論点 + 北極星補正 + 外部データ取り込み復活 |
| redesign の本質 | 「データ管理画面」 → **二層構造 surface** への transformation (= **観測層** = user 自身が 1 日を見る + **生成層** = Alter が自律学習で user に最も適した 1 日を組み立てる) |
| 1 画面 1 主役 (= GPT) | **採用**、 但し Aneurasync 解釈: List = 時間軸主役、 マップ = 空間軸主役、 両者で「**同じ 1 日を 2 軸で観測**」、 さらに **生成された 1 日も同じ 2 軸で表示**(= 観測 / 生成の境界線は visual 上シームレス) |
| 北極星 (= CEO 第 3 補正) | /plan は「観測 surface」 + 「自律 planning engine の可視化面」 の **二層構造**。 ユーザー入力なしでも user に最適な 1 日を生成し、 Alter との会話でプラン作成、 Plan 側で追加/削除/修正、 外部データ (= シフト表 / 時間割 / PDF / 画像) 取り込みまで含む |
| 外部データ取り込み (= 復活) | 過去設計 `alter-plan-foundation-design.md` の Document Import (= Phase 1a/1b/2、 Vision LLM 経由) を future scope として復活。 シフト表 / 時間割 / PDF / 単発予定の取り込みを **本 audit の scope に含めない** が、 redesign は将来取り込んだ anchor を自然に表示できる構造で設計 |
| 用語統一 (= CEO 第 3 補正) | **UI 表示**: 「地図」 → **「マップ」**、 「今日の地理」 → 「マップ」。 **内部概念**: 「空間軸」 / 「今日の地理」 は doc / 思想 layer で維持 |
| 既存規約との整合 | wave 1/2/3/3a 規約 24-extended **完全保持** (= 機械保証 40 件) |
| 実装着手 | 本 audit 着地 → IA Audit (= 北極星補正版) → 別 sub-phase plan audit → 実装、 即実装は **不可** |

### 0.3 CEO 判断項目 (= §17 で詳細、 主要項目)

1. **二層 framing 採用** (= 観測 + 生成、 「ただの観測アプリ」 でも「ただの予定管理アプリ」 でもない)
2. **外部データ取り込み future scope 復活** (= Document Import、 過去設計踏襲)
3. **用語統一**: 「地図」 → 「マップ」 (UI)、 内部「空間軸」 維持
4. 1 画面 1 主役 (= List 時間軸 / マップ 空間軸) の採用
5. design redesign を N phase の どこに位置付けるか
6. 次 sub-phase audit (= 北極星補正版 IA Audit) への進行承認

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
| 評価 score (= 78% バランス) | (= score の有無は **構造論点**、 §13 IA audit で再判断) | optimization 排除は **copy 単語** ではなく **構造** で行う (= 第 2 補正反省) |
| 時間帯限定 section label (= `ALTER MORNING`) | **「Alter Planning」 section label** (= §11.5 確定、 時間帯独立、 brand 2 段階深化) | brand 重複 / 思想不整合 解消 |

### 5.3 「観測される 1 日」 framing の意味

これは GPT の「1 日体験画面」 を Aneurasync 固有性で **深化** したもの:
- 「体験」 = 一般的 (= 多くのアプリが目指す)
- 「観測」 = Aneurasync 固有 (= 「user 自身が user の 1 日を観測する」 = 自己観測)

→ user が plan を開く行為 = **自己観測の行為**。 各 event card = **観測の単位**。 1 日全体 = **観測の流れ**。

これが Aneurasync が他の予定管理アプリと **構造的に異なる** 点。

---

## 6. 統合 vision: 「観測 + 生成」 の二層構造として redesign (= 北極星補正版)

### 6.1 redesign vision statement (= 1 文、 第 4 補正反映、 主従明示)

> **/plan は予定管理アプリでも、 ただの観測アプリでもない。 本質は Alter が学習で user に最も適した 1 日を「生成・反映」 する planning engine の可視化面であり、 ユーザー自身が 1 日を時間軸 (= List) と空間軸 (= マップ) で「観測・編集」 する体験面でもある。 「生成・反映」 が主、 「観測・編集」 がその surface。 二層は対立せず、 生成 → 観測 → 編集 → 学習 → 生成 のサイクルを成す。**

### 6.1.5 二層構造の詳細 (= CEO 第 3 + 第 4 補正で明確化、 主従順序)

| 層 (= 優先順) | 役割 | source | 表示先 |
|---|---|---|---|
| **第 1 層 (= 主): 生成・反映層** | Alter が学習で user に最も適した 1 日を組み立てる、 会話で plan 作成、 Plan 反映 | Alter 自律学習 (= user 過去行動 pattern) + Alter 会話 + 外部 source (= シフト表 / 時間割 等) | List / マップ |
| **第 2 層 (= 体験面): 観測・編集層** | user 自身が 1 日を見る (= 時間軸 / 空間軸)、 編集 (= 追加 / 削除 / 修正)、 修正は Alter の学習 source として循環 | user 手入力 anchor + 外部データ取り込み済 anchor + Alter generated anchor | List / マップ (= 同じ surface に統合表示、 source は visual 上シームレス) |

ゴール (= CEO 明示):
- **ユーザー入力なし**でも user に最適な 1 日を生成 (= 第 1 層の核)
- **Alter との会話**でプラン作成 (= 例: 旅行 plan)、 Plan 側に反映 (= 第 1 層 → 第 2 層)
- **Plan 側**で追加 / 削除 / 修正 (= 第 2 層 → 第 1 層、 双方向)
- **外部データ**取り込み (= シフト表 / 時間割 / PDF / 画像 → Vision LLM → ExternalAnchor、 §10.5)
- **予定の準備 / 実行 / 事後の知能** (= Event Execution Layer、 §10.7)

### 6.1.6 サイクルの図解 (= 第 4 補正反映)

```
[Alter 学習]                   [user 過去行動 pattern]
     ↓                                    ↓
[第 1 層: 生成・反映]  ←  [Alter 会話 / 外部データ / Event Execution Layer]
     ↓
[List / マップ surface 表示]
     ↓
[第 2 層: 観測・編集]  →  [user の修正 / 追加 / 削除]
     ↓
[Alter 学習 (= 循環)]
```

→ 生成 → 観測 → 編集 → 学習 のサイクルで「**user に最も適した 1 日**」 の精度を継続的に向上。

### 6.2 vision を支える 5 principles (= §4.3 + 北極星補正)

1. **Subject as identity**: 主語は「Plan」 ではなく「今日のプラン」、 究極は「**観測 + 生成のサイクル**」
2. **Time as spine (= List)**: timeline で時間軸を視覚的に spine 化、 観測 anchor + 生成 anchor を統合表示
3. **Space as spine (= マップ)**: 地図で空間軸を視覚的に spine 化、 dashed route で 1 日を story 化、 観測 + 生成 anchor を統合表示
4. **Cards with meaning**: 各 event = 観測 / 生成の単位、 Alter 補助文 + semantic visual で「行きたくなる」
5. **Bottom sheet as drill-down**: 詳細は sheet で drill-down、 主画面は overview を保持

### 6.3 vision からの除外 (= やらないこと、 北極星補正で再整理)

| 除外 | 理由 |
|---|---|
| **「ただの観測アプリ」 化** (= 生成層なし) | CEO 第 3 補正: 「観測されるだけで何も生成しない」 アプリは Aneurasync vision を半分しか達成しない |
| **「ただの予定管理アプリ」 化** (= 観測層なし) | 競合 (= Google Calendar / Things 3 等) との差別化喪失 |
| **「独特なプランニングアプリ」 化** (= 過剰な世界観で使いづらい) | CEO 第 3 補正: 自然な日本語 + 構造で思想表現、 単語狩り禁止 |
| **写真 (= 外部 image)** の即実装 | source 決定が別 audit、 まずは semantic visual で start |
| Stargazer pivot / 大規模 engine 接続 | scope 外、 既存 alter engine 流用 (= read-only) |
| Calendar tab の redesign | CEO 明示で一旦放置 |
| **本 audit scope での外部データ取り込み impl** | future scope (= §10.5)、 redesign は表示構造のみ確保 |
| **本 audit scope での planning engine impl** | future scope (= §10.6)、 redesign は表示構造のみ確保 |

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
│   Alter Planning (= subtle 紫 Title case、 §11.5 確定) │
├─────────────────────────────────────────┤
│ [title block]                            │
│   今日のプラン (= display large)          │
│   時間の流れを把握して、 心地よい 1 日に。│
│     (= 参考画像踏襲、 §11.5 確定で revert)│
├─────────────────────────────────────────┤
│ [toggle]                                 │
│   マップ | リスト (= right-aligned、 §11.5 確定) │
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
│   ── 移動 ── ── ── ── ── ── 11:00-12:00 │
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
│   78% バランス良好 (= 参考画像踏襲、       │
│     score 構造論点は §13 IA audit)        │
│   集中と休息のバランスが取れた良いプランです。│
│   「リズムを整えるヒント ›」 (= 参考画像踏襲)│
├─────────────────────────────────────────┤
│ [bottom tab nav]                          │
│   今日のプラン / インサイト / Alter メモ / 設定 │
│     (= 「Alter メモ」 のみ §11.5 確定で変更)│
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
│   subtitle: 「場所をマップで確認して、     │
│     流れをつかみましょう。」              │
│     (= 参考画像踏襲 + 「地図」 → 「マップ」 §11.5 確定)│
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
│   今日の計画を整理しましょう。            │
│     (= 参考画像踏襲、 §11.5 確定で revert)│
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

#### 9.3.4 「マップ」 として見せる 1 日 (= UI 表示用語、 内部概念 = 空間軸 / 今日の地理)

- マップは **背景**、 pin / route / sheet が物語の **主役**
- pin の時間ラベルで「**いつ**」 + category 色で「**何**」 + dashed route で「**流れ**」 = 1 日のマップ上 story
- bottom sheet で「**今選択中の場所の意味**」 (= Alter 補助文)

**用語分離**:
- UI 表示: 「マップ」 (= CEO 第 3 補正、 toggle label / subtitle 等)
- 内部概念 (= doc / 思想 layer): 「空間軸」 / 「今日の地理」 / 「Map redesign」 (= 維持)

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
- `SECTION_LABEL_TEXT_CLASS` (= Alter Planning の Title case style、 §11.5 確定)
- `EVENT_CARD_VARIANTS` (= card variant の class 合成)
- 等

但しこれは別 sub-phase audit (= **design system extraction audit**、 §13.1 順序で **最後**) で詳細化。

---

## 10.5 外部データ取り込み (= Document Import、 future scope、 CEO 第 3 補正で復活)

### 10.5.1 復活の根拠

CEO 第 3 補正 (= 2026-05-24): 「以前私が言っていた、 例えばシフト表などのデータ媒体を、 読み込んで、 plan に写す。 がこれまでの会話の中で現れなかったので、 無かったことにされてます」

過去 doc `docs/alter-plan-foundation-design.md` (= 既存) に **Document Import** が体系化済:
- §7 全体: アーキテクチャ (= Frontend → Next.js API → Vision LLM → 構造化 JSON → AlterConfirmation → ExternalAnchor)
- Phase 1a (= Wave 2): 単発予定 PDF (= 予約票 / 会議招待 / 旅行 itinerary / 診察予約)
- Phase 1b (= Wave 2): 時間割 PDF (= 学校時間割 / 定期授業表)
- Phase 2 (= Wave 5): シフト表 (= 自分の名前抽出) / 手書き写真 / recurrence 自動推定 / 学期カレンダー連携
- Vision LLM (= Claude Sonnet 4 / Opus 4.7) でテーブル構造を直接理解

→ 本 audit から **無かったことにされていた** ため、 future scope として正式復活。

### 10.5.2 本 audit (= List / Map redesign) との関係

| 項目 | 本 audit scope | 別 audit scope |
|---|---|---|
| **取り込み機能本体** (= upload UI / Vision LLM 呼び出し / 確認画面) | ❌ scope 外 | ✅ Document Import phase で別実装 |
| **取り込まれた anchor の List / Map 表示** | ✅ scope 内 | — |
| **取り込み source の visual hint** (= 例: 「シフト表から」 等の origin badge) | ⚠️ design 時点で考慮、 詳細は後段 | ✅ Document Import 完了後の UI 統合 |
| **取り込み済 anchor の編集 / 削除 flow** | ✅ scope 内 (= 既存 anchor flow と同じ) | — |

→ redesign は **将来取り込んだ anchor を自然に表示できる構造** で設計。 表示構造のみ確保、 取り込み機能本体は別 phase。

### 10.5.3 design 時点で確保すべき構造

- ExternalAnchor type の **source 属性** (= 「手入力」 / 「Document Import」 / 「Alter 生成」) を view model で受け取れる
- event card に **origin hint** を表示する余地 (= 但し overemphasis しない、 一見では普通の anchor と同じ表示)
- List timeline / マップ pin に origin による visual differentiation の余地 (= 例: subtle badge)
- conflict 検出 (= 取り込み anchor と既存 anchor の重複) の表示余地 (= 但し warning 系文言 / 色 禁止、 自然な表現)

### 10.5.4 3 source 共存設計 (= GPT 第 4 補正で IA Audit 必須化 → 第 5 補正で必須拘束条件化)

GPT 第 4 補正: 「外部データ取り込みを future scope だけで終わらせない。 IA Audit で **user entered / imported / Alter generated** の 3 source が List / マップ 上でどう共存するかを最初から決める」

GPT 第 5 補正: 「3 source 共存が『存在宣言』 で止まっている。 IA Audit で **5 必須項目として固定**」

**IA Audit で必須項目** (= §13.1.6 で **必須拘束条件 5 項目**として固定):
- source provenance の表示方法 (= 3 source の visual differentiation、 但し overemphasis 回避)
- imported schedule (= シフト表 / 時間割) の **編集可能性** (= user が変更できるか、 取り込み時点でロックか、 hybrid か)
- Alter generated plan の **distinguish 方法** (= 「受け入れる / 修正 / 削除」 action の余地)
- 会話反映予定 (= Alter 会話 → Plan) と外部取込予定の **並列ルール** (= 時刻衝突時の解決)
- 統一 source provenance 構造 (= §10.6.3 + §10.7.5 連携)
- **generated plan を確定前 / 確定後で表現分離** (= 第 5 補正で追加、 §13.1.6 #5)

→ これら 5 項目は §13.1.6 で **IA Audit 必須拘束条件**として固定。 1 つでも未確定で List Redesign Spec に進むことを **禁止** (= §13.1.8)。

---

## 10.6 自律 Planning Engine (= future scope、 CEO 第 3 補正で明示)

### 10.6.1 北極星 (= CEO 第 3 補正)

CEO 第 3 補正 (= 2026-05-24): 「自律的にユーザーを学習し、 それを反映させていくことで、 ユーザーの予定をコントロールできるようにするべきです。 ユーザーに最も適した 1 日を、 ユーザーからの情報なしでも作れるようになるのがゴール」

planning engine の 3 機能 (= CEO 明示):
| # | 機能 | 詳細 |
|---|---|---|
| 1 | **自律学習 → 1 日生成** | user の過去行動 pattern を継続観測 → user 入力なしで最適 1 日を生成 |
| 2 | **Alter 会話 → plan 作成** | Alter との会話 (= 例: 旅行 plan)、 自然対話で plan を生成 |
| 3 | **双方向反映** | Plan ↔ Alter (= Plan で追加/削除/修正 → Alter に学習として反映、 Alter の生成 → Plan に表示) |

### 10.6.2 本 audit (= redesign) との関係

| 項目 | 本 audit scope | 別 audit scope |
|---|---|---|
| **planning engine 本体** (= 自律学習 / 1 日生成 / 会話 plan) | ❌ scope 外 | ✅ planning engine phase で別実装 (= N-4 以降 or 別 phase) |
| **生成された anchor の List / Map 表示** | ✅ scope 内 | — |
| **生成 source の visual hint** (= 例: 「Alter 提案」 等の origin badge) | ⚠️ design 時点で考慮 | ✅ planning engine 完了後 |
| **生成 anchor の編集 / 削除 / 受け入れ flow** | ⚠️ design 時点で構造確保 | ✅ planning engine UI で詳細 |
| **Alter 会話 surface** (= 会話 UI) | ❌ scope 外 (= 既存 alterHomeAdapter / 別 surface) | ✅ Alter 会話 phase |

→ redesign は **将来生成された anchor / 会話結果を自然に表示・操作できる構造** で設計。

### 10.6.3 design 時点で確保すべき構造

- ExternalAnchor type の **source 属性** に「Alter 生成」 / 「Alter 会話」 の値を許容
- event card / pin に **生成 anchor かどうか** の visual differentiation 余地 (= 但し overemphasis しない、 「手入力か Alter 生成か」 は user が知りたいなら見える程度)
- **「受け入れる / 修正 / 削除」** action の余地 (= 但し Plan 主画面では overemphasis しない、 sheet / detail で表示)
- 「観測」 と「生成」 の境界が visual 上 シームレス (= 同じ event card / pin で表示、 一見では区別なし)

### 10.6.4 思想整合性 (= 「観測される 1 日」 と「自律生成される 1 日」 の調和)

二層構造の Aneurasync 解釈:
- 観測層 = 「user 自身が自分の 1 日を見る」 (= 自己観測、 中心問い 「自分って、 そういう人間だったのか」)
- 生成層 = 「Alter が user の代わりに 1 日を組み立てる」 (= 第二の自己、 中心問い 「user が自分で組み立てるよりも、 Alter が組み立てたほうが user らしい」 への接続)
- 両層は **対立せず統合**: Alter は user の代行ではなく、 user の自己観測の **延長**として 1 日を生成

→ 「ただの観測アプリ」 でも「ただの予定管理アプリ」 でもない、 Aneurasync 固有の二層 surface。

---

## 10.7 Event Execution Layer (= 予定にぶら下がる実行知能、 future scope、 CEO 第 4 補正)

### 10.7.1 CEO 構想 + GPT 提案統合

CEO 構想 (= 2026-05-24): 「予定に対する準備などに対して、 なんの準備が必要なのかを、 詳細ボタンの中に、 推論 + ユーザーの記入で出してあげる。 ToDo みたいなものを。 すべての予定に入れるべきではない。 持ち物 / やらなきゃいけないことが予定から推論または、 ユーザーが必要だと言ったときにつければいい。」

→ これは「ToDo」 ではなく **予定を成立させるための実行知能**。 GPT 提案 (= 6 種類 + 付与条件 5 系統 + 完全 10 軸 + 構造 + 3 層 UI + 強化案 7 + 禁止 4) を統合し、 future scope として明示。

### 10.7.2 実行レイヤーの 6 種類 (= GPT 整理)

| # | 種類 | 例 |
|---|---|---|
| 1 | **準備** | 持ち物 / 服装 / 資料確認 / 事前予約 / URL 確認 / 充電 / 名刺 / チケット / 財布 / 身分証 |
| 2 | **実行タスク** | 上司に共有 / 資料送付 / 会場連絡 / 店予約 / 印刷 / 交通手段確認 |
| 3 | **条件・依存関係** | 雨なら中止 / チケット取得済 / 相手返答待ち / シフト確定後 / 友人参加可否 |
| 4 | **当日の注意点** | 10 分前到着 / 静かな服装 / 現金のみ / 入館証 / 遅刻連絡先 |
| 5 | **事後タスク** | お礼メッセージ / 経費精算 / 写真整理 / メモまとめ / 次回予約 / フィードバック |
| 6 | **学習メモ** | この会議は毎回 PC + 充電器 / 映画館は 30 分前到着 / 出張前日は荷造り |

### 10.7.3 付与条件 5 系統 (= CEO 「すべての予定に入れない」 を体系化)

| # | 条件 | 詳細 |
|---|---|---|
| A | **推論で自動提案** | 「会議」 → 資料 / PC / 開始前確認、 「旅行」 → チケット / 荷物 / 移動、 「面接」 → 服装 / 履歴書 / 到着バッファ |
| B | **user が必要だと言った時** | 「この予定の準備も見たい」 「持ち物も付けて」 「やることを出して」 |
| C | **過去行動から学習** | 毎回カフェ作業の前にイヤホン / 出勤前に社員証 / 出張前日に荷造り |
| D | **外部データ由来** | シフト表 → 制服 / 社員証、 旅行 itinerary → チェックイン / 搭乗、 PDF 持ち物欄抽出 |
| E | **高負荷イベントのみ** | 旅行 / 面接 / 病院 / 会議 / プレゼン / 出張 / 重要会食 / イベント参加 |

→ **全予定に自動付与しない**。 上記 A-E のいずれかが trigger されたときのみ付与。

### 10.7.4 完全網羅 10 軸 (= GPT 整理、 詳細項目)

| # | 軸 | 内容 |
|---|---|---|
| 1 | 持ち物 | 必須 / あると良い / 現地代替可否 |
| 2 | 事前タスク | 前日まで / 当日朝まで / 出発前まで |
| 3 | 確認事項 | 時間 / 場所 / 相手 / 持ち物 / 支払い / 服装 / 必要書類 |
| 4 | 移動準備 | 出発時刻 / 交通手段 / 乗換 / 遅延リスク / バッファ |
| 5 | お金関連 | 現金 / 経費 / 私費 / チケット購入済 / 支払い先 |
| 6 | コミュニケーション | 連絡 / リマインド / お礼 / 参加可否確認 |
| 7 | 服装・身だしなみ | フォーマル / カジュアル / 制服 / 天候依存 |
| 8 | mental / context prep | 何を考えておくか / 話す内容 / 目標 / 質問リスト |
| 9 | リスク・条件 | 雨天時 / 相手都合 / 遅延時 / 必須条件未達 / キャンセル条件 |
| 10 | 事後処理 | 記録 / 精算 / お礼 / 次回設定 / 振り返り |

### 10.7.5 構造 (= 「ToDo checklist」 ではなく「準備オブジェクト」、 GPT 提案採用)

```typescript
// 将来の Event Execution Layer type (= 提案、 詳細は別 audit で確定)
type EventExecutionLayer = {
  readonly preparation_items?: ReadonlyArray<PreparationItem>;
  readonly required_items?: ReadonlyArray<RequiredItem>;
  readonly preconditions?: ReadonlyArray<Precondition>;
  readonly departure_plan?: DeparturePlan;
  readonly communication_tasks?: ReadonlyArray<CommunicationTask>;
  readonly followup_tasks?: ReadonlyArray<FollowupTask>;
  readonly notes_for_next_time?: ReadonlyArray<LearningNote>;
};
```

→ user entered / imported / Alter generated の 3 source 統一構造 (= §10.5.3 + §10.6.3 連携)

### 10.7.6 UI 3 層 (= GPT 提案、 主画面 ↔ 詳細 ↔ 会話)

| 層 | 配置 | 内容 |
|---|---|---|
| **層 1** | 予定 card 上の **軽いサイン** | 「準備あり」 / 「持ち物 3」 / 「出発確認あり」 / 「事後対応あり」 |
| **層 2** | **詳細画面の実行セクション** (= bottom sheet drill-down or modal) | 準備 / 持ち物 / 当日の注意 / 事後タスク (= 6 種類のうち付与されたもの) |
| **層 3** | **Alter 深掘り** (= 会話 surface) | 「この予定で足りない準備ある?」 「何を持っていけばいい?」 「出発は何時がいい?」 |

→ 主画面は overview を保持、 詳細は drill-down、 会話は最深部。 「予定」 は Plan の主役、 「準備」 は詳細に潜る。

### 10.7.7 強化案 7 件 (= GPT 追加)

| # | 案 | 内容 |
|---|---|---|
| 1 | **逆算チェックポイント** | 予定時刻から逆算 (= 前日夜 / 当日朝 / 出発 30 分前)、 「準備」 より実用的 |
| 2 | **必須 / 任意 / 推奨 区別** | 重さに差をつけてノイズ排除 |
| 3 | **confidence 表示** | Alter 推論の確度 (= 高確度 / 推定 / 確認待ち) |
| 4 | **recurring learning** | user 修正で学習 (= 例: 面接で印鑑不要 / ジムで水必要 等) |
| 5 | **event template** | 出張 / 病院 / 会議 / 旅行 のテンプレ |
| 6 | **source provenance** | 各項目の由来 (= user / Alter / 文書 / 学習) を表示 |
| 7 | **missing detection** | 「面接なのに履歴書なし」 等を検出 (= 但し説教注意、 自然な提示) |

### 10.7.8 やらないこと 4 件 (= 失敗 pattern 回避)

| # | やらないこと | 理由 |
|---|---|---|
| 1 | 全予定に一律 ToDo 生成 | 重い、 ノイズ、 タスク管理アプリ化 |
| 2 | 断定しすぎ (= 「これが必要です」) | 推論は推論として見せる、 user 選択尊重 |
| 3 | 準備レイヤーを主画面主役にする | Plan の主役はあくまで 1 日、 準備は詳細に潜る |
| 4 | すぐ最適化に寄せる | まずは「必要な準備が見える」 + 「学習できる」 + 「徐々に精度向上」 |

### 10.7.9 本 audit (= redesign direction) との関係

| 項目 | 本 audit scope | 別 audit scope |
|---|---|---|
| Event Execution Layer 本体 (= 推論 engine / 入力 UI / 学習 logic) | ❌ scope 外 | ✅ Event Execution Layer phase で別実装 |
| 層 1 「軽いサイン」 (= 予定 card 上の indicator) | ⚠️ design 時点で配置候補 確保 | ✅ Execution Layer 完了後 UI 統合 |
| 層 2 「詳細セクション」 (= bottom sheet drill-down) | ⚠️ bottom sheet 構造に余地確保 | ✅ Execution Layer 完了後 UI 統合 |
| 層 3 「Alter 深掘り」 (= 会話) | ❌ scope 外 (= Alter 会話 surface 別) | ✅ Alter 会話 phase |

→ redesign は **bottom sheet drill-down + event card 上の軽い indicator の余地** を design 時点で確保。 Execution Layer 本体は別 phase。

**IA Audit 必須拘束条件** (= GPT 第 5 補正、 §13.1.7 で 6 必須項目固定):
- Event card 上で軽いサインをどう出すか
- 詳細 sheet でどの順番で見せるか
- どのイベントには出さないのか
- 推論 / user 追加 / imported 由来の区別
- imported event に Execution Layer を付ける時の provenance
- 将来の Alter 会話 deep-dive との接続

→ 「概念整理」 で止めず、 IA Audit で **6 必須項目を取りこぼさず確定** (= §13.1.8)。

### 10.7.10 思想接続 (= 「予定を成立させるための実行知能」)

CEO 構想 = 「予定を成立させるための実行知能」 (= GPT 言語化)

これは Aneurasync 二層構造 (= §6.1) の **第 1 層 = 生成・反映層** の具体形:
- **観測** (= 第 2 層) = 「user 自身が予定を見る」
- **生成・反映** (= 第 1 層) = 「Alter が user に最も適した 1 日を組み立てる」 + 「**予定を成立させる準備 / 実行 / 事後を学習・提案・追跡**」 (= 本 §10.7 で具体化)
- 学習メモ (= §10.7.2 #6) = user の行動 pattern を蓄積、 自律 planning engine (= §10.6) の学習源
- recurring learning (= §10.7.7 #4) = サイクル (= §6.1.6 図解) の「学習 → 生成」 を強化

→ Event Execution Layer は **observation + generation cycle の中核 driver**。

### 10.7.11 design 時点で確保すべき構造

- event card 上の **軽い indicator** 配置余地 (= 「準備 3」 等の chip / dot、 但し overemphasis 回避)
- bottom sheet **drill-down 構造** (= peek / half / full の 3 段階で実行 layer を表示可能)
- source provenance の **共通 visual hint** (= user / imported / Alter generated と統一、 §10.5 + §10.6 連携)
- ExternalAnchor type に **execution_layer 属性** を将来追加可能な設計 (= view model で扱える)
- 学習 anchor (= 「過去にこれを毎回した」) を表示する余地 (= 但し overemphasis 回避)

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

## 11.5 Copy contract 自律確定 (= CEO 第 1 指示 + 第 2 補正受けた再構築、 「Alter Planning」 + 「Alter メモ」 確定、 他は before 維持)

### 11.5.1 背景

| 段階 | 指示元 | 内容 |
|---|---|---|
| 1 | CEO 2026-05-24 第 1 | 「見出しや、 ラベル、 最上部の文言等は、 君のリサーチで違う内容に。 alter morning はおかしい。 文言系は変える。 変えなくてもいいと判断したらそれでいい」 |
| 2 | 私 初回確定 (= `70720d59`) | 9 件変更 (= 「観測 framing」 を全面適用) |
| 3 | CEO + GPT 第 2 補正 | 「全体的に文言がおかしい。 もっと一般的な文言に。 before の方が優秀。 自然で誰でもわかりやすい。 before に戻す。 **Alter メモは採用。 alter morning → Alter Planning**」 |
| 4 | 本 audit 再確定 | **8 件 revert + 「Alter メモ」 維持 + 「Alter Planning」 上書き = 2 件確定変更 / 12 件維持** |

### 11.5.2 自律反省 (= 私の初回判断の過剰だった点)

| # | 過剰 | 反省 |
|---|---|---|
| 1 | **「観測 framing」 を全 copy に均一適用** | 自然な日本語が失われた (例: 「時間の流れを把握して、 心地よい 1 日に。」 → 「時間として観測する 1 日。」 で不自然) |
| 2 | **summary score 完全否定** | 「78% バランス良好」 を「観測中」 に置換 → score の有無は **構造** の問題、 一般用語としての「バランス良好」 は自然 |
| 3 | **「整理しましょう」 を命令形と過剰判定** | 「〜しましょう」 は丁寧な日本語、 「整理する余白」 等の名詞化は不自然 |
| 4 | **「リズムを整える」 を push 寄りと過剰判定** | 「整える」 は自然な日本語、 push UX は別 layer の問題 |

→ **思想は構造 (= entry default visible / modal user initiated / score 有無 / 評価 axis の見せ方) で transmission、 全 copy に「観測」 単語を入れる必要なし**。 CEO 「変えなくてもいいと判断したらそれでいい」 を厳密適用すべきだった。

### 11.5.3 「ALTER MORNING」 の問題点 (= 5 件、 維持)

| # | 問題 | 詳細 |
|---|---|---|
| 1 | **時間帯限定** | 朝限定の表現だが「今日のプラン」 は全時間 |
| 2 | **英語混在の不自然さ** | 主見出し日本語 + label 英語 (= 但し英語自体は OK、 内容が問題) |
| 3 | **意味の曖昧さ** | 「ALTER の朝」 の意味不明 |
| 4 | **brand redundant** | header「ANEURASYNC ALTER」 + section「ALTER MORNING」 で「ALTER」 重複 |
| 5 | **思想不整合** | 「MORNING」 限定が「1 日」 framing と矛盾 |

### 11.5.4 採用案 (= CEO 直接指示)

**section label「ALTER MORNING」 → 「Alter Planning」**

理由 (= CEO + 自律分析):
- 「Alter」 = brand integration (= Aneurasync 固有性、 header「ANEURASYNC ALTER」 とは Title case / 重複感の薄さで差別化)
- 「Planning」 = 一般的英語 (= plan の verb-ing 形)、 plan という製品 metaphor を name 化
- **時間帯独立** (= 朝限定問題解消)
- **brand 2 段階深化** (= 全社名「ANEURASYNC ALTER」 + 製品体験名「Alter Planning」)
- 自然な英語 (= 命令形 / 評価 / push なし)

visual spec:
- subtle 紫 (= indigo-500/600 系) + Title case (= 「Alter Planning」、 全大文字 caps ではない、 Pascal-like)
- letter-spacing 広め
- size: text-xs - text-sm

### 11.5.5 全 copy contract 確定 (= 本 audit 範囲、 14 項目、 第 2 補正後)

| 位置 | before (= 参考画像) | after (= 確定) | 修正理由 |
|---|---|---|---|
| header brand | `ANEURASYNC ALTER` | (= 維持) | brand identity |
| **section label** | **`ALTER MORNING`** | **「Alter Planning」** (= CEO 確定) | 時間帯限定 + brand redundant + 思想不整合 解消 |
| 主見出し | 「今日のプラン」 | (= 維持) | 1 日 framing、 自然な日本語 |
| subtitle (List) | 「時間の流れを把握して、 心地よい 1 日に。」 | (= **維持**、 revert) | 自然な日本語、 修正不要 (= 過剰修正反省) |
| subtitle (Map) | 「場所を地図で確認して、 流れをつかみましょう。」 | (= **維持**、 revert) | 自然な日本語、 修正不要 |
| **toggle** | **「地図」 / 「リスト」** | **「マップ」 / 「リスト」** (= CEO 第 3 補正) | UI 表示統一 (= 内部概念「空間軸」 / 「Map」 は doc / 思想 layer で維持) |
| date selector | `< 6月12日 (木) >` | (= 維持) | 標準 UX |
| transition chip | 「移動・リフレッシュ」 / 「移動」 | (= **維持**、 revert) | 自然な日本語、 修正不要 |
| summary 主表現 | 「78% バランス良好」 | (= **維持**、 revert) | 自然な日本語、 score の有無 (= 構造論点) は別 audit (= screen architecture / IA audit) |
| summary 説明 | 「集中と休息のバランスが取れた良いプランです。」 | (= **維持**、 revert) | 自然な日本語、 修正不要 |
| summary CTA | 「リズムを整えるヒント ›」 | (= **維持**、 revert) | 自然な日本語、 修正不要 |
| Alter 補助文 example | 「集中しやすい静かなカフェで、 今日の計画を整理しましょう。」 | (= **維持**、 revert) | 自然な日本語、 修正不要 |
| CTA buttons | 「詳細を見る」 / 「ここへの経路」 | (= 維持) | observation + functional |
| **bottom tab #3** | **「AI メモ」** | **「Alter メモ」** (= CEO 採用) | 「AI」 (= generic) → 「Alter」 (= brand integration、 「第二の自己」 思想接続) |
| bottom tab 他 | 「今日のプラン」 / 「インサイト」 / 「設定」 | (= 維持) | 既存整合 |

### 11.5.6 統計 (= 第 2 + 第 3 補正後)

- **変更**: **3 件** (= section label「Alter Planning」 / bottom tab #3「Alter メモ」 / toggle「マップ」)
- **維持** (= revert 含む): **11 件**
- **合計**: 14 項目 確定

### 11.5.7 思想 transmission の方向修正 (= 自律反省結果)

思想 transmission は **copy 単語** ではなく **画面構造** で行う:

| 思想 | transmission 手段 |
|---|---|
| 観測の幕間 (= push しない) | entry default visible / modal user initiated (= 構造) |
| empty 肯定 (= 「余地」) | empty day surface の見せ方 (= 構造、 N-3a foundation) |
| 評価 axis の控えめ化 | score を出す/出さない、 何を score 化するか (= 構造、 screen architecture audit) |
| Alter 同行感 | brand 統一 (= 「Alter Planning」 / 「Alter メモ」 / 「ALTER で見る」 で接続) |

→ 全 copy に「観測」 単語を入れる必要なし、 **自然な日本語を維持 + 構造で思想を表現** が正しい。

### 11.5.8 N-3a empty day entry との整合

- `EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›"` (= N-3a `d55aab5f` 確定)
- 「Alter Planning」 (= §11.5.4) と整合: 「Alter」 brand 統一
- 「Alter メモ」 (= §11.5.5) と整合: 「Alter」 brand 統一
- → **N-3a foundation と本 copy contract は brand 軸で完全整合** ✅

### 11.5.9 詳細 copy contract は別 audit

本 §11.5 で **方向性 copy 14 項目** を確定。 以下は別 audit:
- 全 page copy (= settings / インサイト / Alter メモ tab 内 等)
- micro-copy (= empty state / loading / error message)
- tooltip / aria-label
- date variants (= 過去 / 未来 section label の動的 variant、 必要なら)

→ **copy contract audit** (= 別 doc) で詳細化、 但し **screen architecture audit (= IA audit) 後** に着手 (= GPT 第 2 補正受けた順序、 §13 update)。

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

### 13.1 全体順序 (= CEO + GPT 第 2 補正反映、 screen architecture 先行)

GPT 第 2 補正 (= 2026-05-24): 「次は design system extraction ではなく、 List / Map Information Architecture Audit が先。 順序は screen model → list spec → map spec → design system」。 自律確定で採用。

| # | phase | 内容 | docs/impl | 規模 |
|---|---|---|---|---|
| 1 | ✅ N-3a | empty day observation pure foundation | impl | 完了 (= `d55aab5f`) |
| 2 | ★ **本 audit** | List / Map design redesign direction (+ copy contract §11.5) | docs | 着地中 |
| 3 | **次** | **List / Map Information Architecture Audit** (= screen model、 主役 / 階層 / 捨てるもの / card vs line vs chip) | docs | 中 (= GPT 補正で先行) |
| 4 | | **List Redesign Spec audit** (= IA に基づく詳細 spec、 hero / timeline / event card / transition / summary / empty) | docs | 中 |
| 5 | | List redesign impl (= sub-phase 分割: timeline spine → event card → 統合) | impl | 大 |
| 6 | | List closeout audit | docs | 小 |
| 7 | | **Map Redesign Spec audit** (= pin semantics / route / selected state / bottom sheet 階層) | docs | 中 |
| 8 | | Map redesign impl (= sub-phase 分割: pin/route → bottom sheet → 統合) | impl | 大 |
| 9 | | Map closeout audit | docs | 小 |
| 10 | | **Design System Extraction audit** (= tokens / typography / radius / shadow / spacing、 list + map 確定後で落とす、 GPT 補正で最後) | docs | 中 |
| 11 | | Design system impl (= token 化、 既存 component 段階的置換) | impl | 大 |
| 12 | | N-3b (= empty day entry UI 接続、 redesign 後の UI に整合) | impl | 中 |
| 13 | | N-3c-e | impl | — |
| 14 | | N-3 closeout | docs | — |
| 15 | | N-4 (= Pattern Truth Layer + Counter-Factual Observation) | — | — |
| 16 | | N-5 (= /plan final closeout) | — | — |

GPT 補正の根拠 (= 私の direction audit に対する補正):
- 今の課題の本体は **token (= 色・余白・角丸) ではなく screen architecture (= 情報構造)**
- 「どこが主役か曖昧 / 何を最初に読ませたいか弱い / 同情報の重複 / 『今日の体験』 ではなく『予定データ』 に見える」 が本質問題
- → screen model を先に決めずに design system に進むと、 「綺麗だけど弱い UI」 になる
- list を先に設計 → map に visual system を流す → 最後に token 化、 が成功率高い

### 13.1.5 Information Architecture Audit (= 次 sub-phase) で決めるべきこと (= GPT 指定 + CEO 第 3 補正反映の北極星補正版)

**北極星 (= CEO 第 3 補正、 IA Audit で必ず織り込む)**:
- /plan は「観測 surface」 + 「自律 planning engine 可視化面」 の **二層構造** (= §6.1)
- 「ただの観測アプリ」 でも「ただの予定管理アプリ」 でもない
- 「独特なプランニングアプリ」 にならない (= 自然な日本語 + 構造で思想表現、 単語狩り禁止)

**List**:
- List の主役は何か (= 時間の流れ)
- 1 画面に何層まで出すか (= 1 日の要約 / event / transition / 補助ヒント)
- 何を捨てるか (= 重複表示、 主画面から外す category-by-place 等)
- どこまでを card にし、 どこを line / chip にするか
- **観測 anchor と生成 anchor の表示統合**: 一見では区別なし、 必要なら subtle origin hint

**マップ (= UI 表示名、 内部概念は「空間軸」 / 「Map」)**:
- マップの主役は何か (= 内部概念で「今日の地理」 = 空間軸)
- 主表示はマップか、 下部 card か (= マップ主役、 card が補完)
- pin / route / selected state の優先順位
- 凡例・コントロール・sheet の役割分担
- **観測 pin と生成 pin の表示統合**: 一見では区別なし

**現状 UI の削除対象** (= GPT 第 2 補正で具体指摘):
- 主画面の上下で同じ 1 日を 2 重表示している問題の解消
- カテゴリ別セクション (= 家 / 職場 / 学校 / カフェ / 公共 / 屋外 / 移動 / 未分類) は主画面ではなく **二次画面** (= 地理プロフィール / 場所パターン) に移動候補
- マップ / list の visual language 分離問題の解消

**外部データ取り込みの表示構造 (= §10.5 連携、 CEO 第 3 補正で復活)**:
- ExternalAnchor type の **source 属性** を view model で受け取る
- 取り込み済 anchor (= シフト表 / 時間割 / PDF 等) の event card / pin 表示方法
- origin hint (= 「シフト表から」 等) の overemphasis 回避
- conflict 検出 (= 取り込み anchor と既存 anchor の重複) の自然な表現

**3 source 共存設計 (= §10.5.4 必須化、 GPT 第 4 補正)**:
- **user entered / imported / Alter generated** の 3 source が List / マップ 上で **どう共存するか** (= 最初から設計)
- source provenance (= 各 anchor の由来) の visual differentiation
- imported schedule の編集可能性 (= ロック / 変更可 / hybrid)
- Alter generated plan の distinguish 方法 (= 「受け入れる / 修正 / 削除」 action)
- 会話反映予定 と 外部取込予定 の並列ルール
- 統一 source provenance 構造 (= §10.6.3 + §10.7.5 連携)

**planning engine の表示構造 (= §10.6 連携、 CEO 第 3 補正で明示)**:
- 自律生成された 1 日の表示方法 (= 観測 anchor と統合 / シームレス)
- 「受け入れる / 修正 / 削除」 action の余地 (= sheet / detail で表示、 主画面では overemphasis 回避)
- Alter 会話で作成された plan の Plan 反映方法
- 観測 / 生成の境界が visual 上 シームレス

**Event Execution Layer の表示構造 (= §10.7 連携、 CEO 第 4 補正)**:
- event card 上の **軽い indicator** (= 「準備 3」 等の chip / dot) の配置候補
- bottom sheet **drill-down 構造** で実行 layer (= 準備 / 持ち物 / 当日注意 / 事後) を表示可能か
- source provenance (= 「user 追加」 / 「Alter 推論」 / 「文書取込」 / 「過去学習」) の表示方法
- 全予定への自動付与禁止、 付与条件 5 系統 (= §10.7.3) で trigger
- 主画面では overemphasis 回避、 詳細 sheet / 会話で深掘り

**用語統一 (= CEO 第 3 補正)**:
- UI 表示: 「マップ」 (= toggle / subtitle 等、 「地図」 / 「今日の地理」 は不採用)
- 内部概念: 「空間軸」 / 「今日の地理」 / 「Map」 は doc / 思想 layer で維持

**参考画像から採るもの / 採らないもの**:
- 採る: 構造 / 階層 / 表現
- 採らない: score の思想 / 指導的 copy / generic lifestyle app 的決め打ち

### 13.1.6 IA Audit 必須拘束条件 ①: 3 source 共存設計 (= GPT 第 5 補正で「存在宣言で止めない」 と明示化)

GPT 第 5 補正 (= 2026-05-24): 「3 source 共存が『存在宣言』 で止まっている。 次の IA Audit では必ず以下を設計対象にする」

**5 必須項目** (= IA Audit で **必ず確定**、 取りこぼし禁止):

| # | 必須項目 | 詳細 |
|---|---|---|
| 1 | **source provenance を UI 上でどう見せるか** | 各 anchor の由来 (= user / imported / Alter generated) の visual differentiation 方法 (= subtle badge / icon / color hint、 overemphasis 回避) |
| 2 | **各 source の編集可能性をどう分けるか** | user entered = 自由編集 / imported = ロック or 一部変更 / Alter generated = 「受け入れる / 修正 / 削除」 — 各 source の編集 affordance |
| 3 | **会話由来 plan と imported schedule の競合解決** | Alter 会話で作成された plan と外部取込された schedule が時刻衝突した時の解決 (= 自動マージ / user 確認 / Alter 提示) |
| 4 | **list / map で 3 source が混ざった時の優先表示ルール** | 同時刻に複数 source の anchor がある時の display order / visual stacking ルール |
| 5 | **generated plan を確定前 / 確定後で表現分離** | Alter generated は user が「受け入れる」 前と後で表現を変える (= 確定前 = 提案 dim / 確定後 = 通常表示) |

→ IA Audit は **これら 5 項目を必ず確定** してから次へ進む。 1 つでも未確定で List Redesign Spec に進むことを **禁止**。

### 13.1.7 IA Audit 必須拘束条件 ②: Event Execution Layer 設計 (= GPT 第 5 補正で「概念整理で止めない」 と明示化)

GPT 第 5 補正: 「Event Execution Layer が future scope の説明で終わりかけている。 次の IA Audit では必ず以下を設計対象にする」

**6 必須項目** (= IA Audit で **必ず確定**、 取りこぼし禁止):

| # | 必須項目 | 詳細 |
|---|---|---|
| 1 | **Event card 上で軽いサインをどう出すか** | 「準備あり」 / 「持ち物 3」 / 「事後あり」 等の indicator の visual / 配置 / size を確定 (= chip / dot / icon の選択、 overemphasis 回避) |
| 2 | **詳細 sheet でどの順番で見せるか** | 6 種類 (= 準備 / 実行 / 条件 / 当日 / 事後 / 学習) の表示順序、 priority、 fold/expand state |
| 3 | **どのイベントには出さないのか** | 付与条件 5 系統 (= §10.7.3) の trigger ルール、 「全予定に出さない」 ための判定 logic |
| 4 | **推論 / user 追加 / imported 由来の区別** | 各実行項目 (= 持ち物 / 事前タスク 等) の source 表示方法 (= 「Alter 推論」 / 「user 追加」 / 「シフト表から」 等) |
| 5 | **imported event に Execution Layer を付ける時の provenance** | 取り込み済 anchor (= シフト表 / 時間割 / PDF) に Alter が Execution Layer を追加する時、 「imported anchor + Alter 推論 layer」 の hybrid 表示 |
| 6 | **将来の Alter 会話 deep-dive との接続** | 詳細 sheet → Alter 会話 surface (= 「この予定の準備をもっと深く考える」) への navigation 設計、 但し主画面では overemphasis 回避 |

→ IA Audit は **これら 6 項目を必ず確定** してから次へ進む。 1 つでも未確定で List Redesign Spec に進むことを **禁止**。

### 13.1.8 拘束条件の意味 (= GPT 第 5 補正の本質)

GPT 第 5 補正の本質:
- 旧 (= 私の direction audit): 「**概念として入った**」 段階 (= 3 source / Execution Layer を future scope に整理)
- 新 (= GPT 補正): 「次の IA Audit で **UI と構造の必須条件に落とし切る**」 段階

本 audit (= direction) は **概念**を整理した。 IA Audit は **拘束条件**として UI と構造に落とす。 §13.1.6 (= 5 項目) + §13.1.7 (= 6 項目) の **計 11 必須項目** はその境界線。

**IA Audit 完了判定基準** (= GPT 第 5 補正で明示):
- 11 必須項目すべて確定
- 各項目に対し具体的 UI / 構造 spec が audit doc に記録
- 「概念」 「方向性」 等の曖昧表現での residual 禁止

→ IA Audit は単なる「次に決めるべきことの整理」 ではなく、 **「11 拘束条件を取りこぼさず確定する」 doc**。

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

### 14.2 redesign 固有禁止 (= 第 2 補正反映、 過剰判定を緩和)

- 既存 wave 1/2/3/3a frozen file への追加変更 (= 規約 24-extended 違反復活)
- 「予定なし」 否定的 empty 表現は **構造で扱う** (= entry default visible で「観測の余地」 を示唆、 但し copy 単語は自然な日本語維持可)
- **「ただの観測アプリ」 化** (= 生成層なし、 CEO 第 3 補正で警告)
- **「ただの予定管理アプリ」 化** (= 観測層なし、 競合差別化喪失)
- **「独特なプランニングアプリ」 化** (= 過剰な世界観で使いづらい、 CEO 第 3 補正で警告)
- **外部データ取り込み (= シフト表 / 時間割 / PDF) の存在を無視した design** (= future scope 表示構造を確保すべき、 §10.5)
- **planning engine (= 自律生成 + 会話 plan) の存在を無視した design** (= future scope 表示構造を確保すべき、 §10.6)
- 強い push UX (= modal 強制 pop-up / 通知 push / banner 等、 = N-3 哲学整合の structure 禁止)
- 外部 image 即実装 (= source 別 audit、 semantic visual で start)
- 大規模 motion library 追加 (= framer-motion 既存依存内)
- base map provider 変更 (= 既存維持)
- Calendar tab redesign (= CEO 明示で一旦放置)
- N-3b 以降 の機能 を先取り実装 (= design 確定後)
- ~~命令形 copy (= 「整理しましょう」 「掴みましょう」 → 観測 framing)~~ — **撤回** (= 「〜しましょう」 は自然な丁寧表現、 CEO 第 2 補正)
- ~~評価 score (= 「78% バランス良好」 → 「観測中」 framing)~~ — **撤回** (= score の有無は **構造論点**、 §13 IA audit で再判断)
- ~~push 系 CTA (= 「整える」 「ヒント」 → 「見る」 framing)~~ — **撤回** (= 「整える」 等は自然な日本語、 push UX は modal 等 structure で判断)

判断原則 (= 自律反省):
- **copy 単語** を観測 framing で均一化しない (= 自然な日本語を維持)
- **構造** (= entry default visible / modal user initiated / score 有無 / 評価 axis の見せ方) で思想を transmission
- 命令形 / 評価 / push の判断は **個別構造**で行う、 単語の単純禁止ではない

### 14.3 本 audit で禁止 (= docs only)

- 実装着手 (= 新規 file 作成、 既存 file 改変)
- 別 sub-phase audit への独断進行 (= design system extraction は別 audit)
- frozen branches 追加 commit

---

## 15. smoke 観点 (= 各 sub-phase 共通)

### 15.1 visual smoke (= 第 2 補正反映、 「観測 tone」 を構造観点に再 frame)

| 観点 | 内容 |
|---|---|
| 「観測される 1 日」 vision | 画面 **構造** (= 主見出し / 階層 / spine) が観測 framing を transmission するか (= copy 単語ではなく構造) |
| 1 画面 1 主役 | List 時間軸 / Map 空間軸が明確か |
| 二重表現排除 | 同情報の重複なし |
| event card 意味 | Alter 補助文が **自然な日本語** で書かれているか (= 過度な「観測」 単語化禁止) |
| empty day 表現 | entry default visible + modal user initiated (= 構造で思想表現) |
| copy tone | **自然な日本語**、 強い push UX のみ NG (= 単語狩りではなく構造判断) |
| brand color 適切利用 | selection / hover OK、 focus 禁止 (= 規約 24-extended) |
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
| copy 思想違反 | low | **自然な日本語維持 + 構造で思想 transmission** (= §11.5 確定、 第 2 補正反映)、 単語狩りではなく structure 判断 |
| image source 決定遅延 | medium | semantic visual で start、 後段 audit |
| performance 低下 | low | bundle / motion 制約あり |
| a11y 低下 | low | 規約 24-extended + ARIA で担保 |
| scope 膨張 | high | sub-phase 厳密分割、 各 sub-phase で CEO smoke 必須 |
| N-3b 整合性低下 | medium | redesign 後 UI に entry を整合させる (= N-3b は redesign 後着手) |
| Calendar への波及 | low | CEO 明示で放置、 触らない |
| Stargazer pivot 越境 | low | data / engine 内部不触 |

---

## 17. CEO 判断項目 (= 報告で停止)

### 17.1 vision / framing (= 北極星補正版、 第 4 補正で主従明示)

| # | 判断項目 |
|---|---|
| 1 | **二層 framing 採用** (= **第 1 層 = 生成・反映層 (主)** + **第 2 層 = 観測・編集層 (体験面)**、 §6.1 第 4 補正反映、 サイクル §6.1.6) |
| 2 | 1 画面 1 主役 (= List 時間軸 / マップ 空間軸) 採用、 3 source (= user / imported / Alter generated) は visual 上シームレス統合 |
| 3 | ~~参考画像の copy tone を Aneurasync 整合に書き換え~~ — **§11.5 確定済** (= CEO 第 1 + 第 2 補正反映、 14 copy contract 確定、 **3 件変更 (= section label / bottom tab #3 / toggle) / 11 件維持** = 自然な日本語維持 + 構造で思想 transmission) |
| 3.5 | **「ただの観測アプリ」 / 「ただの予定管理アプリ」 / 「独特なプランニングアプリ」 化を回避** (= CEO 第 3 補正、 §6.3) |

### 17.2 visual / structure

| # | 判断項目 |
|---|---|
| 4 | ~~「ALTER MORNING」 section label 採用~~ — **§11.5 で「Alter Planning」 に変更確定済** (= CEO 直接指示、 時間帯独立 + brand 2 段階深化) |
| 4.5 | ~~toggle 「地図」~~ → **「マップ」** に変更確定済 (= CEO 第 3 補正、 §11.5.5、 内部「空間軸」 / 「Map」 概念は維持) |
| 5 | image source 決定 (= semantic visual + ambient gradient で start、 後段 audit) |
| 6 | bottom sheet 3 段階 (= peek / half / full) 採用 |
| 6.5 | **外部データ取り込み future scope (= §10.5) 復活** 採用 (= CEO 第 3 補正、 過去 doc `alter-plan-foundation-design.md` の Document Import を future scope として明示) |
| 6.6 | **自律 planning engine future scope (= §10.6) 明示** 採用 (= CEO 第 3 補正、 自律学習 + 会話 plan + 双方向反映、 redesign は表示構造のみ確保) |
| 6.7 | **Event Execution Layer future scope (= §10.7) 明示** 採用 (= CEO 第 4 補正、 予定にぶら下がる実行知能 = 準備 / 実行タスク / 条件 / 当日注意 / 事後 / 学習 の 6 種類、 付与条件 5 系統、 完全 10 軸、 構造 = 準備オブジェクト、 UI 3 層、 強化案 7、 禁止 4、 redesign は表示構造のみ確保) |
| 6.8 | **3 source 共存設計を IA Audit で必須化** (= GPT 第 4 補正、 §10.5.4、 user entered / imported / Alter generated の List / マップ 上共存、 source provenance / 編集可能性 / 会話反映関係) |
| **6.9** | **3 source 共存 5 必須項目を IA Audit 必須拘束条件化** (= GPT 第 5 補正、 §13.1.6、 「存在宣言で止めない」、 source provenance / 編集可能性 / 競合解決 / 優先表示 / 確定前後表現分離 を IA Audit で取りこぼさず確定) |
| **6.10** | **Event Execution Layer 6 必須項目を IA Audit 必須拘束条件化** (= GPT 第 5 補正、 §13.1.7、 「概念整理で止めない」、 軽いサイン / 詳細順序 / 出さないイベント / 由来区別 / imported hybrid / 会話 deep-dive 接続 を IA Audit で取りこぼさず確定) |
| **6.11** | **IA Audit 完了判定基準採用** (= §13.1.8、 「11 必須項目すべて確定 + 具体 UI/構造 spec が記録 + 曖昧表現での residual 禁止」 を完了基準として固定) |

### 17.3 phase 配置

| # | 判断項目 |
|---|---|
| 7 | design redesign を N phase の どこに位置付けるか (= §13.2 の A/B/C/D) |
| 8 | 次 sub-phase audit (= design system extraction) への進行承認 |

### 17.4 後段論点 (= 別 audit、 第 4 補正で追加)

- **List / Map Information Architecture Audit** (= 北極星補正版、 §13.1.5 で決めるべき 7 領域、 GPT 補正で先行)
- design system extraction (= tokens / typography / motion、 IA Audit 後)
- copy contract audit (= 全 page copy / micro-copy / error / date variants 確定)
- image source decision audit
- responsive design (= tablet/desktop) audit
- **Document Import phase audit** (= §10.5、 Vision LLM 経由の取り込み機能本体、 過去 doc `alter-plan-foundation-design.md` 踏襲)
- **自律 Planning Engine phase audit** (= §10.6、 自律学習 + 会話 plan + 双方向反映)
- **Event Execution Layer audit** (= §10.7、 予定にぶら下がる実行知能の推論 engine / 入力 UI / 学習 logic)

---

## 18. 結論

### 18.1 本 audit の成果 (= 第 1 + 第 2 + 第 3 + 第 4 補正統合)

1. GPT design audit (= 第 1 / 第 2 / 第 3 / 第 4 補正) の **妥当性評価** + 自律統合
2. 世界トップアプリ literature からの **5 principles 抽出**
3. Aneurasync 思想との **統合 vision** = **二層構造** (= 北極星補正版、 §6.1)
4. List / マップ redesign direction の **詳細方針** 固定
5. 既存資産整合 + 実装順序 + 禁止事項 + smoke 観点
6. **CEO 判断項目** + **後段 audit** 明示 (= §17)
7. **Copy contract 確定 14 項目** (= §11.5、 **3 件変更 / 11 件維持**、 第 1+第 2+第 3 補正反映)
8. **実装順序 GPT 補正反映** (= §13.1、 IA Audit 先行 + design system extraction 最後)
9. **自律反省記録** (= §11.5.2、 過剰 framing 修正)
10. **北極星補正反映** (= §6.1、 二層構造、 CEO 第 3 補正)
11. **外部データ取り込み future scope 復活** (= §10.5、 過去 doc 踏襲、 CEO 第 3 補正)
12. **自律 planning engine future scope 明示** (= §10.6、 CEO 第 3 補正)
13. **用語統一** (= 「マップ」 統一、 内部概念維持、 CEO 第 3 補正)
14. **北極星主従明示** (= §6.1 第 4 補正、 **第 1 層 = 生成・反映 (主)**、 **第 2 層 = 観測・編集 (体験面)**、 サイクル §6.1.6)
15. **3 source 共存設計を IA Audit 必須化** (= §10.5.4、 user entered / imported / Alter generated、 GPT 第 4 補正)
16. **Event Execution Layer future scope 追加** (= §10.7、 予定にぶら下がる実行知能、 6 種類 + 5 付与条件 + 10 軸 + 構造 + 3 層 UI + 強化 7 + 禁止 4、 CEO 第 4 補正 + GPT 統合)
17. **IA Audit 必須拘束条件 11 項目固定** (= §13.1.6 + §13.1.7 + §13.1.8、 GPT 第 5 補正反映、 「概念」 → 「拘束条件」 への昇格、 3 source 共存 5 項目 + Event Execution Layer 6 項目、 IA Audit 完了判定基準明示)

### 18.2 redesign の本質 (= 1 文、 北極星補正、 第 4 補正で主従明示)

> /plan redesign は単なる UI polish ではなく、 「**データ管理画面**」 から「**生成・反映が主、 観測・編集が体験面の二層 surface**」 への transformation である。 Alter が学習で user に最も適した 1 日を生成・反映する planning engine の可視化面 (= 第 1 層 = 主) であり、 user 自身が 1 日を時間軸 (= List) と空間軸 (= マップ) で観測・編集する体験面 (= 第 2 層) でもある。 3 source (= user entered / imported / Alter generated) はシームレス統合、 Event Execution Layer (= 準備 / 実行 / 事後 / 学習) で予定を成立させる実行知能を持つ。

### 18.3 次のアクション (= CEO 判断後、 第 2 補正反映後)

1. CEO 判断 (= §17 残項目、 #3 / #4 は §11.5 で自律確定済)
2. 採用なら **List / Map Information Architecture Audit** に進む (= GPT 第 2 補正反映、 別 audit / 別 branch)
3. その後 List Redesign Spec → impl → Map Redesign Spec → impl → **Design System Extraction** の順 (= §13.1)
4. 各 sub-phase で CEO smoke 必須 (= 連続 GO 不可)
5. 詳細 copy contract (= micro-copy / error / date variants) は IA audit 後の **copy contract audit** で完全列挙 (= §11.5.9)

### 18.4 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: redesign (= 大規模) を sub-phase 厳密分割
- 「観測される 1 日」 framing を最初に確定すると、 後段 sub-phase で迷いなく進行
- 「予定管理アプリ」 ではなく「自己観測 surface」 という framing は **Aneurasync 固有性** の表現で、 競合との差別化 axis に直接接続
- frozen branches 影響 0、 既存資産活用 100% (= 規約 24-extended + N-3a foundation)

---

**完了**: Plan List / Map Design Redesign Direction Audit。 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0。 設計方向固定のみ。 CEO 判断待ち (= §17 の 8 項目)。
