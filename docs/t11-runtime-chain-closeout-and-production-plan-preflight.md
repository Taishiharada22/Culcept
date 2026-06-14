# T11 Runtime Chain Closeout + Production `/plan` Integration Preflight（runtime chain凍結・本番接続判断・設計のみ）

**作成日**: 2026-06-14 / **ステータス**: **closeout + 本番接続判断のみ・実装なし**（docs-only）。
**位置づけ**: 3 つの dev preview（fixture×2 + engine-generated×1）で完成した runtime chain を凍結し、engine-generated projection を **本番 `/plan` に統合する最も安全な将来 path** を、本番配線を実装せずに設計する。
**スコープ**: 計画のみ。コード変更なし（docs/decision-log のみ）。**本番 `/plan` integration・CoAlter runtime・useCoAlter・/talk・send・booking・Bundle2・solver・persistence・staging/production/push は触らない**。**本レポートで停止**。

---

## §1 Closeout summary

| preview | 入力 | 何を証明するか | コミット |
|---|---|---|---|
| `dev-travel-projection` | fixture `DisplayPacketForClient` | projection（9 section）が hand-built display packet から read-only 表示できる | `f9a51621` |
| `dev-coalter-projection-cues` | 上記 projection | CoAlter cue（5 action）が display-only で表示できる | `81d9f2b9` |
| `dev-travel-engine-projection` | fixture `TravelPlanEngineInput` | **実 `runTravelPlanEngine`（純）を server 実行 → display chain end-to-end** が動く | `c1a1aa02` |

- **fixture/dev-only のまま**: 3 preview とも default-OFF flag・dev route・fixture 入力・read-only。
- **unwired のまま**: 本番 `/plan`・実 input source（user/session/M2/route/weather/place）・CoAlter runtime・useCoAlter・/talk・send・booking・persistence。

---

## §2 現在の runtime chain

```
fixture TravelPlanEngineInput
  → runTravelPlanEngine（純・server）        … TravelPlanEngineOutput {authoritative, shared, viewer, diagnostics}
    → toDisplayPacket(output, viewerId?)      … DisplayPacketForClient（authoritative=false 固定）
      → buildPlanIntelligenceProjection       … PlanIntelligenceProjection
        → deriveCoAlterProjectionCues          … CoAlterProjectionCue[]
        → read-only preview components（TravelProjectionPreview / CoAlterCuesPreview）
```

- **server-only に残る**: `output.authoritative` / `diagnostics` / engine 実行（`toServerAuthoritativePacket` は呼んでいない＝authoritative は暗黙 server-only）。
- **client display に届く**: **projection / cues のみ**。

---

## §3 trust / authority 境界

1. **authoritative engine output は server-only**（component へ渡さない・render しない・dump しない）。
2. **diagnostics は hidden**。
3. **client は projection / cues のみ**受領。
4. **display は executionAuthority を産まない**（packet authoritative/executionAuthority=false・projection authority field 無）。
5. **projection は booking/scheduling/ranking authority を産まない**（advisory のみ）。
6. **CoAlter cues は display/proposal のみ**（execute/book/schedule/send なし）。

---

## §4 本番 `/plan` integration risk assessment（実測 grounding）

実測（`app/(culcept)/plan/page.tsx`）: 本番 `/plan` は `PLAN_FLAGS.planRouteLive` gate（OFF→notFound・本番 default OFF）+ **auth gate（supabase/user.id）**。Life Ops 本線は `isLifeOpsMainlineAllowed`（**staging-first / production-deny / real_only**）で **実データ**から server-compute して PlanClient へ渡す precedent。

| 論点 | 評価 |
|---|---|
| なぜ新 gate か | 本番 `/plan` は実ユーザーの体験面・**本番反映は CEO 承認案件**。初の travel→本番接触 |
| 本番が必要とする入力 | 実 `TravelPlanEngineInput`（実 user/session 由来 slots・行先/日程/予算/嗜好） |
| 現 fixture 入力で本番十分か | **不十分**。fixture は static で実ユーザーを表さない |
| なぜ実 user/session/M2 未 ready | travel intake（slot source）未配線・M2 personalization は HOLD（M2-B-2 特権 runtime） |
| route/weather/place live が HOLD な理由 | 実 data 源未接続・各々独立 GO・production deny 前提 |
| booking/calendar/send が HOLD な理由 | 実行権限は readiness authoritative 経由のみ・最終段 hard gate |
| 本番 display は何を使うべきか | **display-tier 出力のみ**（DisplayPacketForClient/projection/cues）。authoritative/diagnostics は本番でも server-only |

**★ 決定的所見**: Life Ops precedent は **本番では real_only**（fixture は dev のみ）。travel は**実 input をまだ生成できない**ため、**fixture を本番 `/plan` に出すのは real_only 原則違反＝実ユーザーに偽の travel projection を見せる**。∴ **本番 `/plan` integration（fixture 利用）は今すべきでない**。

---

## §5 Integration architecture options

