# G — CoAlter Display / Runtime Boundary Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。CoAlter runtime は **HOLD**。
> 上位文脈: 候補/表示/M2 enrichment 完了後。CoAlter が Travel の display/cue を**どこまで**消費してよいかの境界。
> 既存資産: `CoAlterProjectionCue[]`（display-safe）/ `deriveCoAlterProjectionCues` / `CoAlterCuesPreview`（dev・read-only）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間超え革新 ⑦世界トップシェア。

---

## 0. grounding
- `CoAlterProjectionCue` = `{ action: ask_question|ask_confirmation|note_risk|show_fallback|explain_plan; source; ref:string（display-safe enum/label/id のみ・raw/private なし） }`（coalter-projection-consume-types.ts:64）。
- `deriveCoAlterProjectionCues(projection)` → cues（pure・display tier）。`CoAlterCuesPreview.tsx`（dev）= **read-only cue 表示の既存 precedent**。
- `TravelLiveActionState` ready → `display.cues: CoAlterProjectionCue[]`（既に display-safe）。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **G. CoAlter display/runtime boundary**（本書） | **推奨・次（設計のみ）**。CoAlter が travel に越境して runtime/action 化しない **firewall** を定義 + 既存 cue を read-only 表示。低リスク |
| Tier1-B href | 後（外部遷移 gate・製品 terminal だが外部） |
| SQL/RLS persistence | 後（§1） |
| M2 production merge wiring | 後（CEO: production action へ merge しない） |
| E production deny release | **最後** |

**推奨: G 次・docs-only。** 根拠（①⑤⑥）: cue は既に display-safe に導出済（`deriveCoAlterProjectionCues`）。G は「CoAlter は travel の **display tier（cue/projection）を read-only 消費するだけ**・runtime（useCoAlter/`/talk`）や action（booking/send）には**ならない**」を境界として確定する firewall。これで CoAlter の travel への scope-creep を構造的に防ぎつつ、cue を panel に read-only 表示できる。

### ★ 設計の核（⑥）— CoAlter は travel の display 消費者であって runtime/executor でない
CoAlter for travel = **display/proposal consumer of display-safe cues**。会話 runtime でも action executor でもない。4 tier（display / server-only / runtime / action）のうち、travel で CoAlter が触れてよいのは **display tier（read-only）のみ**。runtime/action は explicit gate まで HOLD。

---

## 2. 現在の CoAlter-safe 資産（§2）
- `PlanIntelligenceProjection`（display-safe）・`CoAlterProjectionCue[]`（display-safe）・`deriveCoAlterProjectionCues`（pure）・`TravelLivePanel` display-safe state・`TravelLiveActionState`・`CoAlterCuesPreview`（dev・read-only）。
- **display-only**: projection / cues。
- **runtime HOLD**: useCoAlter / `/talk` / CoAlter orchestration。

---

## 3. CoAlter role オプション（§3）
| 案 | 分類 |
|---|---|
| **A. client display-only cue reader** | ◎ later 低リスク（本書の推奨方向） |
| B. server-side proposal/question composer | server boundary 要（後） |
| C. runtime CoAlter conversation agent | **runtime gate（HOLD）** |
| D. action executor | **explicit action authority まで禁止** |

→ travel での CoAlter は **A（display-only cue reader）**から。B は別 server 設計、C は runtime gate、D は禁止。

---

## 4. 許可される CoAlter display 消費（§4）
- `PlanIntelligenceProjection` を **display 文脈で read**。
- `CoAlterProjectionCue[]` を **display/proposal 文脈で read**。
- 表示してよい cue: `ask_question` / `ask_confirmation` / `explain_plan` / `note_risk` / `show_fallback`。
- **proposal/display only**・**execution authority なし**・**booking/calendar/action authority なし**・**send/realtime/read receipt なし**。

## 5. 禁止される CoAlter 挙動（§5）
client 文脈で `AuthoritativePacketForServer` を消費しない / raw `TravelPlanEngineOutput`・`TravelPlanEngineInput`・`FitResult`・provider diagnostics を消費しない / 欠落 field から private rationale を推論しない / fit evidence を捏造しない / booking・calendar write を作らない / **useCoAlter を呼ばない** / **`/talk` を呼ばない** / メッセージ送信しない / read receipt を立てない / **M2 runtime を呼ばない** / pair/partner identity を作らない。

## 6. trust tier（§6）
| tier | 内容 | travel での CoAlter |
|---|---|---|
| **display** | PlanIntelligenceProjection / CoAlterProjectionCue[] / (必要なら)DisplayPacketForClient | ✅ **read-only OK** |
| **server-only** | AuthoritativePacketForServer / provider diagnostics / private M2 enrichment / private readiness・fit rationale | ❌ client で触れない |
| **runtime** | useCoAlter / `/talk` / server-authoritative CoAlter orchestration | 🔴 **HOLD** |
| **action** | booking / calendar / send / realtime / read receipt | 🔴 **HOLD/禁止** |

