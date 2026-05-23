# Phase 3-N-3 Plan Audit — Empty Day → ALTER Observation Entry

**作成日**: 2026-05-23
**branch**: `docs/plan-phase3-n-3-plan-audit`
**前提**: N-3 readiness audit `cf869f6d` 着地後、 CEO + GPT 補正 (= 哲学的境界 B/C hybrid 確定 + 禁止/許可表現確定 + merge 戦略 frozen 維持) を受けて、 N-3a 最小実装の plan audit を着地
**性質**: docs only (= 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0)

---

## 0. CEO + GPT 補正反映 (= readiness 後の確定事項)

### 0.1 哲学的境界: **B/C hybrid 確定**

| 解釈 | 採用 |
|---|---|
| A (= generation、 「あなたの 1 日はこうした方が良い」) | ❌ 禁止 |
| **B** (= 観測の入口 + user 選択尊重) | ✅ 採用 |
| **C** (= 観測補助のみ、 push しない) | ✅ 採用 (= B と hybrid) |

**hybrid の意味**:
- 空き日に ALTER への入口を出す (= B 寄り)
- ただし AI が勝手に「おすすめ」 を押し出さない (= C 寄り)
- user が開いた時だけ、 観測・見立て・下書きとして出す (= C 寄り)
- final action は user が決める (= B 寄り)

### 0.2 禁止表現 (= 確定、 regression test 必須)

| 語彙 | 性質 |
|---|---|
| 「おすすめ」 | push 寄りの語、 generation 連想 |
| 「これをした方がいい」 | 強い助言、 user 選択侵食 |
| 「最適」 | optimization 違反 |
| 「推奨」 | push 寄りの語 |
| 「改善」 | optimization 連想 |
| 「警告」 / 「危険」 / 「注意」 / 「リスク」 | warning 系全面禁止 |

### 0.3 許可表現 (= 確定、 entry copy contract 候補)

| 語彙 | 性質 |
|---|---|
| 「見立て」 | observation の言語化 |
| 「下書き」 | user 選択を前提、 確定ではない |
| 「空き日の観測」 | 観測の入口 |
| 「今日を組む」 | user 主語、 active voice |
| 「ALTER で見る」 | 控えめ、 push せず |

### 0.4 既存資産の扱い

| 扱い | OK | NG |
|---|---|---|
| 既存 Daily Guidance / AlterHome 系資産の **read-only 調査** | ✅ | — |
| 既存 endpoint の **呼び出し** (= 後段で検討) | ✅ | — |
| /plan の空き日体験として接続 | ✅ | — |
| 既存 engine 内部改変 | — | ❌ Stargazer pivot |
| 新規 Stargazer phase 開始 | — | ❌ |
| Deploy / 初期ユーザー獲得 | — | ❌ |

### 0.5 merge 戦略

- /plan complete まで **frozen 維持** (= 戦略 C 採用)
- N-5 final closeout 後に PR/merge 戦略を再判断
- GitHub / push / fetch / gh は引き続き禁止

---

## 1. 既存 empty day surface inventory (= read-only 調査結果)

### 1.1 CalendarTab (= `app/(culcept)/plan/tabs/CalendarTab.tsx`)

**L 462-478**: 既存 empty day card 構造

```tsx
{selectedDayAnchors.length === 0 ? (
  <div
    className="rounded-2xl bg-slate-50 px-4 py-6 text-center"
    data-testid="plan-calendar-empty-day"
  >
    <p className="text-sm text-slate-500 mb-3">予定なし</p>
    {onAddRequest && (
      <button ... className="text-sm text-indigo-600 hover:underline" ...>
        + この日に予定を追加
      </button>
    )}
  </div>
)}
```

→ N-3 entry 追加点: card 内の button 横 or 下に 「ALTER で見る ›」 entry。

### 1.2 FlowTab (= `app/(culcept)/plan/tabs/FlowTab.tsx`)

**L 142-149**: ALTER 提案 card の **予約スペース** (= 既にコメントで言及)

