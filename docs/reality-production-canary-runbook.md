# Reality Capture — Production Canary Runbook（A1-5-15 Final Preflight）

> **目的**: A1-5-16 Production Canary ON の最終確認 + 実行手順。**本 runbook は CEO/operator 手動操作用**。
> **AI は production env 変更 / production 接続 / production ON をしない**（CEO の明示操作のみ）。
> 最終更新: 2026-06-07（A1-5-15・**doc-only・read-only audit**）
>
> ★**2026-06-07 補正（Day Rehearsal セッション・CEO 指示・doc-only）**: A1-5-15 時点の「**client banner DORMANT / backend-only / user 不可視**」前提は **stale**。その後 **A1-5-8-3 が client を live 配線**（`hooks/useAlterChat.ts` L819: `setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data))` → MorningPlanCard → CaptureCandidateBanner）。
> → **本 canary は user-facing read-only preview として扱う**（surface ON → canary user に banner が表示される）。**read-only・no apply・no save・no write**（banner は表示のみ・予定変更しない）。**Reality セッション周知要**（client wiring A1-5-8-3 の前提で runbook 更新）。production exposure / env 変更 / Vercel 操作は **未実施**（CEO 手動のまま）。

---

## 0. 前提（A1-5-11〜14 で確立済・evidence-based）

| 項目 | 状態（根拠） |
|---|---|
| capture write path（`fireMorningCapture`）| gate scaffold 配線済（A1-5-14）。`/api/stargazer/alter`（production morning）+ `/api/alter-morning/plan` が fire-and-forget 呼出。morning turn のみ発火 |
| surface read path（`buildMorningCaptureSurface`）| gate 配線済（A1-5-14）。server response に `captureCandidate?` を additive |
| gate（`evaluateCaptureGate`）| staging-only default + **production lane**（A1-5-13）。kill 最優先・fail-closed・production ref は明示許可ない限り block・test-locked |
| resolver wiring | `resolveMorningObserveGate` / `resolveSurfaceGate` が PLAN_FLAGS の production canary flag を gate へ渡す（A1-5-14・**default-off**） |
| **client banner display** | ★**LIVE 配線済（A1-5-8-3・補正 2026-06-07）**: `useAlterChat` L819 が response の `morningProtocol.captureCandidate` を `selectMorningProtocolCaptureCandidate` で抽出 → MorningPlanCard → `CaptureCandidateBanner` 描画。→ **surface ON → canary user に user-facing read-only preview（控えめ「候補があります」banner）が表示される**（旧記述「dormant / backend-only / user 不可視」は stale）。**read-only・apply/save/write なし**（表示のみ）。banner は home の MorningPlanCard 内（home 到達ユーザーが対象） |
| dedup / TTL | write-time dedup + undated TTL（A1-5-11-4/5）。staging で write→suppress→TTL→surface→cleanup 実証済（A1-5-11-6） |
| cleanup / status transition | **未実装**（design-only・A1-5-12）。expired 行は残る（surface 表示は除外）。canary（1 user）は蓄積 bounded |

---

## 1. Production Canary に設定する env（A1-5-16 で CEO/operator が production に設定）

**段階導入（推奨・安全順）**:

### Phase 1 — observe（dry-run・実 DB write 0・gate と extractor を検証）
```
REALITY_CAPTURE_PRODUCTION_CANARY=true          # 無いと production は必ず block（production lane の中核 gate）
REALITY_CAPTURE_CANARY_USER_IDS=<canary user の auth UUID>   # reality 専用 list・auth.users.id（email でない）
REALITY_CAPTURE_OBSERVE=true                     # observe mode（fake write・実 DB 0・real LLM extractor + gate + would-capture を log）
# REALITY_CAPTURE_LIVE は unset（observe 優先しない・write しない）
```
→ canary user の morning 発話で **gate allow → observe（実 DB write 0）**。`[reality.capture.observe]` log で outcome 観測。non-canary user は `gate_blocked`。

