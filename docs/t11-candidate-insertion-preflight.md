# Candidate Insertion Preflight（docs-only）

> 設計フェーズ。**コード変更なし**。実装は CEO 承認後に別 slice。
> 上位文脈: `docs/t11-travelcandidate-construction-boundary-design.md`（A+B `ScheduledDraftCandidateEnvelope` firewall）の次段。
> 原則: ①前提を疑う ②自立推論+grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間同等の推論 ⑦人間を超える革新 ⑧世界トップシェア。

---

## 0. grounding（前提を変える事実）

| 事実 | 出典 | 含意 |
|---|---|---|
| **`TravelCorePlan` は pure type・未配線** | core-types.ts:279（"runtime 依存なし・未配線"） | insert する**器が runtime に存在しない** |
| **`candidates[]` の runtime consumer ゼロ** | engine/decision-core/route 全て未参照 | insert しても**誰も読まない**（今は） |
| Pareto 比較は **別型 `RankedCandidate[]`** を取る・未配線 | lib/coalter/travel/pareto.ts | 「insert → 自動 ranking」は**現状起きない**が、将来 lane を繋ぐと起きる |
| **`TravelCandidate` が 2 種ある** | core-types.ts:243 / lib/coalter/travel/types.ts | insert 先は **core-types 版**（`candidateId/title/tags/itinerary/tradeoff/constraints/rationale/uncertainty/reversal?`）。混同注意 |
| rich field は draft から**導出不可** | core-types.ts | `title/tags/rationale/uncertainty/reversal` は機械導出できない（後述） |

→ **insertion は「まだ穴の空いていない扉の鍵」を設計する段階**。だから本書の主眼は「いつ insert してよいかの gate を確定し、insert 自体は HOLD に留める」こと。

---

## 1. まず前提を疑う — 次は本当に insertion preflight か？

| 候補 | いま着手すべきか |
|---|---|
| **A. candidate insertion preflight**（本書） | **docs-only として推奨**。理由↓。ただし実 insert は HOLD |
| B. Bundle 2 ranking design | **後**。ranking は candidates[] を読む層。器も consumer も未配線な今は時期尚早 |
| C. S5 replanning design | **後**。S5 の入力は受理/保存 candidate。insertion gate 未確定なら入口が浮く |
| D. scheduled draft candidate **display preview** | **有力代替**。envelope を insert せず安全に見せる方が、目下のゴール（予約直前まで・agency）に近い |

**推奨: A を docs-only で実施。** 根拠（①⑤）:
- insertion は「draft/handoff 空間 → plan candidate 空間（comparison/decision/ranking が消費）」への**越境**。越境の gate を先に固定するのは firewall-first の一貫方針。
- だが grounding 上 **器も consumer も無い**ので、**実装は最小（または HOLD）**が正しい。preflight で「gate の契約」を型に落とし、実 insert は consumer/orchestrator が現れるまで HOLD。
- D（display preview）は「ゴールに直結する次の BUILD」として別途有力 — §11 で次フェーズ候補として併記する。

---

## 2. Closeout summary（完成 / HOLD）

| 部品 | 状態 |
|---|---|
| `ScheduledTravelItineraryDraft` | ✅ pure・authoritative:false/draft:true・候補でない（assembly-types.ts:33） |
| AB bridge (`bridgeAssemblyCandidate`) | ✅ pure・server-only envelope（4 gate） |
| `ScheduledDraftCandidateEnvelope` (A+B) | ✅ pure・`insertable:false`・TravelCandidate でない・**candidates[] に入らない（型 firewall）** |
| **candidate insertion** | 🔴 **HOLD**（本書で gate 設計のみ） |
| TravelCandidate 構築（converter） | 🔴 **HOLD** |
| ranking/dominance（Bundle 2） | 🔴 **HOLD** |
| acceptance / booking / persistence / production `/plan` | 🔴 **HOLD** |

**完成 = 「scheduled draft を非挿入 envelope として安全に包める」まで。**

---

## 3. insertion problem の定義

- `TravelCorePlan.candidates[]` は **rich な core-types `TravelCandidate`** を期待する。
- `ScheduledDraftCandidateEnvelope` は **意図的に非挿入**（discriminant + `insertable:false` + 必須 field 欠落）。
- insert は **draft/handoff → plan candidate 空間**への越境。
- candidate 空間は **comparison/decision/ranking** が消費し得る（現状未配線だが将来繋がる）。
- ∴ **insertion は新しい gate**であり、envelope を直接入れることは禁止のまま。

