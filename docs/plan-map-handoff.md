# /plan Map タブ — セッション間 引き継ぎ書 (Handoff)

> 作成: 2026-06-04 / セッション `claude/frosty-hellman-b3305e`
> **原則: 嘘をつかない。** 完了/未完了・検証済/未検証・HOLD を厳密に区別して記す。
> 次セッションは本書 §0 → §1 → §4(制約) → §3(着手対象) の順で読むこと。

---

## 0. このドキュメントの位置づけ
- **戦略の全体像**: `docs/plan-map-second-self-strategy.md`（必読・受理済。第1回リサーチ反映）
- **リサーチ findings（2回・保全）**: `docs/plan-map-research-findings.md`（可読索引）+ `docs/research/plan-map-deep-research-1-strategy-raw.json` / `-2-foundation-raw.json`（verbatim 生出力・authoritative）
- **設計契約（旧）**: `docs/alter-plan-time-layers-mobility-design.md`（Time Layers / Mobility Layer・**§4.3.1 観測ガードレール**）
- **本書**: 現状の確定事実 + 別セッションへ引き継ぐ全項目 + 絶対制約 + コードマップ + リサーチ要約 + **§10 進め方・品質バー（CEO 規律・必読）**
- このブランチは **未 push**。最新 commit は `git log --oneline` 参照（実装コードは `7eeeb3f4` までで凍結、以降は docs のみ）。push/PR は CEO 承認案件。

---

## 1. 確定済み成果（commit 済・本セッション）

ブランチ `claude/frosty-hellman-b3305e`、コミット履歴（新しい順・**すべて本セッション**、ベース `9afdcaf9` の上）:

| commit | 内容 |
|---|---|
| `7eeeb3f4` | 所要時間比較（判断材料）+ 履歴補助 |
| `9f17b9b7` | S2-A 「前回こう動いた」recall hint |
| `8298642e` | S1-A `selectedModeByLeg` localStorage 永続化 |
| `70f33f67` | docs: 「第二の自己化する地図」戦略 & 施策提案 |
| `9c9b42b2` | ガラス質ホログラム ルート線 + Lucide 移動アイコン + ノード鼓動/発光呼吸 |
| `2064b723` | mobility icon switcher v1（per-leg mode chips / card / mode-aware route） |
| `ae5e408b` | docs: 観測ガードレール明文化（§4.3.1・`selected↔actual` 鉄則） |
| `20a2a59c` | docs: Time Layers & Mobility Layer 設計（**nifty と共有する契約**） |
| `e1176d20` | mobility route leg 表示レイヤー（RouteLegViewModel・距離推定撤去・静かな glow） |
| `f80412ce` | 道路沿いルート化 v1（WIP） |

（本引き継ぎ書じたいは `a8ffc722` 以降の docs commit。）

**全変更は `app/(culcept)/plan/tabs/MapTab.tsx` のみ**（docs を除く）。他ファイル不触。`lib/shared/googleMapsLoader.ts` 不触。

### 1.1 デザイン（`9c9b42b2`）
- 移動アイコン: 手描き SVG → **lucide-react** に刷新。地図=円チップ `mobilityLegIconDataUri` / カード=iOS squircle `mobilitySquircleDataUri` / glyph `mobilityGlyphLucide`。
- ルート線: **ガラス質ホログラム3層**（外側グロー + 半透明本体 + 白い芯）`buildGlassyLegLines` + `getRouteStyleForLeg`。
- アニメ: 「中央を走る光」廃止 → `createRouteAuraAnimation`＝①current グローの**発光呼吸**（位置不動）+ ②次の目的地の**ノード発光鼓動**（拡大+フェード）。past=丸点線 `dottedRouteIcons`（純正 CIRCLE）。
- frozen loader 不触のため local 型拡張: `RouteSymbol`(fill 追加)/`RouteRingIcon`(strokeOpacity)/`GmapsMarkerWithSetIcon`。
- **設計決定の経緯（CEO の選択。再提案防止）**: アイコン=「手描き SVG」却下→Lucide 採用。線/動き=「中央を光が走る(flowing-light)」「ネオン発光チューブ」「呼吸のみ」を却下→**ガラス質ホログラム + ノード発光鼓動 + 発光呼吸**を採用。「速すぎるアニメ」「距離からの mode 推定」も明示的に却下済み。

