# 平日プラン完成度監査（2026-06-12）

**目的**: CEO 認識「平日のプランはすでに概ね固まっている」のコード根拠検証。
**方法**: コード監査エージェント（very thorough）+ 手動スポット検証（featureFlags / plan route gate / weekday 配線 / A-4 docs）。
**スコープ**: `/plan` ルート + `lib/plan/`（reality / lifeops 層含む）。Alter Morning 等の別 surface は本監査スコープ外。
**ステータス**: read-only 監査。コード変更なし。

---

## 0. 判定（結論先出し）

**「概ね固まっている」は表示骨格については正しいが、エンジンについては過大評価。**

| 層 | 判定 | 一言 |
|---|---|---|
| 入力・骨格（anchors / recurring / 曜日テンプレ / list / map / travel segments） | ✅ 固まっている | 実装+テスト済み。weekday-template による「平日 9:00-18:00 仕事」入力も存在 |
| 表示層（briefing card A-4-c38 / Moment A-4-c39） | ✅ staging で動作 | テスト green、ただし staging gated・production deny 恒久 |
| **候補生成エンジン（L-3）** | ❌ 未実装 | 設計 docs のみ（`aneurasync-reality-candidate-generator-design.md`）。実装ファイル 0 |
| **周期推論（L-2）** | ❌ 未実装 | read 契約のみ存在、consumer 不在 |
| **accept→plan seed** | ❌ docs-only | A-4-c40 で「DO NOT IMPLEMENT」明記、apply track GO 待ち |
| **当日再計画** | ❌ 未着手 | 実装ファイル 0 |
| **パーソナライズ消費（Stargazer state → plan）** | ❌ ほぼ未配線 | 下記 §2 |
| **production 公開** | ❌ 未公開 | 下記 §3 |

---

## 1. 平日/休日概念の配線状況

- 曜日が存在するのは **anchor 入力層のみ**: [lib/plan/weekday-template.ts](../lib/plan/weekday-template.ts)（「平日 9:00-18:00 仕事」→ RRULE BYDAY 生成）、[lib/plan/anchor-detail-format.ts](../lib/plan/anchor-detail-format.ts)（表示）、`app/(culcept)/plan/tabs/_helpers.ts` の `weekdayTone()`（UI 色）。
- **候補生成・empty-day 生成・スコアリングに曜日は一切入っていない**（`lib/plan/reality/` に weekday 参照 0 件、grep 検証済み）。過去 tsc 監査の「phaseC isWeekday は removed-old-spec の dead field・weekday 意図未配線」と整合。
- 含意: 「平日のプラン」と「休日のプラン」をエンジンが区別して生成する能力は現状ない。ユーザーが anchor として平日の予定を登録した上に提案を載せる、という構造のみ。

## 2. Stargazer state 消費マップ（最重要ギャップ）

「ユーザーを全て理解しているから完全パーソナライズできる」という差別化主張に対し、**観測側の資産（45軸 / HDM / ActionShape / 内的天気）は実在・永続化済みだが、plan 生成側への接続がほぼゼロ**。

| State | plan 側での消費 | 根拠（監査エージェント報告） |
|---|---|---|
| energy | △ placeholder のみ | `empty-day-generator.ts` の `energyScale()`。ただし client-side context 由来で server では null（`supabase-worldstate-source-ports.ts`） |
| 45 性格軸（`stargazer_axis_scores`） | ❌ 参照 0 | `lib/plan/reality/` に axes import なし |
| ActionShape / ForceBalance | ❌ type import のみ | 読み取りロジック 0 |
| HDM / 内的天気（stress / socialBattery） | ❌ 参照 0 | — |
| PRM（personal reality model） | ❌ 保存・読出し基盤はあるが候補生成への feed 呼び出し 0 | `reality-secretary-os-vision-vs-impl-gap-audit.md` §1 と整合 |

**結論**: 差別化の核「state→plan 接続」は未構築。これは平日プランと Travel Mode が**同じ橋**を必要とするため、Travel 設計でこの橋（PersonalizationPort）を正本として作り両者で共用するのが最効率（→ `travel-mode-plan-os-extension-design.md` M2）。

## 3. Production 公開状況

- `/plan` ルート自体が production default で `notFound()`: [featureFlags.ts:21](../lib/plan/featureFlags.ts)（`PLAN_ROUTE_LIVE === "true"` のみ有効）、[page.tsx:53-54](<../app/(culcept)/plan/page.tsx>)。
- A-4 Life Ops 群 flag は全 default OFF + production 二重 deny（`lifeops-production-gate.ts`）。A-4-c37（2026-06-11）で「production 未接触・staging release freeze」を正式 closeout 済み。
- つまり**平日プラン体験は本番ユーザーには一切届いていない**（CEO 経営判断による公開ゲート待ち、これ自体は意図された状態）。

## 4. 確定仕様として注意すべき点

- **done のみが cadence 学習を動かす**（accept / later / dismiss は学習に影響しない、A-4-c13 で accept-proxy 退役）。「採用したのに翌日も同じ提案が出る」は仕様 — UX 上の説明が将来必要。
- accept の意味論（採用 / 完了 / 試行の 3 読み）は A-4-c40 で設計済みだが open Q が残る（CEO 判断待ち）。

## 5. 正確な現在地の言語化

> 「平日プランは、**入力と表示の骨格（anchors・曜日テンプレ・list/map・briefing/Moment card）が staging で固まっている**。しかし**提案の中身を作るエンジン（候補生成・周期推論・パーソナライズ消費・accept の plan 化・当日適応）は未実装**で、production には未公開。設計資産は厚い（docs 30+ 件）が、実装は表示層中心。」

CEO 認識との差分は「設計の完成」と「実装の完成」の混同に由来すると推測する。

---

*作成: Build/Research 統合監査セッション（worktree objective-mcnulty-a554c9）。各主張の詳細根拠はセッションログの監査エージェント報告を参照。*