→ **runtime + action tier は HOLD**。display tier のみ read-only 可。server-only は client へ出さない。

## 7. TravelLivePanel との関係（§7）
- 現 panel は cue を **read-only 表示**してよい。
- **CoAlter runtime 呼び出しなし**・**input box なし**・**send button なし**・**「Alterが実行します」copy なし**・**booking/schedule/action affordance なし**・**raw diagnostics なし**・**private M2 text なし**・**raw userId なし**。

## 8. 既存 CoAlter/talk work との関係（§8）
- 旧 `/talk` thread は **Travel session root でない**。
- `CoAlterPlanSession` participant model は**分離のまま**。
- CoAlter runtime **HOLD**・M2-B-2 **HOLD**・relation_context shared **HOLD**・pair state 仮定なし・thread-derived identity なし。

## 9. privacy（§9）
CoAlter display path は **display-safe projection/cues のみ**使用 / cue text に **private M2 enrichment なし** / shared cue に **private red_line/rationale なし** / **client-only filtering 禁止** / viewer-only note は明示安全時のみ viewer へ / **authoritative/shared diffing なし** / **raw diagnostics なし**。

## 10. copy ルール（§10）
- **許可**: 「追加で確認したいこと」「この点を確認してください」「この案の注意点」「代替案があります」「これは予約・確定ではありません」。
- **禁止**: 「実行します」「予約します」「確定します」「送信します」「既読にします」「自動で進めます」「この案に決定」。

---

## 11. 実装オプション + 推奨（§11・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| A. docs-only freeze | 本書で境界確定 | 安全 |
| B. pure CoAlter display-consume types 精査 | 型のみ | 補助 |
| **C. read-only CoAlter cue 表示（Travel panel・runtime なし）** | `display.cues` を panel ready view に read-only 表示（cue action→中立 copy・input/send/runtime なし） | ◎ **推奨 minimal slice** |
| D. dev-only cue preview polish | 既存 CoAlterCuesPreview 改善 | 補助 |
| E. server-side CoAlter orchestration preflight docs | server 設計 | 後 |
| F. useCoAlter runtime design | runtime | **HOLD** |

**推奨: C（read-only cue 表示・runtime なし）。**
- `TravelLiveReadyView` に `display.cues` を read-only で表示（action→中立 copy: ask_question→「追加で確認したいこと」/ ask_confirmation→「この点を確認してください」/ note_risk→「この案の注意点」/ show_fallback→「代替案があります」/ explain_plan→補足）。
- **input box / send / useCoAlter / `/talk` / booking / action affordance なし**・**raw ref を出さない**（中立ラベルのみ）・既存 OFF gate 下。
- runtime（E/F）・action は HOLD。

---

## 12. 推奨初期実装候補（§12）
- `CoAlterProjectionCue[]`（= `display.cues`）の **read-only 表示** を TravelLivePanel ready view（or dev preview）に。
- **no runtime / no useCoAlter / no `/talk` / no input box / no send/realtime/read receipt / no booking/calendar/action**・既存 display-safe cues のみ・**default-OFF / gated**（panel は既に live gate 下）。

## 13. 将来 test（§13・実装時）
- CoAlter display は **`CoAlterProjectionCue[]` のみ**消費。
- **`AuthoritativePacketForServer` を受けない**。
- **useCoAlter を import しない**・**`/talk` を import しない**・**engine/provider/M2 runtime を import しない**。
- **send/realtime/read receipt UI なし**・**booking/calendar/action button なし**。
- **禁止 copy なし**・**private M2 text なし**・**raw diagnostics なし**・**raw userId なし**。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 14. Stop
- 本書（G CoAlter Display / Runtime Boundary Design）で**停止**。
- G 実装は **CEO 承認まで行わない**（CoAlter runtime/useCoAlter/`/talk`/action は HOLD）。

---

## 出力サマリ
- **前提（①⑥）**: CoAlter for travel = **display tier の read-only cue consumer**（会話 runtime でも executor でもない）。G は CoAlter の travel への runtime/action 越境を防ぐ **firewall** + cue の read-only 表示を許可。
- **trust tier**: display（projection/cues）= read-only OK / server-only（authoritative/diagnostics/private）= client 不可 / runtime（useCoAlter/`/talk`/orchestration）= **HOLD** / action（booking/calendar/send/realtime/read receipt）= **HOLD/禁止**。
- **copy**: 「追加で確認したいこと/この点を確認してください/この案の注意点/代替案があります/これは予約・確定ではありません」（「実行します/予約します/確定します/送信します/既読にします/自動で進めます/この案に決定」禁止）。
- **推奨 minimal slice**: **C（`display.cues` を TravelLivePanel ready view に read-only 表示・runtime/input/send/action なし・OFF gate 下）**。B（types）/ A（freeze）は補助。**runtime（E/F）・action・M2-B-2・relation_context shared・`/talk` は HOLD**。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
