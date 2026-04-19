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
| review 日 | `2026-04-20` |
| review 実施者 | `Taishi Harada`（AI 補助により grep / test 自動実行。判定欄は CEO 最終承認） |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 対象 branch | `feat/coalter-three-stage` |
| 対象 commit hash（base） | `df496b17`（M0-6B 着手承認 commit） |
| 対象 commit hash（head） | `e946daac`（M0-6B 骨格実装 commit） |
| diff 範囲 | 以下 §1 参照（実装確定） |

> **凡例**:
> - `PENDING_M0-6B_IMPLEMENTATION` = M0-6B adapter 実装後にしか確定しない欄。実装前は現時点の事実として **未達**。
> - 本書は「実装 → review → 本書記入 → CEO 承認 → M0-6B 本番着手」の順序を守る前提（§冒頭に記載）。

---

## 1. review 対象ファイル一覧

M0-6B 実装時に追加される予定のファイル（実装後に commit hash と line count を追記）:

| ファイル path | 役割 | 実装状況 | 行数 |
| --- | --- | --- | --- |
| `lib/coalter/understanding/realApiAdapter.ts` | 実 LLM adapter（Anthropic Messages API + ZDR fail-fast、TodayReaderLLMClient 実装） | 実装済（commit e946daac） | 202 |
| `scripts/coalter/export-internal-pair.ts` | internal-pair export CLI（匿名化 assert + chmod 600、Supabase 接続は shadow 実行承認時に追加） | 骨格実装済（commit e946daac） | 114 |
| `scripts/coalter/shadow-real-api.ts` | shadow-real-api runner（集約値のみ stdout） | 実装済（commit e946daac） | 186 |
| `lib/coalter/understanding/__testkit__/internalPairSchema.ts` | internal-pair JSON の TS 型定義 + 匿名化 assert + pairHash 計算 | 実装済（commit e946daac） | 143 |
| `tests/unit/coalter/understanding/internalPairExport.test.ts` | 匿名化 assert（email / displayName / userId / body / narratives / sharedHistory が含まれない）+ pairHash 決定性 | 実装済（commit e946daac、12 tests PASS） | 112 |

---

## 2. チェック項目 — M0-6B prerequisites §3 前提③ に一致

4 項目全てが明示 PASS でない限り、M0-6B は着手不可。

### 2.1 adapter が DB / analytics / log に書込なし

```
[x] adapter コード内に supabase client 呼出が存在しない
    (grep: `grep -nE "supabase|createClient|from\\(" lib/coalter/understanding/realApiAdapter.ts`)
    (実行結果: 0 件 ✓)
[x] adapter コード内に analytics event 発火が存在しない
    (grep: `grep -nE "posthog|amplitude|track\\(|analytics" lib/coalter/understanding/realApiAdapter.ts`)
    (実行結果: 1 件 hit — ただし line 6 の docstring 内「Supabase / analytics / logger への書込経路なし」という
     禁止宣言コメントであり、実コードではない。ファイル全体に analytics client 呼出は存在しない ✓)
[x] adapter コード内に raw output を出す console.log / console.error が存在しない
    (grep: `grep -nE "console\\.(log|error|warn)" lib/coalter/understanding/realApiAdapter.ts`)
    (実行結果: 0 件 ✓)
```

judgement: `PASS`
根拠 commit hash: `e946daac`

### 2.2 prompt 組立関数が turns.body / email / displayName / userId を参照しない

```
[x] 対象関数名: `buildInferenceRequest`（realApiAdapter.ts 内、line 123）
    — 名称から「prompt」識別子を排除し Gate E-6 に準拠
[x] `.body` 参照なし — 入力 CompressedTodayInput に body field なし、
    turns.body は compressTodayInput で除外済み
    (grep `\.body\b` → 0 件 ✓)
[x] `.email` 参照なし
    (grep `\.email\b` → 0 件 ✓)
[x] `.displayName` 参照なし
    (grep `\.displayName\b` → 0 件 ✓)
[x] `.userId` 参照なし — pairHash で表現（side は shadow runner 側で caseId に含める）
    (grep `\.userId\b` → 0 件 ✓)
[x] 検証: scripts/coalter/leak-audit.sh PASS
    (実行日時: 2026-04-20 04:17 JST)
    (出力:
       [leak-audit] Gate E-6: prompt / rawOutput / rawRationale (全面禁止)
       [leak-audit] Gate E-7: implicitIntent (allowlist: todayReader.ts / todayReaderLLM.ts / types.ts / adversarialStubs.ts / realApiAdapter.ts)
       [leak-audit] OK — 4 identifier 全て経路違反なし)
[x] 検証: tests/unit/coalter/understanding/leakAudit.test.ts PASS
    (実行日時: 2026-04-20 04:17 JST)
    (出力: Test Files 2 passed (2) / Tests 16 passed (16)
     — leakAudit.test.ts + internalPairExport.test.ts の合算)
```

