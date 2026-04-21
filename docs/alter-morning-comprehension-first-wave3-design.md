# Alter Morning Protocol — Comprehension-First v1.3+ Wave 3 設計書

**ステータス**: 確定版（2026-04-21 CEO 承認）
**前提**: Wave 1（PR #6, L1 Core Reasoning Slice）+ Wave 2（PR #7, Place Grounding & Narration）+ Wave 2 末尾 PR（PR #8, LLM Narrator 配線）マージ済み
**対象**: alter-morning Morning フェーズの **本丸**。L1→L2→L3 を production route で一本化し、Body / Weather を新規層として追加、other_party を復活、placeTable を拡張する
**北極星**:
> 「Wave 2 までに閉じた骨格を **実機で回す**。Morning plan graph が production route で動き、Body / Weather という二次層が plan graph を書き換えずに注釈として添えられる」

---

## 1. Wave 3 スコープ

CEO 指示の優先度順に 5 layer を積む。**Wave 1 / Wave 2 既存コードは一切変更しない**（非破壊）。

| # | Layer | 性質 | 現状 | Wave 3 ゴール |
|---|-------|------|------|---------------|
| 1 | Gap Resolver 本実装 | 統合 | `lib/alter-morning/planning/gapResolver.ts` 239行 既存 pure function。未接続 | production route / orchestrator に接続 + clarify question 生成仕上げ + 契約テスト拡充 |
| 2 | placeTable 拡張 | 追加 | 122 entry、Tokyo 偏重、sparse: hotel / station / library | geographic / category カバレッジ拡張 + alias 強化 |
| 3 | Body / Weather 統合 | greenfield | 無 | 二次層として新規設計。plan graph は書き換えず annotation として添える |
| 4 | other_party 生成 | 凍結解除 | `who: string[]` のみ。生成ロジック無し | who.generated annotation を L2 で添える（plan graph は書き換えない） |
| 5 | production route 配線 | greenfield | `app/api/alter-morning/` 無し | `runMorningPipeline` orchestrator + route handler + 実機 LLM スモーク |

### 非スコープ（やらないこと）

- Rendezvous / Stargazer など他ドメインへの影響変更
- 既存 `morningProtocol.ts`（v1 legacy）の撤去 — Wave 4+ で段階的に
- UI 変更（Morning の画面 / コンポーネント）
- 課金・決済・法務・外部サービス連携追加（CEO 承認必須事項）
- 新辞書の大量流し込み（人名・施設・地名のフル拡張は Wave 4+）

---

## 2. Wave 3 の設計原則

Wave 1 / Wave 2 から継承し、Wave 3 で追加:

1. **plan graph を単一の真実とする**（Wave 2 北極星の継続）
   - Body / Weather / other_party は **annotation（注釈）層** であり plan graph を書き換えない
   - L3 Faithfulness Checker が Wave 2 同様「plan graph 外」を deterministic に弾く。annotation は narration で言及されない限り干渉しない

2. **orchestrator は pure function の合成**（Wave 1 / 2 の pure-function 志向を継続）
   - `runMorningPipeline(input, providers)` が L1→L2→L3 を順に呼ぶ単一責務
   - Route handler は orchestrator を呼び、テレメトリ / auth / session 以外の logic を持たない

3. **Gap は plan graph に残す、Resolve しきれないものは "未解決のまま narration へ"**
   - Gap Resolver は強制解決しない。解決できなかった event は `missing_*` を残したまま通し、narration は plan graph の状態をそのまま読み上げる（L3 stub / LLM の既存仕様）

4. **annotation は多義性を保持**（Body / Weather / other_party 共通）
   - "このカフェは屋内か屋外か / この時間帯は寒いか / 誰と行く可能性が高いか" を **candidates で保持**、narration 側で hedge 表現を選ぶ
   - Wave 2 の `GroundedPlace.candidates` 方式を踏襲

5. **実機通し は最後**
   - Priority 1-4 を stub provider / deterministic fallback で固めたあと、Priority 5 で初めて実 LLM に通す
   - 途中でスモークする衝動を抑え、**構造が閉じたあと** で通すことで因果を絞る

### 2.1 Wave 3 固定制約（2026-04-21 CEO 確認、妥協不可）

