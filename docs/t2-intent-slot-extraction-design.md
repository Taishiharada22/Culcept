# T2 intent / slot 抽出 設計（design only・実装禁止）

**作成日**: 2026-06-12
**ステータス**: docs-only。実装・LLM 呼び出し・runtime 抽出・API・DB・migration・route/server action・service_role 配線・M2-B-2・liveCollector 変更・CoAlter adapter 統合・UI・外部 API・production・push すべて**なし**。local only。
**前提**: TravelCore-T1 完了（T1A pure types `44c0a1f1` / T1B pure helpers `407f2c4f`）。
**整合対象**: TravelCore-T1A/T1B・M2 PersonalizationPort 境界（[m2-personalization-port-design.md](m2-personalization-port-design.md)）・CoAlterPlanSession participant モデル（[t1a-closeout-and-contract-alignment.md](t1a-closeout-and-contract-alignment.md)）・TalkBridge-T1a adapter 境界（[coalter-plan-tab-talk-migration-design.md](coalter-plan-tab-talk-migration-design.md)）・**「adapter provider mode と participant source は別概念」という訂正**。

---

## §0 位置づけと設計原則

T2 = 3 層アーキテクチャ（LLM 抽出 → 決定論ソルバ → LLM 説明）の**第 1 層（Understand）の精密化**。UI モックの「会話 → 共有コンディション chips」の裏側を定義する。

原則:
1. **抽出は累積的・冪等**: セッション中の発話・操作のたびにスロット集合を更新する（再抽出しても同じ入力からは同じ結果）。
2. **LLM は提案者・正規化器が門番**（§5）。LLM の出力は常に `proposed` 状態であり、決定論 normalizer を通過して初めて TravelCore の制約になる。
3. **可視性は内容ではなく「surface の聴衆」で決まる**（§4）。
4. **三直交の分離**: ①participant source（identity 出自・T1A）②adapter provider mode（メッセージ転送の供給元: fixture / talk_thread 等・TalkBridge-T1a）③**extraction source surface（本書 §2: スロットの根拠となった操作面）**。互いに独立な軸であり、どれからも他を推論しない。

## §1 スロットモデル（Required output 1）

スロット = 「プラン生成に必要な構造化情報の 1 単位」。各スロットは下表の定義に従う。**スロット値は T1A 型へ正規化可能な形のみ**を最終形とする。

| slot key | 値の形（正規化後） | 変換先（TravelCore） | owner 既定 | 備考 |
|---|---|---|---|---|
| `destination_area` | { areaText, placeRefId? } | candidate 生成の入力（制約ではない） | shared | 地名解決（placeRefId 付与）は T3+ の外部解決。T2 はテキスト+任意 ref まで |
| `date_or_range` | ISO date / {start,end,nights} | `TravelPlanWindow`（T1B `isValidPlanWindow` 検証） | shared | |
| `time_window` | 分単位 {departAfterMin?, returnByMin?} | `TravelConstraint` axis=time（T1B `isValidMinuteOfDay`） | 発話者 participant | 例「20時には帰りたい」→ `return_by:1200` |
| `budget_band` | `BudgetBand`（T1B `normalizeBudgetBand`） | constraint axis=budget | 発話者 participant | 「上限」断定 → hard、「目安」→ soft |
| `pace` | `Pace`（slow/normal/intense） | `TravelCorePlan.pace` + axis=fatigue soft | shared（合意後） | 個別発話段階は participant owner |
| `mobility_tolerance` | { maxWalkKm? , maxTransfers? } | constraint axis=distance | 発話者 participant | 「移動は軽め」chips の正体 |
| `red_line` | descriptor 正規キー | constraint severity=red_line | 発話者 participant | 明示的な絶対 NG のみ。推定で red_line を立てない |
| `soft_preference` | descriptor 正規キー | constraint axis=preference severity=soft/preference | 発話者 participant | 「会話しやすい場所」「温泉」等 |
| `participant_constraint` | 上記の participant-owner 形 | owner: {kind:"participant", participantId} | participant | §4 の visibility 規則に従う |
| `shared_condition` | 上記の shared-owner 形 | owner: {kind:"shared"} | shared | UI chips に出るのはこの層（confirmed のみ） |

