# F — M2 Soft Enrichment Provider Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。M2 runtime は **HOLD**（本 phase は fixture contract）。
> 上位文脈: D（in-memory harness）完了後。Travel に **個人傾向（soft）** を足すが hard 事実は触らない。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間超え革新 ⑦世界トップシェア。

---

## 0. grounding（M2 firewall は大半が既存）
| 事実 | 出典 | 含意 |
|---|---|---|
| `profile_prior`（M2 PersonalizationPort 由来）surface | slot-types.ts:69 | M2 由来 slot の surface |
| `SURFACE_INITIAL_STATUS[profile_prior] = "normalized"`・`SURFACE_IS_EXPLICIT[profile_prior] = false`・**default visibility = "private"** | slot-types.ts:85,97,113 | M2 slot は非明示・正規化・既定 private |
| 「profile_prior は **band/enum 値のみ・生スコア禁止**」（normalizer 強制） | slot-types.ts:210 | **raw Stargazer score を slot に入れられない** |
| `HARD_CONFIRMING_SURFACES_BY_KEY` = explicit(+session_context for date) **のみ**・profile_prior 不在 | session-intake-provider.ts:40-42 | ★ **M2(profile_prior) は destination/date を hard-confirm 不可（構造的に enforced）** |

→ ★ F の firewall は**大半が既存**: M2 は profile_prior 経由 = 非明示・正規化・private・band/enum のみ・**hard-confirm 不可**。F は「M2 fixture → soft slot mapper」を足すだけ。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **F. M2 soft enrichment provider design**（本書） | **推奨・次（設計のみ）**。製品中核（深いユーザー理解）× travel の **soft 個人化**。soft/private のみ・hard 不可・M2 runtime HOLD ゆえ **fixture contract** で安全 |
| G CoAlter display/runtime | 後（CoAlter runtime gate・pair state） |
| Tier1-B href | 後（外部遷移 gate） |
| SQL/RLS persistence | 後（§1） |
| E production deny release | **最後** |

**推奨: F 次・docs-only。** 根拠（①⑤⑥）: explicit input（where/when/who）が確定した今、次の価値は「**how you tend to travel（pace/疲労/混雑/新規性/朝夜）= 個人傾向**」で plan を soft に個人化すること＝Aneurasync 中核（第二の自己）。だが **hard 事実は M2 が作らない**（agency）。M2 runtime は HOLD ゆえ **fixture M2 → soft slot の pure mapper** から。

### ★ 設計の核（⑥⑦・agency × personalization）
**M2 = soft 傾向（how）/ explicit input = hard 事実（where/when/who）** の分離。plan は「**MY 傾向**（M2 soft）×**MY 明示選択**（explicit hard）」を反映。M2 は destination/date/participant を**決して確定しない**（surface 構造で enforced）＝個人化しても agency を奪わない。

---

## 2. 現在の Travel input 状態（§2）
- `bindTravelSessionIntake`（explicit events→slots・status surface 由来）・`getProductionTravelInput`（5 状態）・`TravelPlanDisplayResult`・`TravelLiveActionState`・`InMemoryTravelSessionHarness`（contract）・`SafeTravelLinkIntent`（inert）。
- **real input（hard）**: destination/date（explicit）+ participantIds（auth）。
- **soft/derived/HOLD**: budget/pace/mobility/red_line/soft_preference（soft）・**M2 enrichment（本書・HOLD）**・after_action。

---

## 3. M2 の役割（§3）
- M2 は **hard prerequisite provider ではない**。
- M2 は `destination_area` / `date_or_range` / `participantIds` を **hard-confirm しない**（profile_prior は HARD_CONFIRMING_SURFACES に無い＝構造的に不可）。
- M2 は **real entity retrieval をしない**・**route/weather/place facts を作らない**。
- M2 は **soft/private enrichment のみ**供給。

---

## 4. 許可される M2 soft enrichment（§4）
pace preference / mobility tolerance / budget sensitivity / lodging preference / food preference / quietness・crowd・novelty preference / morning-night preference / fatigue sensitivity / weather tolerance（**preference としてのみ**）/ red_line（**provenance-marked かつ visibility-scoped な時のみ**）/ after_action 学習済 preference（既に pure input として在る場合）/ **confidence・provenance・visibility wrapper**。
→ いずれも **band/enum 値**（pace enum / mobility band / budget band / descriptor）として soft slot 化（**生スコア禁止**）。

## 5. 禁止される M2 enrichment（§5）
destination/date/participant の **hard 確定なし** / live state 推論なし / 明示 source なき health・sleep 推論なし / client display に **exact private trait なし** / Travel display に **raw Stargazer axis score なし** / **無制限 personality dump なし** / pair/partner read なし / CoAlter pair state 仮定なし / route・weather・place・price・availability facts なし。

