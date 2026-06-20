# Day Rehearsal Repair Candidate — dedup mini design + closeout（案A 実装・main 着地済）

> 2026-06-07 / **mini design（§1-5）→ 案A 実装 → main 着地完了（§6）** / 前提: Repair v1（target-aware copy）main live（`25337696`）。`generateDayRepairCandidates` は step ごとに候補を push・`prioritizeRepairCandidates`（kind 優先度 stable sort + cap 3）で表示整形 → DayOutlookBanner が `c.suggestion` を list 描画。

---

## 0. 結論（先に）
- **★同一文が複数並ぶ可能性は「ある」**（同 kind が複数 step で発火 → kind 固定文が重複）。production でも busy な日に起こる。
- **推奨 = display 段で「同 kind を 1 件に集約」**（generation は full-fidelity 維持・将来の per-row anchoring を壊さない）。集約は **prioritize と別の composable 関数 `dedupeRepairCandidates`** として追加（既存 prioritize/P3 契約を壊さない）。CalendarTab は `prioritize(dedupe(generate(...)))`。
- 集約は **copy 無改変（既存 suggestion をそのまま代表 1 件）** が最も安全（read-only・新 copy なし）。複数性を伝えたい場合のみ qualitative-plural（「いくつかの移動で…」）を**別オプション**として検討（v1.1 では非推奨・数値は出さない）。
- dedup は **max-3 と矛盾しない**（むしろ top-3 の kind 多様性が増す＝改善）。

## 1. CEO 5 問への回答
### Q1. 同じ候補文が複数並ぶ可能性があるか
**ある。** `generateDayRepairCandidates` は step ループ内で per-step に push する。同 kind は複数 step で発火しうる（kind→文は固定 COPY なので**同一文**になる）:
| kind | 複数発火条件 | production(Option D) |
|---|---|---|
| leave_earlier | insufficient transition が複数 | ✅ 起こりうる |
| confirm_uncertain | not_applicable transition（friction≠null）が複数 | ✅ 起こりうる |
| use_recovery_window | recovery step（raw slack≥60）が複数 | ✅ 起こりうる |
| protect_buffer | convergencePoint（非 insufficient）が複数 | full path のみ |
| reduce_density | — | 最大1（day-level・targetStepIndex null） |
- 1 step では同 kind 最大1（`if(insufficient) / else if(convergence)` + 独立 if）。よって重複は **「同 kind × 異なる step」** から生じる。

### Q2. 同 kind の候補をまとめるべきか
**まとめるべき（display 段で）。** 候補文は **どの移動か を指していない**（targetStepIndex は UI 非表示・timeline anchor 無し＝v1 監査済）。よって同一文を 2 本見せても**ユーザーが得る情報は 1 本と同じ**（「どれ」を区別できない）→ 重複は純粋なノイズ。集約で情報損失なし。day-level の「詰まりやすい」傾向は banner outlook が別途伝える。

### Q3. targetStepIndex が違う候補をどう扱うか
- **day-level 表示**: targetStepIndex は描画されないため、同 kind なら異 index でも**代表 1 件に集約**（決定論的に「最初の step（stable sort 後の先頭）」を残す）。evidence/targetStepIndex は内部用なので代表のものを保持（or union・§3 参照）。
- **generation は集約しない**（per-step を全件保持）→ 将来 per-marker（候補を timeline 行に紐付け）を実装する時に index 別候補が必要。**集約は display 専用**にして両立。
- ★異 kind が同 step で共起する稀ケース（full path で protect_buffer+use_recovery_window 等）は**別文なので dedup 対象外**（kind 単位の集約では自然に両方残る）。

### Q4. 最大3件ルールと矛盾しないか
**矛盾しない・むしろ改善。** 現状は `prioritize`（kind 優先度 sort → cap 3）。例: insufficient 3本 → top-3 が **leave_earlier ×3（同一文）** になり、use_recovery_window 等が押し出される。**dedup を cap の前に入れる**と top-3 = **最大 3 つの異なる kind** になり、kind 多様性が上がる（同一文で枠を潰さない）。max-3 の意味が「3 行」→「3 種の示唆」に良化。

### Q5. read-only / copy 安全性を保てるか
**保てる。**
- 推奨案（代表 1 件・copy 無改変）: 既存 suggestion をそのまま使う純粋な list 操作（filter）→ 実行 UI なし・新 copy なし・禁止語/数値の新規混入なし。**最も安全**。
- qualitative-plural オプション（「いくつかの移動で…」）を採るなら: suggestion トーン維持・**生数値を出さない**（「2か所」等の count を出さない＝「いくつか」で定性化）・禁止語なし を守れば read-only/安全。ただし copy 追加 + 「ユーザーが区別できない複数性」を強調する副作用 → v1.1 では非推奨。

