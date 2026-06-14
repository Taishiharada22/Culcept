# T11-H Plan Intelligence Projection Design（PI 投影の安全設計・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only）。
**位置づけ**: G で凍結した consume trust tier（`DisplayPacketForClient` / `AuthoritativePacketForServer`）の上に、
将来 **Plan Intelligence（PI）** が T9 packet（fitSummary / readiness / confirmationQueue / questionQueue /
rationale / contingency）を **どう安全に投影してよいか** を定義する。
**スコープ**: 設計のみ。コード変更なし。**実装・配線・runtime・UI・solver・weather/route API・booking は触らない**。**本レポートで停止**。

---

## §0 設計の核 — PI は G の壁を「継承」する（directive ⑦）

★ **PI の入力を `DisplayPacketForClient` に型固定すれば、PI は authoritative/private を構造的に受け取れない。**
→ PI は **privacy filtering を再実装しない**。除去は既に engine の `toShared*` 射影 + G の display tier で完了している。
PI は **display tier の純下流**であり、authority/privacy 保証は**型から無料で継承**される。
これが本設計の中心思想（「投影層は壁を作り直さず、壁の内側でだけ動く」）。

---

## §1 前提を疑う — 次は PI projection design で正しいか

| 候補 | 評価 |
|---|---|
| **PI projection design** | **★ 採用**。UI/CoAlter 配線の前に「PI が何を投影してよいか」を固定しないと、画面/秘書での fitSummary・confirmation 扱いが曖昧化 |
| UI/CoAlter wiring preflight | 後。PI projection 契約が UI/CoAlter の consume 形を規定する（projection が前提） |
| Bundle 2 fit dominance/ranking | 後。ranking を動かす前に projection の advisory 扱いを固定すべき |
| itinerary DAG / solver preflight | 後。runtime gate 寄り |

**推奨 = PI projection design**。理由: (1) G で tier の型壁は出来たが「**display tier から何を/どう explanation に変換してよいか**」は未定義。(2) UI も CoAlter も PI projection の出力形を consume する想定 → projection が前提。(3) pure・runtime gate を開けない。

---

## §2 Plan Intelligence の役割（境界）

PI は **投影/説明層のみ**。以下では **ない**:
- engine ではない（決定を作らない）。
- authority source ではない（実行権限を持たない）。
- solver ではない（itinerary を作らない）。
- booking layer ではない（予約しない）。
- **privacy filter ではない**（除去は engine/`toShared*` が済ませている・PI は再実装しない）。
→ PI = **安全な packet 出力の上の projection/explanation のみ**。

---

## §3 許可入力

| 入力 | 条件 |
|---|---|
| `DisplayPacketForClient` | ★ 基本入力（client 投影） |
| `ViewerDisplayPacket` / `SharedDisplayPacket` | display alias（viewer/shared） |
| server-filtered authoritative packet | **server 文脈 + 別承認時のみ**（client 投影には使わない） |
| `fitSummary`（advisory bounded） | display packet 内の field のみ |
| shared `rationale.shared` | display rationale |
| shared / viewer-safe `confirmationQueue` | display packet の queue（private 除去済み） |
| `questionQueue` | display packet の queue |
| `fallbackSummary` / `contingencyActive` | display packet の分岐要約 |
| `diagnostics` | **server-safe かつ別承認時のみ**（client 既定では不可） |

---

## §4 禁止入力

- **raw FitResult**（packet に載らない・PI も読まない）。
- **client 文脈での authoritative packet**（型で代入不可・§0）。
- **client display での diagnostics**（既定不可・server-only）。
- **private rationale**（`forParticipant` の他者分）。
- **private confirmationQueue**（display には来ない）。
- `evaluateFit` / `assessReadiness` / `compareProposals` 等 **中間層の直接呼び出し**。
- **raw M2 personalization**。
- **live route/weather/price/availability の仮定**。

---

## §5 投影出力（display packet field → projection card）

| projection 出力 | 由来（display packet） |
|---|---|
| answer card（結論） | `nextAction` + `recommendedProposalId` + `rationale.shared` |
| why this plan（なぜ） | `rationale.shared`（viewer は当該 viewer の `forParticipant` own のみ追加可） |
| what could fail（崩れ方） | `fallbackSummary`（shared 分岐）+ `fitSummary.riskCodes`（advisory） |
| what needs confirmation | `confirmationQueue`（shared/viewer-safe・private 除去済） |
| what we still need to ask | `questionQueue` |
| safer alternative / fallback | `fallbackSummary`（switchToProposalId / fallbackAction） |
| fit advisory note | `fitSummary`（bounded grade/labelCap/mismatchCount/riskCodes/missingFields） |
| readiness warning | `readinessState` + `confirmationQueue`（needs_confirmation 等） |
| privacy-safe viewer rationale | viewer packet の `forParticipant[viewerId]` のみ |
| **no action authority** | `executionAuthority` を actionable に出さない（display は常に false） |

---

## §6 authority 境界

1. PI projection は **executionAuthority を産まない**。
2. **booking/scheduling を有効化しない**。
3. **readiness を override しない**。
4. **`fitSummary` を ranking authority に変換しない**（Bundle 2 未承認）。
5. **shared/viewer packet を authoritative state にしない**。
6. **display/explanation のみ**であり続ける。

