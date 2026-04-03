# Alter（AI対話エンジン）改善パック

## この機能を改善させるための依頼文
```
以下はAneurasyncのAlter（AI対話エンジン）に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Home画面のComposer、Stargazerの観測データ、Originの行動記録等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象ファイル: hooks/useAlterChat.ts, app/api/stargazer/alter/route.ts, lib/stargazer/alterHomeAdapter.ts, components/home/AskHero.tsx, components/home/AnswerCard.tsx, components/home/AlterFollowup.tsx
```

## 1. この機能の役割
Aneurasyncの「声」。ユーザーの質問・相談に対して、45軸ベイズ性格モデル+ForceBalance+ActionShape判断エンジンで個人化された応答を生成するAI対話システム。「汎用チャットボット」ではなく「あなたの判断原理を知っているAI」として機能する。Home画面のComposerから起動。

## 2. 現状の事実
- 日次上限: MAX_DAILY_ROUNDS = 5（useAlterChat.ts line 30）。JSTリセット。betaテスターバイパス
- 会話永続化: なし。React state内のみ。リロードで消失。DB保存なし
- localStorageには日次カウント(aneurasync_alter_daily_v1)のみ
- エンジン: app/api/stargazer/alter/route.ts（4,123行）
  - Phase 0: Gemini（utterance reading）→ Phase A: state integration → Phase 2: relational lens → Phase 3: judgment engine
  - モデル: Claude Sonnet、温度 0.6(main)/0.4(retry)/0.3(clarify)
- エンジン本体: lib/stargazer/alterHomeAdapter.ts（5,746行）
  - ForceBalance（7連続変数）→ ActionShape（8離散判断形）
  - P1-Aルーター: 5タイプ（emotional/self_understanding/knowledge/strategy/judgment）
  - 専用プロンプトパス各1本
  - buildPersonalizedFacts() line 1621: archetype重み減衰 weight=1/(1+obsCount*0.08)
  - PASS率90%、ルーター正解率100%（eval 35ケース）
- エラーハンドリング: 429（上限到達）、AbortController。リトライロジック（指数バックオフ）なし
- Talk画面: app/(culcept)/talk/ に4ファイル（別スレッド型チャット）
- チャット関連コンポーネント: 6個

## 3. 世界トップ比較
- ChatGPT: 無制限会話、DB永続化、スレッド管理、System Prompt、GPT-4o/o1選択、ファイルアップロード、Code Interpreter
- Pi (Inflection): 無制限、会話永続、トピック切替、共感重視の応答設計
- Replika: 無制限、会話永続、感情記憶、関係性進化
- Character.ai: 無制限、キャラクター別人格、グループチャット
- Claude (Anthropic): 無制限(有料)、Projects、Artifacts、MCP

## 4. 測定指標
| 指標 | 現状値 | ChatGPT | Pi | Replika |
|------|--------|---------|-----|---------|
| 日次対話上限 | 5回 | 無制限(有料) | 無制限 | 無制限 |
| 会話履歴永続 | なし | DB保存 | DB保存 | DB保存 |
| パイプラインPhase数 | 5 | N/A | N/A | N/A |
| ルートファイル行数 | 4,123 | N/A | N/A | N/A |
| エンジンファイル行数 | 5,746 | N/A | N/A | N/A |
| 質問タイプ分類 | 5種 | N/A | N/A | N/A |
| リトライロジック | なし | あり | あり | あり |
| 性格モデル軸数 | 45 | なし | なし | 限定的 |
| 判断エンジン | ForceBalance+ActionShape | なし | なし | なし |

## 5. 全問題点
1. 会話がリロードで完全消失。競合は全てDB永続
2. 日次5回上限。Daily Guidance Engine等の日常利用で3回消費→残り2回
3. 4,123行の単一ルートファイル。Phase分割がファイル内に留まりモジュール分離されていない
4. 5,746行のエンジンファイルも巨大。テスト困難
5. リトライロジックなし。ネットワークエラーで応答消失
6. Talk画面（スレッド型）とHome Composer（インライン型）の二重構造。使い分けが不明瞭
7. clarifyモードの上限除外ロジック（line 534-546）があるが、ユーザーには残り回数が正確に表示されない可能性
8. AbortControllerでリクエストキャンセルできるが、サーバー側のLLM呼び出しは継続（コスト発生）
9. betaテスターハードコード（3メールアドレス）。スケーラブルでない