以下 2 点は Wave 3 全 PR で**絶対**に守る。

**C-1: Priority 5 route は feature flag 必須**
- `ALTER_MORNING_V2_ROUTE_ENABLED` 環境変数を導入、**default off**
- 実機 LLM スモークが通っても UI 切替はしない（UI 切替は Wave 4+）
- Flag off 時は v2 route を 503 / 404 相当で即リターン
- 既存 `morningProtocol.ts` (v1 legacy) は温存

**C-2: Body / Weather / other_party の annotation は L3 narration に自動注入しない**
- Wave 3 時点では annotation を **返すだけ** に留める
- narration からの参照は完全 opt-in（default は参照しない）
- Faithfulness Checker の allowed 集合に annotation 由来の値を勝手に追加しない
- narration 自動注入は Wave 4+ で別設計して入れる（Faithfulness の責務が急に重くなるため、Wave 3 で混ぜない）

---

## 3. Priority 1 — Gap Resolver 本実装

### 3.1 現状（調査結果）

- `lib/alter-morning/planning/gapResolver.ts` (239 行) に `resolveGaps(events: Event[]): GapResolution` が既存
- 戻り値は GapAction（clarify / defer_to_time_solver / defer_to_place_grounder / pass_through）のリスト
- **内部ロジックはほぼ完成**。呼び出し元は `modifyRouter.ts` のみで、production route には未接続

### 3.2 Wave 3 ゴール（**Q-1 = B 確定**）

「本実装」= **wire + clarify question 仕上げ**。

- orchestrator に接続するだけでなく、clarify action が実際の日本語質問文を生成できる状態にする
- tentative chain の再分類アルゴリズム強化（C）は Wave 4+ に送る

### 3.3 Wave 3 成果物

1. `runMorningPipeline` から `resolveGaps` を呼び、結果を pipeline 中間状態に保持
2. clarify action が `{ question: "〜？", target_slot: "when|where|...", target_event_id }` 構造を返す（slot 別の日本語テンプレート）
3. clarify question は rule-based で固める（LLM 生成は Wave 4+）
4. L3 Faithfulness Checker と Gap Resolver の関係を契約テストで固定
   - resolve しきれなかった event の narration は hedge / 省略で対応しているか

### 3.4 やらないこと

- Gap Resolver の LLM 化（Wave 4+）
- clarify 質問の LLM 生成（rule-based ファーストで固める）
- 複数 clarify の優先順位学習

---

## 4. Priority 2 — placeTable 拡張

### 4.1 現状

- 122 entry / Tokyo 偏重 / 以下 sparse:
  - `hotel`: 3 件 / `station`: 3 件 / `library`: 4 件 / `hospital`: 1 件 / `coworking`: 2 件 / `home`: 1 件
- 外部 API (Nominatim / Google Places) は Wave 2 design §2.4 で Wave 3 以降扱い

### 4.2 Wave 3 ゴール（**Q-2 = A 確定**）

**category 均等化のみ**。sparse category を 10 件以上に底上げ。geography は Tokyo のまま。
主要都市拡張 / 外部 API は Wave 4+ に送る（production route を閉じてから）。

### 4.3 Wave 3 成果物

1. sparse category ごとに以下を追加:
   - hotel: 主要ブランド 7+ 件追加（ホテルメトロポリタン / ドーミーイン / アパ / 東横イン / リッチモンド / リーガロイヤル / スーパーホテル 等）
   - station: 主要ターミナル 10+ 件（東京 / 新宿 / 渋谷 / 池袋 / 品川 / 上野 / 秋葉原 / 大手町 / 銀座 / 六本木）
   - library: 都内主要図書館 5+ 件
   - coworking: WeWork / Regus 等 5+ 件
2. alias 強化: 各 entry の口語呼称を 2+ alias 追加（例: 東京駅 → ["東京駅", "東京", "T-CAT"]）
3. placeGrounder の substring マッチ挙動を拡張後エントリで回帰テスト

### 4.4 やらないこと

- 外部 API 連携（Wave 4+）
- 人名辞書
- 活動 (activity) 辞書の拡張

---

## 5. Priority 3 — Body / Weather 統合

### 5.1 現状