---

## 4. insert 前に真でなければならない条件

1. candidate に **明示 id** がある（envelope.candidateId 踏襲可）。
2. itinerary は scheduled draft 由来、**承認済み converter** で core-types `TravelCandidate` 形へ変換済み。
3. **必須 `TravelCandidate` field が明示供給**されている（silent 既定値・silent 導出を禁止）:
   - `title: string` / `tags: string[]` / `tradeoff: TradeoffProfile{cost,distance,fatigue,experienceVariety}` /
     `constraints: TravelConstraint[]` / `rationale: ViewerScopedRationale{shared, forParticipant}` /
     `uncertainty: UncertaintyLevel("high"|"medium"|"low")` / `reversal?: ReversalCost`。
4. **raw FitResult を含まない**。
5. **private diagnostics を含まない**（solver reason / private narrowing）。
6. **booking/calendar/action 権限なし**。
7. **acceptance / final plan state なし**。
8. **暗黙 ranking/dominance なし**。
9. **production persistence なし**。
10. **client display payload を source of truth にしない**。

### ★ rich field の本質（⑥⑦）— なぜ「明示供給」が要件か
draft から機械導出できるのは **factual** な一部のみ:
- `tradeoff.cost` ≈ Σ node budget、`fatigue` ≈ Σ fatigueLoad、`experienceVariety` ≈ activityKind 多様度、`distance` ≈ Σ edge。
だが **interpretive** な核 — `title`/`tags`/`rationale`（なぜ "あなた" に合うか）/`uncertainty`/`reversal` — は**導出不可**。
ここを silent 生成すると「中身の薄い自動候補」が出来、**agency（自分の選択・理由が分かる）を毀損**する。
→ **converter は interpretive field を捏造せず、明示供給を要求（fail-closed）**。factual の自動導出すら、やるなら**別の承認ステップ**に分離（boundary は dumb/explicit に保つ）。

---

## 5. 禁止される insert 入力

- `no_draft`
- `UnresolvedChoiceReport`
- `SelectionRejection`
- `ScheduledDraftCandidateEnvelope`（`insertable:false`・**そのまま insert 不可**）
- `DisplayScheduledItinerary`（client view・source of truth でない）
- bridge/candidate envelope **外**の raw `ScheduledTravelItineraryDraft`
- raw `FitResult`
- 不完全な `TravelCandidate`（必須 field 欠落）
- live booking/calendar 結果
- 別承認なしの external route/weather/place 結果

---

## 6. candidate construction options（§6）

| 案 | 内容 | 評価 |
|---|---|---|
| A. envelope を**永久に非挿入**・TravelCandidate は完全別建てで後日 | firewall は最強だが、将来の多候補選択（agency の核）への道を塞ぐ | ✗ 硬直 |
| **B. 明示 converter**（envelope → TravelCandidate・全 rich field 明示供給・fail-closed） | interpretive 捏造を防ぎつつ変換路を用意 | ◎ 採用 |
| **C. insertion adapter**（**完成 TravelCandidate のみ**受理・envelope は受けない） | insert 口を TravelCandidate に限定し envelope 直挿入を構造的に排除 | ◎ 採用 |
| D. 別の `PlannableTravelCandidateDraft`（依然非挿入） | 中間型をもう 1 段。現状 consumer 不在で**過剰間接** | △ 不要（将来再考） |

**推奨: B + C の二段 gate。**
`envelope ──(B: 明示 converter)──▶ core-types TravelCandidate ──(C: insertion adapter)──▶ candidates[]`
- B は **interpretive field を明示要求**（捏造禁止・fail-closed）。
- C は **envelope を構造的に拒否**（`insertable:false`/discriminant/必須 field 欠落で型が弾く）。完成 TravelCandidate のみ通す。
- 各段が独立 gate（1 関数に束ねない）。**insert 実行は両 gate 通過 + 明示 GO のときのみ**。

---

## 7. ranking 境界