### 1.2 S1-A 永続化（`8298642e`）
- key: `plan-map:selectedModeByLeg:v1:${dayKey}`（`dayKey = selectedDate.toISOString().slice(0,10)`、当日スコープ）。
- value: `{ [legKey]: RouteTransportMode }`。`legKey = legKeyOf(fromAnchorId, toAnchorId)` = `${fromId}__${toId}`。
- **重要**: `anchorsForDay`（`app/(culcept)/plan/tabs/_helpers.ts`）は**元 anchor をそのまま返す**ため `anchor.id` は再 fetch をまたいで安定 → id ベース legKey で復元成立。recurring は同一 id を全日で再利用。**composite fallback は不要**（CEO スペックの条件「id 不安定なら」が偽だった）。
- load: mount 後 `useEffect`（初期 `{}`=SSR一致、hydration 不整合回避）。save: `handleSelectLegMode` 内で即時。fail-open（破損/SSR/QuotaExceeded は握りつぶし）。
- 関数: `loadPersistedLegModes` / `savePersistedLegModes`。

### 1.3 S2-A recall（`9f17b9b7`）
- `recallPriorLegMode(dayKey, legKey)`: **過去日**の S1-A バケットを走査し同 legKey の最新日 mode を返す（**読取専用**・学習なし）。
- カード表示: 「前回この区間: ◯◯ [適用]」。表示条件 = **今日未選択 ∧ 過去 leg でない ∧ 履歴あり**（`MobilityLegCard` の `recallMode` prop）。適用 = 既存 `onSelect`（=S1-A 保存）。
- recurring 区間でのみ意味を持つ（one-off は legKey が日跨ぎ不一致 → null）。

### 1.4 所要時間比較（`7eeeb3f4`）
- `fetchLegInfo(service, from, to, travelMode)`: **実 Google Directions の duration** を取得（cache/in-flight/timeout/fail-open は `fetchRoadSegmentPath` と同型）。transit は steps の TRANSIT 数 −1 を乗換数に。
- カード開時に **徒歩=WALKING / 車・タクシー=DRIVING / 電車・バス=TRANSIT** の3モードを read-only fetch（`legDurCacheRef` で legKey キャッシュ）。`legDur` state、`LegInfo`/`LegDurState` 型。
- UI: 「この区間の移動・所要時間の目安」ブロック（`durLine`）。取れない手段=「—」、自転車/飛行機/新幹線=「経路目安なし（未対応）」明記。「**おすすめではなく判断材料です**」と明記。
- ✦おすすめ枠（曖昧プレースホルダ）は**撤去**。`recommendedMode` prop 削除。

---

## 2. 検証状況（★嘘をつかない・厳密区別）

| 対象 | 検証 | 状態 |
|---|---|---|
| ESLint (MapTab) | 各 commit | ✅ 0 errors / 0 warnings |
| tsc (MapTab.tsx のみ) | 各 commit | ✅ 0 errors |
| デザイン（線/アイコン/カード） | 実機スクショ | ✅ 確認済 |
| S1-A 永続化（保存・リロード復元） | 実機 smoke | ✅ ユーザー確認済 |
| **S2-A recall 表示パス**（過去日→「前回」表示） | — | ⚠️ **未確認**（条件成立データ無く実機未到達。**抑制パス=今日選択済みは確認済**。表示ロジックは静的検証のみ） |
| 所要時間比較（実値表示） | 実機スクショ | ✅ 徒歩46分/車12分/電車—（実 Google 値）確認済 |
| **所要時間比較の未確認パス** | — | ⚠️ 「電車が返る区間の乗換表示」「loading→数値遷移」「別 leg 再取得/キャッシュ」は**未確認** |
| プロジェクト全体 tsc | — | ⚠️ **1112 件の既存エラー**（本変更前から存在・`next.config.js` で `typescript.ignoreBuildErrors:true`。MapTab.tsx は 0） |

---

## 3. 引き継ぎ項目（全件・現在 HOLD）

