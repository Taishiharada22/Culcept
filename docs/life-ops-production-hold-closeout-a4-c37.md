# Life Ops — A-4-c37 Production Hold Closeout / Staging Release Freeze

> 2026-06-11 / CEO gate。**production を一切触らず**、A-4 Life Ops を staging 完成状態として凍結し、production へ進む残条件を明文化する。
> 本書は closeout（docs-only）。実装変更なし・production 操作なし。

---

## 1. c36 docs-only 成果物の整理
- `docs/life-ops-production-schema-apply-a4-c36-bundle.md`: PRE/APPLY/POST/ROLLBACK SQL + abort 条件 + prm prerequisite audit + 返送フォーマット。
  **§8 finding 記録済み**（PRE-1 で `lifeops_structured_sources` が production 既存判明）+ §9 既存 table audit 手順。
- 位置づけ訂正済み: 「GO を出せる状態」→ **「bundle 準備済み・execution は CEO gate 未承認 HOLD」**。

## 2. production 未接触の再確認（正確な記録）
- **Claude は production DB へ一度も接続していない**（全 commit を通じて production への read/write/apply ゼロ）。
- production への唯一の接触 = **CEO が手動実行した PRE-1（read-only 1 クエリ）**。これは finding 取得（table 既存判明）のみで、
  apply/write には進んでいない。→ 「Claude 未接触」は厳密に true、「production 完全未クエリ」は PRE-1 の分だけ例外（CEO read-only）。

## 3. Production execution HOLD の明文化
```
A-4 Life Ops の production execution（PRE 続行 / APPLY / read / write / card visibility / input UI / feedback writer）は
すべて CEO gate 未承認のため HOLD。flag/allowlist は全 dormant（default OFF）。
```
解禁は P1→P5 の段階ごとに別 CEO GO（c35 Release Gate Matrix）。本 closeout は解禁しない。

## 4. Staging 完成範囲（成立済み・全 E2E PASS）
| 領域 | slice | 状態 |
|---|---|---|
| structured source schema | c27/c28 | staging apply 済・POST 監査一致 |
| reader read-only wiring | c29 | staging smoke honest zero |
| writer contract + smoke | c31/c32 | 1-row write→read→dup→cleanup PASS・occurrence 正形式 |
| deadline input UI + E2E | c33/c33b | 本線 UI 登録→card→cleanup PASS |
| cadence input UI + E2E | c34/c34b | 同上（実効 mode fix 込み） |
| mainline card / action rail / done 2 段階 | c23/c18 | 本線 E2E PASS |
| duplicate guard / cleanup scripts | c32/c33b | exact・冪等・param 化 |
| fixture kill-switch / sparse fallback / 実効 mode | c25/c26/c34b | real_only 恒久・登録分のみ表示 |
| production release gate matrix | c35 | dormant 基盤・Plan C 設計 |
- final staging smoke: total=0 / lifeops=0 / structured=0 / normalized=0（record 50 で全 0 確認）。
- full suite 20591 PASS / tsc 55 baseline。

## 5. production 前に必要な CEO gate（順序）
1. **P1 schema apply**: §8 finding により「既存 table の audit（c36 §9）→ draft 一致 ∧ row_count=0 確認」が先。一致なら apply 不要で P1 充足。
2. **prm prerequisite**: feedback write（E/P4）前に prm_learning_events の production CHECK が lifeops/done/completion を許容するか確認
   （不足なら M1+c11 拡張 bundle を別起票）。P1-P3 には不要。
3. **P2 read visibility 配線**: `isLifeOpsProductionStageAllowed("read_visibility")` を card 経路に OR 配線（別 GO）+ `LIFEOPS_PROD_READ_VISIBILITY` + allowlist 設定。
4. **P3 input+structured write 配線** → **P4 feedback write 配線** → **P5 一般開放（allowlist 条項撤去の改修）**。

## 6. production 前に必要な追加観測
- **staging では追加観測不要**（c19 観測 5 条件は c22b/c24/c33b/c34b で全充足・4 action E2E・cooldown・390px・実データ反映・体感）。
- production 固有の観測は **P2 以降の allowlist dogfood**（CEO 自身が production allowlist で）で取得する設計（counts-only・c35 §6）。
- → staging release freeze は**観測の取りこぼしなし**で確定可能。

## 7. rollback / disable / flags の現状
- 全 Life Ops flag = **default OFF（dormant）**: mainline / realdata / feedback read+write / cadence read / structured read+write / prod stage 4 種。
- staging 解禁は env flag ON でのみ（dev server セッション限定運用）。production は二重 deny（URL gate + flag）。
- rollback: flag OFF=即時 / allowlist 除去=per-user / source safety=構造的に fixture 不可（real_only 恒久）/ schema DROP=最後の手段。
- **production には enable 経路が配線されていない**（prod stage gate は consumer 0 dormant）→ 誤操作で production が開く余地なし。

## 8. 次の選択肢（CEO 判断）
- **(a) Life Ops を staging-complete で凍結し、別テーマへ**（CEO 方針「Stargazer 深層観測」等）— production は将来の CEO GO 待ち。
- **(b) production P1 audit へ進む**（c36 §9 の既存 table audit を CEO 実行→ draft 一致確認のみ・apply なし）。
- **(c) prm prerequisite audit を先行**（P4 の前提を早めに棚卸し）。
- **(d) staging 横展開**（cadence picker の辞書拡張・archived 編集 UI 等の機能深化・production 不要）。
推奨: production は CEO 経営判断（公開タイミング）に依存するため、**(a) で凍結**し、Build の手は (d) の機能深化 or 別テーマに向けるのが「今月の成功条件（コア機能完成・世界観）」と整合。