- `lib/alter-morning/body/` / `lib/alter-morning/weather/` 共に **存在しない** 完全 greenfield
- 既存の outfit 推薦は `outfitBridge.ts` で venue から heuristic 推論している（Morning planner とは別系統）

### 5.2 Wave 3 ゴール

Body / Weather を **二次層（annotation 層）** として新設。plan graph は書き換えない。

- **Body 層**（`lib/alter-morning/body/`）
  - 入力: user's personalColor / bodyType / hairType（既存 phenotype データ）
  - 出力: event ごとに `BodyAnnotation { outfit_hint, tone_hint, avoid_hint }` を生成
  - Morning planner に「この plan に対して体色視点のアドバイス候補」を候補群で添える（複数候補保持）
- **Weather 層**（`lib/alter-morning/weather/`）
  - 入力: targetDate + 居住地（JMA office code は `lib/shared/location.ts` に既存）
  - 出力: `WeatherAnnotation { forecast, temp_range, precipitation, warning }`
  - event の時間帯に応じたアドバイス hint（屋内優先 / 折りたたみ傘 等）

### 5.3 スコープ確定（**Q-3 = A 確定**）

**Body / Weather 両方入れる**（Wave 3 の厚みを揃える）。
ただし C-2 固定制約により、**narration への自動注入はしない**。annotation を返すだけに留める。

### 5.4 Wave 3 成果物

1. `lib/alter-morning/body/bodyAnnotator.ts`
   - pure function: `annotateBody(events, phenotype): BodyAnnotation[]`
   - stub provider + 将来 LLM 差し込み interface
2. `lib/alter-morning/weather/weatherAnnotator.ts`
   - `annotateWeather(events, location, targetDate, forecastProvider): WeatherAnnotation[]`
   - JMA 予報 API provider interface（Wave 3 では stub / deterministic rules、実 API は Wave 4+）
3. `runMorningPipeline` に両 annotator を注入
4. **narration には流さない（C-2 固定）**。annotation は別フィールドで返す
5. 契約テスト:
   - annotation が plan graph (`ComprehensionResult`) / TimeLine / GroundedPlace を書き換えないこと
   - annotation を返しても既存 L3 テスト（Wave 2）が不変であること
   - Faithfulness Checker の allowed 集合が annotation 由来の値で広がらないこと

### 5.5 やらないこと

- 外部 API の本番呼び出し（Wave 4+）
- Body / Weather に基づく plan graph 再計画（annotation のみ）
- outfit 推薦 UI 統合（Wave 4+）

---

## 6. Priority 4 — other_party 生成（凍結解除）

### 6.1 Wave 2 での扱い

- Wave 2 design では凍結（CEO 2026-04-18: "who は turn 2+ で後回し"）
- `Event.who: string[]` のみ存在、生成ロジック無し

### 6.2 Wave 3 ゴール（**Q-4 = A 確定**）

**annotation のみ**。plan graph の `Event.who` は書き換えない。narration にも流さない（C-2 固定）。
modify 経路統合（B）は Wave 4+ に送る。

### 6.3 Wave 3 成果物

1. `lib/alter-morning/planning/partyAnnotator.ts`
   - pure function: `annotateParty(events, userBaseline): PartyAnnotation[]`
   - candidates: user の頻繁共起者（phenotype / calendar baseline など）から候補を添える
   - **断定しない**、候補として複数保持
2. narration には Wave 3 時点では流さない（Faithfulness 影響を抑制）
3. 契約テスト: plan graph 非破壊

### 6.4 やらないこと

- Rendezvous の relation graph 連携（別ドメイン）
- LLM で「誰と行きそうか」推論（Wave 4+）

---

## 7. Priority 5 — Morning pipeline production route 配線

### 7.1 Wave 3 ゴール

`runMorningPipeline` orchestrator と route handler を新設し、**実機 LLM で 1 発通す**。

### 7.2 Wave 3 成果物

1. `lib/alter-morning/morningPipeline.ts`
   ```ts
   export async function runMorningPipeline(
     input: { utterance: string; userId?: string; ... },
     providers: { l1Provider: ...; narrationProvider: NarrationProvider; ... }
   ): Promise<MorningPipelineResult>
   ```
   - L1.0 rule preparse → L1.1 LLM → L1.2 provenance check → L2.1 gap resolve → L2.2 time solve → L2.3 place ground → L3 narration pipeline
   - 各層の結果を result に含めて observability