各項目: 概要 / 必要サブシステム / なぜ別セッションか / 着手のヒント。**着手は CEO グリーンライト必須。**

### 設計合流: nifty（予定追加）セッションとの語彙統一 ★優先・横断
- **概要**: 本 worktree (frosty) は Map **表示**側、別セッション **nifty = 予定追加 (add-schedule UI)** 側。両者で語彙・型を揃える必要がある（本セッション初期の到達点 `20a2a59c`/`ae5e408b` で「次は nifty 合流」と申し送り済み）。
- **揃える語彙**（共有契約 = `docs/alter-plan-time-layers-mobility-design.md`・commit `20a2a59c`）: `candidateModes` / `recommendedMode` / `selectedMode` / `actualMode`、`ContextBand` / `Anchor` / `ExcursionLeg`、`transportMode` 正本型の将来方針。
- **現状（正直に）**: 本セッションの S1-A/S2-A/所要時間比較 は **`selectedMode` の localStorage サブセットのみ**を使用。frosty は**共有正本型を新規作成していない**（CEO 指示の HOLD）。`recommendedMode` は所要時間比較導入時に prop ごと撤去（推薦エンジン HOLD のため）。
- **正本型の現物マップ（main `@9afdcaf9` を実証・2026-06-04）**: 合流は「ゼロ作成」でなく**散在表現の reconcile**。検証結果:
  - ✅ canonical `TransportSegment`（+ duration/source/距離 heuristic）= `lib/alter-morning/transport/types.ts` ほか `lib/alter-morning/planning/*`（W3-PR-10）。**ただし alter-morning（Home/Morning）ドメイン**で、**/plan Map(frosty)は未使用**（frosty は別経路: localStorage `selectedMode` + Google Directions duration）。
  - ✅ `ExternalAnchor` / `anchorsForDay` = /plan の anchor 正本（`lib/plan/external-anchor.ts` / `tabs/_helpers.ts`。frosty 使用中）。
  - ⚠️ `deriveTitlePlaceGroups`（commit `873d2ca1`・Step4「よく行く」ヘルパー）= **実在するが main 未マージ**（別 branch）。
  - ⚠️ containment band（案B / `ContextBand`）= **main では plan-map 用を検出できず**（nifty branch か名称差の可能性・要 nifty 側確認）。
  - → **合流の本質 = 散在する transport 表現を共有正本型へ一本化**（★詳細精査は **§11**）。**/plan の正本層は `lib/plan/transport`（11ファイル・main・alter-morning とは別で疎結合＝import 1点）**。frosty は未使用で独自実装＝衝突あり。**表示哲学／正本置き場所／MapTab アーキ の3点は CEO 決定**（§11.4）。nifty の「✅実装済(main)」は **TransportSegment は正・Step4/band は要補正**。
- **なぜ別**: 2 worktree 間の設計合流＋正本型確定は片側だけでは決められない。**共有正本 / DB / Decision Engine 接続は合流後の別 Phase**。
- **着手のヒント**: nifty 側の現状を読み語彙の食い違いを洗い出してから正本型を1本化。frosty 側は §4 の `selected↔actual` ガードレールを必ず引き継ぐ。
- **関連の未捕捉機能（CEO 発案・nifty 側 deferred）**: 「**よく行く / よく使う場所**」候補提示 ＝ 予定追加時に**右端の SVG をクリック → その予定に応じた候補地**を出す UX。frequency ベースの提案で **S2-B（頻度学習）/ S3 と接続しうる**。本セッションでは未着手（nifty スコープ・HOLD）。

### 軽量・S1-A/S2-A の上に乗る
- **S2-B レパートリー学習（頻度/recency 重み付け + OD/時間帯/曜日 一般化）**
  - 必要: 集約ロジック（=学習の入口）。`lib/stargazer/bayesianAxisUpdater.ts`（ベイズ共役・precision auto-scale）が再利用候補。
  - なぜ別: 「最新の前回値」(S2-A) を超え統計学習に入る。研究の **forgetting/decay は保守的に**（過度な recency 禁止）、**ハードロック禁止**（0-3 反証）。
