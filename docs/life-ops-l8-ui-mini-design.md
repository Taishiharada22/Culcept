# Life Ops L-8 — Life Ops UI mini-design【L-8a pure presenter は実装可 / L-8b React は停止】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: boundary §2 L-8 / Appendix A.12 / candidate-types / permission(L-7) / category-model(label) / CLAUDE.md「世界観優先」「対外公開は CEO」。
> **CEO 指示**: L-7 完了→L-8 計画→精査→合格なら実装。**UI 表示に入る前は停止**も明記。→ 精査の結論で **2 層分割**。

---

## 0. 精査結論（なぜ分割か）
- **L-8a pure presenter**: candidate + PermissionAssessment → 非断定の**表示用 ViewModel**（文言/ラベル/バッジ/緊急度）。pure・横非 import・実データ非接触・テスト可。→ **自律実装可（合格）**。
- **L-8b React カード**: glassmorphism で実描画。**ブラウザ観測 + 世界観/トーン直結**。→ CLAUDE.md「世界観優先」「迷ったら世界観」より **preview 検証 + CEO の目** が要る。→ **L-8a 着地後に停止**。

## 1. L-8a スコープ（実装・`lib/lifeops/card-presenter.ts`）
LifeOpsCandidate + PermissionAssessment（+ L-1 label）→ `LifeOpsCardViewModel`。**断定しない**（「〜が自然」「〜のタイミング」）。
```ts
export interface LifeOpsCardViewModel {
  readonly category: LifeOpsCategoryId;
  readonly title: string;              // L-1 label（「美容院」「確定申告」）
  readonly reasonText: string;         // dueReason の非断定文（事実提示）
  readonly timingHint: string | null;  // 「数日前が自然」等（recommendedLeadDays から）
  readonly actionLabel: string;        // maxAllowedAction の日本語（「候補を出します」「予約ページへ進めます」）
  readonly requiresConfirmation: boolean;
  readonly confirmationNote: string | null; // 「内容を確認してから進めます」
  readonly riskNotes: readonly string[];     // reasonCodes → 人間可読(redacted)
  readonly placeQuery: string | null;
  readonly urgency: "overdue" | "high" | "normal"; // 表示順/強調
}
export function toLifeOpsCardViewModel(candidate, assessment): LifeOpsCardViewModel;
export function toLifeOpsCardViewModels(candidates, assess): readonly LifeOpsCardViewModel[]; // urgency 順
```
- **import 可**: `category-model`(label・**lib/lifeops 内**＝横でない)・`permission`・`candidate-types`。**横エンジン(lib/plan/reality)は import しない**。

## 2. 文言マップ（非断定・redacted）
- **reasonText**（dueReason 種別）:
  - cycle: 「前回から◯日（目安は約◯日）」/ well_beyond は「目安の約◯日を過ぎています」。
  - event_prep: 「◯日後の{イベント}に向けて」(+ nearing なら「そろそろ整えるタイミングです」)。
  - deadline: overdue「期日を過ぎています」/ within_lead「期日まで◯日です」。
- **actionLabel**（maxAllowedAction）: observe「記録します」/ notify「お知らせします」/ suggest「候補を出します」/ open_link「予約ページへ進めます」。
- **riskNotes**（reasonCodes→可読）: risk_personal_info「個人情報の入力があります」/ risk_high_cost「費用が高めです」/ risk_cancellation_fee「キャンセル料がかかる場合があります」/ risk_card_required「カード登録があります」/ risk_appearance_change「見た目が大きく変わります」/ risk_nomination「指名の選択があります」/ risk_first_visit「初めてのお店です」/ risk_long_session「時間がかかります」/ risk_far_location「少し遠いです」/ medical_no_auto_suggest_cap「健康に関わるため提案までにします」/ level4_5_future_gated は表示しない(内部)。
- **イベント label**: meeting_someone「人と会う予定」/ interview「面接」/ trip「旅行」/ business_trip「出張」/ ceremony「冠婚葬祭」/ shoot「撮影」/ important_event「予定」。

## 3. urgency
deadline overdue → "overdue" / (deadline within_lead ∨ event_prep daysUntil≤3) → "high" / else "normal"。`toLifeOpsCardViewModels` は overdue→high→normal の順（同順は入力順・安定）。

## 4. 厳守 / 非スコープ（L-8a）
- pure・deterministic・**横エンジン非 import**・no-DB・no-React・no-外部・no-実データ・barrel 非 export。
- **非スコープ**: 実 React 描画(L-8b)・配置/window(横R2)・通知(R4)・予約実行(L-6)・実データ源。presenter は**文言整形だけ**。

## 5. テスト（`tests/unit/lifeops/lifeOpsCardPresenter.test.ts`）
- 3 dueReason 種別で reasonText が非断定（「した方がいい/必ず」を含まない）。actionLabel が maxAllowedAction と一致。
- requiresConfirmation→confirmationNote 提示。医療は riskNotes に「健康に関わる…」・actionLabel「候補を出します」。
- urgency: 期限超過=overdue・直近イベント=high・並べ替え順。placeQuery 透過。pure。

## 6. L-8b（停止・設計のみ）
- React カード（`生活行動カード`/`準備不足カード`/`実行レベル付きカード`）を glassmorphism（`GlassCard`/`GlassBadge`/`GlassButton`/`FadeInView`）で描画。ViewModel を props 注入（データ取得しない）。
- **停止理由**: ブラウザ観測 + 世界観/トーン直結（CLAUDE.md 最優先）。preview 検証 + CEO 承認後に実装。
- 配置（どの画面/Home のどこ）・3 案（守る/楽/攻める）統合は横 R2 と協調（別）。

## 7. 停止
L-8a（pure presenter）着地後、**L-8b React 実描画の手前で停止**して CEO へ（世界観 + preview）。その後 CEO フローに従い L-6 計画→精査→実装へ。
