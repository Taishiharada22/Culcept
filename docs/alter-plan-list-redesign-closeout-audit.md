# List Redesign Closeout Audit (= sub-phase 8 全体到達 / 未到達 / Map 向け design rule 整理)

**日付**: 2026-05-24
**承認**: CEO 実機 smoke PASS (= 8a / 8b 12 commit / 8c / 8c-2)
**branch**: `feat/alter-plan-list-impl-flowtab-8c` (= 終端 `61bd612c`)
**作成判断**: CEO 指示 「List 側 closeout に進む。 List に新機能を足さない。 後段で Map 判断」

---

## §1. 到達点 (= 何が完成したか)

### 1.1 基盤 layer (= sub-phase 2-3.6 + 4-6 + 7)

| sub-phase | commit | 内容 |
|---|---|---|
| foundation | `5ccfc163` | pure type 定義 + contract test |
| 3 | `66e3a841` | discriminated union + factory + copy contract + helpers |
| 3.5 | `b6c4b2e2` | source model 2-axis refactor (= Origin + Authority) |
| 3.6 | `90af5d32` | cloneImported source link 保持 |
| 4 | `4c2996d8` + `a10aacc8` | TimelineSpine + EventCard component + render contract test |
| 5 | `75691a36` | TransitionChip + EmptyDayEntry first-pass |
| 6 | `cf87c472` | SourceIndicator + ExecutionLayerChip first-pass + EventCard 統合 |
| 7 | `df4b7ae4` | ImportedLockEscapeModal first-pass |

### 1.2 統合 layer (= sub-phase 8a)

| sub-phase | commit | 内容 |
|---|---|---|
| 8a-pre | `b6be22e5` | featureFlags + externalAnchorAdapter pure module + 30 contract test |
| 8a-impl | `41fbb01e` | FlowTab 内 flag check + 新 TimelineSpine/EmptyDayEntry 統合 |

### 1.3 mock 整合 layer (= sub-phase 8b、 12 commit)

| sub-phase | commit | 主内容 |
|---|---|---|
| 8b-1 | `1d9dc87b` | CategoryMeaning module + 34 contract test |
| 8b-2 | `7d9d33c5` | adapter alterNote 注入 + transitions 生成 |
| 8b-3 | `c1d47d5d` | EventCard semantic tint + TimelineSpine spine icon |
| 8b-4 | `3a3ea11f` | TimelineSpine transitions prop + FlowTab 接続 |
| 8b-5 | `5223519d` | categoryInference 4 段階優先順位 heuristic + icon visibility |
| 8b-6 | `9d52bfff` | 7 項目 mock 整合 大幅改修 |
| 8b-7-A | `9b39049f` | 5W1H alterNote + 出発/帰宅 + 枠 -100 + triangle border + Briefcase |
| 8b-7-B | `418e136e` | 「当日のプラン」 header + 1 日表示 + 「教えた予定」 削除 + 背景白 |
| 8b-8 | `bcc60f2f` | tabs 横並び + 文体 mock 整合 + アイコン大 + 出発↔予定↔帰宅 transitions |
| 8b-9 | `e939126c` | timeline 1 本軸 + 色反転 + 地図→マップ + sticky 削除 + Calendar icon |
| 8b-10 | `841001b3` | density up + tabs left icon + 余白縮小 + event row line solid |
| 8b-11 | `2611120c` | 移動 pill 小さく + spine pt-1 削除 + カレンダー文字小さく |
| 8b-12 | `d87dd191` | spine column items-stretch で line を row 全体に拡張 + 移動文字大 + 余白 |

### 1.4 解釈 layer (= sub-phase 8c + 8c-2)

| sub-phase | commit | 主内容 |
|---|---|---|
| 8c | `22502a85` | SummaryFooter 解釈レイヤーの器 + StaticAlterSuggestionCard flag ON 削除 |
| 8c-2 | `61bd612c` | TransitionChip 詳細 button + SummaryFooter 階層強化 + 下部固定 + FAB 再配置 |

### 1.5 完成した機能 (= flag ON 状態)

