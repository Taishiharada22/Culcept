# Rich Display Transport Boundary Design（docs-only）

> 設計フェーズ。**コード変更なし**。transport 実装は CEO 承認まで HOLD。
> 上位文脈: A+C（live gate + coarse-status server action）の次。ready の rich display（projection/cues）を production `/plan` へ安全に運ぶ境界。
> 既存基盤: `buildTravelPlanDisplayResult`（pure・display-safe）/ brand 型 firewall / engine-consume の display-safe 保証。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 0. grounding（②検証で前提を 1 つ崩した）

| 検証 | 結果 |
|---|---|
| display packet の `rationale.forParticipant` は cross-viewer 漏洩か？ | **否**。engine-consume.ts:30「viewer の forParticipant は当該 viewer 自身の note のみ＝display-safe」/ packet-types.ts:69「shared 射影では forParticipant を全削除」 |
| `DisplayPacketForClient` の display-safety | `assertDisplayPacketHasNoAuthority`（authoritative:false ∧ executionAuthority:false ∧ private confirmation なし）+ brand 型で**型/engine 強制** |

→ ★ transport の難所は **forParticipant 漏洩ではない**（engine が既に scope 済）。難所は **rich payload を server→client へ運ぶ機構**（PRG では運べない・URL 漏洩・persistence）。不要な「projection-only に絞る」refinement は**不要**と判明（②: 主張前に検証）。

---

## 1. まず前提を疑う（①）

| 候補 | いま着手すべきか |
|---|---|
| **A. rich display transport boundary design**（本書） | **推奨**。PlanClient UI / action 内 engine 実行の**前提となる blocker**。機構を決めないと UI も engine も動かせない |
| B. PlanClient display panel design | **後**（transport 機構が決まってから） |
| C. Tier1 safe links | **後**（HOLD） |
| D. coarse status のまま停止 | 安全だが rich display は永久に出ない。**機構決定が先** |

**推奨: A。** 根拠（①⑤）: chain は display-safe で完成。残るは「ready の projection/cues を **persistence/URL 漏洩なし**に client へ運ぶ機構」。これを決めれば UI（B）と engine 実行が解錠される。

### ★ 機構の核（①③）— transport は persistence を要しない
**Next.js server action の RETURN 値（`useActionState`）**は、rich な display-safe payload を **URL でも persistence でもなく** RPC で client component へ運べる（POST→action 計算→返値を 1 回 serialize）。これは CEO の選択肢 A-G に明記が無い **option H**。E（durable state からの再計算＝persistence）より安全（永続不要）。

---

## 2. 現在の状態（§2）

- server action gate（`isPlanTravelLiveAllowed`・OFF・staging・prod deny）あり。
- permissioned FormData intake（`buildTravelSessionEventsFromFormData`）あり。
- readiness-only coarse-status PRG あり。
- engine/display adapter（`buildTravelPlanDisplayResult`）**あるが action から未呼出**。
- dev preview 3 本が display chain を server-render で実証。
- **rich display transport は無い**。

---

## 3. なぜ transport が難しい（§3・②訂正込み）

- **PRG redirect は rich projection を安全に運べない**（token 専用）。
- **query string は内容を URL/history/共有 URL に漏らす**（rich payload は不可）。
- ~~display result は display-safe でも private-adjacent な forParticipant を含み得る~~ → **②訂正: forParticipant は engine が viewer-scope 済（漏洩しない）**。
- projection を**保存**するには persistence/session 戦略が要る（DB/session）。
- client は **authoritative output を受け取れない**（型 firewall）。
- raw diagnostics は **隠したまま**でなければならない。
- 現 PRG 範型では server action が **React UI を直接返せない**。

---

## 4. transport オプション比較（§4 + option H 追加）

| 案 | 内容 | 評価 |
|---|---|---|
| A. PRG query・coarse status のみ | 現状 | rich なし（現スライス）。安全 |
| B. PRG query に rich projection | URL に payload | ✗ URL 漏洩/history/共有/サイズ |
| C. server-side ephemeral session store | session に保存 | △ persistence-adjacent・信頼性/掃除/プライバシー懸念 |
| D. DB persistence | DB 保存 | ✗ HOLD（CEO §1・transient display に過剰） |
| E. server component が **durable/explicit state から再計算** | GET で再 render | △ **durable intent が要る（persistence/URL）→ HOLD**。dev route と同型の server-render だが intent の持続が課題 |
| F. client-side 再計算 | client が engine | ✗（engine を client で走らせる・raw input が client に要る） |
| G. dev-only preview route | 既存 dev route | 既に proof 済（production transport でない） |
| **H. server action の RETURN 値（`useActionState`）** | action が display-safe payload を返し client component が render | ◎ **採用候補**。**persistence/URL 不要**・display-safe（brand 型保証）・refresh で消えるが「送信→結果表示」UX には十分 |

**推奨: H。** persistence も URL 漏洩も無い唯一の機構。E（persistence 必要）より安全。

---

## 5. 推奨方向（§5）

- **production transport = H（server action RETURN → client component が `useActionState` で render）**。
  - action: gate → permissioned intake → bind → provider → **ready のみ engine（`buildTravelPlanDisplayResult`）→ display-safe payload を RETURN**（not-ready は coarse/ask を RETURN）。**void/redirect でなく値返却**。
  - client: `useActionState(submitTravelLiveIntakeAction)` で返値を render。**engine/adapter を直接呼ばない**・返値は display-safe のみ。
  - **persistence 不要**（返値は RPC で 1 回運ばれ client state に載るのみ・refresh で消える＝再送信で再計算）。
