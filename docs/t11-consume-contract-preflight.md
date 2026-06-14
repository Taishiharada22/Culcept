# T11 UI / CoAlter / Plan Intelligence Consume-Contract Preflight（消費契約の凍結・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **計画/設計のみ・実装なし**（docs-only）。
**位置づけ**: `fitSummary`（F）と `cancelWeather`→readiness（C7/F）が packet 境界に載った今、将来 UI / CoAlter /
Plan Intelligence / Travel runtime / solver が **T9 出力をどう読んでよいか / 読んではいけないか** を凍結する。
**次の risk は pure logic でなく consumer misuse**（GPT）。配線が始まる前に契約を固める。
**スコープ**: 計画のみ。コード変更なし。**実装・配線・runtime・solver・UI・CoAlter・Plan Intelligence・weather/route API・booking は触らない**。**本レポートで停止**。

---

## §1 前提を疑う — 次は consume-contract preflight で正しいか

| 候補 | 評価 |
|---|---|
| **consume-contract preflight** | **★ 採用**。fit/cancelWeather が境界に載った直後・配線前。誤用 risk を型/契約で先に塞ぐ |
| Bundle 2（fit dominance/ranking 影響） | 後。ranking を動かす前に「誰が何を authoritative として読むか」を確定すべき（動かした後だと consumer 前提が崩れる） |
| itinerary DAG / solver preflight | 後。solver は authoritative packet を consume する想定 → consume 契約が前提 |
| more fit / rationale 強化 | 直交・diminishing returns |

**推奨 = consume-contract preflight**。理由: (1) F で **authoritative packet が private を持つ**ことが確定（§2）→ 誰がどの tier を読むかを誤ると即漏洩。(2) Bundle 2 も solver も「consume 契約」を前提にする。(3) pure・runtime gate を 1 つも開けない。

★ 反証検討: 「consumer は未だ 0（unwired）だから後でよい」→ しかし**最初の配線 PR が契約なしに書かれると境界が崩れる**。契約を先に凍結し、配線 PR を機械的に照合可能にするのが安全。

---

## §2 現在の packet 契約（authoritative vs display-only・**実測検証済み**）

`runTravelPlanEngine` は **3 つ**返す（`TravelPlanEngineOutput`）。**caller がどれをどの trust context へ渡すかが契約の本体**。

### ★ 2 つの trust tier（契約の核）
| tier | 出力 | 性質 |
|---|---|---|
| **T-S（server / pure-authoritative）** | `output.authoritative` + `output.diagnostics` | **private を持つ**・実行権限の正本・**client に出してはならない** |
| **T-D（client / display）** | `output.shared` / `output.viewer` | private 非搭載・`authoritative=false`・`executionAuthority` 構造的 false・**実行権限にできない** |

### authoritative packet が private を持つ証跡（実測）
- `confirmationQueue = rd.requiredConfirmations` → **private-visibility 確認**（`private_constraint_conflict` / private な `weather_reversal_uncertainty`）を含む（`packet-core.ts:136`）。
- `rationale.forParticipant = mergeForParticipant(d,rd,ct)` → **各参加者の private 注記**を含む（`packet-core.ts:124`）。
- `fitSummary`（authoritative）→ grade が **full label（private 反映可）**。
→ ∴ **authoritative packet = T-S のみ**。shared（`forParticipant:{}`・shared 確認のみ・fitSummary は toSharedFitView 由来）と viewer（shared + 当該 viewer の own のみ）= **T-D**。

### packet field 一覧と tier
| field | 中身 | 読んでよい tier |
|---|---|---|
| `authoritative`(bool) | T-S=true / T-D=false | 両 |
| `executionAuthority`(bool) | schedule/reserve/book 可否 | **T-S のみ**（T-D は常に false・権限源にしない） |
| `recommendedProposalId` | 推奨案 id | 両（表示可） |
| `decisionState` / `readinessState` | 状態 | 両 |
| `contingencyActive` | 分岐発火 | 両 |
| `nextAction` | 次の一手 | 両（表示可） |
| `questionQueue` | 聞けば決まる質問 | 両（**T-D は shared 由来のみ**） |
| `confirmationQueue` | 進める前の確認 | **private 含む→ T-S only / shared 版は T-D** |
| `fallbackSummary` | 分岐要約 | 両（T-D は shared 分岐のみ） |
| `blockedReason` | ブロック理由 | 両 |
| `rationale.shared` | 共有説明 | 両 |
| `rationale.forParticipant` | 本人 private 注記 | **T-S only**（viewer は own のみ） |
| `inputError` | 入力致命傷 | 両 |
| **`fitSummary`** | advisory bounded（raw FitResult なし） | T-S=full grade / **T-D=toSharedFitView 由来**・**いずれも権限源にしない** |

