# Life Ops — A-4-c17 Gated Writer Wiring Preview Mini-Design（non-cadence actions only・done 禁止）

> 2026-06-11 / CEO・GPT GO「採用/後で/不要 だけを dev/operator preview で gated writer へ。done は確認 UI 付き別 slice」。
> **禁止**: done の writer 接続・cadence 更新を起こす操作・自動 done・done button 有効化・PlanClient・R4・notification・production・push/PR/merge。

---

## 1. 設計 10 点（GPT 指定への回答）

1. **client→server に渡す値**: `candidateKey`（既存 `lifeOpsMomentKey`=`{category}:{menu}`・非 PII 構造キー）+ `action` の **2 値のみ**（form hidden + submit button name/value）。
2. **handle 非露出**: handle は writer 用内部 DTO。HTML/DTO/hidden input に出さない（c16 lock 継続・JSON/HTML に `"handle"`/`lifeops:` 不在を test）。
3. **client 値を信頼しない**: 受信値は **lookup key としてのみ**使用。typeof/enum 検証 → 照合に失敗したら書かない。
4. **server 再検証**: server action 内で page と同一 chain（real anchors world + fixture inputs + gated feedbackCadence）を**再計算**し、
   現在の Morning 代表（rail を持つ唯一の集合）に candidateKey が存在するか照合。時間経過で代表が変わっていたら invalid（安全側 reject）。
5. **intent 再構築**: 照合に成功した **server 側 candidate object** から c15 `listLifeOpsActionDescriptors` → 該当 action の intent を採用
   （= 辞書 firewall 再通過）。pure 検証 core `resolveLifeOpsActionRequest`（新 lib）に切り出し fake で全分岐 test。
6. **production hard block**: ① action 冒頭で page と同じ host 三重ガード（hostMode ∧ staging allowlist ∧ production deny→notFound）
   ② writer 自身の gate（master ∧ write ∧ staging ∧ !production・c9）= production では flag ON でも常に false。
7. **gate stack**: host 三重ガード → `REALITY_PIPELINE_PREVIEW` → operator auth（supabaseServer・owner-RLS）→ action allowlist
   `{accept, later, dismiss}`（**done はここで常時拒否**）→ candidateKey 照合 → `intent.cadenceEligible なら拒否`（二重防御）→ writer gate（`LIFEOPS_FEEDBACK_WRITE` 含む）。
8. **duplicate/cooldown**: ① writer 既存 cooldown（同一 handle×action 10 分・recent は **gated read（c8）から注入**。read gate OFF なら []=cooldown 縮退を明示）
   ② POST→`redirect`（PRG）でリロード再送を構造的に防止。
9. **success/failed 表示**: redirect の query token（enum 検証済み）→ 固定辞書文言 1 行。
   ok=「記録しました（preview 限定・本線には反映されません）」/ gate_off=「記録は実行されていません（write flag OFF・preview のみ）」/
   duplicate_cooldown=「少し前に同じ記録があります（重複防止のため書きませんでした）」/ insert_failed=「記録できませんでした」/
   invalid=「この操作は受け付けられませんでした（候補が変わったか、無効な操作です）」/ denied=「操作できません（operator 未ログイン）」。
   **本線保存と誤解させない**（「preview 限定・本線には反映されません」を ok 文言に内蔵・非断定語のみ）。
10. **write 後の即時反映なし**: write 結果を candidate pipeline に流し込まない（redirect 後の再 render も feedback read は default OFF→不変。
    read flag ON 環境でも accept/later/dismiss は cadence にならない=c13 lock）。

## 2. UI（client は presentational 維持）

rail の順序維持 `採用 完了※ 後で 不要`。`feedbackAction` prop（server action）が**ある時だけ** 3 action を
`<form action>` + `<button type="submit" name="action" value=…>` に昇格（onClick/useState/fetch なし）。**完了※は span のまま押せない**。
prop なし（test/将来の無効化）では c16 と同一の全 span 表示。result 行は token→固定辞書で 1 行。

## 3. staging smoke 判断: **実施しない**
理由: ①writer→DB 経路は c12(accept)/c13(done) の 1-row smoke で検証済み・c17 で writer/DB コードは不変更
②新規ロジック（enum deny/照合/intent 再構築）は pure で fake により全分岐 lock 可能
③server action は operator session（cookie auth）+RSC 文脈必須で CLI から安全に駆動できない → GPT 条件「少しでも不確実なら fake/unit で停止」に従う。
実 staging での E2E 操作確認は CEO の operator dogfood（flags ON 環境で UI から）を別途提案。

## 4. 変更ファイル
新 `lib/plan/reality/lifeops/lifeops-action-request.ts`（pure 検証 core）／compute（`computeLifeOpsPreviewModel`=dto+repCandidates 公開・highlight に `candidateKey`）／
新 `app/(culcept)/plan/dev-reality-pipeline/actions.ts`（"use server"・writer import は server のみ）／page（searchParams token+action prop 渡し）／
client（form/button 昇格+result 行）／tests（新 wiring file+c16/integration allowlist 更新）／docs/log。
