# Phase E-0.5 — CalendarTab repository 化 後の UI smoke 結果

**作成日**: 2026-06-22
**対象**: `214c7ce1a`（E-0: TravelRepository 境界・CalendarTab を repository 経由 async load 化）
**結論**: ✅ repository 層 + SSR（本番初期表示）は smoke PASS。client effect の live 実行は**環境制約で未実施**（下記 §3 に正直記載 + コード分析で代替）。

---

## 0. 何を確認したかった（CEO 指定）

1. flag OFF / fixture repository で従来表示と同じか
2. 初回表示で不自然な空白やちらつきがないか
3. 日付切替時に正しい day が出るか
4. loading / async state が破綻していないか
5. unmount 後 setState の警告がないか
6. Travel UI entry flag / 期間判定が壊れていないか

---

## 1. 実施した検証と結果

### A. TravelRepository 単体（`tests/unit/plan/travelRepositoryFixture.test.ts`・7 PASS）
- `FixtureTravelRepository.getTripDay`:
  - 期間内（2026-06-25）→ fixture day を返し、**日付ラベルがクリック日に動的上書き**（date=2026-06-25 / monthDayLabel=6/25 / weekdayLabel=木）。→ **項目3「正しい day が出るか」を repository 層で保証**。
  - 境界（startDate 6/24 / endDate 6/26）両端 inclusive で非 null。
  - 期間より前（6/23）/ 後（6/27）→ null。→ **項目6「期間判定」を repository 層で保証**。
- `getTravelRepository()`: flag OFF（既定）で `FixtureTravelRepository` を返す。consumer 契約（期間内 day 返却）も確認。
- `SupabaseTravelRepository.getTripDay`: skeleton ＝ `TravelRepositoryNotImplementedError` を throw（**実DB接続なし**）。

### B. CalendarTab SSR render contract（`tests/unit/plan/calendarTabTravelSsrContract.test.tsx`・2 PASS）
- now=2026-06-24（fixture 旅行日）でも **flag OFF**:
  - 「旅の詳細を見る」ボタン（`plan-calendar-open-travel`）が**出ない**。
  - 既存 week strip / 月 header / 選択日 anchor（歯医者）が**壊れない**。
- → **項目1「flag OFF で従来表示と同じ」+ 項目2 の初期 HTML 不変**を保証。
  travelTripDay は useEffect 取得ゆえ SSR 初期 HTML に旅行 UI は混入せず、本番（flag OFF）初期表示は完全に従来どおり。

### C. 既存 calendar スイート（回帰）
- `vitest run tests/unit/calendar`: **340 PASS / 17 files**（E-0 で退化なし）。

### D. 型 / baseline
- `tsc --noEmit`: 総 **55 = baseline 同数**、touched/new files に新規エラー **0**。

---

## 2. 各確認項目の判定

| # | 項目 | 判定 | 根拠 |
|---|------|------|------|
| 1 | flag OFF で従来表示と同じ | ✅ | B（SSR で旅行 UI 不在・既存要素健在）+ C（340 PASS） |
| 3 | 日付切替で正しい day | ✅ | A（クリック日でラベル上書き・期間内のみ day） |
| 6 | UI entry flag / 期間判定 | ✅ | A（期間内外で day/null）+ B（flag OFF で entry 非表示） |
| 2 | 初回ちらつき | ⚠ 部分 | B で初期 HTML は不変を保証。flag ON 時の null→populate 遷移は §3（コード分析）で評価 |
| 4 | loading / async 破綻 | ⚠ 部分 | §3（cancelled guard + 例外 catch）で評価。live 実行は未実施 |
| 5 | unmount 後 setState 警告 | ⚠ 部分 | §3（cleanup の cancelled guard）で評価。live 実行は未実施 |

---

## 3. 正直な未実施事項と代替評価（項目 2/4/5 の client effect）

### なぜ live 実行できなかったか
- **ブラウザ smoke は auth wall**: `/plan` は未認証で `/login?next=/plan` にリダイレクト。`.env.local` は
  staging（`hjcrvndumgiovyfdacwc`）を指し、ログインには実認証情報が必要（アカウント作成/パスワード入力は禁止）。
- **DOM テスト環境が未導入**: `jsdom` / `happy-dom` / `react-test-renderer` いずれも未インストール。
  本リポジトリの component テストは **`renderToStaticMarkup`（SSR・effect 非実行）専用**の方針。
  → useEffect を走らせる client smoke は、依存追加なしでは実行不能。E-0.5 の範囲で依存追加は行わなかった。

### コード分析（実コード `CalendarTab.tsx` 由来・項目 2/4/5）
```ts
const [travelTripDay, setTravelTripDay] = useState<TripDayResult | null>(null);
useEffect(() => {
  if (!isTravelDayDetailEnabled()) { setTravelTripDay(null); return; } // flag OFF 即 null
  let cancelled = false;
  void getTravelRepository().getTripDay(selectedDate)
    .then((r) => { if (!cancelled) setTravelTripDay(r); })   // ← unmount/再実行後は no-op
    .catch(() => { if (!cancelled) setTravelTripDay(null); }); // ← reject も飲み込み破綻なし
  return () => { cancelled = true; };  // cleanup
}, [selectedDate]);
```
- **項目5（unmount setState 警告）**: cleanup で `cancelled=true` → 解決時 setState を実行しない。React 19 は
  unmounted setState を no-op 扱いだが、本実装はそもそも setState 自体を抑止。
- **項目4（async 破綻）**: `.catch` で reject を飲み込み null へ fail-soft。fixture 実装は同期解決のため reject 経路は実質発生しない。
- **項目2（ちらつき）**: 初期 state は null（SSR と一致＝初期 HTML 不変）。flag ON 時のみ次 tick で null→day に遷移しうるが、
  fixture は `Promise.resolve` で即解決。**本番は flag OFF のためユーザーに遷移は発生しない**。

### 残リスク（小）
- flag ON（dev/preview）での「null→populate」一瞬の遷移は、live では未目視。実害は flag ON 時のみ・本番無関係。
- 必要なら次のいずれかで補完可能（CEO 判断）:
  (a) DOM テスト環境（jsdom 等）を dev 依存として追加し client effect テストを常設、
  (b) 認証済みローカルで flag ON の手動目視。
  E-0.5 ではどちらも未実施（範囲外）。

---

## 4. 禁止事項の遵守

Supabase 実装本体 / API route / DB write / migration / staging・production apply / `.env` 編集 /
origin・main push — **いずれも未実施**。
- preview は launch.json に **一時 smoke config** を追加して試行したが auth wall で到達不可と判明 → **config は元に戻し（commit せず）**、`.env` ファイルは不変。

---

## 5. 追加ファイル（E-0.5）

- `tests/unit/plan/travelRepositoryFixture.test.ts`（repository 単体）
- `tests/unit/plan/calendarTabTravelSsrContract.test.tsx`（SSR render contract）
- `docs/travel-calendar-repository-e0_5-smoke.md`（本書）

## 6. 次

E-0.5 の repository/SSR smoke PASS により、**E-1（ItineraryContext / LocationNotesScreen の repository 化）**へ進行可。
E-1 も fixture 既定・flag OFF・Supabase skeleton 止まり・実DB接続なし。