## 2. 設計オプション
| 案 | 内容 | 評価 |
|---|---|---|
| **A（推奨）** | display 段で **同 kind→代表1件**（先頭保持・copy 無改変）。`dedupeRepairCandidates` を新設し `prioritize(dedupe(...))` | ✅ 最小・安全・kind 多様性↑・generation 不変・将来 per-row 両立 |
| B | dedup + **qualitative-plural copy**（≥2 件時「いくつかの…」）。数値なし | △ 複数性を伝えるが区別不能な情報・copy 追加。v1.1 非推奨 |
| C | **generation 段で集約** | ❌ per-step fidelity を喪失（将来 per-row anchoring 不可）。非推奨 |
| D | 何もしない | ❌ busy 日に同一文が並ぶ（v1 の「重複を減らす」目標に反する） |

## 3. 推奨実装スケッチ（次 GO 時のみ・今は実装しない）
- 新 pure 関数（dayRepairCandidates.ts）: `dedupeRepairCandidates(cands): readonly DayRepairCandidate[]`
  - kind ごとに**先頭 1 件**を保持（入力順＝step 順を尊重・stable）。reduce_density は元々1なので不変。
  - 代表の targetStepIndex/evidence は **先頭のものを保持**（v0 単純）。将来 evidence union が要れば別判断。
  - 純粋・Date 不使用・read-only・新 copy なし。
- CalendarTab: `prioritizeRepairCandidates(dedupeRepairCandidates(generateDayRepairCandidates(...)), 3)`。
- 既存 `prioritizeRepairCandidates`（sort+cap）と **P1-P5 契約は不変**（dedup は別関数）。
- test: dedupe unit（同 kind 複数→1・異 kind 保持・順序保持・reduce_density 不変・空）。render contract は既存のまま（banner は受け取った list を描画）。
- tsc footprint 0・additive。production 挙動 = **重複行が減るだけ**（候補の種類・優先度・evidence は不変）。

## 4. HARD GATE 照合（実装する場合の予防線）
- 予定変更指示でない（既存 suggestion 文・実行 UI なし・list filter のみ）。
- 根拠のない具体化でない（dedup は情報を**足さない**・代表文は既存）。
- UI 変更は最小（CalendarTab の 1 行合成のみ・banner 不変）or 0（dedup を CalendarTab で挟むだけ）。
- copy が命令/警告/診断に寄らない（copy 無改変）。
- read-only / repair 実行に見えない（純粋関数）。

## 5. CEO 判断点（実装 GO 前）
1. dedup を入れるか（案A）/ 入れないか（案D 現状維持）。
2. 集約は **代表 1 件・copy 無改変（案A）** で良いか / 複数性を qualitative-plural（案B）で見せるか。
3. dedup は **display 専用（generation full-fidelity 維持）** で良いか（将来 per-row anchoring 両立のため推奨）。
4. 集約関数を **prioritize と別（composable）** にするか / prioritize に内蔵するか（後者は P3 契約変更）。
5. 代表の evidence/targetStepIndex は **先頭保持（v0 単純）** で良いか / union するか。

---

## 6. 実装 closeout（案A・main 着地完了）
- **CEO GO（案A）**: generation full-fidelity 維持 / display で同 kind→代表1件 / copy 無改変 / evidence 代表保持 / qualitative-plural なし / `prioritize(dedupe(generate(...)))`。
- **main 着地済（squash・main HEAD `db70d018`・親 `94c413b7`）。** code branch `claude/dr-repair-dedup`（HEAD `9986befb`）保持。
- 実装:
  - `lib/plan/dayRehearsal/dayRepairCandidates.ts`: `dedupeRepairCandidates(cands)` 追加（同 kind は先頭=step 順の最初のみ採用・Set で重複除去・代表の suggestion/targetStepIndex/evidence をそのまま保持＝copy 無改変・pure・Date 不使用）。generation/prioritize/型/preview は不変。
  - `app/(culcept)/plan/tabs/CalendarTab.tsx`: `prioritizeRepairCandidates(dedupeRepairCandidates(generateDayRepairCandidates(dayRehearsal, { recoverySteps })), 3)`（import 1 + 合成 1 行）。banner UI 不変。
- 検証: dayRehearsal dir + render contract **115 PASS**（新規 **D1-D9**: 同 kind→1 / 異 kind 全残 / 順序保持 / 代表=先頭・copy 無改変 / reduce_density 不変 / 空 / pure（入力不破壊）/ **D8 統合 prioritize(dedupe)=同一文並ばず・3 種・≤3** / **D9 旧 3 件↔新 1 件**）・**plan suite 5024 PASS**・**tsc footprint 0（total 55 baseline 不変）**・zero-loss（main↔branch diff 空・明示パス commit で別セッション WIP 不接触）。
- 実機 smoke PASS（CEO + 自己監査）: 6/7 banner「どうするとよさそう？」に leave_earlier + use_recovery_window + reduce_density の **3 種が重複なく併存**・最大3・read-only・既存「なぜ?」/outlook/marker 非破壊。
- production 挙動 = **重複行が減るのみ**（候補の種類/優先度/evidence/copy 不変・予定変更/repair 実行なし）。
- 次 = **Repair Candidate full-path audit**（実装なし・別 doc）: protect_buffer の Option D 不到達を許容するか / raw feasibility・full path 解放の是非。
