# TripDay データ分類 と E-2 実装方針

**作成日**: 2026-06-22
**ステータス**: ✅ 方針確定（Option 2）+ 派生関数 実装/検証済 / DB 組み立て本体は次スライス（local-only・別途）
**安全**: 本フェーズは DB 接続・Docker・staging/production・flag 点火・env 編集・push 一切なし。

---

## 0. 背景：E-2 着手で判明した schema ギャップ

`SupabaseTravelRepository.getTripDay`（Calendar real-data connection）を実装するため、`TripDay`
全フィールドと Phase D migration を突き合わせた結果、**永続先が無いフィールド**が判明。
fixture（`KYOTO_DAY1`）の実値で各フィールドの「性質」を検証し、long-term の正しいモデリングを決定した。

---

## 1. フィールド分類（fixture 実データ照合）

### A. source-of-truth（Phase D schema が既に保持）✓
trip / day（theme・weather・walking・heroPhoto）/ schedule（itinerary_items）/ reservations /
move.legs（movement_legs）/ memories / photos。→ そのまま DB から取得。

### B. 派生データ（DB に持たず算出）— `tripDayDerive.ts` で実装
| フィールド | 算出元 | fixture 照合 |
|---|---|---|
| `move.summary` | move.legs を mode 別＋全体に集計 | **完全再現**（taxi 約38分/12.8km・walk 約20分/1.5km・bus 約18分/4.3km・総 約76分/18.6km/概算¥4,860 が一致） |
| `reservationStats` | reservations を status/changeable/needsAction で集計 | 算出ロジック検証済（fixture の total=6 は trip 全体・未掲載含む curated ＝ day の 4 件とは別スコープ） |
| `routeStops` | schedule を name/coords/順序/transportToNext.mode に投影 | 座標・順序・件数が一致（fixture の name/mode は地図表示用に手調整＝正本は schedule） |

→ **テーブル化しない**。非正規化・整合性負債・キャッシュ無効化を避ける。

### C. 生成 / 要・別設計（DB に素朴に持たない・後送り）
| フィールド | 理由 |
|---|---|
| `meal`（MealSuggestion） | rating/whyFitsYou/conciergeName 等＝**コンシェルジュ生成**（推薦エンジン出力）。source-of-truth でない。スキーマを未設計エンジンに結合すべきでない |
| `budget`（DayBudget） | 本来 `予算総額 + 支出明細` の正規化が必要。donut/dayComparison/dailyAverage/forecast は**集計+生成**。DayBudget 形をそのまま保存は anti-pattern（支出トラッキング設計が前提） |

---

## 2. 方針決定：Option 2（正しいデータモデリング）

### Option 1（meal/budget/routeStops をテーブル追加）— 不採用
- 派生（routeStops/stats/summary）をテーブル化＝非正規化・整合性バグ・キャッシュ無効化負債。
- budget の素朴な DayBudget テーブル化＝将来 `予算+支出明細` への migration 負債（live DB migration は gated で高コスト）。
- meal のテーブル化＝スキーマを未設計の推薦エンジンに早期結合。
- **結論: long-term コスト大・時期尚早。採用しない。**

### Option 2（source-of-truth 保持 / 派生は算出 / 生成は後送り）— 採用 ✓
- Phase D schema は source-of-truth に対して **正しい**（追加 migration 不要）。
- 派生は `tripDayDerive.ts` で算出（実装・検証済）。
- meal/budget は別レイヤ（推薦エンジン / 支出トラッキング）として後送り。
- **メリット**: スキーマ清潔・migration 負債最小・honesty（保存値のみ DB・派生は算出・生成は明示分離）・段階的/可逆。
- **デメリット**: getTripDay が DB だけで fixture と 100% 同一の TripDay を返せない（meal/budget の供給元が要決定）。→ §4 で CEO 判断を仰ぐ。

---

## 3. 本フェーズの成果（安全・検証済）

- `app/(culcept)/calendar/_lib/travel/tripDayDerive.ts`（pure・DB 非依存）:
  - `computeMoveSummary(legs)` / `computeReservationStats(reservations)` / `deriveRouteStops(schedule)`
  - パース補助 `parseDurationMin` / `parseDistanceKm` / `parseFareYen`
- `tests/unit/plan/tripDayDerive.test.ts`（11 PASS）: 特に move.summary の **fixture 完全再現**で「算出で十分＝DB 不要」を証明。
- tsc 55=baseline・新規 0。

---

## 4. getTripDay DB 組み立ての残課題（次スライス・CEO 判断）

`SupabaseTravelRepository.getTripDay` を実装するには、meal/budget の供給方針を先に決める必要がある:

1. **stopgap=fixture/算出**: 永続フィールド＝DB、派生＝算出、meal/budget＝当面 fixture（明示ラベル）。
   - リスク: 実 schedule と fixture budget が混在＝ユーザーに実予算と誤認させうる（honesty 懸念）。
2. **meal/budget を当面 出さない**: `TripDay` を一部 optional 化（全6画面に型 ripple）。
3. **engine/正規化を設計**: 推薦エンジン + 支出トラッキング（budget総額/明細テーブル）を別フェーズで設計してから DB 化。

→ **推奨**: 当面 1 か 2 のどちらかで「Calendar 実データ（schedule/reservations/move/memories）」を先に通し、
meal/budget は 3 を別フェーズ化。どれを採るか CEO 判断。

### さらに getTripDay DB 実装で必要（すべて別途・gated/local）
- ローカル Supabase で実装・検証（auth セッション + RLS・service_role 不使用）＝**local-only**（Phase D と同じ安全クラス）。
- staging/production apply・flag 点火・API route・env・push は **依然 別 GO**。

---

## 5. ファイル（本コミット）
新規: `app/(culcept)/calendar/_lib/travel/tripDayDerive.ts` / `tests/unit/plan/tripDayDerive.test.ts` / 本書。