#### UI 構造
- ✅ 「当日のプラン」 + 横並び tabs (カレンダー / リスト / マップ、 各 SVG icon 付き)
- ✅ subtitle 「時間の流れを把握して、 心地よい1日に。」
- ✅ date picker (= ‹ 📅 5月24日(日) ›、 1 日表示 + 左右 nav)
- ✅ 上品な白背景
- ✅ 「+ 教える」 / 「📋 教えた予定」 / 「予定なし ›」 sticky header / StaticAlterSuggestionCard 削除

#### Timeline
- ✅ 1 本軸 (= items-stretch、 row 全体 spine line)
- ✅ icon center / transition dot center / 軸 完全同一 X
- ✅ filled circle (= w-10 h-10) + 白抜き SVG icon (= cup / fork / briefcase / home / unknown)
- ✅ event row line solid (= icon と密着、 gap 0) + transition row line dashed (= 流れ表現)
- ✅ 帰宅後 line なし (= last event bottom 半分 skip)
- ✅ 予定間余白 (= ul gap-3)

#### EventCard
- ✅ 全周 細 border-{color}-300 (= 反転、 濃く)
- ✅ 背景 bg-{color}-50/30 (= 薄く)
- ✅ 左尖り pseudo-triangle (= ::before 内側 + ::after 外周線)
- ✅ 時刻 / title / location / alterNote / source / execution の階層
- ✅ 📍 emoji → SVG outline LocationPinIcon
- ✅ ✨ + 自然な日本語 alterNote

#### Transition
- ✅ 出発 → 最初 event / event → event / 最後 event → 帰宅 全箇所 「移動」 pill
- ✅ 横長 capsule (= rounded-md + bg-white + border-slate-200) + dashed line + 時刻 右
- ✅ 詳細 button 「詳細 ›」 (= 8c-2 復活、 規約 24-extended)

#### Source / Authority semantics (= sub-phase 6)
- ✅ SourceIndicator compact (= origin axis)、 EventCard 内蔵で flag ON path で自動 null 維持 (= GPT 「truth なき source semantics 主張禁止」 整合)
- ✅ ExecutionLayerChip first-pass (= 軽いサイン、 0 件 → null)

#### Adapter / Inference
- ✅ ExternalAnchor → StrictEventCardViewModel pure 変換 (= adapter pattern)
- ✅ category 4 段階優先順位 (= explicit locationCategory → title heuristic → locationText heuristic → 'other')
- ✅ alterNote 自然な日本語 (= getNarrative location 込み 5W1H / location なし MEANING_TABLE fallback)
- ✅ endTime 推論 (= category default duration + 次 event 考慮 + clamp [30, 240])
- ✅ transitions 生成 (= 隣接 events から 自動、 「移動」 固定 label)
- ✅ 出発 / 帰宅 virtual events (= convertExternalAnchorListWithDayBookends)

#### Document / Lock / Modal
- ✅ ImportedLockEscapeModal first-pass (= override / clone 選択、 modal UI、 a11y)
- ✅ 状態 / 文体規則 documented (= categoryMeaning module + contract test)

#### 解釈レイヤー (= sub-phase 8c)
- ✅ SummaryFooter 下部固定 (= fixed bottom-0 inset-x-0 z-40)
- ✅ 円形 SVG indicator (= 4 segment 色 cafe/meal/work/home symbolic、 score / 数値 0)
- ✅ 中立 状態名 「集中と休息のリズム」 + 観測寄り 一言解釈
- ✅ subtle CTA 「リズムを整えるヒント >」

### 1.6 機械保証 累計
- vitest: **326 tests PASS** (14 test files、 +274 net for sub-phase 8 全体)
- tsc: 8 関連 error **0 件**
- 規約 24-extended: 全 component 遵守
- 禁止語 10 件 grep: 本体 component 0 件 (= test は negative assertion meta)
- frozen file 不触: wave 1/2/3/3a + 既存 SVG icon system 完全不触
- flag OFF default: 全 12+8b + 2 + 2 = **16 commit 期間で user 影響 0**

---

## §2. まだ後段に残したもの

### 2.1 凍結維持 (= CEO + GPT 合議で意図的に skip)