| 案 | 内容 | 評価 |
|---|---|---|
| A. dev preview のみ・本番 path なし | 現状維持 | 保守的・正しいが前進なし |
| B. 本番 `/plan` read-only PI panel（fixture 入力） | 本番に fixture projection | **不採用**。real_only 違反・実ユーザーに偽データ |
| C. 本番 `/plan` read-only PI panel（server engine fixture 入力） | 本番に engine-fixture projection | **不採用**。同上（fixture-in-production） |
| D. 本番 `/plan` adapter boundary のみ・UI なし | 本番に不可視 server seam | 早い（実 input 無で本番 code を触る価値ゼロ） |
| **E. server-only projection provider interface（dev-only）** | 「input source → projection/cues」を抽象する純 provider 契約を定義。dev fixture を first impl・実 provider は HOLD | **★ 推奨**。本番が必要とする「実 input provider」の seam を**本番非接触・純**で結晶化。real input 解錠後に clean plug-in |

---

## §6 Recommended safe next phase

**推奨 = E（server-only projection provider interface・dev-only）。まず docs-only 設計**。

- **なぜ最安全/最価値か**: §4 の通り **本番 `/plan` integration（B/C/D）は real input 未 ready ゆえ今すべきでない**（fixture-in-production は real_only 違反）。前進可能な唯一の安全策は、**「TravelPlanEngineInput をどう得るか」を本番から切り離す provider seam を純設計**すること。これにより real input（slot source/M2/route/weather）が解錠した時、production は Life Ops と同じ gated パターンで provider を plug-in でき、display chain は不変。本番も dev も同じ display-tier 出力のみを consume。
- **docs か実装か**: **まず docs-only**（provider interface 契約の設計）。その後 **pure type 実装**（dev fixture provider のみ・実 provider は HOLD）。本番 `/plan` は触らない。
- **HOLD のまま**: 本番 `/plan` integration（B/C/D）・実 input source・CoAlter runtime・useCoAlter・/talk・M2-B-2・Bundle2・solver・route/weather/place API・persistence・send/realtime・booking/calendar（§10 全件）。

---

## §7 将来実装の guardrails（E を実装に進める場合）

- **default-OFF flag**（既存 `PLAN_TRAVEL_PROJECTION_PREVIEW` を再利用・新 flag は必要が証明されるまで足さない）。
- **read-only**・**no useCoAlter / no `/talk`**・**no API/fetch/DB**・**no M2 runtime**・**no route/weather/place live**・**no booking/calendar**・**no send/realtime/read receipt**。
- **authoritative packet を client へ渡さない**（provider も projection/cues のみ返す）。
- **fail-closed**（provider 構築失敗→空/Disabled・本番 path へ throw しない）。

---

## §8 将来実装の test 期待

1. **本番 `/plan` は明示 GO まで不変**（`page.tsx`/`PlanClient.tsx` byte 同一）。
2. provider は **display 出力のみ**（projection/cues）。
3. **authority field なし**。
4. **raw engine output なし**。
5. **diagnostics なし**。
6. **useCoAlter なし**。
7. **fetch/API/DB/Supabase import なし**。
8. **tsc baseline 55 不変**・既存 preview tests 不変 green・full suite 0 fail。

---

## §9 dev server root 問題

- Turbopack workspace-root 推論問題は **別タスク**（CEO 承認後・`next.config` `turbopack.root` 設定）。本番 integration と**混ぜない**。
- **本番 integration 設計は root 問題を解かずに進められる**（pure 設計・test は vitest/renderToStaticMarkup で root 非依存）。
- **visual browser 検証**（実 dev server で画面を見る）は **将来 root 問題の解決を要する**（unit test では render を検証済だが、ブラウザ目視には dev server 起動が必要）。

---

## §10 Runtime gates still HOLD

本番 `/plan` / CoAlter runtime / useCoAlter / `/talk` / M2-B-2 / Bundle 2 / solver・DAG / route・weather・place API /
persistence / send・realtime・read receipt / booking・calendar / staging・production・push — **すべて HOLD**。

---

## §11 Verification summary

- **latest commits**: `c1a1aa02`(T11-C)→`fc4d7c13`(log) / G→C chain 既コミット。
- **test counts**: 3 preview = 16 + 14 + 16 = **46**・travel-prefixed 412 = **travel-related 458**。
- **tsc baseline**: **55**（不変）。
- **full suite**: **21112 passed / 1 skipped / 0 failed**。
- **flaky**: `proposalPlanClientHelpers.test.ts`（travel 無関係）今回再発なし。
- **tree clean**: yes。**push**: なし。

---

## §12 Stop

本レポートで停止。**本番 `/plan` integration は CEO 承認まで着手しない**。

### CEO 判断請求
1. 本 closeout を **runtime chain（3 preview）の凍結点**として承認するか。
2. **本番 `/plan` integration（B/C/D）は real input 未 ready ゆえ HOLD**（fixture-in-production は real_only 違反）という判断を認めるか。
3. 次フェーズ = **E（server-only projection provider interface・dev-only・まず docs-only 設計）** で良いか（vs A 据え置き）。
4. Turbopack root 問題を **別タスク**（本番 integration と分離・CEO 承認後）として扱ってよいか。
5. §10 runtime gate を **各々独立 HOLD** として確認するか。

実装は CEO 承認まで着手しない（closeout + 本番 preflight レポートで停止）。