### Phase 2 — live write（実 RPC write・seed/evidence を production DB に）
```
REALITY_CAPTURE_OBSERVE → 削除
REALITY_CAPTURE_LIVE=true                         # capture write ON（real RPC・SECURITY INVOKER・user-RLS）
```
→ canary user の発話で **実 write**（seed1 + evidence1）。2回目 同構造 → **suppressed**（RPC・row 増えない）。undated → TTL expires_at。

### Phase 3 — surface（★user-facing read-only preview・補正 2026-06-07）
```
REALITY_CAPTURE_SURFACE=true                      # surface read ON（server response に captureCandidate additive）
```
→ server が `captureCandidate` を返す（redacted）→ ★**client（`useAlterChat` A1-5-8-3）が抽出し home の MorningPlanCard に `CaptureCandidateBanner`（控えめ「候補があります」）を描画 → canary user に user-facing read-only preview が表示される**（旧記述「client dormant / user 不可視」は stale）。**read-only・apply/save/write なし**（表示のみ・予定変更しない）。seed が無ければ banner 非表示（fail-open・正常）。

### 触らない / unset
- `REALITY_CAPTURE_KILL` は unset（false 既定）。緊急時のみ `true`（§3 rollback）。
- `NEXT_PUBLIC_REALITY_CAPTURE_SURFACE_CLIENT` は **不要**（★補正: B案 client path[`useAlterChat`]は本 flag を**見ず** response から直接描画ゆえ。banner は本 flag に依存しない）。
- `NEXT_PUBLIC_SUPABASE_URL` は production(aljav)＝**既存 production config のまま**（変更しない）。
- `REALITY_CAPTURE_LLM_API_KEY` / `_MODEL` は production に設定済前提（observe/write とも実 LLM extractor を使う＝**LLM cost 発生**）。

**確認**: env 未設定（`REALITY_CAPTURE_PRODUCTION_CANARY` unset）→ gate production lane 開かず → production 必ず block（現状・production 挙動変更 0）。

---

## 2. canary user 指定方法
- `REALITY_CAPTURE_CANARY_USER_IDS` に **production の `auth.users.id`（UUID）** を入れる（**email でない**）。
- 取得: production の canary 対象 user の auth UUID を取得（Supabase auth dashboard、または本人 session の `getUser().id`）。
- 複数可（comma-separated）。**最初は 1 名**を強く推奨。
- shared `PLAN_CANARY_USER_IDS` には入れない（gate は reality 専用 list を優先・**shared だけでは production allow しない**＝結合解消済 A1-5-13）。

---

## 3. rollback（緊急停止）
- **即時 kill（最速）**: `REALITY_CAPTURE_KILL=true` を production env に設定 → **redeploy**。gate が kill を最優先で全 block（write/surface 両方）。
- **flag off**: `REALITY_CAPTURE_LIVE` / `REALITY_CAPTURE_OBSERVE` / `REALITY_CAPTURE_PRODUCTION_CANARY` を unset → redeploy → production block。
- ⚠ **latency**: `PLAN_FLAGS` は module-load 評価ゆえ **反映に redeploy が必要**（instant でない・A1-5-12）。最速 rollback = `REALITY_CAPTURE_KILL=true` + redeploy。
- **構造的 backstop**: gate の production lane は `productionCanaryEnabled` が無いと開かない。env を戻せば必ず block（staging-only に復帰）。

---

## 4. monitoring / redaction
- **observe sink**: capture 実行ごとに production log へ `[reality.capture.observe] {mode, observed, outcome, wouldCapture, wouldEvidence, reason, note}`（**redacted・raw/UUID/seedId/prompt/apiKey 非出力**・A1-5-12 確認済）。
- 監視: production log で `[reality.capture.observe]` を grep → `outcome`（captured / suppressed / gate_blocked / no_intent / invalid_extraction / write_failed）を観測。
- redaction 確認: log payload に raw utterance / UUID / source_ref / prompt / apiKey が出ないこと（sink は safe field のみ projection）。