---

## §3 許可 consumer と consume 可否

| consumer | 読んでよい | 読んではいけない |
|---|---|---|
| **UI** | `output.shared` / `output.viewer`（display） | `output.authoritative` / `diagnostics` / 中間層（evaluateFit 等）/ raw FitResult |
| **CoAlter** | server/pure orchestration 文脈でのみ `output.authoritative`（権限判定）・client 表示は `shared/viewer` | client 表示文脈での authoritative / fitSummary を authority 化 / fit evidence 捏造 |
| **Plan Intelligence**（未実装） | `shared/viewer` または **server-filtered authoritative**（投影経由） | client-only privacy filter / raw private / 中間層直叩き |
| **Travel runtime**（未実装） | 別 GO 後に `output.authoritative` | GO 前の consume / 副作用 |
| **solver / itinerary**（未実装） | 別 GO 後に `output.authoritative`（決定の正本として） | fitSummary を itinerary data 扱い / entity/route を fitSummary から復元 |

**全 consumer 共通の唯一口 = `runTravelPlanEngine` の output**。中間層（`buildProposals`/`compareProposals`/`decide`/`assessReadiness`/`planContingencies`/`evaluateFit`）を**個別に直接呼ばない**。

---

## §4 禁止 consumer 行為

1. UI/CoAlter から **`evaluateFit` を直接呼ばない**（fit evidence は engine input 経由で供給）。
2. UI から **`buildProposals`/`compareProposals`/`decide`/`assessReadiness` を直接呼ばない**（output のみ）。
3. **shared/viewer packet を権限として使わない**（authoritative=false）。
4. **`fitSummary` を execution authority にしない**。
5. **`fitSummary` を ranking authority にしない**（Bundle 2 未承認・現状 dominance 不変）。
6. **shared field の欠落から private 理由を逆推論しない**（★ authoritative と shared を**差分して private 存在を当てない** — 同一 trust 文脈で両方を持たせない）。
7. **UI で raw FitResult を読まない**（packet に raw は載らない・載せようとした時点で停止）。
8. **派生値から live route/weather/price/availability を断定しない**（`derived_from_connection_state`）。

---

## §5 UI consumption rules

- UI は **`shared`/`viewer` packet を display 目的でのみ**読む。
- `fitSummary` を **advisory 説明**として表示してよい（grade/labelCap/risk/欠落の助言）。**順位付け・予約可否の根拠にしない**。
- `confirmationQueue`（shared 版）/ `questionQueue` を表示してよい。
- **shared packet 単独で booking/scheduling を有効化しない**（executionAuthority は T-S のみ）。
- private fit/readiness シグナルを露出しない（shared/viewer は構造的に private-free だが、UI 側で authoritative を混ぜない）。
- packet 表示から **plan を mutate / action 送信しない**（display only）。

---

## §6 CoAlter consumption rules

- CoAlter は **authoritative packet を server/pure orchestration 文脈でのみ**使う（client 表示文脈に持ち込まない）。
- **`fitSummary` を action authority に変換しない**。
- `questionQueue` から質問・`confirmationQueue` から確認を提示してよい。
- **fit evidence を捏造しない**（caller binding は別途・CoAlter は entity を作らない）。
- **booking/calendar write を別 runtime gate なしに作らない**。

---

## §7 Plan Intelligence consumption rules

- **Plan Intelligence 投影は未実装**（runtime gate）。
- 将来投影は **`shared/viewer` packet または server-filtered authoritative** を consume。
- **client-only privacy filtering をしない**（除去は engine の `toShared*` で済ませる）。
- `fitSummary` は **safe projection（toSharedFitView 由来）でのみ**要約。
- `confirmationQueue` の **visibility を保持**（private を投影で露出しない）。
- **private rationale を漏らさない**。

