# A2-9 — Weather×Movement Personalization Privacy Review（capture 前の精査）

> 2026-06-09 / Build Unit / ★これは **privacy-by-design のエンジニアリング分析**であり、**法的意見ではない**。
> 私（AI）は法律家でなく、APPI（個人情報保護法）の確定的解釈は **有資格の法務 + CEO** が行う。
> 本書はデータ収集・privacy 設定変更・実装を **一切伴わない**（CEO/法務の判断材料）。

---

## 0. 対象
A2-9 で構想した「本人固有の weather reaction（雨の日のこの人の動き方）」を学習するために、
mobility 観測を `weatherKind`（rain/snow/storm/heat/cold/normal の derived category）でタグ付けする案の privacy 精査。

## 1. データ棚卸し（何に触れるか）
| 種別 | 内容 | 現状 | A2-9 で増えるもの |
|---|---|---|---|
| mode | 移動手段（walk/bicycle/train…） | 既存 MobilityObservation | — |
| timeband / weekday | 時間帯 / 平日週末（非場所） | 既存 | — |
| OD-key | 出発/到着の正規化 location text | 既存（sensitive は redacted で null） | — |
| **weatherKind** | 居住地 day-level の天気 **category** | **無し** | ★**新規タグ**（category のみ） |
| 本人 weather reaction | 「雨の日は普段と違う」推論 | 無し | ★決定時 overlay（保存しない設計も可） |

### ★保存しないもの（設計上の絶対境界）
- raw JMA 文言 / 気温の生値 / 降水確率の生値。
- GPS 座標 / 緯度経度 / office code / 都道府県名 / 住所 / 場所名（weatherKind には含めない）。
- weatherKind は **居住地の day-level 天気** ＝「どこへ行ったか」を露わさない（leg location を持たない）。

## 2. プライバシーリスク分析（privacy-by-design）
1. **生活パターン推論の深化（中リスク）**: 「天気で行動が変わる」は行動プロファイル。timeband/weekday/OD と合わさり生活像が濃くなる。これは Personal Reality Graph の意図そのものだが、機微な個人データ。漏洩時の影響＝詳細な生活パターンの露呈。
2. **location との結合（中リスク）**: weatherKind 自体は非場所だが、既に location を持つ観測（OD-key）を **濃くする**。新たな location は足さないが、プロファイルの解像度が上がる。
3. **sensitive leg（要判断）**: 既存は sensitive 端点で OD-key を redact（mode/timeband/weekday は保持）。weatherKind は非場所だが、redacted 観測まで weather 条件付けに使うと「機微な leg が雨の日に起きた」等の間接推論に寄与しうる → **保守的には redacted 観測を personal 化から除外**。
4. **raw データ（低リスク・既存原則で担保）**: raw GPS 非永続・derived のみ・raw weather 非保存を守れば、生データ起点の再識別リスクは低い。
5. **保管場所（最大の分岐）**: 既存 MobilityObservation は **localStorage（端末内）**。weatherKind も端末内に留めれば **中央集約なし**＝privacy/法務負担が大幅に低い。server/DB に出すと一気に負担増。

## 3. 法的考慮（★高レベル・確定的でない・法務確認要）
- 個人に紐づく行動/生活データは APPI 上の **個人情報 / 個人関連情報**に該当しうる。行動傾向の推論は機微性が上がる。
- **端末内のみで処理（server 収集なし・第三者提供なし）**なら、取得・保管・第三者提供に関する義務は大幅に軽い（本人の端末上の本人データ）。
- ★これは一般的整理であり、**APPI 適用の確定判断は有資格の法務**が行う。本書は技術的論点の提示に留める。

## 4. 緩和策（privacy-by-design 推奨）
1. ★**on-device only**: weatherKind も personal weather reaction も **localStorage（端末内）に留め、server/DB に出さない**（既存 Second Self Map と同姿勢）。= 最大のリスク低減。
2. **derived-only**: WeatherKind category のみ保存。raw weather/GPS/座標/場所/office code は **非保存**。
3. **sensitive 除外**: redacted/sensitive 観測は weather personal 化から **除外**（保守）。
4. **bounded retention**: 既存 60 日 rolling window を継承（無期限蓄積しない）。
5. **sufficient gate**: 条件ごとの最小観測数を満たすまで personal にしない（薄いデータで profiling しない）。
6. **transparency / 撤回**: 「アプリが天気との関係に気づくことがある」を本人に分かるようにし、可能なら **off にできる**（A1-7 の pace opt-in と同思想）。
7. **no export / no transfer**: personal weather reaction は端末外・第三者へ出さない。

## 5. 推奨
- capture を始める場合の**最小・安全な姿勢**＝上記 1–7 をすべて満たす（**端末内・derived・sensitive 除外・bounded・sufficient・透明・非移転**）。これは既存のローカル Second Self Map の privacy 姿勢と一致し、法務負担を低く保つ。
- ★ただし「行動の weather 条件付け」という **新しい推論次元の追加**は、たとえ端末内でも transparency（本人通知）と opt-out を伴うのが望ましい。

## 6. ★CEO / 法務が判断すべき点（stop gate）
1. **そもそも weather×行動の personal 化を収集するか**（製品価値 vs 機微性）。
2. **on-device only を確約するか**（server/DB 同期を将来も行わないか）。
3. **redacted/sensitive 観測の扱い**（除外で確定するか）。
4. **transparency / opt-out UX** の要否と形。
5. **APPI 等の確定的な法的判断**（有資格の法務）。

→ ★本 review は分析まで。**収集・実装・privacy 設定変更・法的確定判断は CEO + 法務**。承認が出るまで A2-9 実装には進まない。

---

## 次
privacy review 提出。CEO/法務の判断（収集是非・on-device 確約・透明性・除外方針）を待つ。承認後、A2-9 mini-design の安全姿勢（端末内・derived・sensitive 除外・sufficient gate）で capture 実装に進める。
