# A2-9 — Weather Personalization mini-design（audit + 設計のみ・★実装しない）

> 2026-06-09 / Build Unit / ★これは **mini-design**。実装・新規データ保存・DB・external API・personal化実装は **しない**。
> 一般則 weather modifier（A2-8・全員共通）と、本人固有の weather reaction を **分離**する設計を示し、stop する。

---

## 1. 目的（前提を疑う）
A2-8 の weather tilt は **一般則**（雨/雪/荒天/暑さ → 全員 tightens slight）。だが人によって天気への反応は大きく違う：
- 雨でも自転車を変えない人 / 雨だと電車に切り替える人 / 雨だと予定を間引く人 / 雨で時間がかかる人。
これは Mischel-Shoda の **if-then signature**（「もし雨なら、この人はこうする」という本人固有の条件付き行動）。
→ Personal Reality Graph の核は「**あなた固有の天気反応**を知っている」こと。一般則からの卒業。

## 2. audit（現状・read-only）
- **weather tag は既存ストアに無い**。`MobilityObservation`={mode, timeband, weekday, originKey, destKey, privacyClass}（timeband/weekday は持つが **weather なし**）。`MovementEvent`=derived durations（weather なし）。
- 既存の privacy 設計: sensitive 端点 → originKey/destKey を null・privacyClass="redacted"（場所 linkage を残さない）。timeband/weekday/mode は **非場所情報ゆえ保持**。
- ★**本人の weather reaction を学ぶには、観測を weather で条件付ける新規タグが要る** → これは**新規データ保存**＝stop gate。

## 3. 設計（分離アーキテクチャ）

### 3-1. 二層に分ける（belief を汚さない）
| 層 | 中身 | 性質 |
|---|---|---|
| **belief（repertoire）** | 「あなたの一般的な mode 習慣」 | weather-free のまま（**汚さない**）。既存 L1-b。 |
| **一般則 weather modifier（A2-8）** | 雨/雪/荒天/暑さ → tightens slight（全員） | 既存・fallback。 |
| **★personal weather reaction（A2-9 将来）** | 「あなたは雨の日、普段と違う動きをする」 | **決定時の overlay**（A2-4 density baseline と同型）。belief に焼き込まない。 |

★personal reaction は **belief を書き換えない**。決定時に weather-tagged 観測から算出し、表示にだけ効く conditional overlay（Mischel if-then を decision-time で表現）。

### 3-2. personal weather reaction の算出（設計・honest gate）
- 単位: OD×mode（既存 repertoire と同じ粒度）× weather 条件（rain/snow/storm/heat/normal）。
- 比較: 「雨の日の mode/pace 分布」vs「その人の普段の分布」。**notable に違えば** personal reaction（grounding="personal"）。
- ★**sufficient gate**（A2-4 と同思想）: weather 条件ごとに最小観測数（例 N≥3-5 日）を満たすまで personal にしない → **一般則 fallback**（薄いデータで断定しない）。
- 偽数値を出さない: 定性（「雨の日はいつもより電車寄り」等）のみ・確率/係数なし。

### 3-3. capture 設計（★新規データ＝実装しない・stop gate）
- `MobilityObservation` に optional `weatherKind?: WeatherKind` を足す案（**derived category のみ**）。
- ★**絶対に保存しないもの**: raw JMA 文言/数値、気温の生値、GPS 座標、緯度経度、office code、場所名。保存は **WeatherKind（rain/snow/storm/heat/cold/normal）category だけ**。
- weatherKind は **居住地の day-level 天気**＝その人の「どこへ行ったか」を露わさない（leg location を含まない）。
- 取得源は A2-6 の `useTodayWeather`（既に dev-gated・fail-open）。

## 4. ★sensitive / location / raw の明確化（CEO 判断点）
1. **raw weather**: 保存禁止。derived WeatherKind category のみ。UI にも JMA 生文言を出さない（A2-8 同様）。
2. **location**: weatherKind は居住地 day-level ゆえ leg location を露わさない。ただし「天気で行動が変わる」分析が間接的に生活パターンを示す可能性 → privacy review が要る（CEO/法務）。
3. **raw GPS**: 不関与（観測は derived・raw GPS 非永続の既存原則を維持）。
4. **sensitive leg**: privacyClass="redacted" の観測に weatherKind を付けるか否かは **privacy 判断点**（weatherKind 自体は非場所だが、保守的には redacted 観測の条件付け分析を控える選択もあり）→ CEO。

## 5. ★stop（mini-design でここまで）
本 A2-9 を実装に進めると、以下が **すべて stop gate** に該当する：
- **weatherKind の新規タグ保存** = 新規データ保存。
- **sensitive/location privacy 判断**（redacted 観測の扱い・生活パターン推定の是非）= privacy 判断。
- **personal化ロジック実装** = CEO が「やる」と決めるまで保留（CEO 明示「personal化実装はまだしない」）。
- 将来 weather を movement に正確に紐付けるなら、観測時の天気確定（過去日の天気保存）に **DB or 蓄積**が要る可能性。

→ ★**A2-9 は audit + 本 mini-design で停止**。実装・新規データ・DB・privacy 判断は CEO 承認後。

## 6. 推奨（CEO への提案）
- まず **一般則 weather（A2-8）を dogfood で観測**し、本人反応の personal 化が「体感で必要」と確かめてから capture を始めるのが安全（薄いデータで personal 層を作らない）。
- capture を始める場合の最小・安全な第一歩は「`MobilityObservation.weatherKind?`（category のみ）を **記録だけ**始める（personal 反映はしない）」= A1 系で実績のある「先に安全に観測を貯める」型。だが新規データ保存ゆえ CEO 承認が要る。

---

## 次
A2-9 mini-design で停止。CEO 判断（capture を始めるか / 一般則のまま dogfood 継続 / privacy review / 別テーマ）を仰ぐ。