```ts
// 最初の「予定なし」日 (ALTER 提案 card の文脈表示用)
const firstEmptyDayLabel = useMemo(() => {
  for (const d of days) {
    const list = dayAnchorsMap.get(iso) ?? [];
    if (list.length === 0) return formatJpDate(d);
  }
  return null; // 全日に anchor あり → card 非表示
}, [days, dayAnchorsMap]);
```

→ ⚠️ **発見**: 「ALTER 提案 card」 という命名が既に書かれているが、 「提案」 は禁止表現に近い。 N-3 では「ALTER 見立て card」 や「ALTER 観測 card」 等の許可表現に **更新が必要**。

**L 426-452**: 「予定なし ›」 inline button (= AddAnchorModal 起動)

```tsx
{!hasAnchors && onEmptyClick !== undefined && (
  <button onClick={onEmptyClick} className="text-xs text-slate-400 ..." >
    予定なし ›
  </button>
)}
```

→ N-3 entry 追加点: header 右側に「予定なし ›」 と並列 or 直下に「ALTER で見る ›」 entry。

### 1.3 MapTab (= `app/(culcept)/plan/tabs/MapTab.tsx`)

**L 12, 1329**: 「empty as silence」 voice 既確立

```
empty も含めて 9 categories 全表示 (Phase 2-C §11.10 empty as silence)
empty も含めて 9 categories 全表示
```

→ 但しこれは **category empty** (= 9 ジャンル毎の empty)、 **日次 empty** とは別概念。 N-3 の対象は日次 empty。

→ MapTab の日次 empty surface は別途確認 (= N-3a で詳細調査、 但し N-3a は entry UI 接続 phase ではないので後段の N-3b で実調査)。

### 1.4 既存 AlterModal の状況

- `grep -rn "AlterModal" app/ --include="*.tsx" --include="*.ts"` → **0 hit**
- 既存 alter UI は **存在しない** (= component として未実装、 N-3 で新規構築 or 別 path)

### 1.5 既存 alter API endpoint (= `app/api/stargazer/alter/`)

| sub-path | 役割 |
|---|---|
| `route.ts` | main endpoint (= Home Alter / Deep Alter / Perspective Engine 統合) |
| `feedback/` | feedback 受信 |
| `followup/` | follow-up flow |
| `home-insights/` | home insight 生成 |
| `selection/` | selection flow |

→ N-3 で empty day を扱う場合、 既存 endpoint への mode 追加 or 別 sub-path 新規。 但し N-3a/N-3b では LLM call なし (= endpoint touch なし)。

### 1.6 既存 alter engine (= `lib/stargazer/`)

| file | 性質 | N-3 利用候補 |
|---|---|---|
| `alter.ts` | core (= AlterPersonality / AlterMode 等) | 後段 LLM 接続時に参照 (= 改変なし) |
| `alterHomeAdapter.ts` | Home Alter 専用 (= ActionShape + ForceBalance + 結論+根拠+次の一手) | empty day mode は別、 但し infra は流用候補 |
| `alterContracts.ts` | 出力契約 | regression test 整合性 |
| `alterOutputGovernance.ts` | post-check / safety layer | N-3d 以降で参照 |

**重要発見**: alterHomeAdapter.ts の冒頭コメント:
> Deep Alter: ソクラテス式・内省特化・**助言禁止**
> Home Alter: 結論→根拠→**次の一手**の実用判断特化

→ Home Alter mode は「次の一手」 を出す設計。 N-3 で流用すると「次の一手」 = 「ALTER の提案」 に解釈される risk。 **N-3 は新規 mode が必要** (= empty day observation mode、 「user の選択を促す観測」)。

→ **但し**: 「mode 追加」 = engine 内部改変 = Stargazer pivot 越境の可能性。 N-3a/N-3b では LLM 接続なし、 N-3c 以降で **既存 mode の流用可否** + **新 mode 必要性** を改めて plan audit (= 別 doc) で確定。

---

## 2. 空き日カード / empty day surface の正確な場所 (= CEO 指定 #1)

### 2.1 確定 (= 既存 surface を流用、 新規追加なし)

