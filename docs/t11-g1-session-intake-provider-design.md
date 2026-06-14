# T11-G1 Server Session/Intake Provider Design（実ユーザー入力→TravelPlanEngineInput・設計のみ）

**ステータス**: 設計のみ・実装なし（docs-only）。CEO ロードマップ「4→1→2」の **(1)**。
**位置づけ**: provider tier 2。dev_fixture の次。**server 側の実 session/intake から real `TravelPlanEngineInput` を作る**（real_only・fail-closed）。M2/route/weather/place は別 tier（後続）。本番配線・抽出 NLP は含まない。

## §1 前提（疑った上で）
- 実ユーザー入力が本番化の最初の blocker（監査確定）。dev_fixture の次 tier はこれ。
- ★ ただし「会話→raw slots 抽出(NLP)」は **upstream の別問題**。本 provider は **抽出/正規化済みの session 由来 slots を受けて組む**（抽出は作らない）。これで tier を薄く・pure に保つ。

## §2 consume（server-only・real）
`TravelIntakeInput`（新規・server-only 型）:
- `slots: ExtractedSlot[]`（session 抽出 + 既存 slot-normalizer 正規化済み・upstream の出力）
- `participantIds: string[]`（1–2・MVP）
- 任意: `policy?`（intended action / 有償・取消不能 = intake で確認した予約意図）・`viewerId?`・`fairnessHistory?`
- ★ 抽出前の生会話・raw text は受けない（slots は upstream で正規化済み）。

## §3 produce
`TravelInputResult`（既存 E-B 型を再利用）:
- ready → `{ input: TravelPlanEngineInput, provenance: { sources, realOnly:true } }`
- not_ready → `{ provenance, missing: TravelInputPrerequisite[] }`（input なし）

## §4 prerequisite / fail-closed
必須を slots から検証（**欠けたら捏造せず not_ready**）:
- `destination` ← destination_area slot 充足
- `date_or_range` ← date_or_range slot 充足
- `participants` ← participantIds 1–2 妥当
欠如 → not_ready・missing に該当 prerequisite。**partial から fake input を作らない**（provider seam 原則踏襲）。

## §5 real_only
- provenance.sources = `["session_slots"]`（+ form intake 由来なら `"user_intake"` も）。**dev_fixture を含めない**。
- `deriveRealOnly` で realOnly=true。`assertNoFixtureSource` を通過。production gate で許可される唯一の real path の起点。

## §6 privacy / server-only
- intake は per-participant の private な soft_preference / red_line（visibility=private）を含み得る → **private slot として TravelPlanEngineInput に入る** → **server-only**（client へ serialize しない・既存 two-layer で full に効くが shared に出ない）。
- client は最終的に projection/cues のみ（engine→display chain は既存）。
- 相手に見せていい条件のみ shared・見せない条件は private（owner/visibility で表現・既存 slot 契約）。

## §7 境界（やらない）
- 会話→slot 抽出(NLP)を実装しない（upstream・別）。
- **M2/Stargazer enrichment しない**（tier 3）。**route/weather/place enrichment しない**（tier 4）。**production aggregator でない**（tier 5）。
- 本番 `/plan` 配線しない。engine を呼ばない（caller が provider→engine）。real entity retrieval しない（option 2）。
- env 読みは provider に入れない（gate/context は引数受け・Life Ops 同様）。

## §8 推奨実装バンドル（承認後・docs→pure types+helper+tests）
- pure types: `TravelIntakeInput`。
- helper: `createSessionIntakeTravelInputProvider` / `getSessionIntakeTravelInput(intake, gate)` — prerequisite 検証 → ready/not_ready。
- validation: prerequisite チェック（destination/date/participants）・provenance real_only。
- tests: 完全 intake→ready/real_only / 欠如→not_ready+missing / private slot は input に入るが provider 出力は server-only / 抽出/ M2/route/weather/production/engine/本番 import なし / dev_fixture を混ぜない / tsc 55 / 既存 green。
- **production 配線・抽出・M2・route/weather・real entity は含めない**。

## §9 HOLD 継続
M2-B-2 / route・weather・place API / real entity retrieval(option 2) / 本番 `/plan` / CoAlter runtime / useCoAlter / talk / send / booking / 予約リンク / solver-DAG / persistence / staging・production・push。

## §10 CEO 判断請求
1. provider tier 2 = **session/intake 由来の正規化済み slots を組むだけ**（抽出 NLP は upstream・別）で良いか。
2. consume = `TravelIntakeInput{ slots, participantIds, policy?, viewerId? }`（生会話は受けない）で良いか。
3. prerequisite = destination/date_or_range/participants・欠如で not_ready（fake 生成なし）で良いか。
4. real_only = sources [session_slots/user_intake]・private intake は server-only slot で良いか。
5. 次フェーズ = この設計の **pure types + intake provider helper 実装**（docs 承認後・M2/route/weather/本番なし）で良いか。