- **S5 1日成立チェック（次に間に合うか）**
  - 必要: 確定 anchor の時刻 + leg 所要時間（`fetchLegInfo` 流用可）。学習不要。
  - なぜ別: Reality Control OS 核の新ロジック。自動並べ替えはしない（選択尊重）。

### 新サブシステムを要する
- **S1-B Supabase 永続化（クロスデバイス同期）** — **DB 承認案件**。S1-A の localStorage を正本→同期へ。redux-persist 型の versioned schema + migration（研究）。
- **S3 個人化移動時間「あなたのペース」** — 実移動からの個人速度推定。**競合未実装の穴**（Citymapper の歩行速度個人化主張は 1-2 反証）。
- **S4 天候バッジ（WALK LESS）** — `lib/shared/location.ts`(JMA office code) + `lib/weather/jma.ts` で自前取得可。step-free 等は**日本データ未確認のため謳わない**。
- **S6 選択理由フック（Alter 接続）** — 推奨と違う選択時にまれに理由観測 → Alter が言語化。Aneurasync 固有の堀。

### moonshot
- **M1 受動的意図推定**（Ziebart 2008・MaxEnt のクライアント近似）/ **M2 選好確率モデル**（選択尊重を数理保証）/ **M3 説明可能な地図**（「なぜ変わったか」を本人モデル起点で）/ **M4 体調連動ルーティング**（HDM/wearEvents）/ **M5 移動の自己発見レポート**（Stargazer 連携）。

### 設計リファイン（研究の修正2点）
- **scrutability を一級目標に**（override→学習更新。研究の高レバレッジ空白）。
- **forgetting/decay を一級関心に**（係数は保守的に開始、要実測キャリブレーション）。

### 本セッションで出た「軽微改善」候補（任意）
- 所要時間比較の **電車・バス「—」** の読み取り改善（「経路なし」等の文言）。
- 過去(done) leg でも所要時間目安が出る（不要なら past で非表示）。

---

## 4. 絶対制約・禁止（★最優先・嘘をつかない含む）

1. **偽の数字・偽の根拠を出さない**（CEO 既定・全フェーズ）。所要時間は実 Google duration のみ、取れなければ「—」。
2. **距離からの移動手段推定をしない**（`MapTab` 内に明記、誤判定が Plan OS の信頼を壊す）。
3. **推薦の断定をしない / 人格診断にしない**（推薦エンジン HOLD 中）。出すのは事実の判断材料。
   - **`selected↔actual` 乖離ガードレール（鉄則・横断制約）** — 正本は `docs/alter-plan-time-layers-mobility-design.md` §4.3.1（commit `ae5e408b`）。要点:
     - 乖離は**深層観測シグナルだが人格診断・固定ラベルではない**（悪「怠けるからタクシー」／良「この状況では移動負荷軽減を優先した *可能性*」）。
     - 必ず**状況依存の仮説**として `confidence / context / weather / baggage / fatigue / urgency` とセットで解釈。単独シグナルで結論にしない。
     - **用途は本人の自己理解と Plan 改善のみ**。断定・評価・監視・スコアリングには使わない。一度の乖離で決めず、反復で confidence を積む。
     - この鉄則は `recommendedMode` / `actualMode` / 将来の Decision Engine 入力 すべてに効く。
4. **`lib/shared/googleMapsLoader.ts` 不触**（frozen。MorningMapView と SCRIPT_ID 共有）。型は MapTab 内 local 拡張で広げる。
5. **新規 npm 依存を入れない**（`@types/google.maps` NG / `@vis.gl/react-google-maps` は Vercel build timeout 既往）。lucide-react は既存。
6. **DB / Supabase / マイグレーション / 外部 API 連携 = CEO 承認案件**。勝手に進めない。
7. **push / PR = CEO 承認案件**。
8. **State Safety Rule（CLAUDE.md §7-8）**: `git stash`/`reset --hard`/`checkout --`/`clean -f`/`restore .` 禁止（Hook ブロック）。`git add` はファイル個別指定。30分/3ファイルでコミット。commit 前に branch/status/log 確認。
9. **observed > inferred**: 選択=観測（高 precision）、推奨=推論（低 precision）。

---

## 5. コードマップ（`app/(culcept)/plan/tabs/MapTab.tsx`）