2. `app/api/alter-morning/plan/route.ts`（新設）
   - POST: utterance を受けて runMorningPipeline を呼ぶ
   - auth: 既存の supabase auth 踏襲
   - telemetry: `logAiRun` 経由
3. **実機スモーク**: CEO 承認後に `OPENAI_API_KEY` 環境で 1-2 発打ち、通しの "通じてる感" を確認

### 7.3 kill switch（C-1 固定）

`process.env.ALTER_MORNING_V2_ROUTE_ENABLED === "true"` で gating。**default off** は妥協不可。
Flag off 時は v2 route を即リターン（503/404 相当）。既存 `morningProtocol.ts` (v1) は温存。

### 7.4 やらないこと

- 既存 morningProtocol (v1 legacy) の撤去
- UI から v2 route への切り替え（Wave 4+）
- A/B テスト設計

---

## 8. PR 分割方針

Wave 1 / Wave 2 は 1 PR でしたが、**Wave 3 は規模が大きいので 3 PR に分割**（**Q-5 = A 確定**）。

| PR | スコープ | 想定行数 | 依存 |
|----|----------|----------|------|
| **W3-PR-1** | Priority 1 (Gap Resolver 接続) + Priority 2 (placeTable 拡張) | ~1500 | main |
| **W3-PR-2** | Priority 3 (Body / Weather 新設) + Priority 4 (other_party annotation) | ~2500 | W3-PR-1 |
| **W3-PR-3** | Priority 5 (runMorningPipeline + route handler + 実機スモーク) | ~1500 | W3-PR-2 |

---

## 9. CEO 承認 Q&A（確定済み）

| # | 質問 | 確定回答 |
|---|------|---------|
| Q-1 | Gap Resolver「本実装」の意味 | **B**（wire + clarify question 仕上げ） |
| Q-2 | placeTable 拡張スコープ | **A**（category 均等化のみ） |
| Q-3 | Body / Weather スコープ | **A**（両方、ただし C-2 により narration 自動注入なし） |
| Q-4 | other_party 実装形態 | **A**（annotation のみ） |
| Q-5 | PR 分割 | **A**（3 PR） |

**固定制約（§2.1）**:
- **C-1**: `ALTER_MORNING_V2_ROUTE_ENABLED` default off（妥協不可）
- **C-2**: Body / Weather / other_party annotation は L3 narration に自動注入しない

**CEO 承認済み next steps**:
- Wave 3 branch `feat/alter-morning-comprehension-first-wave3` を main から切る
- W3-PR-1 → W3-PR-2 → W3-PR-3 の順で進める
- 実機 LLM スモーク（Priority 5 最後）は CEO 承認後に実行

---

## 10. 成功条件

Wave 3 完了時点で以下が満たされていること:

1. ✅ `runMorningPipeline("9時にサドヤでコーヒー")` が production route から呼べて、自然な narration を返す
2. ✅ `runMorningPipeline("15時あたりにカフェ")` が tentative hedge 付きで narration を返す
3. ✅ `runMorningPipeline("自宅から渋谷")` が place resolved / unresolved を正しく分ける
4. ✅ Body annotation / Weather annotation が plan graph を書き換えずに返る
5. ✅ 実機 LLM で 1-2 発打って "通じている感" が最低限出る（CEO の目視確認）
6. ✅ Wave 1 / Wave 2 既存テスト 982 件が全て通る（回帰ゼロ）
7. ✅ tsc 差分由来エラー 0 件
8. ✅ CI lint-and-test green

---

## 11. Wave 3 が閉じたら

- Wave 4 の主戦場: outfit 推薦との統合 / 既存 v1 morningProtocol.ts 撤去 / UI 差し替え / A/B テスト / 外部 API（Places / JMA 本番）
- Wave 5+: Turn 2+ modify の成熟 / Rendezvous との交差 / 複数 modify 同時対応

---

**本設計書の承認フロー**:
1. ✅ CEO が Q-1〜Q-5 に回答（2026-04-21 完了、全て推奨案承認）
2. ✅ 回答を反映して本設計書を確定版として main にコミット（Wave 1 / Wave 2 と同じフロー）
3. Wave 3 branch を main から切って実装着手
