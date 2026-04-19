# CoAlter M0-6B Code Review 記録（雛形）

> **この文書は雛形です**。全ての `__未記入__` 欄は review 実施者（CEO または
> Build Unit 担当者）が手書きで埋める。AI が自動で PASS マークを入れてはならない
> （M0-6B prerequisites §3 前提③ のため）。
>
> 記入完了までは M0-6B 着手不可。
>
> **注意**: review 対象は M0-6B で追加予定の adapter / export script コードである。
> 本書の記入は **adapter 実装 → review → この文書を埋める → CEO 承認 → M0-6B 本番着手**
> の順で行う。この順序が守られることが判定条件そのもの。

---

## 0. メタ

| 項目 | 値 |
| --- | --- |
| review 日 | `PENDING_M0-6B_IMPLEMENTATION`（adapter 実装後に記入） |
| review 実施者 | `Taishi Harada`（予定 — AI を含まない人間 review） |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 対象 branch | `feat/coalter-three-stage`（現在の作業ブランチ、実装時に変更される可能性あり） |
| 対象 commit hash（base） | `PENDING_M0-6B_IMPLEMENTATION`（本日時点の tip が base、実装後に正式記入） |
| 対象 commit hash（head） | `PENDING_M0-6B_IMPLEMENTATION` |
| diff 範囲 | 以下 §1 参照（実装時に増減） |

> **凡例**:
> - `PENDING_M0-6B_IMPLEMENTATION` = M0-6B adapter 実装後にしか確定しない欄。実装前は現時点の事実として **未達**。
> - 本書は「実装 → review → 本書記入 → CEO 承認 → M0-6B 本番着手」の順序を守る前提（§冒頭に記載）。

---

## 1. review 対象ファイル一覧

M0-6B 実装時に追加される予定のファイル（実装後に commit hash と line count を追記）:

| ファイル path | 役割 | 実装状況 |
| --- | --- | --- |
| `lib/coalter/understanding/realApiAdapter.ts`（予定） | 実 LLM adapter（Anthropic ZDR endpoint、TodayReaderLLMClient 実装） | PENDING_M0-6B_IMPLEMENTATION |
| `scripts/coalter/export-internal-pair.ts`（予定） | internal-pair export script（匿名化済み JSON 出力） | PENDING_M0-6B_IMPLEMENTATION |
| `scripts/coalter/shadow-real-api.ts`（予定） | shadow-real-api runner（集約値のみ stdout） | PENDING_M0-6B_IMPLEMENTATION |
| `lib/coalter/understanding/__testkit__/internalPairSchema.ts`（予定） | internal-pair JSON の TS 型定義 | PENDING_M0-6B_IMPLEMENTATION |
| `tests/unit/coalter/understanding/internalPairExport.test.ts`（予定） | 匿名化 assert（email / displayName / userId / body が含まれない） | PENDING_M0-6B_IMPLEMENTATION |

---

## 2. チェック項目 — M0-6B prerequisites §3 前提③ に一致

4 項目全てが明示 PASS でない限り、M0-6B は着手不可。

### 2.1 adapter が DB / analytics / log に書込なし

```
[ ] adapter コード内に supabase client 呼出が存在しない
    (想定 grep: `grep -nE "supabase|createClient|from\\(" lib/coalter/understanding/realApiAdapter.ts` → 0 件)
    (grep 結果: PENDING_M0-6B_IMPLEMENTATION)
[ ] adapter コード内に analytics event 発火が存在しない
    (想定 grep: `grep -nE "posthog|amplitude|track\\(|analytics" lib/coalter/understanding/realApiAdapter.ts` → 0 件)
    (grep 結果: PENDING_M0-6B_IMPLEMENTATION)
[ ] adapter コード内に raw output を出す console.log / console.error が存在しない
    (想定 grep: `grep -nE "console\\.(log|error|warn)" lib/coalter/understanding/realApiAdapter.ts` → 0 件、ただし末尾 4 文字の key ログ等の最小例外は review で個別判定)
    (grep 結果: PENDING_M0-6B_IMPLEMENTATION)
```

judgement: `PENDING_M0-6B_IMPLEMENTATION`（PASS / FAIL — adapter 未実装のため判定不能）
根拠 commit hash: `PENDING_M0-6B_IMPLEMENTATION`

### 2.2 prompt 組立関数が turns.body / email / displayName / userId を参照しない