| tab | 場所 | 既存実装 |
|---|---|---|
| CalendarTab | `data-testid="plan-calendar-empty-day"` card 内 | L 462-478 |
| FlowTab | `data-testid={`plan-flow-empty-${iso}`}` 周辺 | L 426-452 |
| MapTab | 日次 empty surface (= 後段調査) | TBD |

### 2.2 N-3a 段階では UI 接続しない

N-3a = **pure layer のみ** (= CEO 暫定 scope 遵守)。 各 tab の empty surface 場所を identify (= contract 化) し、 実 entry 追加は N-3b で。

### 2.3 統一 vs 個別

各 tab で empty 表現は微妙に異なる (= card / inline button / silence)。 entry copy は **統一** (= 「ALTER で見る ›」 で 3 tab 共通)、 配置 / styling は **tab 個別** (= 既存 surface に整合)。

---

## 3. Entry text (= CEO 指定 #2)

### 3.1 確定 候補 (= 許可表現組合せ)

| 候補 | 性質 | 採否 |
|---|---|---|
| **「ALTER で見る ›」** | 控えめ、 user initiated 連想、 「›」 で tap UX | ✅ **採用** |
| 「見立てを見る ›」 | やや観測寄り、 但し「見立て」 は internal 概念 | ⏸️ 保留 |
| 「今日を組む ›」 | active voice、 user 主語 | ⏸️ 保留 (= 「組む」 が作業感) |
| 「下書きを見る ›」 | 「下書き」 = 確定ではない、 控えめ | ⏸️ 保留 |
| 「空き日の観測」 | 観測語、 但し UI として長い | ❌ 不採用 |

### 3.2 entry copy contract (= N-3a で確定)

```typescript
export const EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›" as const;
```

### 3.3 禁止語 regression test (= N-3a で実装)

- entry label 内に「おすすめ」 / 「最適」 / 「推奨」 / 「改善」 / 「警告」 / 「危険」 / 「注意」 / 「リスク」 不在
- entry label 内に「ALTER」 + 「見る」 存在 (= 採用 candidate 確定保証)

---

## 4. Default hidden / user initiated (= CEO 指定 #3)

### 4.1 確定: **entry は default visible、 modal は user initiated**

| 要素 | 表示状態 |
|---|---|
| empty day entry (= 「ALTER で見る ›」) | **default visible** (= 各 tab の empty surface に常時表示) |
| empty day modal (= ALTER 観測 UI) | **user initiated** (= entry tap で初めて起動、 push しない) |

### 4.2 entry の tone

- text size: `text-xs` / `text-sm` (= 控えめ)
- color: `text-slate-400` / `text-slate-500` (= 既存 「予定なし」 tone と整合)
- 規約 24-extended 遵守 (= focus-visible:slate-* / brand-color 不使用)
- 配置: 既存 button (= 「+ この日に予定を追加」 / 「予定なし ›」) と並列 or 直下

### 4.3 push しない原則

- modal が勝手に開かない
- banner / toast / 通知が出ない
- user の自然な発見 (= entry に気付いて tap) で初めて起動

---

## 5. 既存 Daily Guidance / AlterHome 資産のどこを使うか (= CEO 指定 #4)

### 5.1 N-3a / N-3b 段階: **どこも使わない** (= 接続なし)

- N-3a = pure layer のみ (= type / helper / copy / test)
- N-3b = entry UI 接続のみ (= modal は placeholder)
- N-3a/N-3b では LLM / API / engine 接続 全 0

### 5.2 N-3c 以降 (= 別 plan audit で確定)

候補:
- `lib/stargazer/alterHomeAdapter.ts` → ActionShape / ForceBalance / DecisionMetadata
- `app/api/stargazer/alter/route.ts` → 既存 endpoint
- `alterOutputGovernance.ts` → post-check

但しこれらは **read-only 利用 + 既存 mode 流用** が原則 (= engine 改変は Stargazer pivot 越境)。

---

## 6. 新規 engine を作らずに済むか (= CEO 指定 #5)