| 項目 | 凍結理由 | 後段候補 |
|---|---|---|
| SummaryFooter score 算出 (= 78%) | 8c 「解釈レイヤーの器」 限定 | 別 sub-phase + LLM 接続 検討 |
| SummaryFooter 強い評価文 (= 「良いプラン」 「最適」) | GPT 「評価装置ではなく静かな解釈の器」 | 文体方針確定後 |
| LLM 接続 (= alterNote / 状態名 動的生成) | CEO 「LLM で推論作成していい」 許可済だが scope 限定 | 別 sub-phase (= API endpoint / cache / fallback 設計後) |
| ImportedLockEscape trigger 接続 | sub-phase 7 first-pass 範囲 | 8d 検討 (= EventCard tap → modal 起動) |
| ExecutionLayerChip 中身 (= 詳細 sheet / 学習ループ) | 第 8 補正 #3 first-pass | 後段 + 実 anchor data に execution counts 追加後 |
| SourceIndicator full variant (= 詳細 sheet 「Alter 提案を受け入れ済」 caption) | 第 12 補正 #2 hierarchy main card 非表示 | 詳細 sheet 実装時 |

### 2.2 構造的に未着手 (= scope 外、 別 phase で扱う)

- **EventCard 画像 slot** (= GPT 「写真は optional、 truth なし時は入れない」)
- **詳細 sheet** (= EventCard tap で開く、 TransitionChip 詳細 button 接続先)
- **swipe action / long-press** (= mobile gesture、 deferred to later phase)
- **過去 day / 未来 day の plan history** (= List は当日中心、 履歴は別 view)

### 2.3 既存 frozen file 影響観測 (= 不触維持)

- DayGraphTimeline + movement / feasibility / disclosure (= flag OFF default で従来通り動作)
- AnchorRow / AnchorThumbnail / StaticAlterSuggestionCard (= flag OFF で render 継続)
- pane mode (= isPane 動作) 完全不変
- wave 1/2/3 + L-4d + M-3d + K-3c 系 props 経路 不触

---

## §3. mock に対する到達 / 未到達

### 3.1 mock 要素別 status

| mock 要素 | 状態 | 備考 |
|---|---|---|
| ヘッダー 「当日のプラン」 | ✅ 到達 | 8b-7-B |
| 横並び tabs (= カレンダー/リスト/マップ icon 付) | ✅ 到達 | 8b-8 / 8b-9 / 8b-10 / 8b-11 |
| date picker (= 1 日表示 + 左右 nav) | ✅ 到達 | 8b-7-B + 8b-9 SVG Calendar icon |
| 上品な白背景 | ✅ 到達 | 8b-7-B |
| EventCard 薄 tint + 細枠 + 左尖り | ✅ 到達 | 8b-3 + 8b-6 + 8b-7-A + 8b-9 反転 |
| EventCard 自然 alterNote (= ✨ + 文) | ✅ 到達 | 8b-2 + 8b-6 + 8b-7-A + 8b-8 |
| EventCard 場所 (= SVG pin + 短文) | ✅ 到達 | 8b-6 |
| EventCard 写真サムネ (= 右端 image) | ❌ 未到達 | scope 外 (= truth ある時 別 sub-phase) |
| Spine 1 本軸 + filled circle + 白抜き SVG icon | ✅ 到達 | 8b-3 + 8b-6 + 8b-7-A + 8b-9 / 8b-10 / 8b-11 / 8b-12 |
| 出発 / 帰宅 自動付与 | ✅ 到達 | 8b-7-A |
| transitions 「移動」 chip + dashed line | ✅ 到達 | 8b-2 + 8b-4 + 8b-8 + 8b-9 / 8b-10 / 8b-11 |
| transition 詳細 button | ✅ 到達 | 8c-2 |
| SummaryFooter (= 78% balance card 構造) | ✅ 到達 (= 構造のみ) | 8c + 8c-2 (= score / 強い評価 凍結) |
| SummaryFooter 数値 78% 表示 | ❌ 未到達 (= 凍結) | LLM 接続 / score 算出 別 sub-phase |
| 帰宅後 spine line なし | ✅ 到達 | 8b-9 + 8b-12 |
| sticky header 「今日 · 5月24日(日) 2件」 重複 | ✅ 到達 (= 削除) | 8b-9 |

### 3.2 mock 到達率 (= 視覚要素)
- **完全到達**: 13 項目 / 15 項目 = **87%**
- **構造到達 + 中身凍結**: 1 項目 (= SummaryFooter 78%)
- **未着手**: 1 項目 (= EventCard 写真サムネ)

