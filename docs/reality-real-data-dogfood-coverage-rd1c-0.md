# RD1c-0 — Real Data Dogfood Smoke / Coverage Gap Review（docs-only・CEO 受け入れ + 次方向判断）

- 日付: 2026-06-14 / 作成: real-data dogfood coverage 監査セッション
- 位置づけ: RD1a/RD1b の operator real-data preview（one-off + recurring）を CEO が確認し、**v0 の coverage gap（何が unknown か）を実測**して、**次に Mobility/Place へ進むか、Alter tab へ出すか**を判断する基準を確定する。
- 規律: **コードを書かない**（docs-only）。Alter tab / 本線 / production / notification には進まない（当該セッション新アイデアの実装完了まで production 不可）。
- 上流: RJ2h-0（fixture acceptance）+ RD1a `9672b207` + RD1b `109ccee2`。検証根拠は §2 の RC2a 実装読み取り（RD0 監査）。

---

## 0. 前提（このレビューが確かめること）

real-data preview は**実データだが v0**。RC2a は **place/ETA/route/leaveBy を構造的に unknown/knownFalse にする**（供給が無いため・捏造しない）。よって real dogfood の surface は **「薄い」**（place/出発線/ETA 由来の判断は全て unresolved）。本書は:
1. CEO が one-off + recurring real preview で**実際に何を見るか**を整理し、
2. **どの field が unknown になったか**を実測し（coverage gap）、
3. **次の投資方向**（Mobility/Place で surface を richer にする vs Alter tab で今ある分を出す）を判断する基準を与える。

---

## 1. CEO が見る項目（one-off + recurring real preview）

`/plan/dev-reality-surface` の **real section（あなたの当日）**:
- **counts**: one-off 当日 N 件 / recurring 当日 M 件（除外 X / 不正 Y）。
- **consumerView**: display（render/suppress）+ genericized claim/question（kind のみ・opaque subject）。
- **renderedCopy**: 文面（exact catalog）— observation / status_note / info_incomplete / needs_confirmation / needs_verification / resolve_overlap / resolve_missing_info の該当分。
- **delivery**: eligibility（no_delivery / in_app_passive_eligible）+ deliveredNow=false（届けない）。
- **unavailable**（anchor 0 / 当日 event 0 / assemble 失敗）→ generic reasonCode（fixture へ fallback しない）。

> CEO チェック: real section が fixture と**明確分離**されているか / 当日の予定数が体感と合うか / recurring が正しく当日に出ているか（過剰/過少がないか）。

---

## 2. real-data で unknown になった field 一覧（coverage gap・RC2a 実測・根拠）

| field | v0 実測 | 根拠 | 由来 |
|---|---|---|---|
| **placeCertainty** | **常に unknown** | `compileEventRealityNodes:94`「捏造しない」 | 場所解決の供給なし |
| **movementRequired** | transition なければ **unknown** | `:99-104`「不要を断定しない」 | transition 信号なし |
| **leaveBy** | **常に null**（whyUnresolved） | `:114-119` | ETA なし |
| **route/ETA（routeKnown/etaKnown/leaveByKnown）** | **常に knownFalse** | `compileMovementReality:123-128`「fake 禁止 RJ0.2 §8」 | route/ETA 供給なし |
| **permissionLevel** | 不明 → **blocked(0)**・上限 2 | `:146-150` | origin permission なし |
| **otherPeoplePossible** | companions 無 → **unknown** | `commitmentSignal:114-122` | companions 依存 |
| **reservationOrPaymentPossible** | sensitive medical/legal/exam のみ true / 他 **unknown** | `:131-135` | sensitiveCategory 依存 |
| **fixedness** | rigidity 由来 inferred（**確定はする**） | `:85-87` | anchor.rigidity |
| **sensitiveFlagged** | sensitiveCategory 由来（**確定はする**） | `eventReality:208` | anchor.sensitiveCategory |
| **durationSource** | endTime 有 explicit / 無 assumed_default | `:205` | anchor.endTime |

**結論（coverage gap）**: real-data でも **place / route / ETA / leaveBy / movement は全て unknown**（v0 は供給がない）。**確定するのは時刻・rigidity・sensitive・companions 由来 gate のみ**。surface は「gate と時間衝突」が駆動し、「場所・移動・出発」は駆動しない。

---

## 3. place / route / ETA / leaveBy 欠損の実測（v0 の現実）

- これらは **欠損ではなく「構造的に未供給」**。RC2a は honest に unknown/knownFalse/null を返す（捏造しない）。
- 影響: feasibility は movement 系を **unresolvedCriticalInput** に倒す（unknown）。eligibility は default-deny。decision は observe/ask に寄る。
- よって real surface は **「出発線・遅刻・ルート」を一切語らない**（語る材料がない）。これは**設計通りの誠実さ**であって bug ではない。

---

## 4. companions / sensitive / source の扱い

- **companions** → otherPeoplePossible（高確信 `companions_present`）→ ask 系（confirm_other_people・needs_verification 文面）。**client には raw companions を渡さない**（count/genericized のみ）。
- **sensitiveCategory** → sensitiveFlagged（強 gate）+ reservationOrPaymentPossible（medical/legal/exam）。**category は client に出さない**（needs_verification に潰れる・RJ2d）。DayGraph が sensitive anchor の title/locationText を redact（defense-in-depth・red-team 確認）。
- **sourceId / externalUid** → rigidity provenance（sourceType）・dedup。**internal**（snapshot 由来 hash・client safe DTO に出さない・leak guard 監視）。

