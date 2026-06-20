# Reality capture surface — canary rollout plan（local smoke PASS 記録 + 実行前 plan・実行しない）

> 2026-06-07 / **plan + 記録のみ・Vercel/env/flag 変更は CEO/operator 手動（AI 実行しない）** / 正本 runbook=`docs/reality-production-canary-runbook.md`（Reality セッション所有）。
> 本書は **surface(read-only preview) の canary 視点**で正本 runbook を補完 + 重要な不整合（漏れ）を flag する。

---

## 0. local smoke PASS 記録
- **判定: PASS**（CEO 認定 2026-06-07）。preflight GREEN（STAGING(hjcr) / NODE_ENV=dev / REALITY_CAPTURE_SURFACE=true(.env.local) / **REALITY_CAPTURE_LIVE=off＝write なし** / canary list 設定済 / port 空き）。
- 視覚 smoke は **staging home 到達不可**（banner は home 専用 `components/home/morning/`・/plan 参照なし）+ AI auth 不可 → **code-level smoke で代替**: render-contract/presenter/client **3 files 64 tests PASS**（absent→空 markup / present→控えめ「候補があります」 / **raw/UUID/source_ref 非露出** / MorningPlanCard additive wiring）。
- 安全確認: surface は read-only（write/.from/.insert なし）・DTO redacted・banner read-only(button なし)・fail-open・dev server 停止済。

## 1. ★前提整理（gate architecture）— 「staging canary」の意味
gate（`evaluateCaptureGate`）は 2 lane。**deploy 環境での挙動を正しく把握する必要**:
| 環境 | NODE_ENV | supabase ref | 通過する lane | 結果 |
|---|---|---|---|---|
| **local dev** | development | staging(hjcr) | default/staging lane | ✅ allow（smoke 済） |
| **Vercel 任意 deploy** | **production**（Vercel 既定） | staging(hjcr) | staging lane で `nodeEnv==="production"` **block** / production lane は prod ref 必須で skip | ❌ **block** |
| **Vercel production** | production | production(aljav) | **production canary lane**（`REALITY_CAPTURE_PRODUCTION_CANARY=true` + reality canary user） | ✅ allow（runbook） |
- ★**結論: 「deployed staging-supabase canary」は gate を通れない**（Vercel は NODE_ENV=production・staging lane block・production lane は aljav 必須）。**要確認**: culcept-staging の NODE_ENV（Vercel なら production）。
- ∴ 実 deploy での canary は **production canary lane（正本 runbook）の一択**（1 user・多重 gate）。あるいは **local smoke 止まり**（済）。

## 2. ★重要な不整合（漏れ）— runbook の「banner dormant」は stale
- 正本 runbook（A1-5-15）line 116/121: 「**user-facing banner は別 slice・client display dormant・user 不可視**・本 canary は backend-only」。
- ★だが **`hooks/useAlterChat.ts` line 819（A1-5-8-3）が client を live 配線済**: `setMorningCaptureCandidate(selectMorningProtocolCaptureCandidate(data))` → MorningPlanCard → CaptureCandidateBanner 描画。**runbook より後に wiring された**。
- ∴ **現状 surface ON（phase 3）→ canary user に banner が実際に見える（user-facing）**。runbook の「user 不可視」は **現在 FALSE**。
- 影響: ①UX 上は **機会**（canary user に real value が届く）②但し **意図せぬ exposure を避けるため意識的決定が必要** ③**runbook の更新が必要**（Reality セッション所有）。
- **対応（要 coordination）**: canary 実行前に Reality セッションと「surface ON = banner user-facing」を合意し runbook を更新。or canary を observe/write のみ（phase 1-2）に留め surface(phase 3) を出さない＝backend-only 維持。

## 3. 既存 runbook との関係（再発明しない）
- 正本 = `docs/reality-production-canary-runbook.md`（phases / canary user / rollback / monitoring / STOP 条件 / 実行手順 / 禁止）。**本書はそれを surface 視点で補完**するのみ。実 deploy canary は runbook に従う（Reality セッション所有・CEO 手動）。
- 本系（Day Rehearsal）の寄与: local smoke PASS + 上記 gate/banner 整合の flagging + surface-specific チェック。