---

## §4. 今後 Map 側に持ち込むべき design rule

### 4.1 文体 / 言語規約 (= CategoryMeaning 8b-1 / 8b-6 / 8b-8 確立)

| 規約 | 根拠 |
|---|---|
| 強い命令形 (= 「しなさい」 「しろ」 「やれ」) 0 | Aneurasync 哲学 (= 観測 / 解釈、 押し付けない) |
| 評価形容詞 (= 「最適」 「重要」 「ベスト」 「良いプラン」) 0 | GPT 「評価装置ではなく静かな解釈の器」 |
| 「ましょう」 「しよう」 OK | mock 文体準拠 (= CEO 8b-8 で許可) |
| 状態描写型 / 観測寄り | Aneurasync 中心問い (= 第二の自己として観測) |
| 数値 / score 表現 0 | 8c で確立 (= 解釈レイヤーの器、 score 算出は後段) |
| 禁止語 10 件 (= おすすめ / これをした方がいい / 最適 / 推奨 / 改善 / 警告 / 危険 / 注意 / リスク / 最適化) | 全 sub-phase 横断、 機械的 grep 保証 |

### 4.2 視覚規約 (= EventCard / TimelineSpine 確立)

| 規約 | 根拠 / 詳細 |
|---|---|
| **規約 24-extended** (= focus-visible:border-slate-300、 brand 色 focus 0) | 全 component 遵守、 機械的 grep 保証 |
| **category 色 token** (= cafe indigo / meal orange / work blue / home emerald / other slate) | adapter resolveCategory 4 段階で決定 |
| **背景 tint** (= bg-{color}-50/30、 30% opacity 薄く) | 8b-9 反転原則 (= 中身薄く、 枠濃く) |
| **border 色** (= border-{color}-100 / -200 / -300、 用途別 weight) | 8b-9 反転 / 8b-10 細く |
| **shadow weight** (= shadow-sm / shadow-md / shadow-lg、 階層別) | 8c 「面」 感 (= shadow-lg)、 card は shadow-sm |
| **rounded** (= rounded-md / -lg / -xl / -2xl、 用途別) | 8c-2 で確立 (= 大要素は 2xl、 button 系 md) |

### 4.3 SVG icon system (= 既存 categoryIconMap 拡張 + 新 inline)

| icon | source | 利用 |
|---|---|---|
| CategoryCafeIcon | 既存 (= Phase 2-I) | cafe spine |
| CategoryHomeIcon | 既存 | home spine |
| CategoryUnknownIcon | 既存 | 'other' spine |
| MealIcon | 8b-6 inline (= fork + knife) | meal spine |
| BriefcaseIcon | 8b-7-A inline (= handle + body) | work spine |
| LocationPinIcon | 8b-6 inline (= outline pin) | EventCard 場所 |
| Calendar (= 8b-9) | inline (= rect + lines + 3 dots) | date picker + Tab |
| List (= 8b-10) | inline (= 3 lines + 3 left dots) | Tab |
| MapPin (= 8b-10) | inline (= teardrop + center circle) | Tab + EventCard 場所 (= 同 LocationPinIcon の流用可能) |
| SummaryRing (= 8c) | inline (= circle + 4 arc) | SummaryFooter 視覚枠 |

**Map に持ち込み**: MapPin / Calendar / List / Briefcase / Meal は **Map tab tabs / pin maker / event detail で再利用** 推奨。

### 4.4 構造 pattern (= TimelineSpine refactor で確立)

- **1 本軸 + items-stretch** (= flex column が row 全体に拡張、 absolute child が row 全 height covered)
- **event row line solid + transition row line dashed** (= icon 隣接 gap なし、 transition は流れ表現)
- **first event top half / last event bottom half line skip** (= timeline 開始 / 終了 を明示)
- **icon z-10 で line 重ね** (= 自然な 1 本線 visual)

### 4.5 adapter pattern (= externalAnchorAdapter 確立)