```
[ ] 対象関数名: `buildPromptFromCompressed`（予定、realApiAdapter.ts 内）
[ ] `.body` 参照なし — 想定: 入力は CompressedTodayInput 型のみ、turns.body は compressTodayInput で除外済み
[ ] `.email` 参照なし — 想定: CompressedTodayInput に email field なし
[ ] `.displayName` 参照なし — 同上
[ ] `.userId` 参照なし — pairHash + side("a"/"b") で表現
[ ] 検証: scripts/coalter/leak-audit.sh PASS
    (実行日時: PENDING_M0-6B_IMPLEMENTATION / 出力: PENDING_M0-6B_IMPLEMENTATION)
[ ] 検証: tests/unit/coalter/understanding/leakAudit.test.ts PASS
    (実行日時: PENDING_M0-6B_IMPLEMENTATION / 出力: PENDING_M0-6B_IMPLEMENTATION)
```

judgement: `PENDING_M0-6B_IMPLEMENTATION`（adapter 未実装のため判定不能）

### 2.3 catch した exception に raw output を含めない

```
[ ] adapter 内の try/catch を全列挙: PENDING_M0-6B_IMPLEMENTATION（想定箇所: HTTP request / JSON parse / schema validation の 3 箇所）
[ ] catch block 内で raw response body を error message に混ぜていない（想定実装: error.message = kind のみ、body は捨てる）
[ ] catch block 内で prompt を error message に混ぜていない
[ ] fallback return が LLMReaderResult error form を返す（implicitIntent/prompt/rawOutput を含まない — 既存 todayReaderLLM.ts の error form を踏襲）
```

judgement: `PENDING_M0-6B_IMPLEMENTATION`（adapter 未実装のため判定不能）

### 2.4 console.log 経路がない

```
[ ] adapter / export script / runner に prompt / rawOutput / rawRationale / implicitIntent を
    stdout に出す経路がない
    (想定 grep: `grep -rnE "console\\.(log|error|warn)" lib/coalter/understanding/realApiAdapter.ts scripts/coalter/{export-internal-pair,shadow-real-api}.ts` → 集計値以外の出力 0 件)
[ ] shadow-real-api runner の集約出力は「集計値のみ」（count / percentile / ratio）
    — 既存 `shadow-replay.ts` の出力形式を踏襲する
[ ] Node の debug logger / pino / winston 等への経路もない
    (想定 grep: `grep -rnE "pino|winston|debug\\(|logger\\." lib/coalter/understanding/ scripts/coalter/` → 0 件)
```

judgement: `PENDING_M0-6B_IMPLEMENTATION`（adapter 未実装のため判定不能）

---

## 3. 追加観察事項

review 中に見つかった事項（あれば追記）:

| # | 観察事項 | 重要度 | 対応 |
| --- | --- | --- | --- |
| (空) | | | |

---

## 4. 総合判定

| 項目 | 値 |
| --- | --- |
| 4 項目すべて PASS か | `PENDING_M0-6B_IMPLEMENTATION`（adapter 未実装、review 対象なし） |
| FAIL がある場合の再 review 予定 | 実装後の review で FAIL 発生時に記入 |
| CEO 宛の申し送り | **現時点では本書は「実装後 review の雛形」として commit 済み**。adapter 実装着手に先立ち本書の §1 にファイル path を追加し、実装が済んだ時点で §2.1〜§2.4 を PASS/FAIL 判定で埋める |

**本書記入 + 総合判定 PASS + decision-log.md の CEO 承認エントリ** の 3 点が揃ったら、
M0-6B に着手可。いずれか欠ければ lock は保持。

---

## 5. 付録: leak-audit / leakAudit.test.ts 実行ログ貼付欄

実行結果の貼付は raw output を含んでよい（grep 0 件や test PASS は PII を含まない）。
ただし `--stderr` への実データが出ないことを事前に確認すること。

```
$ bash scripts/coalter/leak-audit.sh
PENDING_M0-6B_IMPLEMENTATION
# (M0-6A 時点の実行結果参考:
#  [leak-audit] Gate E-6: prompt / rawOutput / rawRationale (全面禁止)
#  [leak-audit] Gate E-7: implicitIntent (allowlist: ...)
#  [leak-audit] OK — 4 identifier 全て経路違反なし)
```

```
$ npx vitest run tests/unit/coalter/understanding/leakAudit.test.ts
PENDING_M0-6B_IMPLEMENTATION
# (M0-6A 時点の実行結果参考: 5 tests passed)
```

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate E（漏洩監査）