## 4. flag / canary user / seed / rollback / safety（surface 視点・runbook 参照）
| 項目 | 内容 |
|---|---|
| **flag**（read surface のみ） | `REALITY_CAPTURE_SURFACE=true`（surface read）/ production lane は `REALITY_CAPTURE_PRODUCTION_CANARY=true` 必須 / kill=`REALITY_CAPTURE_KILL` |
| **write flag（別・触らない）** | `REALITY_CAPTURE_LIVE`（seed write）= surface と独立。surface canary では **不要**（既存 seed を read するだけ）。但し seed が無いと候補出ない（§seed） |
| **canary user** | `REALITY_CAPTURE_CANARY_USER_IDS`=production auth UUID（email でない）・最初 1 名・shared list に入れない |
| **seed 依存** | banner は **pending captured seed** がある時のみ表示。surface のみ ON では seed 0→空（fail-open）。seed は capture write（別 flag・別 phase）or 既存 staging seed が前提。**seed 作成は本タスク禁止** |
| **rollback** | `REALITY_CAPTURE_KILL=true` + redeploy（最速・全 block）/ flag unset + redeploy。★PLAN_FLAGS は module-load 評価ゆえ **redeploy 要**（instant でない） |
| **safety gate** | 多層 fail-closed（kill→flag→ref→prod block→canary user）・production hard block・redaction（enum/number/date/null）・read-only（surface は write しない）・fail-open(null→banner なし) |

## 5. 実行前チェックリスト（canary 実行手前・CEO/operator + coordination）
- ☐ C1. culcept-staging / production の **NODE_ENV を確認**（Vercel なら production）→ deployed-staging が gate block か確定（§1）。
- ☐ C2. ★**banner 不整合（§2）を Reality セッションと解消**: surface ON=user-facing を合意 + runbook 更新、or backend-only（phase 1-2 のみ）で進める決定。
- ☐ C3. canary user の **production auth UUID** を確定（1 名）。
- ☐ C4. **seed の用意方針**を決定（既存 staging/production seed を read or capture write を別 phase で生成＝別 GO）。surface のみでは seed 無→空。
- ☐ C5. monitoring 準備（`[reality.capture.observe]` log grep・DB row 監視・redaction 確認）— runbook §4-6。
- ☐ C6. rollback 手順を operator が把握（kill + redeploy）。
- ☐ C7. STOP 条件（runbook §6）を operator が把握。

## 6. 実行に必要な CEO/operator 作業（AI はしない）
1. NODE_ENV 確認（C1）。
2. Reality セッションと banner 不整合の合意 + runbook 更新（C2）。
3. production env 設定（runbook §1 の phase 1→2→（任意 3）・**CEO 手動・redeploy**）。
4. canary user UUID 設定（C3）。
5. monitoring 実施・異常時 kill（C5/C6）。
- ★AI（本系）は **env/flag/deploy/production 接続を一切しない**（runbook の方針）。

## 7. GO / NO-GO 判断点
- **GO（local 段階・済）**: local smoke PASS（code-level 64 + preflight GREEN）。
- **NO-GO（本タスク内）**: Vercel/env 変更・production exposure・capture write ON・seed 作成・実 canary 実行 は **しない**。
- **deployed canary の GO 前提（別 GO・要 coordination）**:
  1. §2 banner 不整合の解消（user-facing にするか backend-only か）。
  2. §1 NODE_ENV 確認（deployed-staging 不可なら production canary lane へ）。
  3. seed 方針（§4）。
  4. Reality セッションと所有・手順の合意（正本 runbook 準拠）。
- **CEO 判断点**:
  1. canary を **user-facing（banner 見せる・UX 最大化）** にするか **backend-only（runbook 既定）** にするか。
  2. deployed canary は **production canary lane**（runbook）で良いか（deployed-staging は gate 不可）。
  3. seed をどう用意するか（既存 or write phase）。
  4. 実行時期 + Reality セッションとの coordination。