- **pure module** (= LLM / API / DB / network 不使用、 deterministic、 入力 mutate なし)
- **4 段階優先順位 heuristic** (= explicit → title → locationText → fallback)
- **元データ書き換え禁止** (= 表示専用 view layer)
- **time 正規化** (= "HH:MM" / "HH:MM:SS" / ISO 8601 / 不正 → "HH:MM")
- **endTime 推論** (= category default duration + 次 event 考慮)
- **virtual bookends** (= 出発 / 帰宅 を自動付与、 day view 完成形)

### 4.6 flag 制御 pattern (= featureFlags.ts 案 1b 確立)

- **コード内 const flag** (= env 不使用、 規約 「DB / env / package 変更禁止」 遵守)
- **default false** (= 既存 user 影響 0)
- **flag OFF path 完全不変** (= 全 16 commit 期間で hard rule 遵守)
- **同責務範囲で旧→新置換** (= 二重表示防止)
- **closeout audit で flag 削除予定** (= 完全 migration、 後段)

### 4.7 testing pattern (= contract test 確立)

- **react-dom/server renderToStaticMarkup** (= @testing-library なし、 軽量)
- **render contract test** (= HTML string 検査、 visual gap を機械保証)
- **禁止語 grep** (= negative assertion)
- **規約 24-extended grep** (= brand 色 focus 0 機械保証)
- **pure module contract test** (= input → output deterministic 保証)

---

## §5. Map 着手前の判断材料

### 5.1 List close で確定したこと
- 8a / 8b / 8c / 8c-2 全 16 commit が flag OFF default で安全 (= user 影響 0)
- mock 視覚要素の 87% 到達 + 13% は意図的凍結
- design rule (= 上記 §4) 全項目 確立
- adapter / featureFlags pattern が再利用可能

### 5.2 Map に持ち込み候補
- SVG icon (= MapPin / Calendar / Briefcase / Meal を Map tab tabs / pin に流用)
- 色 token + 規約 24-extended
- adapter pattern (= ExternalAnchor → MapPinViewModel 等)
- flag 制御 (= MAP_NEW_ENABLED 同 pattern)
- 文体規約 (= Map 上の label / tooltip / detail で適用)
- SummaryFooter (= Map 上にも 1 日全体の解釈レイヤーを置くか別 view 検討)

### 5.3 Map 未確定 / 別 audit 要件
- Map spec audit (= IA Audit と Spec audit の 2 段階で進める、 List と同 pattern)
- 既存 MapTab inventory (= app/(culcept)/plan/tabs/MapTab.tsx + 関連 hooks)
- Google Maps integration (= 既存 utilities、 不触 / 流用判断)
- Map pin source semantics (= List の SourceIndicator pattern を持ち込むか)

### 5.4 Map 着手前に CEO 判断仰ぐ事項
- Map redesign を行うか (= 既存 MapTab 維持 + List close で plan list 完了とするか)
- Map readiness audit 実施可否
- Map 着手のタイミング (= 即着手 / 別週)

---

## §6. closeout 結論

### 6.1 List 側 (= sub-phase 8)
- ✅ 全 sub-phase 採用確定 (= 8a / 8b / 8c / 8c-2 全 16 commit 凍結)
- ✅ mock 視覚 87% 到達 + 13% 意図的凍結
- ✅ design rule (= §4) 確立
- ✅ flag OFF default で user 影響 0 維持
- ✅ 機械保証 326 tests PASS / tsc 0 / 規約 24-extended 全件

### 6.2 残課題 (= List の後段、 別 sub-phase で扱う)
- SummaryFooter score 算出 + 強い評価 (= LLM 接続検討時)
- ImportedLockEscape trigger 接続 (= 8d 検討)
- ExecutionLayerChip 中身 (= 学習ループ + 詳細 sheet)
- SourceIndicator full variant 詳細 sheet (= 詳細 sheet 実装時)
- EventCard 画像 slot (= truth 確保時)

### 6.3 次 phase 判断 (= CEO 判断仰ぐ)
- **A. Map spec audit 着手** (= List と同 pattern で IA → Spec → impl)
- **B. List sub-phase 8d 着手** (= ImportedLockEscape trigger or SummaryFooter score 等)
- **C. 別 task に転換** (= Plan 機能完了として別領域、 Stargazer / Rendezvous 等)

---

**closeout audit 作成完了**。 CEO 判断後、 上記 A / B / C どれに進むかを確定。