---

## §8 future Travel runtime / solver 境界

- solver は **別 GO 後にのみ** authoritative packet を consume。
- solver は **`fitSummary` を完全な itinerary data として使わない**（fitSummary は entity data / route choice を**持たない**）。
- **itinerary DAG は別層**（T1A `TravelCandidate`・solver 出力）。
- **booking/reservation/calendar write は別 gate**。

---

## §9 cancelWeather consumer 境界

- UI/CoAlter は readiness 出力（`confirmationQueue` の `weather_reversal_uncertainty`）を**表示・確認提示**してよい。
- **誰も live weather / cancellation policy を断定しない**。
- **`cancelWeather` は fit-core 由来でない**（engine input の純 evidence）。
- `weather_reversal_uncertainty` は **確認まで booking authority を止める**（needs_confirmation→executionAuthority false）。
- **fallbackAvailability は booking authority を grant しない**（concern を緩和するのみ）。

---

## §10 将来実装の tests / verification 期待

1. consumer は **display に shared/viewer packet** を使う。
2. consumer は **raw FitResult にアクセスできない**（packet に存在しない）。
3. **executionAuthority を shared packet から導出しない**。
4. **`fitSummary` は action を有効化しない**。
5. `confirmationQueue` の **privacy（visibility）が保たれる**。
6. **UI/app が fit-core / 中間層を直接 import しない**。
7. **no fetch/API/DB/route/weather import**。
8. 既存 **365 travel tests 不変 green**。
9. **tsc baseline 55 不変**。
（将来配線で追加: authoritative を client に渡さない lint/型 gate・authoritative⊥shared 差分禁止の契約テスト。）

---

## §11 preflight 後の実装オプション（比較と推奨）

| Option | 内容 | 評価 |
|---|---|---|
| **A. UI/CoAlter consume adapter types only（docs/pure 型）** | 消費 tier を**型で非バイパス化**する consume-view 型（例: `DisplayPacket`=shared/viewer のみ・`AuthoritativePacket`=server-only ブランド）。配線はしない | **★ 推奨**。「誰が何を読めるか」を**型レベルで強制**＝最初の配線 PR が境界を破れない。pure・runtime gate を開けない |
| B. Plan Intelligence projection design only | PI 投影の設計 | A（型の壁）後。投影は consume tier を前提にする |
| C. Bundle 2 fit dominance/ranking 影響 design | fit を dominance に効かせる設計 | consume 契約凍結後が安全（ranking 前提を先に固定） |
| D. itinerary DAG / solver preflight docs-only | solver 前段設計 | runtime gate 寄り・A/B より後 |

**推奨 = Option A（consume adapter types only・docs/pure）**。理由: 本 preflight の発見は「**authoritative packet は private を持つ＝ T-S 専用**・shared/viewer＝ T-D」。この tier 境界を**型で非バイパス化**しておけば、UI/CoAlter/PI の最初の配線 PR が authoritative を client に流す事故を**コンパイル時に防げる**（human-OS grade の安全）。A → B/C → D の順。

---

## §12 出力 + CEO 判断請求

- 本書は **consume 契約の凍結のみ**。実装・配線なし。
- **推奨次フェーズ = Option A（UI/CoAlter consume adapter types only・docs/pure・配線は更に別 GO）**。

### CEO 判断請求
1. 本 consume 契約（**2 trust tier: T-S server-authoritative / T-D client-display**・authoritative packet は private を持つので client に出さない）を凍結点として承認するか。
2. **authoritative⊥shared を差分して private を逆推論しない**（同一 trust 文脈に両方を持たせない）を不変として認めるか。
3. **fitSummary は advisory のみ・execution/ranking authority にしない**（Bundle 2 未承認）を確認するか。
4. **cancelWeather consumer 境界**（live 断定なし・確認まで booking 停止・fit-core 非由来）で良いか。
5. 次フェーズ = **Option A（consume adapter types only・型で tier 非バイパス化）** で良いか（vs B/C/D）。

実装は CEO 承認まで着手しない（consume-contract preflight レポートで停止）。
