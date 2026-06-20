# P0 Product Freeze Audit — Travel Day Detail / Location Notes / Calendar 日次詳細

- **日付**: 2026-06-20
- **担当**: Build Unit
- **承認**: CEO（採用＝freeze の最終決裁）
- **対象スコープ**: 本セッションで構築した **Concierge 旅行モード プレビュー**（Travel Day Detail＋Location Notes＋Calendar 日次詳細からの導線）**のみ**。他ドメイン（Stargazer / Rendezvous / Alter / Plan 本流 等）は対象外。
- **基準コミット**: `b1393b970`
- **対象コミット（4本）**:
  - `e19d98fd3` Concierge 旅行モード UI プレビュー一式（22 files / +2,880）
  - `123dce3c1` Location Notes 発見タブ一式（Concept 7/12-18）＋下部ナビ刷新（18 files / +1,964）
  - `ec6a8a719` Location Notes 機能接続＋全画面 polish（dead-click 解消・連結準備）（28 files / +913 −256）
  - `e49df6fc5` Location Notes 各タブを参照画像へ忠実化（hero variant＋カード拡張）（10 files / +365 −138）
- **規模**: `app/(culcept)/calendar/_components/travel` ＋ `_lib/travel` ＋ `app/stargazer-travel-preview` = **約 5,623 行**

---

## 0. freeze（採用）の定義 — 本監査における判定対象

本作業は **全 fixture・flag OFF・production hard block・main 未接続** の体験プレビューである。したがって本監査の「freeze」は次の意味に限定する：

> **この UX 仕様・画面構成・内部配線を「採用済みの正本プレビュー」として凍結し、以後は破壊的変更を避け、main 連結フェーズへ進める状態にあるか。**

= 「production へ出荷可能か」ではない（出荷は main 連結後の別ゲート）。判定基準は下記。

| # | freeze 判定基準 | 状態 |
|---|---|---|
| C1 | 参照画像（Concept N）に対し画面構成が忠実 | 🟢 |
| C2 | 型安全（対象範囲で tsc 新規エラー 0） | 🟢 |
| C3 | ランタイム健全（対象フローで console error 0） | 🟢 |
| C4 | dead-click ゼロ（押下要素は全て honest に反応） | 🟢 |
| C5 | honesty 原則遵守（捏造写真/リンク/偽成功表示なし） | 🟢 |
| C6 | State Safety（flag OFF・production hard block・main 非結合・既存退行なし） | 🟡（**P0-1 のみに由来**。他は 🟢） |
| C7 | main 連結の resume ゲートが明文化されている | 🟢 |

---

## 1. 成果物インベントリ

### 1.1 画面（全 fixture・モバイル幅 390px 設計）
- **Concierge Dashboard 7 画面**（`_components/travel/`）: ① Dashboard / ④ Schedule / ② Meal / ③ Reservations / ⑤ Budget / ⑥ Move ＋ 実 Google 地図モーダル `TravelMapModal`
- **Location Notes 9 上部タブ**（`_components/travel/locationNotes/`）: 都道府県▾ / Match / 旅行 / スポット / 王道 / 穴場 / テーマ / 検索 / ＋
- **下部ナビ 4 タブ**: ダッシュボード / スケジュール / 予約 / Location Notes（旧「ガイド」削除・「マイページ」→ Location Notes）
- **詳細シート**: `LocationDetailSheet`（カードタップ→詳細）

### 1.2 共有インフラ
- `concierge/primitives.tsx`: 配色トークン `T`、エレベーション `ELEV`、`FOCUS_RING`、`BottomSheet`（React portal）、`SkeletonBlock`、`ConciergeCard`(interactive)、`TravelBottomNav`
- `PhotoSlot.tsx`: 3 状態（実写真 / placeholder「サンプル」印 / 未設定）＋ loading shimmer
- `state/ItineraryContext.tsx`: 旅程追加ストア（`useTravelItinerary` / `useMergedSchedule`）
- `_lib/travel/itineraryConvert.ts`: LocationItem → ScheduleItem 純変換
- `locationNotes/cards.tsx`: HeroCard(stack/split/overlay variant)・TripRowCard・SpotGridCard 他

### 1.3 データ（正本：京都府）
- `_lib/travel/sampleTrip.ts`（京都2泊3日）、`_lib/travel/locationNotesData.ts`（10 trips + 15 spots + 10 themes）、`types.ts`、`flags.ts`

### 1.4 ルート / 導線
- 検証用公開ルート: **`/stargazer-travel-preview`**（`app/stargazer-travel-preview/page.tsx`、コメントに「TEMP 検証専用・検証後削除」明記）
- Calendar 統合: `CalendarPageClient.tsx:1549` が `onOpenTravel={isTravelDayDetailEnabled() ? … : undefined}` で gate、`DayDetailSheet.tsx:129-136`「旅の詳細を見る」入口（flag ON 時のみ）

