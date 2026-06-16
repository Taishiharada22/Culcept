# D — Durable Travel State / Persistence Preflight（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。実 DB/migration は **CLAUDE.md §1（CEO 承認必須）**。
> 上位文脈: C Tier1-A（inert safe-link metadata）完了後。href/Maps 生成/production deny の前に「何を durable に持つか」を確定。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **D. durable state / persistence preflight**（本書） | **推奨・次（設計のみ）**。href/Maps/production deny の前に **durable 状態モデル**を確定するのが筋。実 DB は §1 ゆえ実装 HOLD |
| Tier1-B href / Tier1-C Maps 生成 | 後（外部遷移/生成 gate・refresh-safe が要るなら D 先行が安全） |
| F M2 / G CoAlter | 後（各 runtime gate） |
| E production deny release | **最後** |

**推奨: D 次・docs-only。** 根拠（①⑤）: 現 UX は `useActionState` で **ephemeral**（refresh で消える）。href/Maps を「表示」し始める前に「**何を store してよいか（= input intent のみ）/ 何を recompute するか（= engine/display）/ 何を絶対 store しないか（= authoritative/raw/private-client）**」を確定すべき。実 DB は §1（migration 承認）ゆえ本 phase は**モデル定義のみ**。

---

## 2. 現在の ephemeral 状態（§2）
| 状態 | 寿命/層 |
|---|---|
| TravelLivePanel action state / `TravelLiveActionState` | **ephemeral**（useActionState・refresh で消える・client） |
| `DisplayPacketForClient` / `PlanIntelligenceProjection` / `CoAlterProjectionCue[]` | **client-display only**（ephemeral・display tier） |
| `SafeTravelLinkIntent` inert metadata | ephemeral（現状どこにも保存しない） |
| engine output（`TravelPlanEngineOutput.authoritative` 等）/ provider diagnostics | **server-only**（client へ出ない・保存もしない） |
- refresh で消える: action state / projection / cues / safe-link intent。
- server-only: authoritative packet・diagnostics・provenance・private slot。
- client-display only: projection / cues / DisplayPacketForClient。

---

## 3. persistence problem（§3）
- `useActionState` 結果は **ephemeral**・**refresh で失われる**。
- href/handoff 候補は、将来「表示」するなら **安定 source** が要る。
- **production deny release（E）には一貫した state モデル**が要る。
- **DB persistence は hard gate（§1）**。
- store しすぎ → private/authoritative leak。store しなさすぎ → travel が使えない。

---

## 4. 候補 state クラス（§4）
- **A. input intent**: destination / date・dateRange / participantIds / budget / pace / mobility / red_line / soft_preference。
- **B. provider state**: ready / not_ready_missing / not_ready_unconfirmed / unavailable / invalid。
- **C. engine output**: `TravelPlanEngineOutput` / `AuthoritativePacketForServer`。
- **D. display output**: `DisplayPacketForClient` / `PlanIntelligenceProjection` / `CoAlterProjectionCue[]`。
- **E. entity/link**: `SafeTravelLinkIntent` inert metadata / 将来 href・Maps 生成 URL。
- **F. private**: private red_line / private rationale / raw diagnostics / M2-Stargazer 由来 private enrichment。

---

## 5. storage eligibility（§5）
| クラス | 方針 |
|---|---|
| A 入力（**shared 部分**: destination/date/budget/pace/mobility/shared descriptor） | **将来 persist 可**（owner=auth user・RLS） |
| A 入力（**private 部分**: visibility:private の red_line/soft_preference） | **server-only/RLS・private-marked**（client-readable table に出さない） |
| participantIds | **data として store しない**（auth user から再導出・B で identity は auth 由来） |
| B provider state | **recompute 可**（store 不要・input から再計算） |
| **C engine output / authoritative** | **絶対 persist しない**（server-only・recompute） |
| **D display output** | **ephemeral 既定**（明確な cache 理由が無い限り store しない・input から recompute） |
| E `SafeTravelLinkIntent` | **inert metadata としてのみ persist 可**（href/action 化しない・将来） |
| **F private（rationale/diagnostics/M2-private）** | **client-readable に絶対 persist しない**（server-only・必要時のみ RLS+private mark） |

→ **recompute > store**: engine/display は durable input から再計算（保存しない）。

---

## 6. 推奨 durable モデル（§6）
- **まず structured input/session intent（A の shared 部分）のみ persist**。
- engine/display は **durable input から recompute**（必要時）。
- **raw `TravelPlanEngineOutput` を初期 persist しない**・**`AuthoritativePacketForServer` を persist しない**・**raw diagnostics を persist しない**・**private rationale を client-readable table に persist しない**。
- `SafeTravelLinkIntent` は **inert metadata としてのみ**（href/action でなく）将来 persist 可。
- display projection は **ephemeral のまま**（明確な cache 理由が無い限り）。

