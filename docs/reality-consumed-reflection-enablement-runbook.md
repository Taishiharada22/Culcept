# Reality Consumed Reflection — Staging Enablement Runbook（Slice E）

設計: `docs/aneurasync-reality-control-os-connection-design.md` §9.12（A1-6-7 wiring）/ §9.19（A1-6-13 preflight 監査）
関連: `docs/reality-production-canary-runbook.md`（A1-5 surface・production rollout）

> **本 runbook は手順書のみ**。実際の env 変更・デプロイ・flag ON は **CEO/operator が実行**する。本ドキュメント自体はコード/env/flag を一切変更しない。

---

## 0. 前提・現状（A1-6-13 監査で確定）

- **live route 配線は A1-6-7 で既存**。`app/api/stargazer/alter/route.ts:10376` が serve-time に `resolveConsumedReflectedMorningPlan(morningResponse?.plan ?? null, supabase, userId)` を呼び、結果を `morningProtocol.plan`（L10405）で client へ返す。client は `hooks/useAlterChat.ts:771` で受け取り、AskHero → MorningPlanCard へ流れる（**end-to-end 配線済**）。
- 現状は **wired-but-dormant**: `REALITY_CONSUMED_REFLECTION` flag OFF（default）→ wrapper `morning-consumed-reflection.server.ts:36` `if (!flag || plan===null) return plan`（**read 0・diff 0**）。
- ⚠️ A1-6-12 時点の「live 未配線」という認識は **誤り**（§9.19 で訂正済）。残る作業は「配線」ではなく **flag chain の staging 有効化判断**。

---

## 1. 有効化する flag chain（staging のみ・together）

accept → reflect → display の full loop には以下 3 flag を **staging で together に ON**（`lib/plan/featureFlags.ts:302` の設計意図）:

| flag | env var | 役割 | scope | 既定 |
|---|---|---|---|---|
| `realityCaptureSurface` | `REALITY_CAPTURE_SURFACE=true` | candidate が banner に surface（A1-5） | server | OFF |
| `realityCandidateActions` | `NEXT_PUBLIC_REALITY_CANDIDATE_ACTIONS=true` | accept/dismiss/later ボタン + optimistic add（A1-6-8） | client | OFF |
| `realityConsumedReflection` | `REALITY_CONSUMED_REFLECTION=true` | consumed seed → served MorningPlan reflect（A1-6-7） | server | OFF |

- capture **write**（pending seed の記録）が別途必要なら `REALITY_CAPTURE_LIVE` 等を別途検討。本 runbook は accept→reflect の表示ループに焦点。
- 🔴 **production では 3 flag とも OFF 維持**。staging（supabase ref `hjcrvndumgiovyfdacwc`）でのみ ON。production ref（`aljavfujeqcwnqryjmhl`）では設定しない。

---

## 2. 前提条件

- staging 環境（`NEXT_PUBLIC_SUPABASE_URL` が staging ref を含む / production ref を含まない）。
- 既存 unit が green（reality 683 / alter-morning 4501 PASS・回帰なし）。
- consumed seed が存在する（= 事前に capture→surface→accept を通す必要。無ければ reflect は read 空＝無表示で安全）。

---

## 3. 有効化手順（CEO/operator）

1. staging の env に §1 の 3 flag を set。
2. staging へデプロイ。
3. §4 smoke を実施。

---

## 4. smoke 手順（staging 実機・STAGING_USER_A）

1. STAGING_USER_A で login。
2. Home で Alter に発話 → morning plan 生成。
3. candidate banner が surface するか（`realityCaptureSurface`）。
4. **accept** 押下 → `/api/reality/candidate-action` → status=`consumed`（`realityCandidateActions`・user-RLS・status-only）。
5. 次ターン（または再生成）で served plan に reflected item が **同日**に出るか（`realityConsumedReflection`）。期待表示: `[時間未確定] 午後の予定（60分） 内容暫定`（confirmationState=confirmed・「暫定」chip なし・A1-6-12 contract）。
6. **重複が出ないか**（client の round-trip 後も handle dedup で 1 件）。
7. console error 0 / 既存 plan item・手動予定が壊れていないか。

---

## 5. 観測項目

- reflected item の表示（generic label 保持・marker 整合）。
- **同日のみ反映**（別日 plan で出ないこと）。
- **重複なし**（handle dedup・round-trip 含む）。
- **既存 plan / 手動予定 非破壊**（additive append のみ）。
- **fail-open**（read error 時も plan が壊れない）。
- **serve-time のみ**（stored session 不変・ターン跨ぎ安定）。
- seedRef / raw / source_ref が client に **出ない**（opaque handle のみ）。

---

## 6. rollback 手順

- §1 の 3 flag を **OFF**（env unset または `=false`）→ デプロイ。
- **即座に diff 0**（dormant・read 0・wrapper L36 `return plan`）。**コード rollback 不要**。
- flag OFF 時 `servedMorningPlan === morningResponse.plan`（reflect なし・既存と完全一致）。

---

## 7. stop 条件（有効化中止 → 即 rollback）

以下のいずれかが観測されたら即 §6 rollback:

- 重複 item が出る（handle dedup の想定外）。
- 既存 plan item / 手動予定が壊れる・消える。
- seedRef / raw / source_ref / secret が client（DOM/state/response）に漏れる。
- console error / plan 描画崩れ。
- consumed seed が **別日 / 別 user** に漏れる（同日 filter / user-RLS の想定外）。
- reflect により plan 確定 / Safety Gate / plan_presented が誤作動する。

---

## 8. TTL 未実装時の暫定安全性（A1-6-13 監査）

- cron（`status=expired` 遷移）は **未実装**。但し:
  - **同日 filter が天然 TTL**: consumed seed は `seed.date === plan.date`（= desired_date===today）の日だけ reflect。翌日は date 不一致で自動的に出なくなる。
  - consumed は status **final**（expiry check 不要）。active seed は read-side `expires_at` guard（`seed-source.ts`）あり。
- → cron なしでも staleness は desired_date に **bounded**。staging 有効化に cron は不要。production 有効化前に cron を別途検討するかは任意（§9 Slice T）。

---

## 9. 任意・後続（今はやらない）

- **Slice S（stale-reconcile）**: consume 後に seed が消えた場合の orphaned seed-origin item 除去（additive → reconcile）。現状 additive-only ゆえ round-trip された item は残り得る（低リスク: un-consume / seed 削除 UI なし）。removal が実需要になった時のみ。
- **Slice T（TTL cron）**: expired active seed → `status=expired` の cron。capture 側の関心（reflect 非依存）。

---

## 10. production 有効化（別 GO・本 runbook 範囲外）

- staging smoke + 観測 PASS 後にのみ検討。
- production canary（`REALITY_CAPTURE_CANARY_USER_IDS`・`docs/reality-production-canary-runbook.md`）→ 段階拡大。
- **production 有効化は CEO 承認必須**。
