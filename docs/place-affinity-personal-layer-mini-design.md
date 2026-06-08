# Place Affinity — Personal Layer mini-design + pure engine（P2 readiness・未配線）

> 2026-06-09 / Build Unit / audit + mini-design + safe pure layer 実装（未配線）。新規データ/UI/DB/external なし。

Personal Reality Graph の場所軸：「この人なら今日はどこが合うか」。一般則と本人固有を分離した土台。

---

## 1. audit 要約（既存資産）
- **`lib/plan/compose/placeAffinity.ts`（P1A scorer）= 一般則**: `rerankPlaceAffinity`（pure・fully tested・**完全未配線**）。history/distance/type/freq + persona ±0.05 tie-breaker。fact-gate reason（履歴/最近/距離/予定タイプ）・**人格語 guard 済**。`placeCandidateRanking`(P1A-2a) のみ deploy。
- **既存 place データ（on-device）**: ★`MobilityObservation.destKey`（正規化 place key）= 既に **目的地訪問を捕捉**（timeband/weekday/weatherKind 付き・60日・**sensitive は両端 null で redact**）。coords/GPS/placeId/place-choice reason/place category は **非保存**（locationText は string・category は anchor の locationCategory のみ・Google types は session 限定）。
- **P2 behavioral posterior = ゼロ実装**（これが本タスク）。

## 2. 設計（一般則 vs 本人固有の分離）
| 層 | 中身 | 状態 |
|---|---|---|
| **一般則（P1A scorer）** | distance/type/freq の候補ランキング | 既存・未配線 |
| **本人固有（P2 revealed preference）** | 観測 destKey から「よく行く場所」 | ★本 mini-design で pure 実装（未配線） |
| **条件付き（P3）** | place × weekday/weather/timeband の skew（「今日のあなたなら」） | 次設計（データは weekday/timeband が既存・weather は A2-10 で蓄積中） |

★**belief 非汚染**: P2 は観測を read するだけ。一般則 scorer とは独立。

## 3. 実装した（pure engine・★未配線）
`lib/plan/compose/placeAffinityReadiness.ts`:
- `buildPlaceAffinityReadiness(observations, config)` → `{status, totalVisits, distinctPlaces, profiles[]}`。目的地（destKey）訪問を集計・**redacted 除外**・薄いデータ（totalVisits<8）は not_enough・単発（<2）は profile から除外。
- `PlaceVisitProfile = {placeKey, visitCount, strength: occasional|frequent|habitual}`（実カウント + 定性）。
- `placeAffinityReasonLine(profile)` → **観測トーン**（「よく行く場所のようです」/「ときどき行く場所のようです」・occasional は沈黙）。★**人格診断にしない**（「あなたはこういう場所が好き」断定なし）・数字なし・place 名を埋めない（UI が pair）。
- ★pure・read-only・**未配線**（scorer/UI/決定に繋がない）。9 tests。

## 4. ★安全境界（CEO stop gate 準拠）
- 新規データ保存なし（既存 MobilityObservation を read）。sensitive 除外（redacted・null destKey）。raw GPS/座標/住所なし（placeKey は正規化 text）。
- 人格ラベルなし・偽数値なし・薄いデータで断定しない（sufficient gate）。
- UI 表示なし・DB なし・external API なし・production 非接触。belief 非汚染。

## 5. 次設計（P3 条件付き・safe pure 続行可）
- **place × condition skew**: ある place が weekday/weather/timeband に偏るか（A2-11 weather reaction と同型の readiness）。「雨の日はこの場所を選ぶことが多いようです」（観測トーン）。
- weekday/timeband は既存観測にあり実装可。weather は A2-10 で蓄積中（薄ければ not_enough）。
- ★これも pure/未配線で safe に実装できる見込み（新規データなし）。

## ★stop gate（ここから先）
- P1A scorer の **UI 配線 / P2 を scorer に反映 / place affinity の UI 表示** = user-facing UI stop gate。
- place category 取得（Google Places types 永続化）= 新規データ + external API stop gate。
- DB 永続化（P4）= stop gate。

→ 安全な pure 層（P2 readiness + P3 条件付き）は自律で続行可。UI/配線/新規データ/DB は CEO 判断。

## 次
P2 readiness engine 着地（未配線）→ P3 条件付き skew の pure 実装へ（次設計）。