## 6. 全改善案
A. 会話履歴DB永続化（Supabaseテーブル追加）
B. alter/route.tsをPhase別モジュールに分割（route.tsはオーケストレーションのみ）
C. alterHomeAdapter.tsの機能別分割（ForceBalance, ActionShape, PersonalizedFacts, PromptBuilder）
D. 指数バックオフ付きリトライロジック追加
E. Talk画面とHome Composerの役割明確化（Homeは相談、Talkはログ閲覧等）
F. 日次上限の動的化（ストリークレベルに応じて増加: observer=5, seeker=7, introspector=10等）
G. サーバー側LLMキャンセル対応（AbortSignal伝播）
H. betaテスターフラグのDB化（rendezvous_profiles.is_premiumと統合）
I. 残り回数のUI明示（「あと3回」表示）

## 7. 改善案への反証
A反証: 非永続は「毎回フレッシュな観測」の設計意図の可能性。永続化すると「過去の自分」に引きずられる
B/C反証: ファイル分割はリファクタであり機能改善ではない。動作に問題がないなら優先度低
D反証: LLM APIは通常安定。リトライが必要なほど不安定なら別問題
F反証: 上限増加はLLMコスト直結。5→10で月額コスト2倍。betaフェーズでのコスト管理に反する
H反証: betaテスター3人なら.env管理で十分。DB化はオーバーエンジニアリング

## 8. 反証後の再修正
A再修正: 非永続が意図的なら、UIで「毎回、今のあなたに合わせた会話を始めます」と明示。意図的でないならDB永続化。→CEO判断事項
B/C再修正: 4,123行ファイルはホットフィックス時の認知負荷が高い。パフォーマンスではなくメンテナンス性の問題として優先度を判断
F再修正: 上限増加ではなく、clarifyモード（確認質問）を上限から除外することで実質的な対話可能回数を増加
I再修正: 残り回数表示は低コストで実装可能。即実行可

## 9. 確定改善
1. alter/route.ts Phase別モジュール分割（メンテナンス性向上）
2. 残り回数のUI明示（useAlterChat.tsのremainingRoundsをAskHeroに表示）
3. リトライロジック追加（最低1回のリトライ、3秒待機）

## 10. 要検証改善
1. betaテスターの平均日次利用回数（5回上限の妥当性確認）
2. Talk画面の利用率（Home Composerとの使い分け実態）
3. ネットワークエラー発生率（リトライの必要性確認）
4. clarifyモードの発火率

## 11. 要判断改善
1. 会話履歴のDB永続化 vs 意図的非永続（CEO判断）
2. 日次上限の動的化（LLMコスト vs ユーザー体験のトレードオフ）
3. Talk画面の存続/統合（Home Composerとの一本化の可能性）

## 12. 修正時の副作用 / 依存関係
- route.ts分割 → テスト対象ファイルの変更、import pathの更新
- DB永続化 → Supabaseマイグレーション、RLS設定、Home画面の会話復元ロジック追加
- 上限変更 → useAlterChat.tsのMAX_DAILY_ROUNDS変更、UIの残り回数表示更新
- Talk画面変更 → lib/navigation.tsのMAIN_NAVメッセージ項目に影響

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの
- 削る: betaテスターハードコード（DB化後）
- 残す: 5フェーズパイプライン、P1-Aルーター、ForceBalance+ActionShape
- 強化: エラーハンドリング（リトライ）、残り回数表示、Phase別モジュール化
- 統合: Talk画面とHome Composerの関係整理（要判断）

## 14. この機能が世界トップを超えるための最終条件
ChatGPTやPiは「汎用チャット」。Alterの差別化は「45軸性格モデルに基づく個人化された判断支援」。世界トップを超えるには: (1) 応答の個人化が体感できる（「他の人には違うことを言う」とユーザーが感じる）、(2) 判断の根拠が透明（ForceBalanceの値がUIに反映）、(3) 継続するほど精度が上がることが可視化される。会話永続化の有無は設計思想次第だが、「覚えていない」ではなく「今のあなたに集中する」として成立させること。