- insert は **それ自体で rank しない**。
- dominance/pareto は **Bundle 2**（lib/coalter/travel/pareto.ts は別型 `RankedCandidate[]`・未配線）。
- `fitSummary` は **advisory のまま**（Bundle 2 承認まで ranking/execution 不使用）。
- **insertion order は推奨順を含意しない**（配列順 ≠ おすすめ順）。
- decision-core 消費は **HOLD**。

## 8. privacy

- insert は private fit/readiness/solver reason を**漏らさない**。
- shared/client candidate 投影は**別物**（client-safe view は現状 display projection のみ）。
- raw diagnostics なし。**client-only privacy filtering 禁止**（filtering は server で完了）。

## 9. authority

- insert ≠ accepted / ≠ scheduled・confirmed / ≠ booked。
- insert は `executionAuthority` を**付与しない**。
- booking/calendar は**別 GO**。

## 10. persistence

- **in-memory candidates[] と DB persistence は別物**。
- DB/persistence **HOLD**・production `/plan` **HOLD**・本フェーズ migration なし。

---

## 11. 実装オプション（設計後・CEO 承認で着手）

| 案 | 内容 | 評価 |
|---|---|---|
| **C2. pure converter types only** | `TravelCandidateConversionInput`（envelope + 全 rich field 明示）/ `…Result`（TravelCandidate \| 中立 rejection）/ diagnostic 型のみ | **推奨・次スライス**。契約（何を明示供給すべきか）を型で固定。**TravelCandidate を構築しない**（型参照のみ）＝最も外科的・捏造リスクなし |
| C3. pure converter helper（insertion なし） | 上記契約の helper（全 field 揃う時のみ TravelCandidate を組成・fail-closed） | C2 承認後の自然な続き。実 TravelCandidate を**初めて構築**する慎重段なので分離 |
| C4. insertion adapter design only | 完成 TravelCandidate のみ受理する adapter の docs 設計 | C3 後 |
| C1. docs-only insertion contract | 本書がほぼ充足 | 本書で代替 |
| Bundle 2 ranking design | 別 docs | 別途・後 |
| （代替）scheduled draft candidate **display preview** | envelope を insert せず安全に表示 | ゴール直結の BUILD 候補。CEO が D を選ぶなら有力 |

**推奨次スライス: C2（pure converter types only）。** 根拠（③④⑤）:
- 器も consumer も無い今、**実 TravelCandidate 構築（C3）は時期尚早**。まず「明示供給の契約」を型で固める方が安全。
- C2 は TravelCandidate を**構築しない**（union の出力型として参照するのみ）→ "no TravelCandidate final construction if avoidable" を満たす。
- insert・adapter・ranking・persistence は HOLD のまま。

---

## 12. 将来 test（C2→C3 着手時）

- `insertable:false` の envelope は insert できない（型 firewall・既存テスト継続）。
- converter は **全 `TravelCandidate` 必須 field を明示要求**（欠落で fail-closed・reject）。
- converter は `DisplayScheduledItinerary` を source にしない（型で拒否）。
- converter は raw `FitResult` を取り込まない（出力に FitResult なし）。
- insertion adapter は **非 TravelCandidate を拒否**（envelope/draft/display 不可）。
- insert は ranking/dominance を**設定しない**。
- insert は accepted/final state を**設定しない**。
- insert は `executionAuthority` を**付与しない**。
- **明示 GO なしに candidates[] 挿入をしない**。
- fetch/API/DB/Supabase import なし・pure なら app/UI import なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. Stop

- 本書（Candidate Insertion Preflight）で**停止**。
- insertion 実装は **CEO 承認まで行わない**。

---

## 出力サマリ

- **gate の核**: envelope を直接 candidates[] に入れない。`envelope →(B 明示 converter)→ TravelCandidate →(C insertion adapter)→ candidates[]` の**二段 gate**。各段独立・insert 実行は両通過 + 明示 GO 時のみ。
- **前提確認**: `TravelCorePlan`/`candidates[]` は**未配線・consumer ゼロ**。よって本フェーズは **gate 契約の確定に留め、実 insert は HOLD**。rich の interpretive field（title/tags/rationale/uncertainty/reversal）は導出不可ゆえ **converter で明示供給必須（捏造禁止＝agency 保全）**。
- **推奨次スライス**: **C2（pure converter types only）**。C3（converter helper）→ C4（adapter）→ insert は順次・各 GO。代替として display preview（D）も CEO 選択肢。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