- **E は persistence を要する → HOLD**（durable intent 戦略が別途要る）。H はそれを回避。
- ★ ただし H の**実装は HOLD**: (a) action 内 engine 実行 (b) PlanClient client component（`useActionState`）— **両方とも別 CEO gate**（UI gate）。本 phase は機構決定のみ。

---

## 6. 短期の安全挙動（§6）

- 現 server action は **coarse status のまま**（rich を運ばない・URL に projection を載せない）。
- **action 内で engine を走らせない**（transport 機構が UI と共に承認されるまで）。
- **projection/cues を transport しない**・**PlanClient panel を出さない**。
- **dev preview を視覚 proof として維持**。

---

## 7. 将来の state carrier 評価（§7）

| carrier | privacy | reliability | impl risk |
|---|---|---|---|
| 既存 plan state | △（travel intent は無い） | — | 既存改修要 |
| server action PRG status のみ | ◎（coarse・非private） | ◎ | 低（現状） |
| **action RETURN 値（H）** | ◎（display-safe・非永続） | ◎（送信単位） | 中（UI 結合・engine in action） |
| DB/session persistence | △（保存・掃除） | ○ | 高（CEO §1） |
| server component 再計算（E） | ◎ | ○ | 高（durable intent 要） |
| ephemeral server cache | △ | △ | 中〜高 |

→ **H が privacy/reliability/risk の最良点**（persistence なし・display-safe・送信単位）。

---

## 8. privacy / authority（§8・②検証で display-safe 確認済）

rich display payload は **絶対に含めない**: `AuthoritativePacketForServer` / raw provider diagnostics / raw `TravelPlanEngineInput` / raw `TravelPlanEngineOutput`。projection/cues は **display-only**（brand 型 + `buildTravelPlanDisplayResult` が構造保証・forParticipant は engine が viewer-scope 済）。**executionAuthority なし・booking/calendar/action なし・client-only filtering 禁止**。

## 9. PlanClient 含意（§9）

PlanClient は **display-safe projection/cues のみ** render・**engine を呼ばない**・**adapter を直接呼ばない**・**raw provider input を持たない**・**booking/calendar/send を有効化しない**。**PlanClient panel は transport 解決まで HOLD**（H 採用で `useActionState` 消費が前提）。

---

## 10. 将来 test（§10・実装時）

- rich projection を **URL query に置かない**。
- raw diagnostics を **client へ serialize しない**。
- `AuthoritativePacketForServer` を **境界越えさせない**。
- **provider not ready で engine を呼ばない**。
- display 出力は **server-side で承認済 input から計算した時のみ**（H: action 内・gate 後）。
- **client-side engine import なし**。
- **PlanClient が adapter を直接呼ばない**。
- **明示承認なき DB/session persistence なし**。
- booking/calendar/action なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 11. 次の実装オプション + 推奨（§11）

| 案 | 内容 | 評価 |
|---|---|---|
| A. coarse-status server action のまま停止 | 現状維持 | 安全・progress なし |
| **B. 承認済 transport contract の設計のみ** | 本書が H を確定（payload=`TravelPlanDisplayResult`・action RETURN・no persistence） | **本書で実質充足** |
| C. server component 再計算（既存 durable state があれば） | durable travel intent が**無い**→ persistence 要 | HOLD |
| D. dev-only rich transport route | 既存 dev route が server-render で proof 済 | 追加不要 |
| **E(11). PlanClient display panel（transport 決定後）= H 実装** | action RETURN 化 + `useActionState` panel（OFF flag 裏・staging） | **次スライス候補（HOLD・UI gate）** |

**推奨: 当面 A（coarse status 維持）。** H の実装（action RETURN 化 + PlanClient `useActionState` panel）は **1 つの gated スライス**（engine-in-action と UI を同時に解錠＝CEO UI gate）。本書で transport 機構（H・no persistence）は確定したので、次は CEO が **PlanClient UI gate** を開けるか否かの判断。**E(option) / DB / Tier1 safe links / M2 / 外部 retrieval は HOLD。**

---

## 12. Stop

- 本書（Rich Display Transport Boundary Design）で**停止**。
- transport 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **②検証で前提訂正**: display packet の `forParticipant` は **engine が viewer-scope 済**（漏洩しない）→ transport の難所は forParticipant でなく**運搬機構**（PRG 不可・URL 漏洩・persistence）。不要な projection-only refinement を回避。
- **機構（H 採用）**: **server action の RETURN 値（`useActionState`）**で rich display-safe payload を運ぶ。**persistence も URL 漏洩も不要**（E=persistence より安全）。action は ready のみ engine→display-safe を**返す**（redirect でなく）・client は返値を render（engine/adapter 直呼びなし）。
- **privacy/authority**: payload は projection/cues（display-safe・brand 型保証）のみ・authoritative/raw input-output/diagnostics 厳禁。
- **短期**: coarse status 維持・action 内 engine 実行しない・PlanClient 出さない・dev preview は proof 維持。
- **推奨次フェーズ**: transport 機構は本書で **H に確定**。実装は **PlanClient `useActionState` panel + action RETURN 化を 1 gated スライス**（CEO UI gate・OFF flag・staging・production deny）。当面は coarse status のまま。Tier1 safe links / M2 / 外部 retrieval / route-weather-place / booking / persistence は HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
