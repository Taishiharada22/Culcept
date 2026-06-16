# F2 — M2 Soft Enrichment Merge Boundary Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。real M2 runtime は **HOLD**（fixture のみ）。
> 上位文脈: F（M2 fixture → soft slot mapper）完了後。soft slot を **どこで/どう** engine input に混ぜるか。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算 ⑥人間超え革新 ⑦世界トップシェア。

---

## 1. まず前提を疑う（①）
| 候補 | 評価 |
|---|---|
| **F2. M2 merge boundary**（本書） | **推奨・次（設計のみ）**。F の mapper は単体では未消費＝merge で初めて plan を個人化。pure merge helper のみ（runtime/persistence/外部なし）でリスク最小 |
| G CoAlter display/runtime | 後（runtime gate・pair state） |
| Tier1-B href / Tier1-C Maps | 後（外部遷移/生成 gate） |
| SQL/RLS persistence | 後（§1） |
| E production deny release | **最後** |

**推奨: F2 次・docs-only。** 根拠（①⑤）: F の soft slot は merge されない限り plan に効かない。F2 で「**hard 前提が ready の後にのみ** soft slot を engine input に enrich する」境界を確定すれば、F の価値（個人化）が初めて出る。pure merge helper のみで安全。

### ★ 設計の核（⑥）— readiness と enrichment を分離
**readiness =「hard 事実（where/when/who）が揃ったか？」（explicit のみ）/ enrichment =「user の disposition で plan を個人化」（M2 soft・ready の後）** を**別概念に分離**。merge を **provider ready の後**に置けば「**M2 は readiness を一切 gate しない**」が構造的に自明になる（M2 は readiness 分類に登場すらしない）。

---

## 2. 現在の M2 状態（§2）
`M2TravelSoftPreference`（bounded fixture）/`M2TravelSoftEnrichment`（serverOnly envelope）/`mapM2SoftEnrichmentToSlots`（→ profile_prior/normalized/private soft slot）。soft key のみ・hard facts なし・runtime なし。

---

## 3. merge problem（§3）
- M2 soft slot は travel input が ready になる前にも存在し得る。
- M2 soft slot は **provider を ready にしてはならない**。
- M2 soft slot は **hard 前提充足後にのみ** engine input を enrich できる。
- private M2 slot は **server-side のまま**。
- action/UI は **raw M2 state を表示してはならない**。

---

## 4. hard 前提 firewall（§4・既存構造で enforced）
- `destination_area` は **explicit/session input のみ**から。
- `date_or_range` は **explicit/session date/window のみ**から。
- `participantIds` は **auth/session participant binding**から。
- **M2/profile_prior はこれらを満たさない**（`HARD_CONFIRMING_SURFACES_BY_KEY` に profile_prior 不在＝構造的に enforced）。
- M2/profile_prior は hard-confirming surface から**除外され続ける**。

---

## 5. merge timing オプション（§5）
| 案 | 内容 | 評価 |
|---|---|---|
| A. provider check の前に merge | M2 を intake.slots に先に入れる | safe（firewall は効く）だが「M2 が readiness に寄与する」と誤認させ得る |
| B. provider ready の後に merge | ready 判定は explicit のみ・後で M2 を足す | ◎ 明確 |
| **C. provider ready 後の server-only enrichment channel** | ready の engine input に **別 channel** で M2 soft を merge | ◎ **採用**（B を「別 channel」として明示化） |
| D. harness のみ保存・後で recompute | — | 補助（real persist は §1） |

**推奨: C（= ready 後の server-only enrichment channel・mechanism は pure merge helper）。**
- provider（`getProductionTravelInput`）は **explicit intake のみ**で readiness 分類（M2 は登場しない）。
- `status==="ready"` の時のみ、ready の `TravelPlanEngineInput` に **M2 soft slot を merge**（pure helper）→ enriched input → engine。
- classification test では M2 soft slot を intake に置いて「**ready にならない**」ことを確認してよい（firewall 検証）。production engine input は **ready 後にのみ** M2 を consume。

---

## 6. merge source（§6）
- **fixture M2 enrichment のみ**（first 実装）。
- **no M2 runtime**・**no Stargazer read**・**no pair/partner read**・**no relation_context shared**・**no CoAlter pair assumption**。

## 7. visibility ルール（§7）
- 既定 **private**・shared は明示時のみ。
- private slot は **authoritative server-side engine input を形成してよい**。
- private slot は **以下に leak しない**: not-ready prompt / `PlanIntelligenceProjection` / `CoAlterProjectionCue` / `SafeTravelLinkIntent` / URL・link text / diagnostics。
- **client-only filtering 禁止**（display chain の既存 projection privacy guard が処理）。

