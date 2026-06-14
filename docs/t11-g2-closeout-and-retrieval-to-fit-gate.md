# T11-G2 Closeout + Retrieval-to-Fit Next Gate Decision（4→1→2 凍結・次 gate 判断・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: closeout + 次 gate 判断のみ・実装なし（docs-only）。
**位置づけ**: CEO ロードマップ「4→1→2」完了の checkpoint。external retrieval / retrieval-to-fit / 本番 `/plan` / Stargazer 本流 の前に最安全な次 gate を決める。

## §1 Closeout summary（4→1→2 完了）
| 成果 | コミット |
|---|---|
| (4) provider seam（input 供給/拒否・provenance・real_only/fail-closed） | `cefe9fad`〜`ee65f95a` |
| dev fixture provider | `d9133048` |
| dev provider route integration（preview を provider-as-gate へ） | `b428cf99` |
| (1) session/intake provider（confirmed-real・hard/soft・missing/unconfirmed・slot-key aware） | `2ebc645f` |
| (2) Tier0 entity retrieval normalizer（evidence→state・source 非 score・hallucinate 防止） | `7b8b3bf3` |

**今保証されること**: fixture が real を騙れない（provenance）・unconfirmed slot は ready にならない・entity evidence は score でない・URL は読まない・popularity は confidence のみ・price/availability を捏造しない・fit score/booking authority を出力に出さない・private user state を retrieval に入れない。
**HOLD のまま**: §4 全件。

## §2 現在の安全 data flow
```
session/intake slots → getSessionIntakeTravelInput → TravelPlanEngineInput      [DONE・fixture/manual]
manual entity evidence → getManualEntityRetrievalCandidates → TravelObjectState   [DONE・Tier0 manual]
TravelPlanEngineInput → runTravelPlanEngine → toDisplayPacket → projection → cues  [DONE・dev preview]
```
- **未配線**: ★**retrieved entity(TravelObjectState) を fit で評価し ProposalFitInput 化する pass**（= 2 provider と fit engine の接続）・本番 `/plan`・M2/Stargazer real user model・external retrieval。
- **fixture/manual only**: 全 provider 入力（実 intake UI/実 entity source なし）。

## §3 安全保証
fixture が real を騙らない / unconfirmed slot は ready にならない / entity evidence は score でない / URL を読まない / popularity は confidence のみ / price・availability 捏造なし / booking・action authority なし / retrieval に private user state なし / 本番 `/plan` 非接触。

## §4 HOLD gate（各々独立 GO）
retrieval-to-fit live integration / external source retrieval / official site extraction / Google Maps・Places / OTA・affiliate・partner API / live availability・pricing / booking・calendar / 本番 `/plan` / M2・Stargazer runtime / CoAlter・useCoAlter / send・realtime・read receipt / DB・persistence / staging・production・push。

## §5 次 gate 比較
| 案 | 内容 | 評価 |
|---|---|---|
| **A. retrieval-to-fit integration design（docs-only）** | retrieved entity を fit で評価し ProposalFitInput 化し、既存 T11-F fitSummary 経路に接続 | **★ 推奨**。2 provider と fit engine を繋ぐ**最後の純ピース**・外部/本番/M2 を開けない・advisory のみ(ranking 不変) |
| B. Tier1 safe links / Maps URL design | 検索/Maps への安全 link 生成（取得しない） | 外部寄り・retrieval-to-fit が先（評価が繋がらないと link の価値も限定） |
| C. Tier2 official/Maps read-only extraction | 外部 read-only 抽出 | **外部アクセス=CEO 承認**・HOLD |
| D. Bundle 2 fit dominance/ranking design | fit を ranking に効かせる | A(fit が entity を評価)後・advisory 固定を崩す前提 |

