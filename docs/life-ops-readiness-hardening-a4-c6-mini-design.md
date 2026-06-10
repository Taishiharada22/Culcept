# Life Ops — A-4-c6 Readiness Hardening Mini-Design（WATCH 潰し + 実データ前安全設計）

> 2026-06-10 / CEO・GPT 指示「本線接続前の堅牢化: ①overdue headline escalation ②deadline-only day の Moment policy 明文化 ③5 層 cap 設計。実データ接続は禁止」。
> **禁止**: 実データ源 read-only/DB/notification/R4 本線/PlanClient/UI card 本線/導線/外部 API/production/push/PR/merge。

---

## 1. Overdue headline escalation（仕様）

- **条件**: recommended tier の fitting に `deadline ∧ overdue` の候補がある。
- **文言（一段だけ強く・非断定・低圧）**: `「{label}」は期日を過ぎています。今日は少しだけでも触れると安心です`
  - 通常 deadline（「先にすませると安心です」）より**一段強い**（事実の明示 + 低圧の後押し）が、**督促ではない**（「少しだけでも」）。
- **禁止語**: 「必ず」「今すぐ」「しなければ」「〜してください」、不安を煽る表現（test 固定・既存 ASSERTIVE regex に「今すぐ」追加）。
- **test 固定**: overdue あり → escalated 文言／なし → 通常文言（両方向 lock）。

## 2. Deadline-only day の Moment policy（明文化・結論）

**結論: 「朝に言ったことは繰り返さない」を原則維持。ただし overdue / due-today（daysUntilDeadline ≤ 0）だけは例外として、昼に一度だけそっと出してよい。**

| 論点 | 結論 | 理由 |
|---|---|---|
| 朝に代表表示済みなら Moment は原則沈黙か | **YES（維持）** | nagging 回避が秘書性の核。朝に伝えた通常候補の再提示は督促になる |
| overdue / due-today は重複しても 1 回出すか | **YES（例外）** | 「期限を逃す実害」＞「1 回の再提示の煩わしさ」。deadline が 3 案から消えない原則（生活破綻防止）の時間軸への拡張 |
| focus / recovery 中の沈黙 | **例外なく維持** | 集中・回復は期限より優先（既存 lock test 維持） |
| 出る場合の形 | **preview VM のみ**（通知ではない・cap 1・非断定文言） | 既存契約維持 |

**実装位置 = 統合層（compute）の exclude 政策**（moment の機構は不変）:
- `computeLifeOpsPreviewDto` の excludeKeys から **urgent deadline（overdue ∨ daysUntil ≤ 0）の代表 key を除外しない**（=Moment が一度拾える）。
- **「一度だけ」の担保**: 発火後は caller（将来の本線/観測者）が同じ excludeKeys 機構に key を追加する運用（既存 cooldown 契約のまま・機構追加なし）。
- 非 urgent の代表は従来どおり exclude（test 固定）。

## 3. 5 層 cap 設計（実データ read-only 前の必須 gate・本 slice は pure helper + test まで）

| # | cap | 定数（既定） | 適用点 | 本 slice |
|---|---|---|---|---|
| 1 | raw input cap | `RAW_INPUT_CAP=50`/配列 | collector **入力**（実 reader の limit と併用） | pure helper `capRawLifeOpsInputs`（**未配線**・実データ slice で reader 直後に） |
| 2 | candidate pool cap | `CANDIDATE_POOL_CAP=12` | collector 出力 → placement 入力 | pure helper `capLifeOpsCandidatePool`（**未配線**・同上） |
| 3 | tier fitting cap | `TIER_FITTING_CAP=5` | compose per-tier fitting | **定数のみ定義**（pool cap=12 が上流で爆発を抑止するため必須でない・体験上限として実データ slice で配線判断） |
| 4 | representative display cap | `BRIEFING_HIGHLIGHT_MAX=3`（既存） | briefing/moment | 既存どおり |
| 5 | overflow summary cap | `OVERFLOW_RETAINED_CAP=5` | compose overflow 配列の保持上限 | **定数のみ定義**（VM line は既に count 縮約・配列も pool cap で ≤12 に bound 済み・配線は実データ slice） |

**pool cap の不変条件（混同の再発防止）**:
- **deadline は不滅**: deadline kind は cap を超えても**必ず保持**（カテゴリ数で自然に bound）。
- **lane 多様性 floor**: easy / push lane それぞれ**最低 2 枠**（存在すれば）を保証 — urgency 上位が deadline/event で埋まっても push が死なない（A-4-c4 の教訓を pool 層で再保証）。
- 残り枠は global urgency 順。**dropped は count で返す**（黙って捨てない・「ほかにも◯件」素材）。
- **pool cap（判断材料）≠ presentation cap（見せる量）** を定数名と doc で分離。

**wiring 計画（実データ slice・別 GO）**: reader → `capRawLifeOpsInputs` → collector → `capLifeOpsCandidatePool` → placement(∞ pool) → compose（必要なら TIER_FITTING_CAP/OVERFLOW_RETAINED_CAP）→ briefing/moment（≤3）。**この配線が済むまで実データ read-only gate は開かない**（A-4-c4 §4 の gate を具体化）。

## 4. Page 縦長（L7）
観測継続（operator preview では許容・UI 整理は本 slice では行わない）。

## 変更ファイル
briefing（overdue 分岐）/ compute（urgent-deadline exclude 政策）/ placement（`lifeOpsLaneOf` export・pool cap helper が使用）/ **新** `lifeops-pool-cap.ts` + tests / 既存 tests 更新（escalation・policy lock・banned に「今すぐ」）/ dogfood-log（record 13=検証 dump）。