---

## 5. DB row 監視項目（production・canary user scope）
- `plan_seeds` WHERE `user_id`=<canary UUID> の件数。
- `plan_seed_duration_evidences` WHERE `user_id`=<canary UUID> の件数。
- **期待**: write-time dedup で同構造重複は増えない（distinct intent ごとに 1 行）。undated は `expires_at`=now+14d。
- expired 行: cleanup job が無いため `expires_at` 経過後も `status='active'` 行が残る（surface guard は**表示**除外）。canary（1 user）では bounded。
- read は **allowed columns のみ**（id / user_id / status / expires_at 等・raw 列なし）。

---

## 6. STOP 条件（1つでも該当 → 即 kill + 調査）
- **non-canary user** の seed/evidence が書かれた（gate の canary 制限が効いていない）。
- RPC error 多発 / capture が production response（user の morning 応答）を壊す兆候。
- DB row が想定外に急増（dedup が効いていない）。
- redacted log に raw / UUID / secret が出た。
- gate が production で意図せず allow（reason/log から逸脱を検出）。
- 任意の production 障害 / service_role 経路の混入。

---

## 7. A1-5-16 実行手順（短く・CEO/operator 手動）
1. canary user（1 名）の production `auth.users.id`（UUID）を確定。
2. production env に **Phase 1（observe）** を設定（§1）→ deploy。
3. canary user が morning interaction（発話）→ `[reality.capture.observe]` log で `observe` outcome を確認。**non-canary user → gate_blocked** を確認（gate の絞り込み検証）。実 DB write 0 を DB 件数で確認。
4. 問題なければ **Phase 2（live write）** に切替（§1）→ deploy。canary user 発話 → seed1+evidence1 が production DB に（§5 で件数確認）。
5. 2回目 同構造発話 → **suppressed**（RPC・row 増えない）/ undated → `expires_at`=now+14d を確認（A1-5-11-6 と同挙動）。
6. （任意）**Phase 3（surface）** で ★**canary user の home（MorningPlanCard）に控えめ banner「候補があります」が表示される**ことを確認（client A1-5-8-3 配線済・user-facing read-only preview）。read-only（apply/save/write なし）・seed 無→banner 非表示（正常）・redaction（raw/UUID/source_ref が DOM に出ない）を確認。
7. 異常 → §6 STOP（`REALITY_CAPTURE_KILL=true` + redeploy）。
8. **終了時**: env を unset → redeploy → production block に復帰。canary user の test 行は必要なら手動 cleanup（owner-RLS delete → evidence FK cascade）。

---

## 8. 禁止（A1-5-16 でも厳守）
- service_role 使用 / production migration / cleanup 自動化なしの放置（row 蓄積を必ず監視）。
- non-canary user への拡大（reality canary list を増やす前に 1 user で十分観測）。
- ★（補正 2026-06-07）**banner からの apply / save / 予定変更 / write**（banner は **read-only preview 表示限定**。client A1-5-8-3 は描画のみ・act-on/apply は未配線の別 slice）。**user-facing banner 表示自体は本 canary の対象**（旧「banner 有効化禁止 / backend-only」は stale・撤回）。

---

## 9. 本 canary で検証「される / されない」こと（補正 2026-06-07）
- ★**user-facing banner 表示は本 canary で検証「される」**（client A1-5-8-3 配線済・read-only preview）。旧「dormant ゆえ検証されない」は撤回。
- 検証「されない」（別 slice・依然）:
  - banner からの **apply / act-on / 予定変更**（client は描画のみ・executor は no-write skeleton 未配線）。
  - 自動 cleanup / status transition（design-only）。
  - partial unique index（race-prone dedup のまま・canary 低 volume で許容）。
  - scale（多 user）運用。
  - home 非到達 user への露出（banner は home の MorningPlanCard 内ゆえ home 到達が前提）。