## §6 推奨次フェーズ
**推奨 = A（retrieval-to-fit integration design・docs-only）**。
- **なぜ最安全/最価値か**: 現状 entity は state を持ち（G2）、fit engine は entity を評価できる（fit-core）が、**両者が繋がっていない**（retrieved entity に fit を走らせる pass が無い）。A はこの**唯一残った純ピース**を設計し、`evaluateFit(user, entity)→ProposalFitInput→既存 fitSummary 経路`を繋ぐ。外部 retrieval/本番/M2/booking を 1 つも開けず、advisory のみ（ranking 不変・Bundle 2 は別）。
- **docs か実装か**: **まず docs-only 設計**（§7）→ 承認後に pure 実装（fixture FitUserState + fixture entity・外部なし）。
- ★ **重要な honest 注記**: A は **Travel 純 brain の最後のピース**。A 完了後、**Travel の残 gate は全て HOLD（external/M2/production）**＝外部 API・予約・本番・実 user model の投資判断は CEO 案件。よって **A の後は「外部 retrieval 投資 vs Stargazer 本流復帰」を CEO が判断**する地点になる（§8）。

## §7 retrieval-to-fit integration 設計（A 採用時の骨子）
- **join**: `EntityRetrievalCandidate(TravelObjectState)` を proposal/candidate に **caller 供給の candidateId 対応**で紐づける（retrieval は user-agnostic ゆえ、どの entity をどの proposal に当てるかは caller 責務・**strict id 一致のみ**・未知→diagnostic・捏造しない＝T11-F 同型）。
- **fit pass**: `(FitUserState[供給・fixture/M2 later], boundEntities[]) → evaluateFit per candidate → ProposalFitInput{candidateId, fit:FitResult}`。**ProposalFitInput を産む**（T11-F の input 型）→ 既存 `runTravelPlanEngine(input.fit)` → adapter が bounded fitSummary 化。
- **strict id matching**: candidateId が既存 proposal id と完全一致時のみ・unknown は diagnostic・重複 fail-closed（T11-F join 規律）。
- **no ranking change（first slice）**: fitSummary advisory のみ・dominance/pareto 不変（Bundle 2 は別 GO）。
- **no raw FitResult in packet**: FitResult は server-side（fit pass）に留め、packet には adapter の bounded fitSummary のみ（T11-F 既存保証）。
- **no action authority**（fit literal false）・**no external retrieval**（entity は G2 manual/fixture）・**no production**。
- 必要 user model: fit pass は `FitUserState`（traits/tolerances/intendedRoles）を要する。**今は fixture/manual 供給**・実 user model（M2/Stargazer）は HOLD ＝ A は「繋ぎ」を pure に確立し、real user model 解錠時に plug-in。

## §8 Stargazer/Plan 本流復帰（代替時の条件）
- **Travel deliverable 凍結点**: 4→1→2 + A（採用時）＝**Travel 純 brain 完成**。残（external/M2/production）は HOLD。
- **resume 条件**: (a) 外部 API/予約連携の CEO 承認、(b) M2/Stargazer real user model 解錠、(c) 本番 `/plan` 統合の CEO GO のいずれか。
- **先に着手すべき Plan/Stargazer gap**: 監査（`docs/t11-honest-audit-2026-06-14.md`）どおり、平日 Plan OS は機械は組まれているが**本番 live でない**（planRouteLive/LifeOps mainline staging-first gate）・**Stargazer state→plan 接続が弱い**。CEO 最優先（CLAUDE.md=Stargazer 深層観測の完成）に照らせば、ここの本番 live 化 or Stargazer→plan 接続が候補。

## §9 検証 / Stop
- 最新: `7b8b3bf3`(G2)→`5501eda5`(log)。tsc baseline **55**・full suite **21166 passed/1skip/0fail**・travel test **462**・本番 `/plan` 不変・tree clean・push なし。
- 本レポートで停止。external retrieval / 本番統合は CEO 承認まで着手しない。

### CEO 判断請求
1. 4→1→2 完了を **Travel 純 provider/retrieval の凍結点**として承認するか。
2. 次 = **A（retrieval-to-fit integration design・docs-only）** で良いか（vs B/C/D）。
3. **A は Travel 純 brain の最後のピース・後は全 HOLD**（外部/M2/本番）という整理を認めるか。
4. A 後の分岐（**外部 retrieval 投資 vs Stargazer 本流復帰**）を CEO 判断事項として確認するか。
5. §4 HOLD gate を各々独立 GO として維持するか。