> 行番号は 2026-06-04 時点の目安（編集で必ずずれる。シンボル名で grep すること）。

### データの流れ
- props: `anchors: ExternalAnchor[]`, `now?`, `onAnchorClick?`（`PlanClient.tsx` から / Supabase `external_anchors` 経由 `/api/plan/anchors`）。
- `selectedDate = utcMidnight(now)`（9 closeout で「今日」固定）。`dayKey`（≈161）。
- `dayAnchors = anchorsForDay(anchors, selectedDate)`（`_helpers.ts:341`、**元 anchor を返す=id 安定**）。
- `allPins: AnchorWithCoord[]`（≈252、`{anchor, coord:{lat,lng}, kind}`）← `usePlanGeocode` + `usePlanBaseline`。
- `legKeyOf(fromId,toId)`（≈1460）= `${fromId}__${toId}`。

### 永続化・想起（S1-A/S2-A）
- `MOBILITY_PERSIST_KEY_PREFIX`（≈1473）/ `loadPersistedLegModes`（≈1476）/ `savePersistedLegModes`（≈1505）/ `recallPriorLegMode`（≈1528）。
- state: `selectedModeByLeg`, `openMobilityLegKey`, load `useEffect`, `handleSelectLegMode`（save 注入）。

### 所要時間（duration）
- 型: `GmapsDirectionsResult`（`legs[].duration` / `steps[].travel_mode` を local 拡張済）。`LegInfo`（≈2174）/ `LegDurState`（≈2179）。
- `fetchLegInfo`（≈2194）+ `legInfoCache`/`legInfoInflight`。`toApiTravelMode`（walk→WALKING / car,taxi→DRIVING / train,bus,shinkansen→TRANSIT / bicycle→BICYCLING / flight→null）。`createDirectionsService` / `directionsApiUnavailable`（REQUEST_DENIED で session 停止）。
- state: `legDur` + `legDurCacheRef` + fetch `useEffect`（mobilityCard useMemo の直前）。

### ルート描画・アニメ（デザイン）
- `getRouteStyleForLeg` / `buildGlassyLegLines`（≈1779） / `createRouteAuraAnimation`（≈1837） / `dottedRouteIcons` / `flightArcPath`。
- アイコン: `mobilityGlyphLucide`（≈1988） / `mobilityLegIconDataUri`（円・地図） / `mobilitySquircleDataUri`（squircle・カード） / `ROUTE_MODE_COLORS`。
- `MobilityLegCard`（カード本体）: props = legKey/fromTitle/toTitle/selectedMode/`recallMode`/`durations`/readOnly/onSelect/onClose。

### 再利用できる既存基盤（将来の学習用・現状 HOLD）
- `lib/stargazer/bayesianAxisUpdater.ts` — ベイズ共役更新（mobility 軸を足すだけで学習に乗る）。
- `lib/aneurasync/observationBridge.ts` — 観測記録（`/api/stargazer/observations`）。
- `lib/shared/location.ts`（JMA office code/座標）+ `lib/weather/jma.ts` — 天候（自前）。
- `lib/shared/wearEvents.ts` — 着用/体調 周辺（別ドメイン）。

---

## 6. オープン論点（着手前に要追加調査）
- **日本の交通データ**: GTFS-RT（JR/私鉄/地下鉄）、駅構内 step-free、ODPT（JSON/REST 公開だが**新規依存・登録必須**＝vanilla 制約と衝突）。Google Maps Platform 日本 transit/walking の範囲。
- **leg 安定キー（将来）**: Google Calendar 由来なら `originalStartTime`（不変）/ iCal は UID+RECURRENCE-ID（ただし「完全安定」は 0-3 反証＝migration 前提）。**実時刻でキーを作らない**。現データは id 安定で当面 OK。
- **MaxEnt のクライアント近似**: 完全な IRL は重い。localStorage + bayesianAxisUpdater でどこまで「選択尊重」を近似できるか PoC 要。
- **説明可能性 UI**: 「なぜ変わったか」を非侵襲に。Google「Ask Maps」は選択肢可視化止まりで**選択理由は説明しない**（差別化健在）。
- **decay 係数の初期値**: 習慣的経路では aggressive recency が逆効果の可能性。保守的開始 + 実測。