### 1.5 フラグ（`_lib/travel/flags.ts`）
- `TRAVEL_DAY_DETAIL_ENABLED` → `isTravelDayDetailEnabled()` は `NODE_ENV !== "production"` で **production 常時 OFF**（line 8 ★production hard block）
- `TRAVEL_MAP_LIVE_ENABLED` → `isTravelMapLiveEnabled()` 同様 production OFF（line 17）。OFF/key 無し時は静的プレビューに fail-open

---

## 2. ドメイン別 freeze readiness

### 2.1 Concierge Dashboard 7 画面 — 🟢 freeze-ready
- 全画面レンダリング・遷移を実機スクショ確認（Dashboard/Schedule/Reservations/Map 等）。
- 参照画像（Concept 4 系: travel/detail/suggestion/booking/budget/move）に対し構成一致。
- dead-click 解消済み（通知/保存=navigator.share/予約変更/相談/Budget 展開/節約/移動 等を honest に配線。`ReservationsScreen.tsx`/`BudgetSnapshotScreen.tsx`/`ScheduleDetailScreen.tsx`/`ConciergeDashboard.tsx`）。
- Walking 進捗をハードコード 62%→実 steps/目標へ（`ConciergeDashboard.tsx`）。
- **現状品質で freeze 可**（CEO 確認済み・2026-06-20）。参照画像への追加「より忠実化」は freeze 懸念ではなく **将来の optional polish** 扱い（ブロッカーでも resume ゲートでもない）。

### 2.2 Location Notes 9 タブ — 🟢 freeze-ready
- 全タブを参照画像（Concept 8/12-18）と照合しスクショ確認。`e49df6fc5` で hero を variant 化（stack=旅行 / split=スポット・穴場 / overlay=王道 / Match 専用2カラム）し構成忠実化。
- 各タブ内「地元民 / 旅行者」分割、検索ライブ絞り込み、テーマ「あなたにも合うテーマ」、＋追加フォーム（2カラム高密度）まで実装。
- 都道府県セレクタが content に追従（他県は全セクション空状態＝honest）。

### 2.3 Calendar 日次詳細 導線 — 🟢 freeze-ready（gate 健全）
- `isTravelDayDetailEnabled()` gate により dev のみ入口表示・production hard block。
- 既存 Calendar（`CalendarPageClient` / `DayDetailSheet`）への変更は導線追加に限定、既存挙動の退行は敵対的レビューで未検出。

### 2.4 共有インフラ — 🟢 freeze-ready
- `BottomSheet` を **React portal（document.body 直下）** 化し、framer-motion transform 祖先による `position:fixed` クリップ問題を根治（都道府県ピッカー／詳細シート）。
- 画面/タブ切替の `AnimatePresence mode="wait"` exit stuck を keyed `motion.div` fade-in に統一（再発バグ根治）。
- `ItineraryContext` は重複ガード・`hasAdded` 反映・`useMergedSchedule` を Dashboard/Schedule 双方で消費 → 「旅程に追加」が両画面に即時反映（実機確認）。**内部公開シグネチャは main 接続時も不変**＝消費側ゼロ改修で差し替え可能。

### 2.5 State Safety / honesty — 🟡（**P0-1 のみに由来**。それ以外は 🟢）
- flag は production hard block、main 非結合、写真は placeholder「サンプル」印、捏造リンクなし、toast は成功/情報を出し分け（偽成功チェック排除）。
- この 🟡 は **§4 P0-1（検証ルートの production gate）の一点に限る**。他の State Safety 項目（flag・main 非結合・honesty・既存退行なし）はすべて 🟢。

---

## 3. 検証エビデンス（本セッション）

| 検証 | 結果 | 根拠 |
|---|---|---|
| tsc（対象範囲） | **0 errors** | `npx tsc --noEmit` を `travel/`・`locationNotes`・`stargazer-travel-preview` で grep、各コミット時に 0（本監査時も再実行） |
| console error | **0** | preview MCP `console_logs(level=error)` で「No console logs」を各フロー後に確認 |
| 主要フロー実機 | **PASS** | 都道府県シート開閉/選択・カード→詳細シート・旅程に追加→Schedule 反映・非京都の空状態・全 9 タブ描画をスクショ確認 |
| 敵対的レビュー | **確定6指摘 全修正** | 3次元（correctness / dead-click+honesty / regression）並列レビュー → critical/high を独立検証。写真 objectURL の早期 revoke・都道府県非追従・Dashboard preview 肥大・toast 成功表示・ThemesView 空 CTA・ConciergeCard interactive a11y を全修正 |
| アーキ健全性 | **確認** | Context の hooks 規則 / createPortal の SSR mounted gate / Escape の stopImmediatePropagation / key 衝突なし（`added-<id>` vs fixture `s1..`） |

---

## 4. P0 freeze ブロッカー（採用＝freeze の条件）