---

## 7. RLS/privacy（§7・DB が later 承認された時）
- **row ownership = auth user**。multi-person 後は participants-based read policy。
- **service_role runtime write なし**。
- **client-only privacy filtering 禁止**（server filter）。
- **private field は server-filtered**・public 露出なし・**raw userId 非表示**。
- 各 field を **shared / private / server-only** で監査（保存スキーマに provenance/visibility を持たせる）。

---

## 8. Tier1 safe links との関係（§8）
- Tier1-B/C は、production UX が refresh-safe を要するなら **ephemeral action state だけに依存しない**（durable input から recompute）。
- persist された safe-link metadata は **href gate が開くまで inert のまま**。
- 生成 Maps URL は **store でなく confirmed destination/entity から recompute** が望ましい。
- どの external link state も **booking/availability を含意しない**。

## 9. M2 との関係（§9）
- M2 soft enrichment は **HOLD**・M2 private 出力を **盲目的に persist しない**・M2 は **destination/date を hard-confirm しない**・persist する場合は **provenance/private mark 必須**。

## 10. CoAlter との関係（§10）
- CoAlter runtime は **HOLD**・shared multi-person state は **別の participant/consent モデル**が要る・現 solo travel state は **CoAlter pair state を仮定しない**・**`/talk` なし**。

---

## 11. 実装オプション + 推奨（§11・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| A. persistence docs only / freeze | 本書でモデル確定・実装せず凍結 | ◎ 最安全（実 DB §1） |
| **C. local in-memory travel session repository test harness** | **pure in-memory**（Map）で「input intent を持ち→display を recompute」を模す・**DB/Supabase/migration なし**・never-persist firewall を test | ◎ **推奨 first code slice**（DB gate を開かず durable モデルを検証） |
| B. pure persistence schema types only | 保存スキーマ型（visibility/provenance 付） | C と併用可 |
| D. SQL schema/RLS design docs-only | 実 DB スキーマ設計 | **HOLD**（§1・実 DB 直前） |
| E. DB migration draft | migration | **HOLD**（§1・CEO 承認必須） |
| F. persistence せず Tier1-B へ | ephemeral のまま href | 代替（refresh-safe を後回し） |

**推奨: A（docs/freeze）を posture とし、forward motion を取るなら C（pure in-memory session repository test harness）。**
- C は **real DB を一切触らず**（in-memory Map・process 内 ephemeral）、「**input intent のみ保持 → engine/display を recompute**」「**authoritative/raw/diagnostics/private-client を保持しない**」を pure に検証。SQL/RLS（D）・migration（E）は **§1 HOLD**。
> ★ premise note: C は「durable モデルの contract harness」であって **real persistence ではない**（process 再起動で消える）。real 永続は DB（§1・CEO 承認）。

---

## 12. 将来 test（§12・実装時）
- 保存モデルは **`AuthoritativePacketForServer` を含めない**。
- 保存モデルは **raw `TravelPlanEngineOutput` を含めない**。
- 保存モデルは **raw diagnostics を含めない**。
- 保存モデルは **private red_line を client へ露出しない**。
- **保存 input から display output を recompute できる**。
- `SafeTravelLinkIntent` は **persist 後も inert**。
- **persist された Tier1-A metadata から href を生成しない**。
- DB later 時 **RLS が非 owner read/write を block**。
- **service_role runtime write なし**。
- **booking/calendar/action authority なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. Stop
- 本書（D Durable Travel State / Persistence Preflight）で**停止**。
- persistence 実装は **CEO 承認まで行わない**（実 DB/migration は §1）。

---

## 出力サマリ
- **前提（①）**: D 次・docs-only。現 UX は ephemeral（useActionState）。href/Maps/production deny の前に durable モデルを確定。実 DB は §1 ゆえ実装 HOLD。
- **durable モデル**: **input intent（shared 部分）のみ persist 候補**・engine/display は **recompute**・**authoritative/raw output/diagnostics/private-client は絶対 persist しない**・SafeTravelLinkIntent は **inert-only**・private は server-only/RLS。participantIds は auth から再導出（data 保存しない）。
- **RLS/privacy（DB later 時）**: owner=auth user・no service_role write・private server-filtered・no raw userId・field 単位で shared/private/server-only 監査。
- **推奨次スライス**: **A（docs/freeze）** を基本、forward なら **C（pure in-memory session repository test harness・DB 不触）**。**D(SQL/RLS) / E(migration) は §1 HOLD**。Tier1-B/C・F・G・production deny も HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
