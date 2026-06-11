# Life Ops — A-4-c35 Production Read-only Visibility / Release Gate Matrix（設計のみ・production 操作なし）

> 2026-06-11 / CEO・GPT GO。**禁止**: production migration apply/read/write/card・input UI・writer enable・DB write smoke・
> notification・R4・external API・push/PR/merge。本書は解禁「設計」の正本（実解禁は段階ごとに別 CEO gate）。

---

## 1. Production readiness audit

### 現行 gate 一覧（実装済み・全て staging-only）
| # | gate | helper | 条件 | production |
|---|---|---|---|---|
| G1 | card visibility | `isLifeOpsMainlineAllowed` | LIFEOPS_MAINLINE ∧ planRouteLive ∧ staging ∧ !prod | **恒久 deny** |
| G2 | source safety | `resolveLifeOpsSourceMode`+`resolveEffectiveLifeOpsSourceMode` | URL 由来＋登録済→real_only | **real_only 恒久（flag で開かない）** |
| G3 | feedback read | `isLifeOpsFeedbackReadAllowed` | master ∧ FEEDBACK_READONLY ∧ staging ∧ !prod | deny |
| G4 | cadence read | `isLifeOpsCadenceReadAllowed` | master ∧ CADENCE_READONLY ∧ staging ∧ !prod | deny |
| G5 | structured read | `isLifeOpsStructuredSourceReadAllowed` | master ∧ STRUCTURED_SOURCE_READONLY ∧ staging ∧ !prod | deny |
| G6 | structured write | `isLifeOpsStructuredSourceWriteAllowed` | master ∧ STRUCTURED_SOURCE_WRITE ∧ staging ∧ !prod | deny |
| G7 | feedback write | `isLifeOpsFeedbackWriteAllowed` | master ∧ FEEDBACK_WRITE ∧ staging ∧ !prod | deny |
| G8 | input UI 表示 | page（G1 ∧ STRUCTURED_SOURCE_WRITE） | — | deny（G1 経由） |
| G9 | duplicate guard read | G6 配下 | — | deny |

### schema 前提（A）
- `lifeops_structured_sources`: **staging のみ**（c28）。production 未 apply → **read-only visibility は schema apply なしに成立しない**。
- `prm_learning_events`: production 状態は**要 CEO 確認**（本 repo からは query 不能）。feedback write（E 段）には base table + c11 CHECK 拡張
  （source_kind+='lifeops' / action+='done' / signal+='completion'）の production 反映が前提。
- production apply は **別 slice・別 CEO gate**（c28 方式の SQL Editor bundle・PRE/POST/rollback 同梱・§7 checklist）。

## 2. 解禁の分離（A-F）と Release Gate Matrix

```
A. schema readiness（c36 候補・CEO SQL Editor apply）
B. read-only visibility（card のみ・write 全 deny 維持）
C. input UI visibility（B と分離・D とも分離）
D. structured source writer（C とセットで実用になるが flag は別）
E. feedback/action writer（done/later/dismiss・最後）
F. rollback / kill switch（全段階で flag OFF=即時）
```

### 新設（本 slice で dormant 実装）: production 段階 gate
`isLifeOpsProductionStageAllowed(stage, env)` — **production URL ∧ stage flag ∧ userId ∈ allowlist** の AND。
- stage flags（全て default OFF・dormant）: `LIFEOPS_PROD_READ_VISIBILITY` / `LIFEOPS_PROD_INPUT_UI` / `LIFEOPS_PROD_STRUCTURED_WRITE` / `LIFEOPS_PROD_FEEDBACK_WRITE`
- **user allowlist**（Plan C の核）: env `LIFEOPS_PROD_USER_ALLOWLIST`（uuid CSV・server-only・log 不出力）。**空= 全 false**（一般開放は
  allowlist 撤廃でなく「別 CEO gate で allowlist 条項を外す改修」＝事故で全開しない）。
- 既存 G1-G9 は**本 slice で不変更**（staging 経路はそのまま）。将来の解禁 slice で
  `既存 staging 経路 OR isLifeOpsProductionStageAllowed(...)` を**段階ごとに別 CEO GO で**配線する。
- **G2（source safety）は解禁対象外**: production は何段階でも real_only 恒久＝fixture は永久に出ない。

