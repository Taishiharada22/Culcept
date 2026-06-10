# Life Ops — A-4-c15 Action Intent Contract Mini-Design（pure・UI 本線/DB write/notification 非接続）

> 2026-06-11 / CEO・GPT GO「候補カードの 採用/完了/後で/不要 を writer へ渡せる安全な action intent contract として pure に設計」。
> **禁止**: React button・UI 本線・PlanClient・server action・DB write 実行・staging write smoke・notification・R4・production・push/PR/merge。

---

## 1. 流れ（c14 までの read 方向の逆向き）

```
LifeOpsCandidate（縦 seam・category+menu のみ読む）
  → buildLifeOpsActionIntent / listLifeOpsActionDescriptors（本 slice・pure・辞書 firewall）
  → LifeOpsActionIntent{handle, action, signal, sourceKind, cadenceEligible, requiresExplicitConfirmation}
  → actionIntentToWriterInput(intent, actedAtISO) → LifeOpsFeedbackWriteIntent（c9 既存）
  → （将来 slice・別 gate）writer.writeFeedback
```

## 2. action 意味論（c13 確定の mirror・本 slice で新規定義しない）

| UI 意味 | action | signal | cadence 影響 | 確認契約 |
|---|---|---|---|---|
| 採用 | accept | adoption | **なし**（intent） | 不要 |
| 完了 | done | completion | **あり**（事実・唯一） | **requiresExplicitConfirmation=true** |
| 後で | later | deferral | なし | 不要 |
| 不要 | dismiss | non_adoption | なし | 不要 |

- signal/sourceKind は **c9 の共有定数**（`LIFEOPS_FEEDBACK_SIGNAL`/`LIFEOPS_SOURCE_KIND`）から導出＝第二の正本を作らない。
- **自動 done 禁止**: intent の構成は caller の明示 action 引数のみ。module 内に dueReason 等から done を導く経路は存在しない。
  done は誤タップが cadence（前回完了日）を歪めるため、UI 契約 boolean `requiresExplicitConfirmation` で確認 UI を義務付ける。

## 3. availability 設計（シンプル則）

**辞書 valid（L-1 category ∧ menu enum）な候補 → 4 action 全て**を固定順 [採用, 完了, 後で, 不要] で提供。
- 後で/不要 は**ユーザー主権**として常に正当（押し付けない・断定しない）。done の妥当性は本人だけが知る事実 → gating でなく確認契約で守る。
- **辞書外 category / enum 外 menu → intent 化されない**（build=null・descriptors=[]＝safe disabled）。検証は c8 `parseLifeOpsFeedbackHandle` の **roundtrip firewall** を再利用（build した handle を parse して一致しなければ null）。
- 差は metadata（cadenceEligible/requiresExplicitConfirmation）に置き、per-kind 制限は将来 slice が contract 不変のまま追加可能。
- dismiss の候補抑制・later の cooldown/再提示抑制は**今回接続しない**（将来用途として intent に十分な key=handle が既にある）。

## 4. safety（含めてよい field の閉集合）

intent = handle（enum builder のみ）/ categoryId / menu / action / signal / sourceKind="lifeops" / cadenceEligible / requiresExplicitConfirmation。
descriptor = intent + uiLabel（採用|完了|後で|不要 の 4 語固定辞書）。
**candidate からは category と menu 以外を読まない**（placeQuery/label/riskFlags/dueReason 文字列は構造的に不到達）。free text/PII/user_id/id/raw row/source_ref の経路なし。

## 5. 変更ファイル
新 `lib/plan/reality/lifeops/lifeops-action-intent.ts`（pure・barrel 非 export）／新 test `realityLifeopsActionIntent.test.ts`（GPT 14 lock）／docs/log。
**card-presenter.ts（縦）には接続しない**: 縦は横非依存・横は consume のみの boundary を維持（条件付き許可は辞退）。descriptors の表示接続は UI action preview slice（次 gate）で判断。