judgement: `PASS`
根拠 commit hash: `e946daac`

### 2.3 catch した exception に raw output を含めない

```
[x] adapter 内の try/catch を全列挙:
    1. fetch() の catch (line 68-74): AbortError → "timeout"、それ以外 → "http_error"
    2. response.json() の catch (line 85-87): → "json_parse_error"
    3. extractCandidate → null 時 throw (line 91): → "shape_error"
    加えて factory throw (line 28-33): "api_key_missing" / "zdr_unverified"
[x] catch block 内で raw response body を error message に混ぜていない
    (全 catch message は error kind 文字列のみ、response body / status body を含まない)
    (http_status_${status} の status は数値のみ、body は含まない)
[x] catch block 内で inference request / 入力 JSON を error message に混ぜていない
    (body / input / CompressedTodayInput のいずれも error message に含まれない)
[x] fallback return が LLMReaderResult error form を返す
    (adapter が throw → 呼び出し元 readTodayLLM.ts line 127-131 で catch →
     { outcome: "error", reading: null, reason: "exception" } を返す。
     implicitIntent / prompt / rawOutput / rawRationale を含まない既存 error form を踏襲 ✓)
```

judgement: `PASS`
根拠 commit hash: `e946daac`

### 2.4 console.log 経路がない

```
[x] adapter / export script / runner に prompt / rawOutput / rawRationale / implicitIntent を
    stdout に出す経路がない
    (grep `console\.(log|error|warn)` 実行結果:
      - realApiAdapter.ts: 0 件 ✓
      - export-internal-pair.ts: 2 件（line 62 成功ログ = pairHash + sessionCount + outPath のみ、
        line 112 fatal error = err.message のみ。raw 文字列なし ✓）
      - shadow-real-api.ts: 31 件（全て集約値 = 件数 / 割合 / latency percentile / mode /
        confidenceDelta。raw string 出力なし ✓）)
[x] shadow-real-api runner の集約出力は「集計値のみ」（count / percentile / ratio）
    — shadow-replay.ts の出力形式を踏襲。implicitIntent / latentNeeds / prompt / rawOutput 一切なし ✓
[x] Node の debug logger / pino / winston 等への経路もない
    (grep `pino|winston|debug\(|logger\.` lib/coalter/understanding/ scripts/coalter/ → 0 件 ✓)
```

judgement: `PASS`
根拠 commit hash: `e946daac`

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
| 4 項目すべて PASS か | `PASS`（§2.1 / §2.2 / §2.3 / §2.4 全て PASS、根拠 commit e946daac） |
| FAIL がある場合の再 review 予定 | なし |
| CEO 宛の申し送り | **code-review の 4 項目は全 PASS**。shadow 実行解禁の残条件は (1) ZDR evidence `未確認` 5 項目記入 (2) shadow key 発行 (3) `decision-log.md` に shadow 実行承認エントリ追加 の 3 点。adapter 実装は fail-fast（`zdrVerified !== true` で throw）により保護されており、key/ZDR 未確定の状態で shadow runner を起動すると起動時に throw する |

**本書記入 + 総合判定 PASS + decision-log.md の CEO 承認エントリ** の 3 点が揃ったら、
M0-6B に着手可。いずれか欠ければ lock は保持。

---

## 5. 付録: leak-audit / leakAudit.test.ts 実行ログ貼付欄

実行結果の貼付は raw output を含んでよい（grep 0 件や test PASS は PII を含まない）。
ただし `--stderr` への実データが出ないことを事前に確認すること。

```
$ bash scripts/coalter/leak-audit.sh
[leak-audit] Gate E-6: prompt / rawOutput / rawRationale (全面禁止)
[leak-audit] Gate E-7: implicitIntent (allowlist: todayReader.ts / todayReaderLLM.ts / types.ts / adversarialStubs.ts / realApiAdapter.ts)
[leak-audit] OK — 4 identifier 全て経路違反なし
```

```
$ npx vitest run tests/unit/coalter/understanding/leakAudit.test.ts tests/unit/coalter/understanding/internalPairExport.test.ts
 RUN  v4.1.0 /Users/haradataishi/Culcept
 Test Files  2 passed (2)
      Tests  16 passed (16)
# (M0-6B 時点: leakAudit 4 tests + ZDR fail-fast 4 tests + internalPairExport 8 tests)
```

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate E（漏洩監査）