---

## 7. 運用メモ（次セッションの環境）
- **ポート衝突**: `:3001` は**別プロジェクト**（`/Users/haradataishi/dev/aneurasync-x-code-migrated-20260525-183641`、next v16.2.4）が占有（別セッションの可能性・**kill 禁止**）。本 worktree は **空きポート**で起動（例 `:3003`）。
- **scaffolding（gitignore/symlink）**: closeout で削除済み。再開時に再リンク:
  ```
  cd /Users/haradataishi/Culcept/.claude/worktrees/frosty-hellman-b3305e
  ln -s /Users/haradataishi/Culcept/node_modules node_modules
  ln -s /Users/haradataishi/Culcept/.env.local .env.local
  NODE_OPTIONS=--max-old-space-size=8192 npx next dev --webpack --port 3003
  ```
  `localhost:3003/plan`（ログイン必須・認証壁。未ログインは 307 リダイレクト＝コンパイル成功の合図）。
- **検証コマンド**:
  - ESLint: `NODE_OPTIONS=--max-old-space-size=2048 npx eslint "app/(culcept)/plan/tabs/MapTab.tsx"`
  - tsc(全体・MapTab だけ抽出): `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json 2>&1 | grep MapTab.tsx`（**8192 必須・2048 では OOM**。dev server と同時実行はメモリ逼迫で crash 既往 → 単独で回す）。
- **Google Directions API（運用前提）**: ルート線・所要時間比較は client `DirectionsService` の実呼び出しに依存。**未有効化だと `REQUEST_DENIED` → `directionsApiUnavailable=true` で session 中は試行停止し、線は直線 fallback・duration は「—」**になる（本セッション初期に GCP で Directions API 有効化済み。"急に出なくなった" 時は GCP キー/有効化/課金/リファラ制限を疑う）。browser key = `NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY`。
- **目視確認の限界**: /plan は認証壁。Playwright は別セッション（未ログイン）で実 localStorage/カードを見られない。runtime はユーザー実機確認に依存。

---

## 8. リサーチ要約（deep-research 2 回・引用つき）

> 完全版（全 finding・vote・逐語 evidence・全出典・caveats・refutations・openQuestions）は
> **`docs/plan-map-research-findings.md`**（可読索引）と **`docs/research/plan-map-deep-research-{1,2}-*-raw.json`**（verbatim）に保全済。以下は最小要約。

### 第1回（戦略）— `docs/plan-map-second-self-strategy.md` に詳細
- 人は最短を選ばない（53% が推奨1位でない／Lima 2016 J.R.Soc.Interface 13:20160021、3-0）。レパートリーは小（1/3 単一）。
- MaxEnt IRL（Ziebart 2008 AAAI）= 受動観測で意図推定 + **非最適な実選択を尊重**（3-0）。
- **反証（設計の禁則/好機）**: 「20回でロックイン」0-3 反証→確率的継続学習。「個人化歩行速度」は競合未実装 1-2→**独占の穴**。「Wanderlog=車中心 fuel 最適化」1-2→multimodal 前提。
- 競合: Citymapper（step-free=荷物/ベビーカーにも効く一機能多用途・WALK LESS・線区セグメント障害回避・路線別通知／**日本カバレッジ未確認**）、Wanderlog（1日訪問順最適化 max15・予約メール取込 便/ホテル）。

### 第2回（方針再検証 + 土台）
- **方針＝支持（修正付き）**: 移動手段選択は強く習慣化、ライフ遷移でのみ鋭く変化（Verplanken 習慣不連続仮説）。
- **修正①**: 「理由言語化」を学習の前提にしない（ユーザーは制御UIを使わない=手間/不可逆/プライバシー）→ 低負担・可逆優先。
- **修正②**: **scrutability（訂正可能性）を一級目標**に（200+論文中 7 本のみ＝高レバレッジ空白）。
- **棄却**: 「行動ログ=必然的フィルターバブル」0-3 反証（慎重設計で回避可能）。「UID+RECURRENCE-ID 完全安定」0-3 反証。
- **永続化**: redux-persist 型 versioned key + 前方 migration、バグ版からの移行も明示、書込失敗前提の fail-open。
- 出典は両 docs / 各 finding の sources を参照。Reddit 等は**定性シグナル**（一次統計でない）。