---

## §7 privacy 境界

- projection は **client display に shared/viewer packet のみ**使う。
- **authoritative/shared を差分しない**（private 逆推論しない）。
- **private fit/readiness/contingency 理由を漏らさない**（display には来ない）。
- **viewer-only rationale はその viewer にのみ**表示。
- **client-only privacy filtering をしない**（除去は engine 側で完了）。

---

## §8 fitSummary の扱い

- **advisory のみ**。
- **bounded grade / labelCap / mismatchCount / riskCodes / missingFields のみ**表示。
- **raw component 値を出さない**（packet に存在しない）。
- **private signalBasis を出さない**。
- **ranking に使わない**（Bundle 2 承認まで）。
- **fitSummary から entity 詳細を推論しない**（fitSummary は entity/route data を持たない）。

---

## §9 cancelWeather の扱い

- `confirmationQueue` に `weather_reversal_uncertainty` が**見えるときのみ**「確認が必要」と表示。
- **live weather を断定しない**。
- **cancellation policy を断定しない**。
- **booking authority を産まない**。
- **fallbackAvailability ＝「予約して安全」ではない**（concern 緩和のみ）。
- **不確実性の surface / 確認の提示のみ**。

---

## §10 consumer 型の関係

- PI は **`DisplayPacketForClient` を consume**する（authoritative を受け取れない＝§0）。
- 将来 **`PlanIntelligenceProjectionInput` 型**で `DisplayPacketForClient` を **wrap** すべき（例: `{ packet: DisplayPacketForClient; viewerId?: string }`）。
  - → PI は **display tier に型ロック**され、authoritative packet を**引数に取れない**（G の壁を PI 入口まで延伸）。
- **server-only projection input** は将来 server 文脈 PI が必要になったときのみ（`AuthoritativePacketForServer` を wrap・別 GO）。
- **client projection に永続的に不可**: authoritative packet / diagnostics / raw FitResult / private confirmation / private rationale。

---

## §11 将来実装の tests / verification 期待

1. PI projection は **display packet のみ受理**。
2. **authoritative packet は client projection に受理されない**（型・@ts-expect-error）。
3. projection に **executionAuthority が無い**。
4. **fitSummary は advisory のまま**。
5. **private confirmation を表示しない**。
6. **private rationale を表示しない**。
7. **viewer rationale はその viewer にのみ**。
8. **cancelWeather 確認は visible なときのみ**表示。
9. **raw FitResult なし**。
10. **fit/readiness/中間層を直接 import しない**。
11. **no fetch/API/DB/Supabase/UI runtime import**。
12. 既存 **378 travel tests 不変 green**・**tsc baseline 55 不変**。

---

## §12 設計後の実装オプション（比較と推奨）

| Option | 内容 | 評価 |
|---|---|---|
| **A. PI projection pure types only（docs/pure 型）** | `PlanIntelligenceProjectionInput`（DisplayPacketForClient を wrap）+ `PlanIntelligenceProjection`（answer/why/whatCouldFail/needsConfirmation/toAsk/fallback/fitAdvisory/readinessWarning の bounded 出力型）。**型のみ・logic/配線なし** | **★ 推奨**。G の型壁を PI 入口まで延伸・最初の PI/UI 配線が authoritative を渡せない形を**型で固定**。pure・runtime gate を開けない |
| B. UI/CoAlter consume wiring preflight | 実 UI/CoAlter 配線の前段 | A（PI 投影型）後。UI は PI projection を consume する |
| C. Bundle 2 fit dominance/ranking design | fit を ranking に効かせる設計 | projection の advisory 固定後 |
| D. itinerary DAG / solver preflight | solver 前段 | runtime gate 寄り・後 |

**推奨 = Option A（PI projection pure types only・docs/pure）**。理由: G で tier を型壁化した流れを継承し、**PI 入力を DisplayPacketForClient に型ロックする `PlanIntelligenceProjectionInput` と bounded projection 出力型**を pure に定義すれば、PI/UI の最初の配線が **authoritative/private/raw FitResult を投影に持ち込めない**ことを**コンパイル時に保証**できる（G→H の型壁連鎖）。A → B（UI/CoAlter 配線）→ C/D の順。

---

## §13 出力 + CEO 判断請求

- 本書は **PI 投影の安全設計のみ**。実装・配線なし。
- **推奨次フェーズ = Option A（PI projection pure types only・docs/pure・配線は更に別 GO）**。

### CEO 判断請求
1. **PI = 投影/説明層のみ**（engine/authority/solver/booking/privacy-filter でない）という役割定義を承認するか。
2. **PI 入力を `DisplayPacketForClient` に型ロック**し privacy/authority を G から継承する方針（§0）で良いか。
3. **fitSummary は advisory のみ・ranking/execution authority にしない**（Bundle 2 未承認）を確認するか。
4. **cancelWeather 投影**（visible 時のみ確認提示・live 断定なし・fallback は安全保証でない）で良いか。
5. 次フェーズ = **Option A（PI projection pure types only・`PlanIntelligenceProjectionInput` で display tier 型ロック）** で良いか（vs B/C/D）。

実装は CEO 承認まで着手しない（T11-H 設計レポートで停止）。