### 6.1 N-3a/N-3b: **完全に新規 engine なし**

- pure type / view model のみ
- empty day 判定 helper のみ
- entry copy contract のみ
- test のみ

### 6.2 N-3c 以降: **既存 engine 流用が原則**

- 新 mode 追加が必要な場合: 別 plan audit で「mode 追加 = Stargazer pivot 越境か」 を CEO 判断
- 既存 mode で代用可能なら mode 追加なし

---

## 7. Prompt / LLM call の必要性 (= CEO 指定 #6)

### 7.1 N-3a/N-3b: **LLM call 不要**

- entry visibility のみ
- entry tap → modal 起動 (= placeholder content)
- LLM 接続なし

### 7.2 N-3c 以降: **LLM call が必要**

- modal 内で「見立て」 を表示するには LLM 応答が必要
- 但し prompt 内容 + post-check 設計は別 plan audit で詳細化

---

## 8. Prompt が必要な場合、 既存経路のみで足りるか (= CEO 指定 #7)

### 8.1 既存経路の候補

- `/api/stargazer/alter/route.ts` (= main endpoint、 Home Alter / Deep Alter 統合)
- 既存 mode (= Home Alter / Deep Alter)

### 8.2 自律推奨: **既存経路で「足りない」 可能性が高い**

理由:
- Home Alter は「結論 + 根拠 + 次の一手」 (= 「次の一手」 が「ALTER 提案」 に偏る risk)
- Deep Alter は「ソクラテス式・助言禁止」 (= empty day で「見立て」 を出すには逆寄り)
- empty day mode = 「user の空白に対して観測を言語化、 但し選択は user に委ねる」 = **新規 mode** が思想的に正確

### 8.3 但し N-3a/N-3b では未確定

新 mode 追加は N-3c 以降の plan audit で確定。 本 plan audit (= N-3 全体 plan) では「**新 mode 追加が必要か、 既存 mode 流用か は N-3c 以降に持ち越す**」 を明示。

---

## 9. Privacy / cost / fallback (= CEO 指定 #8)

### 9.1 N-3a/N-3b: **該当なし**

- LLM call なし → privacy / cost 概念なし
- entry visibility のみ → fallback 不要

### 9.2 N-3c 以降: **設計必要**

設計原則 (= readiness audit §7.2-7.4 継承):

| 項目 | 原則 |
|---|---|
| privacy | dataSurface 最小化 (= user_id + 日付のみ送信、 詳細 anchor 送信なし) |
| cost cap | 1 empty 日 = 最大 1 LLM call + 24h cooldown |
| fallback | LLM down 時 entry 自体は出る、 modal 内で「Alter は今日少し時間がかかります」 等の中立 message |
| fail-open | LLM 完全失敗時 entry click は AddAnchorModal 通常起動 (= empty 日 tap が壊れない) |

---

## 10. UI smoke 項目 (= CEO 指定 #9)

### 10.1 N-3a smoke (= pure layer)

| # | smoke |
|---|---|
| 1 | empty day 判定 helper の unit test PASS (= 0 件 = true、 1 件 = false) |
| 2 | entry copy contract 禁止語 grep 0 hit |
| 3 | entry copy contract 許可語 grep 存在 |
| 4 | type 整合性 (= EmptyDayEntryViewModel の構造) |

### 10.2 N-3b smoke (= entry UI 接続)

| # | smoke |
|---|---|
| 1 | CalendarTab empty 日表示時 entry visible |
| 2 | FlowTab empty 日表示時 entry visible |
| 3 | MapTab empty 日表示時 entry visible |
| 4 | entry tap → modal placeholder 表示 (= LLM なし) |
| 5 | 規約 24-extended 遵守 (= focus-visible:slate-* + brand-color 不使用) |
| 6 | mobile / desktop 整合 |

### 10.3 N-3c 以降 smoke

別 plan audit で確定 (= LLM 応答 / post-check / privacy / cost / fallback)。

---

## 11. N-3a として安全に実装できる最小 scope (= CEO 指定 #10)