## 6. 出力契約（§6）
```
// スケッチ（未実装・fixture contract）
interface M2TravelSoftPreference {        // ★ fixture 入力（bounded・raw score でない）
  pace?: Pace;
  mobility?: MobilityToleranceValue;
  budgetBand?: BudgetBand;
  preferences?: { descriptorKey: DescriptorKey; descriptorValue: string }[];  // crowd/novelty/food/lodging/morning-night 等 → soft_preference
  redLines?: { descriptorValue: string }[];                                   // avoid（provenance/visibility 必須）
  confidence?: "low" | "medium" | "high";
  // ★ raw axis score field を持たない（band/enum のみ）
}
interface M2TravelSoftEnrichment {
  outcome: "m2_soft_enrichment";
  serverOnly: true;                       // 既定 private（profile_prior default private）
  slots: ExtractedSlot[];                 // ★ profile_prior surface・status normalized・soft key のみ
  // 非所持: display packet / projection / cues / engine output / raw score / hard slot
}
// mapper（pure・fixture）:
//   mapM2SoftEnrichmentToSlots(input: M2TravelSoftPreference): ExtractedSlot[]
//     - 各 pref → soft slot（surface "profile_prior" / status "normalized" / visibility 既定 private /
//       confidence は M2 由来 / value は band/enum/descriptor）
//     - destination_area/date_or_range を **作らない**（hard key を産出しない）
```
- surface: **profile_prior**（M2 由来）/ after_action（学習済）。relation_context は **将来 shared relation が明示許可した時のみ**。
- visibility: **private**（既定）・shared は明示時のみ。confidence: low/medium/high（ConfidentValue 互換）。
- **raw score field なし・display packet/projection/cues/engine output なし**。

## 7. 既存 provider との統合（§7）
- M2 enrichment は **soft slot/enrichment としてのみ**入る（intake.slots に merge）。
- **provider ready は依然 destination/date/participant の hard prerequisite に依存**（M2 で not-ready を解消しない）。
- soft enrichment は **provider ready の後にのみ** `TravelPlanEngineInput` を形成。
- **private enrichment は server-side のまま**・display chain は既存 projection privacy guard を使う。

## 8. InMemoryTravelSessionHarness との関係（§8）
- M2 由来 soft enrichment は **visibility/provenance が明示な時のみ** harness に store 可。
- **raw M2/Stargazer 出力は store しない**（harness の forbidden-key guard + band/enum 化で raw score を排除）。
- private enrichment は **display-safe read に出ない**（harness が private descriptor を除去）。
- recompute は **server-side で private enrichment を使える**（注入関数）。**real persistence なし**。

## 9. privacy（§9）
- **client-only privacy filtering 禁止**。
- private enrichment は **以下を通じて leak しない**: not-ready prompt / projection rationale / cues / safe links / URL text / diagnostics。
- **shared view は shared-safe input から recompute**。
- private 値は **authoritative engine output を server-side でのみ**形成。

---

## 10. 実装オプション + 推奨（§10・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure M2 enrichment types** | `M2TravelSoftPreference` / `M2TravelSoftEnrichment` | 推奨バンドル前提 |
| **C. pure helper M2 fixture → soft ExtractedSlot[]** | `mapM2SoftEnrichmentToSlots`（profile_prior soft slot・hard key 不産出・raw score 不受） | ◎ 推奨 keystone |
| B. pure fixture M2 enrichment mapper | fixture データ | C に内包 |
| D. harness test（private M2 が server-only に留まる） | 検証 | A+C の後の test |
| E. 実装せず G CoAlter へ | — | 代替 |

**推奨実装スライス: A（types）+ C（pure mapper）。**
- `mapM2SoftEnrichmentToSlots(fixture): ExtractedSlot[]` — 各 soft pref → **profile_prior / normalized / private 既定** な soft slot（band/enum 値）。**destination_area/date_or_range を産出しない**・**raw score を受けない**（型に無い）。
- merge は別スライス（action で intake.slots に soft slot を足す・provider ready は hard 依存のまま）。**M2 runtime は HOLD**（fixture のみ）。
> ★ premise note: F の firewall は既存（profile_prior は hard-confirm 不可・private 既定・band/enum のみ）。本スライスは「M2 fixture → soft slot」の pure mapper を足すだけ。real M2 連携は HOLD。

---

## 11. 将来 test（§11・実装時）
- M2 は destination / date / participants を **hard-confirm できない**。
- profile_prior destination slot は **unconfirmed/soft のまま**（provider が弾く）。
- private pace/mobility preference は **server-side input を enrich できる**。
- private enrichment は **display-safe read に出ない**。
- raw Stargazer score 形 / 無制限 M2 dump は **拒否**（band/enum のみ・harness forbidden guard）。
- shared enrichment は **visibility shared の時のみ**出る。
- **M2 だけでは provider not-ready のまま**。
- hard prerequisite 充足後は provider ready が M2 soft enrichment を含められる。
- **M2 runtime import なし**・DB/Supabase import なし・app/UI import なし・CoAlter/useCoAlter なし・`/talk` なし・fetch/API なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 12. Stop
- 本書（F M2 Soft Enrichment Provider Design）で**停止**。
- F 実装は **CEO 承認まで行わない**（M2 runtime は HOLD・fixture contract のみ）。

---

## 出力サマリ
- **前提（①⑥）**: F の firewall は既存（profile_prior は **hard-confirm 不可・private 既定・band/enum のみ**）。M2 = soft 傾向（how）/ explicit = hard 事実（where/when/who）の分離で **個人化しつつ agency 保全**。
- **契約**: `M2TravelSoftEnrichment`（serverOnly・**soft slot のみ**: profile_prior/normalized/private・band/enum・raw score なし・display/projection/cues/engine output なし）。
- **統合**: soft slot を intake に merge・**provider ready は hard prereq 依存のまま**（M2 で not-ready を解消しない）・soft は ready 後に engine input 形成・private は server-side。
- **推奨実装スライス**: **A（types）+ C（pure mapper M2 fixture→soft ExtractedSlot[]）**。merge/real M2 連携/relation_context shared は HOLD。G/Tier1-B/SQL-RLS/E も HOLD。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