---

## 9. 次セッション クイックスタート
1. 本書 §0/§1/§2 で現状把握 → §4 の制約を頭に入れる。
2. CEO が §3 から着手対象を1つ指定（複数同時着手しない＝本セッションの規律）。
3. §7 で環境再構築（symlink + 空きポート dev）。
4. 着手対象の「必要サブシステム」が DB/Supabase/外部API/新依存なら **CEO 承認を取る**。
5. 変更は最小・外科的・**MapTab 以外を触るなら理由説明**。commit 前に branch/status/log 確認。**push/PR しない**。
6. 実機 smoke はユーザーに依頼（認証壁）。**嘘をつかない**（検証できていない事は「未検証」と書く）。
7. **§10 の進め方・品質バーを必ず守る**（CEO が一貫して求めた規律）。

---

## 10. CEO の進め方・品質バー（プロセス規律・★次セッション必読）
> 本セッションを通じ CEO が一貫して要求した「**どう進めるか**」。WHAT(§1-§9) と同等に重要。これを外すと品質が落ちる。

### 思考原則（CEO 提示 ①〜⑧）
1. **前提を疑う**（コード前に前提・要件の妥当性を問う）
2. **自立推論 + 文献リサーチ**（時間をかけて自分で調べ抜く。鵜呑みにしない）
3. **シンプルな核から**始め論理的に
4. **外科的・緻密に**修正（最小差分）
5. **目標から逆算**して実行
6. **人間と同等の推論・組み立て・理解**を持つ
7. **革新（人間の能力を超えるアイデア）**を引き出し組み込む
8. **世界トップシェアを取る**前提で、**時間をかけて**ゆっくり推論

### 実行規律
- **tight-slice**: 1 フェーズ = 最小・検証可能な1スライス（S1-A / S2-A / 所要時間比較 のように）。**複数同時着手しない**。
- **scope 拡大前に必ず確認**（勝手に次フェーズへ進まない。CEO が範囲を指定する）。
- **MapTab 以外を触るなら理由説明**。新サブシステム（DB/Supabase/外部API/新依存）は**着手前に承認**。
- 変更は**外科的・最小**。frozen file（googleMapsLoader.ts）不触。

### 検証・コミット・closeout のリズム
- 各フェーズ: 実装 → ESLint/tsc（MapTab 0）→ **実機 smoke はユーザー** → CEO 承認 → **保護 commit** → **closeout**（dev 停止・scaffolding 掃除・clean 確認）。
- commit 前に `branch / status / log` を確認。`git add` は**ファイル個別指定**。**push/PR は承認制**。State Safety Rule（stash/reset/checkout/clean/restore 禁止）。

### 誠実性（最優先・このセッションで CEO が強く要求）
- **完成度を断定しない**。**検証済 / 未検証 / HOLD を厳密に区別**して報告する（「全項目クリア」のような過大主張をしない）。
- **嘘をつかない**。確認していない事は「未確認」と書く。
- **偽の数字・偽の根拠・距離からの mode 推定・人格診断**をしない（§4）。**observed > inferred**。
- リサーチや成果は**揮発（/tmp）に置かず commit で永続化**する（出典つき）。

---

## 11. 合流衝突の精査結果（main・両 branch を実証・2026-06-04・★実装前必読）
> §3 nifty 合流の**詳細**。frosty が main / frosty branch / nifty branch を `git show`/`git grep` で実証。
> **結論: 合流は「小さな reconcile」でなく相応の統合プロジェクト。3 つの CEO 決定が要る。**