### 11.1 N-3a の確定 scope (= CEO 暫定候補完全踏襲)

| 項目 | 内容 | 範囲 |
|---|---|---|
| **1** | pure type / view model | `EmptyDayEntryViewModel` 型定義 |
| **2** | empty day 判定 helper | `isEmptyDay(anchors): boolean` |
| **3** | entry copy contract | `EMPTY_DAY_ENTRY_LABEL = "ALTER で見る ›"` const |
| **4** | tests | helper unit test + copy 禁止/許可語 regression test |
| **5** | no LLM call | ✅ |
| **6** | no API | ✅ |
| **7** | no DB / env / package / dependency | ✅ |
| **8** | no push recommendation | ✅ |

### 11.2 N-3a 新規 file (= 提案)

| file | 役割 |
|---|---|
| `lib/plan/emptyDayObservation.ts` | type + helper + copy contract |
| `tests/unit/plan/emptyDayObservationContract.test.ts` | unit test + regression test |

### 11.3 N-3a 既存 file 改変

| file | 改変内容 |
|---|---|
| **既存 file** | **0 (= 触らない)** |

→ 完全に pure layer。 frozen branches への追加 commit 0、 規約 24-extended 違反復活 risk 0。

### 11.4 N-3a invariants

- LLM call: 0
- API call: 0
- network: 0
- DB / localStorage / env / package: 0
- frozen branches 追加 commit: 0
- 既存 file 改変: 0
- 規約 24-extended 違反: 0 (= 既存 file 触らないため自動的に整合)
- 禁止語混入: 0 (= regression test で機械保証)

---

## 12. sub-phase 順序 (= N-3 全体)

| sub-phase | 内容 | LLM | API | UI 変更 | risk |
|---|---|---|---|---|---|
| **N-3a** | pure layer (= 本 plan で確定、 次に着手) | × | × | × (= 既存 UI 不触) | low |
| **N-3b** | empty day entry UI 接続 (= 3 tab に entry 追加) | × | × | ✅ (= 規約 24-extended 遵守) | low-medium |
| **N-3c** | empty day modal UI (= placeholder、 LLM なし) | × | × | ✅ (= modal 新規) | medium |
| **N-3d plan** | 新 mode 必要性 + 既存 endpoint 流用可否の audit | — | — | — | — |
| **N-3d impl** | LLM 接続 (= 既存 endpoint or 新 mode、 N-3d plan で確定) | ✅ | ✅ | × | high |
| **N-3e** | post-check + fail-safe + regression | ✅ | ✅ | × | medium |
| **N-3 closeout** | wave 全体 audit + N-2 並列 pattern | — | — | — | — |

→ **連続 GO 不可** (= 各 sub-phase で CEO smoke 必須、 N-3a 完了後 CEO 判断 → N-3b 等)。

---

## 13. 禁止 / 許可表現 確定 (= regression contract、 CEO 文面踏襲)

### 13.1 禁止表現 (= 全 N-3 sub-phase 遵守、 regression test で機械保証)

```
おすすめ
これをした方がいい
最適
推奨
改善
警告
危険
注意
リスク
```

### 13.2 永続禁止 (= readiness audit §2.2 継承)

- Arrival Risk
- Counter-Factual generation
- Routes API / 実 API
- DB / env / package / dependency 変更
- localStorage / persist
- Deploy readiness
- Stargazer pivot
- 初期ユーザー獲得
- fetch / push / gh
- reset / restore / stash / branch delete

### 13.3 許可表現 (= entry copy + modal copy 候補)

```
見立て
下書き
空き日の観測
今日を組む
ALTER で見る
```

### 13.4 既存資産の限定利用 (= 許可範囲)

- 既存 Daily Guidance / AlterHome 系の **read-only 調査** ✅
- 既存 endpoint の **呼び出し** (= 後段 N-3d 以降) ✅
- /plan の空き日体験として **接続** ✅
- 既存 engine 内部 **改変** ❌ (= Stargazer pivot)

---

## 14. risk 評価

