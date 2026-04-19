# CoAlter Stage 1 Understand — M0 昇格 Gate（正式版）

**locked 2026-04-20 (M0-5) / Gate 通過 = CEO 承認必須**

本書は `todayReaderLLM` を shadow から production default に昇格させるための
**必要条件**（all-of）を定義する。数値閾値はデータが揃った後に調整するが、
**gate 項目そのもの**は M0-5 時点で確定し、以後勝手に削除・緩和しない。

---

## Scope

対象: `lib/coalter/understanding/todayReaderLLM.ts` を
`runUnderstanding()` の本流として採用する（= `readTodayRuleBased` を退役させる）判断。

対象外:
- `fusePersonalLens` / `fuseRelationalLens` / `fairnessAdjustment` の LLM 化
- `judgeOutcome` / `OUTCOME_THRESHOLDS` の改定
- Stage 2 Curate / Stage 3 Resolve の LLM 化

---

## Gate 一覧（all-of）

### Gate A: 比較母数
| 項目 | 基準 |
| --- | --- |
| A-1 | fixture replay が **最低 100 件** 完了（`scripts/coalter/shadow-replay.ts` 実行ログ保管） |
| A-2 | 合成 pair 生成器が axis 分布 × 疲労 signal × ledger skew の **直交組合せ**を網羅 |
| A-3 | adversarial stub 5 strategy 以上で評価済み（均一 rule-copy ではない） |
| A-4 | 内部ペア実データ（最低 20 件）で shadow 実行済み（M0-6 以降） |

### Gate B: 精度
| 項目 | 基準 |
| --- | --- |
| B-1 | `modeAgreement >= 0.85`（合成 pair 全件 × 実データ全件の加重平均） |
| B-2 | `confidenceDelta` の絶対値中央値 <= 0.15（bias が過大でないこと） |
| B-3 | `latentNeedsDelta.overlapCount / max(ruleCount, llmCount)` の中央値 >= 0.5 |

### Gate C: 信頼性
| 項目 | 基準 |
| --- | --- |
| C-1 | `llmOutcome === "ok"` の率 >= 0.95 |
| C-2 | `llmOutcome === "error:exception"` の率 <= 0.01 |
| C-3 | `llmOutcome === "fallback:invalid_shape"` の率 <= 0.02 |

### Gate D: 性能
| 項目 | 基準 |
| --- | --- |
| D-1 | `latencyMs.llm` p95 が `latencyMs.rule` p95 の 10 倍以内（rule-based 比較）|
| D-2 | `latencyMs.llm` p99 が 5,000 ms 以内（絶対値上限） |
| D-3 | shadow 並列実行時の fusion / fairness latency 劣化が誤差範囲（+20% 以内） |

### Gate E: 漏洩監査（raw text / PII）

**手続**: 下記 checklist を M0-5 / M0-6 / 昇格直前で 3 回実行し、全 PASS のログを保管する。

| # | Check | PASS 判定 |
| - | --- | --- |
| E-1 | 型 guard 3 本が compile 通過 | `_COMPRESS_GUARD` / `_COMPARE_GUARD` / `_DIAGNOSTICS_GUARD` が tsc error なし |
| E-2 | LLM prompt 組立ファイルに `displayName` / `userId` / `body` / `quote` 参照なし | `grep -nE "\.displayName\|\.userId\|\.body\|\.quote" lib/coalter/understanding/` で 0 件 |
| E-3 | diagnostics payload key が許可リスト内のみ | `tests/unit/coalter/understanding/diagnostics.test.ts` の「payload キーは許可リスト内のみ」が PASS |
| E-4 | LLM adapter に DB 書き込み経路なし | `grep -nE "insert\|update\|from\(.*\)" lib/coalter/understanding/**/*.ts` で Supabase client 呼出 0 件 |
| E-5 | console.log / analytics event 経路に raw prompt / raw output なし | adapter 側で prompt / rawOutput を closure 外へ漏らさない（審査は code review） |

### Gate F: 決定性・互換性
| 項目 | 基準 |
| --- | --- |
| F-1 | 本流昇格後の置換戦略が文書化されている（snapshot → 確率的許容域 or 決定論 seed 固定） |
| F-2 | 既存の `runUnderstanding.test.ts` 決定性テスト（同 bundle 2 回実行 deep equal）が**置換**ではなく**廃止の可否**で判断されている（感想 not allowed） |
| F-3 | `judgeOutcome` の 22 本の境界値テストに対し、LLM confidence 変動での破綻率が定量化されている |

### Gate G: 運用
| 項目 | 基準 |
| --- | --- |
| G-1 | Kill switch が本流昇格後も **有効**（勝手に OFF にできない、失敗時 rule-based に即時 fallback 可能） |
| G-2 | 監視 dashboard に llmOutcome 分布 / latency / modeAgreement が載る |
| G-3 | ロールバック手順が `docs/` に明文化されている |

---

---

## M0-6 の段階分割（M0-6A / M0-6B）

**locked 2026-04-20 (M0-6)**

M0-6 は実 API 接続を伴う局面だが、母数の健全性を先に担保するため
次の 2 段階に分ける。M0-6B は **M0-6A 完了 + CEO 明示承認**が前提。

### M0-6A: synthetic matrix 拡張（実 API 不使用）

**完了条件**:
- `buildExtendedMatrix()` が `syntheticPairs.ts` に存在し **50 件**を返す
- rule-based `readToday` で判定した mode 分布が **5 mode 全てに 10 件以上**
- 各 case id の prefix (`rec` / `cel` / `cha` / `con` / `mai`) と rule-based mode が
  1-to-1 で一致するテストが PASS
- `shadow-replay.ts` は default で extended matrix を使用し、全 250 件
  (50 × 5 strategies) が `llmOutcome="ok"` で完走
- 本番 runtime / DB / analytics は未接続のまま

**この段階では**:
- 実 API 呼び出し禁止
- prod 環境変数 / secret 参照禁止
- `docs/decision-log.md` への昇格提案はしない（データ準備中のため）

### M0-6B: 実 API shadow 接続（内部ペア少数 + 完全 shadow）

**着手条件 (all-of)**:
1. M0-6A 完了
2. 内部ペア **最低 20 件** の consent / 匿名化経路が明文化されている
3. LLM adapter が ZDR プロバイダ (Anthropic ZDR enrollment) で稼働する構成
4. prompt / raw output / PII を DB・analytics・log に残さない経路設計が
   code review 1 回 PASS

**観測 observables**:
- `llmOutcome` の OK / fallback / error 内訳
- `latencyMs.llm` の p50 / p95 / p99（ZDR provider 経由込み）
- `modeAgreement` 実データ側集計（synthetic と分離）
- `confidenceDelta` 分布
- `llmOutcome === "fallback:invalid_shape"` の原因種別（shape / unknown mode / NaN）
- exception 種別（timeout / auth / 429 / 5xx）

**昇格判定はこの段階ではまだ行わない**。
Gate A-1 / A-3 / A-4 のログ収集と Gate E(漏洩監査) の 2 回目実施が主目的。

---

## Gate 判定の記録

CEO 承認ログは `docs/decision-log.md` に次の形式で残す:

```
[YYYY-MM-DD] [Build Unit] [CoAlter M0 昇格 Gate X-Y PASS / 差戻し] [承認: CEO]
  根拠: <ログ path / commit hash / 数値>
```

**Gate A〜G 全 PASS** が揃い、かつ **CEO が明示承認** しない限り、
`runUnderstanding` の本流を LLM 版に切り替えない。