### Matrix（行=解禁段階・列=開く gate）
| 段階 | A schema | B read(G1+G3-G5 相当) | C input UI | D structured write | E feedback write | 想定ユーザー |
|---|---|---|---|---|---|---|
| P0 現在 | staging のみ | ✗ | ✗ | ✗ | ✗ | staging operator |
| P1 schema apply | **✓(prod)** | ✗ | ✗ | ✗ | ✗ | なし（無挙動） |
| P2 allowlist read | ✓ | **✓(allowlist)** | ✗ | ✗ | ✗ | CEO（card 観測のみ・source 0 なら null） |
| P3 allowlist input | ✓ | ✓ | **✓** | **✓** | ✗ | CEO（登録→card・rail は不可視 or 押下 gate_off） |
| P4 allowlist full | ✓ | ✓ | ✓ | ✓ | **✓** | CEO（full loop 実運用 dogfood・cleanup 不要前提） |
| P5 一般開放 | ✓ | allowlist 条項撤去（別 CEO gate） | 同左 | 同左 | 同左 | 全ユーザー |

## 3. Plan 比較 → **Plan C 採用（CEO 推奨に同意）**
| Plan | 内容 | 評価 |
|---|---|---|
| A read-only first | 最安全だが source 0 の一般ユーザーに何も出ない（B だけでは無価値） | P2 として吸収 |
| B input+write 同時 | 価値は出るが production write を一段で開ける | 不採用 |
| **C allowlist dogfood** | P2→P3→P4 を allowlist 内で段階実施→P5 | **採用**（A/B の利点を段階に内包） |

## 4. read-only visibility（P2）で見せる範囲
structured source 由来 candidate のみ（G2 real_only 恒久）・**source 0 → card null**（c25/c26 lock 済み）・
raw count/debug/source 名/internal flag は本線 DTO に構造的に不存在（c23/c26 lock 済み）。rail は P2 では出さない
（card builder は rail 付きで組まれるため、P2 配線時は **feedbackAction prop 不渡し→c16 互換 chip 表示（押せない）**を利用＝追加実装最小）。

## 5. input UI（C）/ writer（D/E）方針
- C と D は flag 分離（test ④）だが**運用上は同時に開ける**（UI だけ出して write 不能は gate_off 体験になるため・P3）。
- E（feedback write）は最後（P4）: done 2 段階・cooldown・PRG は実装済み。**cleanup 不要の実運用前提**＝dogfood cleanup script は
  production を恒久 deny のまま（実運用データを消す道具を作らない）。

## 6. Observability（counts-only）
- アプリ側 logging は**追加しない**（PII/user_id/full row log 0 方針の維持が最強の保証）。
- 観測手段: ①allowlisted CEO の実 UI ②SQL Editor の counts クエリ（checklist 同梱: `SELECT count(*) FROM lifeops_structured_sources;`
  `SELECT source_type, count(*) FROM lifeops_structured_sources GROUP BY 1;` `SELECT action, count(*) FROM prm_learning_events WHERE handle LIKE 'lifeops:%' GROUP BY 1;`）
  ③既存 Vercel/Supabase dashboard の error rate。gate 状態= env の目視（flag 一覧 checklist）。

## 7. Production schema apply checklist（c36 の素材・実行は CEO）
PRE: ①project ref=aljavfujeqcwnqryjmhl を目視 ②`to_regclass('public.lifeops_structured_sources')`（期待 NULL）③`prm_learning_events` の存在
+ CHECK 定義確認（c11 拡張が未反映なら同 bundle に含める判断）。APPLY: c28 と同一 SQL（冪等化済み）。POST: c28 の POST-1〜6 同等。
ROLLBACK: c27 同梱の clean DROP（**原則最後の手段**・P2 以降にデータが入った後は flag OFF を先に）。

## 8. Rollback / kill switch（F）
| 対象 | 手段 | 効果 |
|---|---|---|
| 任意の段階 | stage flag OFF | 即時（card/入口/write が次 render から消滅） |
| 特定ユーザー | allowlist から除去 | 即時・per-user |
| read 系 | master/per-source flag OFF | real source 不使用→card null |
| fixture | 不要（G2 恒久 real_only） | 構造的に発生不能 |
| schema | DROP（c27 rollback） | **最後の手段**（データ喪失・flag OFF を常に先行） |

## 9. 変更ファイル（本 slice）
本 doc／`lifeops-production-gate.ts`（pure dormant helper）／featureFlags（prod stage flags 4 種 dormant）／新 test（gate matrix）／log。