| risk | level | mitigation |
|---|---|---|
| 禁止語混入 | low | regression test 機械保証 |
| push UX 越境 | medium | entry tone 控えめ + modal user initiated |
| 規約 24-extended 違反 | very low | N-3a 既存 file 不触、 新規 file は新規 invariant 適用 |
| Stargazer pivot 越境 | low | N-3a engine 不触、 N-3b UI のみ、 N-3c+ で別 plan audit |
| Counter-Factual generation 越境 | medium | LLM 接続前に新 mode 必要性 audit |
| frozen branches 追加 commit | very low | N-3a/N-3b 範囲は新 branch、 frozen には触らない |
| UX 押し付け | low | entry default visible だが控えめ、 modal user initiated |
| a11y 違反 | low | 規約 24-extended 継承 + Tab focus / aria-label |

---

## 15. CEO 判断項目 (= 報告で停止)

### 15.1 N-3 plan audit 全体

| # | 判断項目 |
|---|---|
| **1** | 哲学的境界 B/C hybrid (= §0.1) で N-3 全 sub-phase を貫くか |
| **2** | 禁止/許可表現 (= §13) で entry copy contract を確定するか |
| **3** | sub-phase 順序 §12 (= a → b → c → d plan → d impl → e → closeout) で OK か |
| **4** | 既存 surface 流用 §2.1 (= 各 tab の既存 empty 表現に entry 追加) で OK か |

### 15.2 N-3a 実装

| # | 判断項目 |
|---|---|
| **5** | N-3a 最小 scope §11.1 (= pure layer + helper + copy + test) で OK か |
| **6** | entry copy contract 「ALTER で見る ›」 (= §3.2) で OK か |
| **7** | N-3a 新規 file 2 件 (= §11.2、 `emptyDayObservation.ts` + test) で OK か |
| **8** | N-3a 実装着手承認 (= readiness 着地後 plan audit → impl の流れ確定か) |

### 15.3 後段論点 (= N-3a 後に再 audit)

| # | 後段判断項目 |
|---|---|
| **9** | N-3c 以降の LLM 接続: 既存 mode 流用 / 新 mode 追加 (= 別 plan audit) |
| **10** | FlowTab L 142 「ALTER 提案 card」 命名の更新 (= 「ALTER 観測 card」 等) |

---

## 16. 結論

### 16.1 N-3 plan audit 判定

| 軸 | 判定 |
|---|---|
| 哲学的境界 | ✅ B/C hybrid (= CEO + GPT 補正反映) |
| N-3a 最小 scope | ✅ 安全 (= pure layer のみ、 既存 file 不触) |
| sub-phase 分割 | ✅ 連続 GO 不可、 各 sub-phase で CEO smoke 必須 |
| risk | low (= N-3a 範囲) |
| **総合** | **N-3a 実装着手は CEO 判断後に進められる状態** |

### 16.2 次のアクション (= CEO 判断待ち)

1. CEO が §15 の判断項目に回答
2. N-3a OK なら **実装着手** (= 新 branch、 pure layer 実装 + test、 frozen 不触)
3. N-3a 完了後 CEO smoke → N-3b 着手判断
4. merge 戦略は引き続き frozen 維持 (= /plan complete まで)

### 16.3 自律推奨 (= 思考原則 ⑤ ゴールから逆算)

- /plan complete までの最短経路: N-3 (= 本 phase) → N-4 → N-5
- N-3a を最小 scope (= pure layer) で確定すると、 frozen branches 影響 0 で安全に着地可能
- entry copy contract を最初に確定すると、 後段 N-3b 以降で UI 接続時に「文言で迷う」 risk 排除
- 「ALTER で見る ›」 は CEO 許可表現 (= 「ALTER で見る」) を踏襲し UX UX 慣習 (= `›`) を追加した最小拡張、 思想整合

---

**完了**: Phase 3-N-3 Plan Audit。 実装変更 0、 既存 file 改変 0、 frozen branches 追加 commit 0。 N-3a 最小 scope 確定。 CEO 判断待ち (= §15 の 10 項目)。