### 11.1 実証した現物（3 つの transport 表現が並存）
1. **`lib/plan/transport/`（main・11 ファイル）= 成熟した正本層「Mobility Truth Layer」(Phase 3-L)**
   - `transportTypes.ts`（390行）/ `movementDisplayContract.ts`(307) / `Formatter`(272) / `cascadeOrchestrator.ts`(342) / `heuristicDistanceProvider.ts`(215) / `manualUserProvider.ts` / `unresolvedProvider.ts` / `mapTabCoordsBridge.ts`(115) ほか。
   - **frosty と同一哲学**: optimize/recommend しない・**距離→mode 推定しない**(mode 常に unknown/low confidence)・confidence ベース・**provider 非依存**。
   - provider スロット: `google_routes`=**未接続(L-3+)**、`manual_user`=**shell のみ(L-2)**、現行 source=`heuristic_distance`(alter-morning heuristic 再利用)。
   - 表示契約は**意図的に最小**: `"移動 約N分"` のみ。**mode 表示は範囲外・raw 数値出さない・比較なし**(recommendation/mode/distance を NG 文言と明記)。
2. **frosty branch の MapTab.tsx = 独自実装（lib/plan/transport 未使用）**
   - 今セッションの `selectedMode`(localStorage) ≒ 正本層の `manual_user`、Google Directions duration ≒ `google_routes` を**スロットに挿さず MapTab 内に独自実装**。
   - frosty の**所要時間比較(徒歩/車/電車 の raw 複数mode)は、正本契約が"範囲外"とした表現**そのもの = **設計哲学の食い違い**(CEO の今回指示 vs 既存 Truth Layer の保守契約)。
3. **nifty branch = 薄い MapTab ＋ `lib/plan/transport` ＋ hooks**（`_useMapTabMovementDisplay`/`_useMapTabFeasibilityDisplay`/`mapTabCoordsBridge`、timeline 系で使用）。
   - 加えて nifty branch のみ: containment band(`lib/plan/timeline-containment.ts` + `DayTimelineCanvas.tsx`、commit `418ab6db`/`a614a62d`/`3da88636`/`7fa063e9`/`3825e786`)。`deriveTitlePlaceGroups`(Step4・`873d2ca1`)。

### 11.2 衝突の核心（3 層）
- **(a) コード重複**: frosty Directions+selectedMode が、正本層の未接続スロットを独自に再実装。
- **(b) 設計哲学の対立**: frosty「raw 複数mode 比較」 vs 正本契約「移動約N分・mode/raw/比較なし」。
- **(c) アーキ乖離**: `frosty ↔ nifty` の **MapTab.tsx 差分 = +30 / −1462 行**(共通祖先 `9afdcaf9`)。frosty=モノリス、nifty=薄い＋hooks。git merge は大規模 conflict。

### 11.3 reconcile の骨格（推奨）
- **データ層 = `lib/plan/transport`(正本)**: frosty の Directions→`google_routes` provider、selectedMode→`manual_user` provider として**スロットに挿す**。
- **UI 層 = frosty の資産**(ガラス線・Lucide・MobilityLegCard)を正本層の出力消費形に。
- **MapTab アーキ = nifty の薄い＋hooks を基盤に frosty UI を載せ替え**(frosty モノリスを正本層へ分解)。
- **やり方 = surgical 段階移行**(共有型/接続を定義 → adapter で寄せる → 検証。big-bang 置換は禁物)。

### 11.4 ★CEO 決定が必要（これが決まらないと合流設計が一意にならない）
1. **表示哲学**: frosty の raw 複数mode比較を**残す**か、正本契約の「移動約N分」保守形に**寄せる**か。
2. **正本の置き場所**: `lib/plan/transport`(既存実体) か、設計契約 §7 の `lib/shared/mobility.ts`(未実装ターゲット) か。
3. **MapTab アーキ**: frosty モノリス基盤 か、nifty 薄い＋hooks 基盤 か。

### 11.5 再検証コマンド（次セッションが裏取り用）
```
git show main:lib/plan/transport/transportTypes.ts            # 正本型・哲学
git show main:lib/plan/transport/movementDisplayContract.ts   # 保守表示契約
git grep -l "alter-morning/transport" main -- lib/plan        # 結合は1点(疎)
git diff --stat claude/frosty-hellman-b3305e claude/nifty-turing-128e67 -- 'app/(culcept)/plan/tabs/MapTab.tsx'  # ~1492行乖離
git show claude/nifty-turing-128e67:lib/plan/timeline-containment.ts  # band(案B)
```