**スロット状態機械**: `proposed`（LLM/構造化操作からの候補）→ `normalized`（T1B 検証合格）→ `confirmed`（ユーザー承認: chip 表示の確定・リアクション・明示操作）→ `retracted`（撤回）。**chips に出るのは confirmed のみ**。

**不確実性・欠損（uncertainty / missing）**: スロットごとに `confidence 0..1` と充足状態 `filled / partial / missing` を持つ。重要度（プラン生成に必須か）× 欠損で **missing-slot questions**（§3）を導出する。必須スロット（MVP）: `date_or_range`・`destination_area`（粗くてよい）。他は欠損のままでも default で生成可能（M2 prior で補完）。

## §2 抽出ソース surface（Required output 2）

| surface | 性質 | 抽出方式 |
|---|---|---|
| `chat_message` | 自由文（ペアチャット/ソロチャット） | **LLM 提案（将来・runtime GO 後）**。発話は TalkBridge adapter が供給する utterance イベント（speaker は participantId で識別） |
| `quick_action` | 構造化（「もっと近く」「予算を下げる」） | **決定論マッピング（LLM 不要）**。action id → スロット差分の固定表 |
| `adjustment_card` | 構造化（プラン側「ランチをもっと近くに」適用） | 決定論マッピング |
| `form_input` | 構造化（モード選択・日付ピッカー・人数） | 決定論マッピング |
| `profile_prior` | M2 由来の事前値（例: 「予算: ミディアム」） | **M2 PersonalizationPort 経由のみ**（orchestration 層が `derivePlanParams` の派生値を prior スロットとして注入。**生の軸スコアは扱わない**） |
| `relation_context`（将来） | Culcept 側 relation データ由来の文脈 | 将来定義。本書では enum 予約のみ |

**旧 `/talk` を唯一のソースにしない**: `chat_message` は「adapter が供給する utterance イベント」に対して定義され、その adapter の **provider mode（fixture / talk_thread / 将来の plan-native）が何であるかを抽出層は関知しない**。同様に speaker の participant source kind（self / talk_pair_member / culcept_relation / plan_session）も抽出規則に影響しない（T1B で固定した source-agnostic 規則を継承）。

## §3 出力契約（Required output 3）

T2 の出力 = `ExtractedSlotSet`（型定義は T2B で実装。本書は契約のみ）:

```
ExtractedSlotSet {
  slots: ExtractedSlot[] {
    key: TravelSlotKey
    value: （§1 の正規化後の形）
    status: "proposed" | "normalized" | "confirmed" | "retracted"
    confidence: 0..1            // 抽出確度（M2 prior 由来は M2 の confidence を継承）
    owner: { kind: "shared" } | { kind: "participant", participantId }
    visibility: "shared" | "private"        // §4 の規則で決定
    evidence: EvidenceRef[] {               // 根拠への参照（本文の複製は持たない）
      surface: chat_message | quick_action | adjustment_card | form_input | profile_prior | relation_context
      refId: string                          // message id / action id / "m2:planParams.budgetPosture" 等
      speakerParticipantId?: string
    }
  }
  missingSlotQuestions: { slotKey, priority, questionIntent }[]   // 文言生成は説明層の責務
}
```

規則:
- **生の private 性格スコアを含めない**: `profile_prior` 由来スロットは M2 の**派生値**（budgetPosture / paceDefault 等の band 値 + confidence）のみ。`stargazer_axis_snapshots` の生スコア・axis キー単位の値は ExtractedSlotSet に存在してはならない。
- evidence は**参照**であり、本文（チャット原文）の複製を持たない（PII 最小化。表示時に refId から引く）。
- `assertNoEngineOnlyLeak` 互換: ExtractedSlotSet は plain object としてゼロから構築する。`EngineOnly` ブランド付きオブジェクト（M2-B-1 のペア snapshot 等）を**埋め込んだ瞬間に出口ガードで throw する**ことを互換性の定義とする（T2C でカナリアテスト固定）。

## §4 プライバシー規則（Required output 4）

