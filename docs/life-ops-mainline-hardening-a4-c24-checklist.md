# Life Ops — A-4-c24 Mainline Staging Hardening（audit/mini-design + CEO 観測 checklist）

> 2026-06-11 / CEO・GPT GO。production deny 解除ではない。**禁止**: PlanClient 大改造・R4・notification・production enable・push/PR/merge。

---

## 1. Read-only audit（8 点）

1. **later/dismiss 本線経路**: mainline action → `routeLifeOpsMainlineActionRequest`（両 action ∈ 許可 set・confirm 不要）→ c17 route → intent → writer。実装済み・**E2E 未観測**（本 run で消化）。
2. **cooldown 現仕様**: writer guard `shouldWriteLifeOpsFeedback`＝**同一 handle×action が 10 分以内 → duplicate_cooldown（insert 呼ばず）**。
   recent は mainline action が **gated read の observations から注入**（read flag ON 環境で実効）。2 回目 submit は server 再 read で 1 行目を検出 → 構造的に **2 件以上 write されない**。PRG が連打再送も防止。
3. **連打時 UI**: 1 押し=1 PRG。2 回目は token=duplicate_cooldown → 固定文言。
4. **文言**: 「少し前に同じ記録があります（重複防止のため記録しませんでした）」等は妥当。★**発見（polish 対象）**: result 行が全 token で
   成功色（emerald・bold）＝ duplicate/invalid/failed も成功に見える → **非成功 token は amber・非 bold へ**（本 slice で修正）。
5. **done 整合**: later/dismiss=即時 / done=2 段階のみ（route 共有・c23 test 済み）。
6. **cleanup**: c18b script が `LIFEOPS_DOGFOOD_CLEANUP_ACTION=later|dismiss|done` 対応済み。
7. **390px**: c23b 実機 OK 済み → CSS 追加修正なし。
8. **card 位置/文言**: c23b 違和感報告なし → 変更は §4 の result 色のみ。

## 2. CEO 観測手順（A→C・各 action 後に cleanup・repo root）

**共通 before**（全 0 確認・read-only）:
```bash
LIFEOPS_FEEDBACK_SMOKE_GO=1 LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true \
LIFEOPS_CADENCE_READONLY=true NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-readonly-smoke.ts
```
**dev server**（c23b と同じ + MAINLINE）:
```bash
REALITY_CANDIDATE_ACTIONS_DEV_HOST=true REALITY_PIPELINE_PREVIEW=true LIFEOPS_MAINLINE=true \
LIFEOPS_REALDATA_READONLY=true LIFEOPS_FEEDBACK_READONLY=true LIFEOPS_CADENCE_READONLY=true \
LIFEOPS_FEEDBACK_WRITE=true npm run dev
```

**A. later**: `/plan` の card で 1 候補の「後で」を 1 回 → 結果「記録しました。予定には追加しません…」→ smoke: **obs=1 / fbCad=0 / realCad=0**（later は cadence に影響しない）→ cleanup（下記・ACTION=later）→ smoke 全 0。
**B. dismiss**: 「不要」を 1 回 → 同様に **obs=1 / fbCad=0 / realCad=0** → cleanup（ACTION=dismiss）→ 全 0。
**C. cooldown**: 同一候補の「後で」を **2 回**（1 回目→記録しました／2 回目→**「少し前に同じ記録があります…」が非成功色（amber）**で出る）→ smoke: **obs=1（2 件にならない）** → cleanup（ACTION=later・**check で対象 1 件**であること自体が cooldown の証明）→ 全 0。

**cleanup（check→confirm 二段・ACTION を差し替え）**:
```bash
LIFEOPS_DOGFOOD_CLEANUP_GO=1 LIFEOPS_DOGFOOD_CLEANUP_ACTION=later \
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/lifeops-feedback-dogfood-cleanup.ts
# 対象 1 件なら + LIFEOPS_DOGFOOD_CLEANUP_CONFIRM=1 で再実行
```

**Abort**: before≠0／C で obs=2（cooldown 不発）／cleanup check≠1 件 → 停止して出力返送。
done は今回**使わない**（A/B/C とも cadence 影響なしの action のみ）。

## 3. 報告テンプレート
```
A later: 結果文言OK / obs=1 / fbCad=0 / realCad=0 / cleanup 1件 / after 0
B dismiss: 同上
C cooldown: 1回目=記録しました / 2回目=重複文言(amber・非bold) / obs=1のまま / cleanup 1件 / after 0
文言・UX違和感: …
```

## 4. 本 slice の実装変更（最小）
LifeOpsMainlineCard の result 行: **ok/ok_done のみ emerald・bold**、それ以外（duplicate/gate_off/invalid/denied/failed）は amber・通常 weight（過剰な成功表示の排除）。render contract test 追加。