### 🔴 P0-1: 検証用ルート `/stargazer-travel-preview` が production gate を素通りする
- **事実**: `app/stargazer-travel-preview/page.tsx` は `isTravelDayDetailEnabled()` を**参照せず**直接 `TravelDayDetail` を描画する。さらに proxy（`proxy.ts` の `PUBLIC_PREFIXES` `/stargazer`）により **auth 不要の公開ルート**。flag は Calendar 導線（§1.4）には効くが、**このページには効かない**。
- **影響**: production へデプロイした場合、誰でも `/stargazer-travel-preview` で fixture プレビューが閲覧可能になる（「今月の成功条件＝デプロイ可能状態」に抵触）。
- **現状の緩和**: production / push は現在停止中（[GitHub suspended/local only]）。したがって**現時点の実害はゼロ**だが、デプロイ再開時の P0。
- **freeze 条件**: 次のいずれかを採用前に確定 — (a) 検証後にルート削除（page.tsx コメントの既定方針）、(b) `isTravelDayDetailEnabled()` で gate して非 dev は 404/リダイレクト、(c) proxy の公開対象から除外し認証必須化。

> 上記 P0-1 以外に、本プレビューを「採用済み正本」として凍結することを妨げる blocker は検出されていない。

---

## 5. freeze 対象外（意図的に未実施＝main 連結フェーズの作業）

これらは「未完成」ではなく**設計上 freeze 後に行う連結作業**。resume ゲート（§8）で管理する。

- 「旅程に追加」の実バックエンド反映（現状 `ItineraryContext` in-memory）
- 保存(heart) の永続化（現状 session 内 Set。localStorage→Supabase 差し替え点あり）
- 写真アップロード（現状 objectURL プレビューのみ）
- 通知 / 予約変更・キャンセル / コンシェルジュ相談 の実機能（現状 honest toast）
- 京都府以外の都道府県の実データ（現状 空状態）

> 注: Concierge Dashboard 7 画面の参照画像「より忠実化」は **freeze 対象外でも resume ゲートでもない**。現状品質で freeze 可であり、実施するかは将来の **optional polish**（CEO 確認済み・2026-06-20）。

---

## 6. リスク登録簿

| リスク | 重大度 | 緩和 |
|---|---|---|
| 検証ルートの公開（P0-1） | 高 | §4 の (a)/(b)/(c) いずれか。production 停止中で現状実害なし |
| fixture を実データと誤認 | 低 | 写真「サンプル」印・全 toast が honest・他県空状態で明示 |
| HMR キャッシュで新規ファイル未検出（dev のみ） | 低 | dev サーバ再起動で解消（本セッションで確認）。production 無関係 |
| pre-existing ESLint（`MealSuggestionScreen` の `Concierge's` 未エスケープ） | 低 | HEAD 既存・本作業導入でない。owning 機能で別途修正 |
| tsc baseline（リポジトリ全体 55 件）に未触 | 低 | 対象範囲の新規エラー 0。baseline は別レジャーで管理 |

---

## 7. 採用（freeze）判定

**判定: 条件付き GO（CONDITIONAL FREEZE）** — 🟢

- 本セッションの Travel Day Detail / Location Notes / Calendar 日次詳細 プレビューは、構成忠実度・型安全・ランタイム健全・dead-click ゼロ・honesty・敵対的レビュー全修正を満たし、**「採用済み正本プレビュー」として凍結する水準にある**。
- **唯一の条件**: §4 P0-1（検証ルートの production gate）を「採用と同時、遅くともデプロイ再開前」に確定すること。production 停止中の現時点では即時 freeze を妨げない。

---

## 8. freeze ゲート・チェックリスト

採用時に CEO が確認：
- [ ] §4 P0-1 の処置方針を決定（削除 / flag gate / 認証必須）
- [ ] freeze 後は本 UX 仕様・画面構成を「正本」とし破壊的変更を避ける合意
- [ ] main 連結 resume ゲート（下記）を次フェーズ計画に登録

### main 連結 resume ゲート（freeze 後の着手順・推奨）
1. `ItineraryContext` Provider 内部を実 trip API（mutation+optimistic）へ差し替え（消費側ゼロ改修）
2. 保存(heart) を永続化（localStorage→Supabase）
3. Calendar `/plan` の特定日 → `TravelDayDetail` の本接続（day データ実取得）
4. 写真アップロード / 通知 / 予約変更 / 相談 の実機能化
5. 京都府以外の実データ投入 or ピッカーを実データ県のみに限定

---

## 9. 付録 — 参照正本

- 正本画像: main 直下 `app/(culcept)/components/calendar/*.png`（Concept N 連番。Dashboard 系=Concept 4、Location Notes 系=Concept 8/12-18。Concept 7 はファイル不在）
- 関連メモリ: `project_travel-concierge-preview`、`project_github-suspended-local-only`、`project_travel-mode-direction`
