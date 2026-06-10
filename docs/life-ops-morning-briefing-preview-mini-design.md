# Life Ops — Morning Briefing Preview Pure Presenter Mini-Design（本流セッション）

> 2026-06-10 / 本流（横 R2 統合）/ CEO・GPT 指示「compose 結果を朝のブリーフィング用の非断定文言・3案要約に変換する pure presenter。counts-only では体験が弱い — 代表 1〜3 件を安全に文言化」。
> 前提: placement（`4c234cdd`）+ compose（`92988ba8`）完了。**Morning Briefing 本線・React UI・通知・DB/API/実データ源・production・push/PR/merge は禁止**（pure VM まで）。

---

## 0. 設計原則（前提を疑った結果）

1. **文言は構造的に PII を持てない**: `LifeOpsCandidate` の全 field は辞書/enum/数値（L-1 label・EventKind enum・日数）。ユーザー自由文は縦が**構造的に持たない**ため、presenter は漏らしようがない（test で恒久ロック）。
2. **L-8a を再利用**（DRY・トーン統一）: 単一候補の非断定文言は縦 `card-presenter.ts`（`toLifeOpsCardViewModel`・reasonText/riskNotes/urgency/EVENT_LABEL）を **public API 経由で consume**。横は **day-level の組み立てだけ**を新設（headline/3案要約/代表選定/窓ヒント）。
3. **counts-only にしない**（CEO 指摘）: 代表 **1〜3 件**を必ず文言化。ただし詳細を出しすぎない — **窓は HH:MM でなく「午前/午後/夕方の空き時間」の粗さ**（briefing に偽精密は不要）。

## 1. 朝の一言 headline（非断定）
recommended tier（null なら easy）の fitting から生成:
- deadline あり + 他あり: 「今日は「{期限 label}」を先にすませると安心です。余裕があれば「{次 label}」も入れられそうです」
- deadline のみ: 「今日は「{label}」を先にすませると安心です」
- deadline なし・候補あり: 「今日は「{top label}」あたりを入れると自然です」
- fitting 0・alsoAvailable>0: 「今日は枠が埋まっていますが、生活まわりの候補は{n}件あります」
- 全て 0: 「今日は生活まわりで急ぎのものはなさそうです」

## 2. 3案要約（protect/easy/push 順）
`{ tier, tierLabel(守る案/楽な案/攻める案), line, highlights[≤3], overflowLine }`
- line: n>0 →「{tierLabel}には{n}件入ります」/ n=0 →「{tierLabel}は生活まわりの追加なし」
- **deadline が 3 案すべてに出る**（compose の累積包含をそのまま提示）

## 3. 代表（highlights・1〜3 件）
- fitting の先頭 ≤3 件（placement の urgency 順を保持）= `{ title(L-1 label), phrase(L-8a reasonText), windowHint }`
- phrase 例: 「期日まで5日です」「3日後の面接に向けて」「前回から60日（目安の約47日を過ぎています）」— **事実提示・断定なし**（L-8a と同一文）
- windowHint: window.startMinute < 12:00 →「午前の空き時間に」/ <17:00 →「午後の空き時間に」/ 以降 →「夕方以降の空き時間に」

## 4. overflow / alsoAvailable
- tier ごと overflow>0 → overflowLine「この案では入りきらない候補が{n}件あります」（honest・黙らせない）
- alsoAvailableLine: unplaced>0 →「ほかにも候補が{n}件あります」/ 0 → null

## 5. riskFlags / permission 注意文言
- 代表（recommended tier の highlights 対象）に対して **L-7 `assessLifeOpsPermission` → L-8a riskNotes/confirmationNote を再利用**。
- dedupe + **cap 2 件**（朝に注意を並べすぎない）。例: 「内容を確認してから進めます」「健康に関わるため、提案までにします」。

## 6. 非断定トーン（恒久ロック）
- 使う: 「〜と安心です」「〜と自然です」「〜入れられそうです」「〜のようです」「〜かもしれません」
- **禁止（test 固定）**: 「すべき」「べきです」「必ず」「しなければ」「してください」「やるべき」

## 7. redaction 方針
- 語彙は **L-1 label・EVENT_LABEL enum・固定テンプレ・数値のみ**（§0-1 の構造保証）。
- FORBIDDEN（seedRef/utterance/personality/UUID/@/長桁）不一致を test 固定。placeQuery（辞書ヒント）も VM に**出さない**（briefing には不要・カード側の責務）。

## 実装
- `lib/plan/reality/lifeops/lifeops-briefing-preview.ts`（pure）: `buildLifeOpsBriefingPreview(compose: LifeOpsDayCompose) → LifeOpsBriefingPreviewVm { headline, tiers[3], cautions[≤2], alsoAvailableLine }`
- React なし・本線接続なし・R2/R4/R5 本体無改変・`generateEmptyDay` 非実行（compose を受けるだけ）。
- tests: 実 chain（collector→placement→generator→compose→briefing）+ 手組み fixture（overflow/空日/caution）。

## stop
Morning Briefing 本線接続 / React UI / 通知 / Moment Trigger 接続 / DB / API / 実データ源 / production / push / PR / merge。