## 8. 競合/override ルール（§8）
- **explicit user input が M2 soft preference に勝つ**。
- **explicit `red_line` が M2 avoid soft_preference に勝つ**（別 key・hard vs soft）。
- M2 は **explicit destination/date/participant を override できない**。
- M2 は **soft avoid を hard blocker に変えられない**（red_line を産出しない）。
- 競合時は **explicit を保持し M2 を低優先 soft signal として残すか drop**。
- **hidden override なし**（precedence は明示・文書化）。
- mechanics: single-value soft key（pace/mobility_tolerance/budget_band/time_window）で explicit が既に在れば **M2 のそれを drop**。`soft_preference` は additive（複数可）。M2 は `destination_area`/`date_or_range`/`red_line` を持たない（mapper 保証）＝hard-key 衝突は起き得ない。

## 9. InMemoryTravelSessionHarness との関係（§9）
- M2 soft slot は **visibility/provenance 明示時のみ** store 可。
- display-safe read は **private M2 を strip**・server-internal read は含む・recompute は **注入 server-side 関数で private M2 を使える**・**real persistence なし**。
- ★ 注: 現 harness は `events` 保持・M2 は `slots` 産出＝slot 格納は別 refinement（本 F2 の merge は **engine-input レベル**で行い harness を要しない）。

## 10. TravelLiveAction との関係（§10）
- action は **明示承認時のみ** fixture mapper を呼ぶ（**real M2 runtime を呼ばない**）。
- action は **M2 slot を返さない**・**M2 diagnostics を render しない**・**not-ready state に private M2 を出さない**。
- engine call は **provider ready で gate** されたまま。
- ★ 本 F2 では **action に merge を配線しない**（CEO: production action へ merge しない）。merge helper は pure・未配線。

---

## 11. 実装オプション + 推奨（§11・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure merge helper types** | enriched input/merge 結果型（必要なら） | 推奨バンドル（最小） |
| **B. pure merge helper（explicit precedence）** | `mergeM2SoftEnrichmentIntoEngineInput(readyInput, m2Slots)`（ready 後・explicit 優先・hard/red_line 不追加） | ◎ 推奨 keystone |
| C. harness test（private M2 strip/persist） | 検証 | 後（slot 格納 refinement 要） |
| D. dev-only fixture merge in engine preview | dev route で fixture M2 を ready 後 merge | 推奨 demonstration |
| E. production action merge（live gate 裏） | action へ配線 | **HOLD**（CEO: production action へ merge しない） |

**推奨実装スライス: B（pure merge helper・explicit precedence）+ 最小 A。**
- `mergeM2SoftEnrichmentIntoEngineInput(readyInput: TravelPlanEngineInput, m2Slots: ExtractedSlot[]): TravelPlanEngineInput`。
  - **ready 後にのみ呼ぶ前提**（provider が ready を返した input に適用）。
  - explicit precedence: single-value soft key は explicit を保持し M2 を drop。`soft_preference` は additive。
  - M2 は `destination_area`/`date_or_range`/`participantIds`/`red_line` を **追加しない**（mapper 保証 + helper でも防御）。
  - **engine/provider/display を呼ばない**・runtime/persistence/外部なし。
- D（dev-only fixture merge）は demonstration として可。**E（production action merge）は HOLD**。

---

## 12. 将来 test（§12・実装時）
- **M2 slot のみでは provider ready にならない**。
- explicit destination/date/participant + M2 soft slot → **ready enriched input** を作れる。
- **explicit が M2 競合に勝つ**（同 key で explicit 保持）。
- M2 avoid は **soft_preference のまま**・**red_line にならない**。
- private M2 は **display-safe read に出ない**・**not-ready state に出ない**・**projection/cues に出ない**。
- **M2 runtime import なし**・DB/Supabase import なし・app/UI import なし・CoAlter/useCoAlter なし・`/talk` なし・fetch/API なし。
- **tsc baseline 不変（55）**・既存 travel tests green。

---

## 13. Stop
- 本書（F2 M2 Soft Enrichment Merge Boundary Design）で**停止**。
- F2 実装は **CEO 承認まで行わない**（real M2 runtime HOLD・production action へ merge しない）。

---

## 出力サマリ
- **前提（①⑥）**: readiness（explicit hard）と enrichment（M2 soft・ready 後）を**分離**。merge を **provider ready の後の server-only channel**に置き「M2 は readiness を gate しない」を構造的に自明化。hard firewall（profile_prior ∉ HARD_CONFIRMING_SURFACES）は既存。
- **merge timing**: **C（ready 後の server-only enrichment channel）**・mechanism = **pure merge helper（B・explicit precedence）**。
- **競合**: explicit が M2 に勝つ・explicit red_line が M2 avoid に勝つ・M2 は hard/destination/date/participant を override しない・soft avoid を hard blocker にしない・hidden override なし。
- **privacy**: 既定 private・private は authoritative server-side のみ・prompt/projection/cues/links/URL/diagnostics に leak しない・client-only filtering 禁止。
- **推奨実装スライス**: **B（pure merge helper・explicit precedence・ready 後適用）+ 最小 A**。D（dev-only fixture merge）は demonstration。**E（production action merge）/ real M2 runtime / relation_context shared / harness slot 格納 / G / Tier1-B/C / SQL-RLS / production deny は HOLD**。
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