1. **可視性は surface の聴衆で決まる（内容では決めない）**: ペアチャットでの発話は相手が既に見ている → そこから抽出されたスロットは **shared 既定**。`profile_prior`（M2 由来）と将来の `relation_context`・ソロ入力面は **private 既定**。
2. **private はプランの形に影響してよいが、shared rationale（相手向け説明）の根拠に使ってはならない**（M5 不変則）。ソルバ入力には private を含む全制約が入る。説明生成時に `filterConstraintsForViewer`（T1B）で viewer 別に制約集合を絞る。
3. **viewer-only rationale は別物**: 本人向け説明（`ViewerScopedRationale.forParticipant`）には本人の private 根拠を含めてよい。shared 説明は shared スロットと一般化理由のみで構成。
4. **private→shared の昇格はユーザーの明示行為のみ**（chip 共有承認等）。抽出層が自動昇格しない。UI モックの「個別条件は要約して共有」はこの昇格 UI。
5. 出力は `assertNoEngineOnlyLeak` 互換（§3）。leak 検査は per-viewer serialize 直前に必ず通す。

## §5 決定論境界（Required output 5・赤線）

```
構造化 surface（quick_action / adjustment_card / form_input / profile_prior）
   └─ 決定論マッパー（LLM 不要）──────────────┐
自由文 surface（chat_message）                      ├─→ proposed slots
   └─ LLM slot 提案器（将来・runtime GO 後）────┘
                     ↓
   決定論 normalizer（T1B helpers が門番）:
     isValidIsoDate / isValidPlanWindow / isValidMinuteOfDay / normalizeBudgetBand /
     isUncertaintyLevel / isConstraintSeverity / validateParticipantsForMvp
     + descriptor 正規キー registry（normalizer だけが descriptor を書く）
                     ↓
   normalized slots → TravelConstraint / TravelPlanWindow / Pace へ変換（T1A 型）
                     ↓
   ソルバ（T3）が制約充足・行程整合を**全責任**で担う
```

- **LLM は候補スロットの提案のみ**。検証・正規化・制約変換は決定論層が行い、不合格は `proposed` のまま破棄または問い直しに回す。
- **LLM は行程の整合性（時刻・予算・営業時間・移動）の根拠になってはならない**（TravelPlanner 系の実証: 純 LLM は制約充足 0.6%〜43%、ソルバ層で 97.9%）。
- descriptor の正規キー（`return_by:HH:MM` / `budget_max:N` / `avoid:crowd` 等）の registry は T2B で as-const 定義し、normalizer を唯一の書き手とする。

## §6 実装スライス（Required output 6・すべて明示 GO 必須）

| Slice | 内容 | 性質 |
|---|---|---|
| **T2A** | 本書のレビュー反映 + closeout（docs-only） | docs |
| **T2B** | schema/types のみ: `TravelSlotKey`・`ExtractedSlot`・`EvidenceRef`・`SlotStatus`・descriptor registry（as-const + pure types。T1A と同流儀・未配線） | additive pure types |
| **T2C** | **fake extractor テスト**: 決定論 fake 提案器（固定対話 fixture → 期待スロット）+ normalizer パイプラインの unit。実 LLM なし。EngineOnly カナリア互換テスト含む | additive pure + tests |
| **T2D+** | runtime LLM 抽出（**ずっと後**）: flag 既定 OFF・CoAlter adapter 統合 GO 後・LLM への最小開示規則（band 値のみ・生スコア不可）とセット | runtime（HOLD） |

## §7 整合チェックリスト

- **T1A/T1B**: 出力は T1A 型へ正規化・normalizer は T1B helpers を門番に使う・participant は participantId 参照のみ。
- **M2 境界**: prior は orchestration 層が M2 port から取得して注入。抽出層は M2 を import しない（core→M2 直接依存なしの原則を抽出層にも適用）。生スコア非搭載。
- **CoAlterPlanSession participant モデル**: speaker / owner は `participants[]` の participantId。`pairStateId` 直接参照なし。
- **TalkBridge-T1a 境界**: 抽出は adapter が emit する utterance イベントを消費。**adapter provider mode（fixture/talk_thread/…）と participant source kind は別概念**であり、抽出はどちらにも依存しない。
- **旧 /talk 非依存**: chat_message は複数 provider のうちの 1 surface。quick_action / form / prior だけでも最小プラン生成が成立する設計（チャットなしでも動く）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
