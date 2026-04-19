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
| review 日 | `__未記入__` |
| review 実施者 | `__未記入__`（CEO or Build Unit 担当者、AI を含まない） |
| 対象 Milestone | CoAlter Stage 1 Understand M0-6B |
| 対象 branch | `__未記入__` |
| 対象 commit hash（base） | `__未記入__` |
| 対象 commit hash（head） | `__未記入__` |
| diff 範囲 | `__未記入__`（例: `lib/coalter/understanding/realApiAdapter.ts` 等） |

---

## 1. review 対象ファイル一覧

M0-6B 実装時に追加される予定のファイル（実装後に列挙）:

| ファイル path | 役割 | 実装状況 |
| --- | --- | --- |
| `__未記入__` | 実 LLM adapter | `__未記入__` |
| `__未記入__` | internal-pair export script | `__未記入__` |
| `__未記入__` | shadow-real-api runner | `__未記入__` |

---

## 2. チェック項目 — M0-6B prerequisites §3 前提③ に一致

4 項目全てが明示 PASS でない限り、M0-6B は着手不可。

### 2.1 adapter が DB / analytics / log に書込なし

```
[ ] adapter コード内に supabase client 呼出が存在しない
    (grep 結果: __未記入__)
[ ] adapter コード内に analytics event 発火が存在しない
    (grep 結果: __未記入__)
[ ] adapter コード内に raw output を出す console.log / console.error が存在しない
    (grep 結果: __未記入__)
```

judgement: `__未記入__`（PASS / FAIL）
根拠 commit hash: `__未記入__`

### 2.2 prompt 組立関数が turns.body / email / displayName / userId を参照しない

```
[ ] 対象関数名: __未記入__
[ ] `.body` 参照なし
[ ] `.email` 参照なし
[ ] `.displayName` 参照なし
[ ] `.userId` 参照なし
[ ] 検証: scripts/coalter/leak-audit.sh PASS
    (実行日時: __未記入__ / 出力: __未記入__)
[ ] 検証: tests/unit/coalter/understanding/leakAudit.test.ts PASS
    (実行日時: __未記入__ / 出力: __未記入__)
```

judgement: `__未記入__`（PASS / FAIL）

### 2.3 catch した exception に raw output を含めない

```
[ ] adapter 内の try/catch を全列挙: __未記入__
[ ] catch block 内で raw response body を error message に混ぜていない
[ ] catch block 内で prompt を error message に混ぜていない
[ ] fallback return が LLMReaderResult error form を返す（implicitIntent/prompt/rawOutput を含まない）
```

judgement: `__未記入__`（PASS / FAIL）

### 2.4 console.log 経路がない

```
[ ] adapter / export script / runner に prompt / rawOutput / rawRationale / implicitIntent を
    stdout に出す経路がない
[ ] shadow-real-api runner の集約出力は「集計値のみ」（count / percentile / ratio）
[ ] Node の debug logger / pino / winston 等への経路もない
```

judgement: `__未記入__`（PASS / FAIL）

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
| 4 項目すべて PASS か | `__未記入__`（はい / いいえ） |
| FAIL がある場合の再 review 予定 | `__未記入__` |
| CEO 宛の申し送り | `__未記入__` |

**本書記入 + 総合判定 PASS + decision-log.md の CEO 承認エントリ** の 3 点が揃ったら、
M0-6B に着手可。いずれか欠ければ lock は保持。

---

## 5. 付録: leak-audit / leakAudit.test.ts 実行ログ貼付欄

実行結果の貼付は raw output を含んでよい（grep 0 件や test PASS は PII を含まない）。
ただし `--stderr` への実データが出ないことを事前に確認すること。

```
$ bash scripts/coalter/leak-audit.sh
__未記入__
```

```
$ npx vitest run tests/unit/coalter/understanding/leakAudit.test.ts
__未記入__
```

---

## 関連ドキュメント

- [coalter-m0-6b-prerequisites.md](./coalter-m0-6b-prerequisites.md) — M0-6B 着手前提の正式定義
- [coalter-m0-promotion-gates.md](./coalter-m0-promotion-gates.md) — Gate E（漏洩監査）