---

## 5. dogfood UX（real・v0 の体感）

- [ ] surface が **薄い**（場所/出発/ETA なし）ことが「物足りない」か「誠実で落ち着く」か
- [ ] companions/sensitive のある予定で **needs_verification（確認しますか？）** が出るか・トーンが適切か
- [ ] 同時刻の予定で **resolve_overlap（重なって見える）** が出るか・duplicate 断定しないか
- [ ] 多くの予定が **observe（届けない・passive）** に落ちるか・それが「静かで良い」か「無反応に見える」か
- [ ] recurring 当日が正しく出ているか（過剰/過少/重複がないか）
- [ ] counts（one-off/recurring 当日/除外/不正）が体感と合うか

---

## 6. 次方向の判断基準（Mobility/Place へ進む vs Alter tab へ出す）

### 6.1 判断軸

| 観点 | Mobility/Place を先にやる | Alter tab に先に出す |
|---|---|---|
| 狙い | surface を **richer に**（場所/出発/ETA を unknown から解決） | 今ある surface（gate/時間衝突/observe）を**体験に乗せる** |
| 前提 | RC2a の place/movement 供給を作る（大きい・RD2+） | 現 surface で UX が成立するか（薄くても良いか） |
| リスク | 投資大・supply 設計（origin/route/天気） | 薄い surface でユーザーが価値を感じるか未検証 |
| dogfood 結果が「薄くて物足りない」なら | **これを選ぶ**（surface を厚くしてから出す） | — |
| dogfood 結果が「薄くても誠実で良い」なら | — | **これを選ぶ**（今ある分を磨いて出す） |

### 6.2 推奨（CEO 判断・dogfood 結果次第）

- **dogfood で surface が「価値を感じる」**（confirm/overlap/observe が腑に落ちる）→ **Alter tab への限定接続**（in_app_passive・pull・opt-in・push なし）を次段に。
- **dogfood で surface が「薄すぎる」**（場所/出発がないと判断にならない）→ **Mobility/Place 供給（RD2）**を先に（place 解決 → movement → leaveBy が unknown から動く）。
- どちらも **read-only / pull / 配信なし / production gate 別**を維持。

### 6.3 絶対に進めない線（CEO 専管・session 新アイデア完了まで production 不可）

実 push / 通知 / 外部送信 / 自動送信 / 一斉通知 / メール / production / deploy / DB write / LLM 自由文面化 / active_prompt 配信転用。**dogfood 合格 ≠ 配信合格・本線合格**。

---

## 7. smoke 手順（real・1 回）

1. staging で `REALITY_SURFACE_PREVIEW`/host/staging/operator login → `/plan/dev-reality-surface`。
2. real section の counts（one-off/recurring 当日/除外/不正）が当日の予定と合うか確認。
3. §2 の unknown field が surface に**出ていない**こと（場所/出発/ETA を語らない）を確認 = 誠実さ。
4. §5 UX チェック。
5. devtools network で write/push 0 確認。
6. §6 decision で **Mobility/Place か Alter tab か** を CEO 判断。
7. flag OFF に戻し product UI 不変を確認。

---

## 8. Department Responsibility Matrix（RD1c-0・docs 契約）

| 項目 | 内容 |
|---|---|
| owningDepartment | **Product**（dogfood 受け入れ・次方向）+ **CEO**（投資判断） |
| consultedDepartments | Build（preview 技術）・Communication（文面）・Mobility（place/movement gap）・Permission |
| blockingDepartments | **CEO**（次方向 GO・本線/production は別 gate）+ production gate |
| outputs | RD1c-0 review（見る項目・unknown field 実測・place/route/ETA gap・companions/sensitive/source 扱い・UX・Mobility vs Alter tab 判断基準・smoke）。**コードなし** |
| safetyGate | dogfood 合格 ≠ 配信/本線合格・read-only/pull/deliveredNow=false 維持・unknown は誠実（捏造しない）・raw companions/sensitive/source 非露出・次方向は別 GO・**実配信/production/本線は CEO + 別 gate** |
| traceRefs | RD1a/RD1b real preview / RC2a unknown 実測 / 既存 safe DTO |

---

## 9. 自己判定

- **RD1c-0 は coverage review として ready**。CEO が real preview を見て **§6 で Mobility/Place か Alter tab かを判断**できる。
- **次方向（Mobility/Place 供給 or Alter tab 接続）は各々別 GO・CEO 専管**。dogfood 合格でも配信/production/本線には進まない。
- 革新点（CEO ⑦）: **「薄さ」を bug でなく coverage gap として可視化** — real-data で何が unknown かを実測表で出すことで、「次に何を供給すれば surface が厚くなるか（place→movement→leaveBy）」が明確になり、投資判断が data-driven になる。捏造で穴を埋めず、穴を**正直に測る**のが reality OS の強み。
- code 変更ゼロ・UI/storage/API/DB write/location/notification/external read 不接触・tree clean・production gate 未通過。
