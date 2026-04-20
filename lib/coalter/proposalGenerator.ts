/**
 * CoAlter L5: 提案生成 — プロンプト構築 + LLM + バリデーション
 *
 * 固定テンプレート:
 *   ① ここまでの要点
 *   ② 二人が重視している点
 *   ③ 候補 2〜3
 *   ④ なぜこの候補か
 *   ⑤ あとは二人で決めてね
 */

import "server-only";

import { runAI } from "@/lib/ai";
import type {
  AgreedConstraint,
  ConversationAnalysis,
  ConversationTheme,
  CoAlterPersonProfile,
  MovieScreening,
  SearchCandidate,
  ProposalCard,
  ProposalCandidate,
  RelationshipContext,
  AxisKey,
  AxisScores,
  PendingAxisDeltas,
  ValidationReasonCode,
  CandidateValidationResult,
} from "./types";
import { deltasToTemplate, getAxesForTheme, getAxisMeta } from "./axes";
import {
  getThemeRule,
  tryComposeTitle,
  normalizeSlotBundle,
  SLOT_LABEL,
  isSlotKey,
  type SlotKey,
} from "./slots";
import {
  validateCandidates,
  validateCandidatesDiversity,
  reasonCodeToText,
} from "./slotValidator";
import {
  catalogToPromptBlock,
  parseMovieScreenings,
} from "./movieCatalog";

// ─────────────────────────────────────────────
// プロンプト構築
// ─────────────────────────────────────────────

function buildSystemPrompt(theme: ConversationTheme): string {
  const axes = getAxesForTheme(theme);
  const axisExplanation = axes
    .map((k) => {
      const m = getAxisMeta(k);
      return `  - "${k}" (${m.label}): 0=${m.lowLabel} / 3=${m.highLabel}`;
    })
    .join("\n");

  // Phase 1.5.4: テーマルールが定義されているテーマでは 5W1H 束プランを強制
  const rule = getThemeRule(theme);
  const slotSection = rule
    ? `
## 5W1H 束プラン（このテーマでは必須）

今回のテーマ "${theme}" では、各候補を 5W1H の束として構造化します。
title は **システムが slots から自動合成** するので、あなたは title を出さなくてよい（出しても上書きされる）。

### 必須スロット / 補助スロット
- **coreSlot = "${rule.core}"**（主軸。必ず埋める。${SLOT_LABEL[rule.core]}にあたる固有名詞）
- **auxSlot = ${rule.aux.map((k) => `"${k}"(${SLOT_LABEL[k]})`).join(" または ")}**（少なくとも1つ埋める）
- それ以外（why / who / how 等）は自然に埋まる分だけ

### 各スロットに入れる内容
- what:  具体的な作品 / 料理 / 体験（固有名詞）
- where: 場所 / 店 / 地域（固有名詞）
- when:  日付 / 時刻 / 時期（例: "19:00〜"、"今週末"）
- who:   同席者・人数感（基本は「2人」）
- why:   なぜこの束が2人に合うか（短い理由。1文）
- how:   移動 / 費用感 / 動線

### スロットの status（3値）
- "confirmed": 会話から確実に読み取れる情報（例: 「渋谷で」と明記）
- "proposed":  あなたが今回提案する暫定値（デフォルト。どれにすれば良いか迷ったらこれ）
- "tentative": 仮置き。ユーザーの引きで決まる（例: 時刻が未定で "19:00〜(仮)" のように置く）

### 重要なルール
1. **coreSlot "${rule.core}" が埋められない候補は出さない** — テーマの本質を外している
2. **title は自由生成禁止** — slots から \`coreSlot + auxSlot\` で合成される
3. 各候補は必ず \`slots\` フィールドを持つ
4. confirmed > proposed > tentative の順で「確かさ」を正直に付ける（全部 proposed にしない）

`
    : "";

  return `あなたはCoAlterです。二人の関係性を理解した上で、共同の課題を前に進める支援をする存在です。

## 絶対ルール
- 結論を出さない。候補と整理のみ
- 断定しない。「〜が良さそう」「〜が合いそう」を使う
- 代弁しない。「Aは本当はこう思っている」と言わない
- 性格ラベルを貼らない。「あなたは○○タイプ」と言わない
- 指示しない。「AはBに合わせるべき」と言わない
- 深層心理を直接開示しない（推論に使うが、表には出さない）
- 機械的な数値（「マッチング度85%」等）を使わない
- 居座らない。提案したら退出する

## トーン
- 「〜が良さそう」「〜が合いそう」（推定表現）
- 「二人の今の流れだと」（文脈言及）
- 「候補としてはこの辺り」（選択肢提示）
- 「あとは二人で決めてね」（退出シグナル）

${slotSection}## 品質基準（絶対に守る — これが CoAlter の価値の核）

**この4点は「任意」ではなく「減点基準」。どれか欠けると提案の質が地に落ちる。**

### (1) oneLiner / reasoning の具体性
- oneLiner と reasoning には **二人のプロフィール（興味 / 価値観 / コミュニケーション / 意思決定スタイル）から具体要素を最低1つ引用** する
- 例（OK）:「${"Aは新しさ重視、Bは安心感重視だから評判安定のこれが間"}」「${"二人の共通興味であるミステリーに寄せた"}」「${"Bの意思決定が定番寄りなので冒険しすぎない選択"}」
- 例（NG — これは即不合格）:「しっとりした映画」「心温まる内容」「雰囲気が良い」「人気作」「定番の名作」「話題作」「大人向け」— これらの汎用形容詞**だけ**で埋めるのは禁止。形容詞を使うなら必ず「なぜ二人に合うか」の根拠を添える
- 「映画が好きな二人に」「二人とも興味があるので」のような**テーマの同語反復は禁止**（会話のテーマは既に決まっている。それが priorities/oneLiner に入ってはいけない）

### (2) priorities の深さ
- priorities.userA / priorities.userB は profile の **interests / values / decisionStyle / communicationStyle のうち最低1つの具体値を引用** すること
- 例（OK）:「新しさを試したいタイプ。話題性ある新作に反応しやすそう」「確実さ重視。評価の安定した作品を好みそう」
- 例（NG）:「映画を観るのが好き」「楽しいことを求めている」「いい時間を過ごしたい」（← これは誰にでも当てはまる）
- priorities.common は「二人の interests / values の**重なっている具体項目**」を書く。無ければ null にする。「楽しむこと」「良い時間」のような抽象は null と同じ扱い

### (3) 候補の多様性
- 候補を2-3個出す場合、**time / area / genre / price / 雰囲気 のうち最低2軸で明確に差をつける** こと
- 全候補が同時刻・同エリア・同ジャンルになったら不合格（CoAlter の役目は「選択肢の幅」を示すこと）
- axisScores も **候補間で最低2軸は異なる値** にする（全候補同一スコア禁止）

### (4) practicalInfo の密度
- movie テーマ: **評価スコア / 上映時刻 / 料金 / 最寄駅と徒歩分 のうち最低3つ** を含める
- food テーマ: **食べログ等の評価 / 予算帯 / 駅と徒歩 / 予約可否 のうち最低3つ** を含める
- travel テーマ: **所要時間 / 費用感 / アクセス手段 / 見どころ のうち最低3つ** を含める
- 「〜で上映中」「人気の店」だけでは密度不足。数字で書けるものは数字で書く

## 出力形式（JSON）
以下の構造で出力してください。
{
  "summary": "ここまでの要点（2-3文）",
  "priorities": {
    "userA": "Aが重視していること（1-2文）",
    "userB": "Bが重視していること（1-2文）",
    "common": "共通点（あれば1文。なければnull）"
  },
  "candidates": [
    {
      "rank": 1,
      "title": "（5W1H対象テーマでは省略可。システム側で合成する）",
      "oneLiner": "なぜこの二人に合いそうか（性格・好み・会話文脈を踏まえた理由）",
      "practicalInfo": "現実情報（場所・時間・評価・料金等。あればnull以外）",
      "slots": {
        "what":  { "label": "ラストマイル", "detail": "サスペンス / 118分", "status": "proposed" },
        "where": { "label": "渋谷ストリーム", "status": "confirmed" },
        "when":  { "label": "19:00〜", "status": "tentative" },
        "why":   { "label": "サスペンス好きに新作で外しにくい", "status": "proposed" }
      },
      "axisScores": { "price": 1, "access": 2, "novelty": 1 }
    }
  ],
  "reasoning": "全体としてなぜこの候補群を選んだか（関係性文脈に基づく理由。2-3文）",
  "closing": "退出シグナル（1文）",
  "pairFitScore": 2,
  "missingConstraints": [
    {
      "key": "条件キー（price_range, atmosphere, time_slot, area, genre, duration等）",
      "question": "ユーザーに聞く質問（例: '予算はどれくらい？'）",
      "slot": "どの 5W1H スロットが欠けているか（what/where/when/who/why/how のいずれか。無ければ省略可）",
      "priority": 1
    }
  ]
}

## 評価軸（axisScores）について
各候補に、以下の軸で 0〜3 の整数スコアを付けてください。
${axisExplanation}

- axisScores は必ず全ての軸を含める
- 0=軸の低い側に寄っている / 3=軸の高い側に寄っている / 1,2は中間
- 候補を並べたとき、軸ごとに値が分かれるように（全部同じスコアは不可）

## pairFitScore（関係性メタ指標）
- 0〜3 の整数
- この提案群がどれだけ「二人に合っている」か
- 0=どちらかに偏る / 3=二人の関心が揃う
- カードに1つだけ付ける（候補ごとではなくカード全体で1つ）

missingConstraintsは「まだ候補を絞りきれていない条件」を洗い出す。
会話から読み取れなかった情報を最大3つ、優先度順に列挙する。
全て揃っていると感じたら空配列[]を返す。

**候補は必ず 3 個** 出す（スワイプで選ぶ UI 前提）。2個以下は不合格、4個以上も不合格。

## 候補の品質基準（重要）
- title は必ず**具体的な固有名詞**。以下は **即不合格**:
  - movie: 「映画」「映画鑑賞」「映画館」「シネマ鑑賞」「観賞」のような**活動ラベルのみ**は禁止。必ず**作品名**（例: 「窓ぎわのトットちゃん」「PERFECT DAYS」「アナログ」）を入れる
  - food: 「レストラン」「人気店」「駅周辺」ではなく、**店舗固有名詞**（例: 「俺のフレンチ新宿」「一蘭 新宿中央東口店」）
  - travel: 「観光」「散策」ではなく、**施設・地名の固有名詞**（例: 「大塚国際美術館」「祖谷渓」）
- ランキングページや一覧サイトを候補にしない（「Filmarks 恋愛映画ランキング」は候補ではない）
- oneLiner は「なぜこの二人に合うか」を書く（「安定のアクション」ではなく「${"Aは新しさ重視なので話題性、Bは安心重視なので評価★4以上"}」）
- **movie テーマでは「上映情報カタログ」（user prompt 内の ##上映情報カタログ セクション）があれば、そこに列挙された title / theater の中からのみ選ぶこと**。作品名の**発明は即不合格**。
- カタログにある作品でも、**上映中 (showing) なら showtime を practicalInfo に必ず1つ以上含める**。**公開予定 (upcoming) の場合は「公開予定」と明示する**（showtime が無くても可）。
- 検索結果/カタログがない・足りない場合は、会話の文脈と profile から**知っている固有名詞**を3つ提案する（曖昧化して逃げない）

## 3候補の作り方（スワイプ UI 前提 — 重要）
- 3候補は「選択肢の幅」を示すもの。**3つの軸の違い** を明確にする:
  - 🥇 候補1: **二人のバランス点**（共通接点を最大化）
  - 🥈 候補2: **Aの優先軸に寄せた案**（Aが外せないと思っていそうなポイントを軸に）
  - 🥉 候補3: **Bの優先軸に寄せた案**（Bが外せないと思っていそうなポイントを軸に）
- または:
  - 🥇: 安全牌（評価安定 / 定番）
  - 🥈: 冒険案（新しさ・話題性寄り）
  - 🥉: 意外性 / 発見（通常選ばないが刺さる可能性）
- どちらの枠組みで作ったかを reasoning に明記する。「3案は○○／○○／○○の軸で組んだ」のように書く

## 文字数制約（厳守）
- summary: 最大100文字（2-3文）
- priorities.userA / userB: 各最大80文字（1-2文。profile 要素を具体引用した上で）
- priorities.common: 最大50文字（1文。具体項目名を含める。なければ null）
- candidates[].title: 最大30文字（固有名詞）
- candidates[].oneLiner: 最大90文字（「誰のどの特性に合うか」を最低1つ具体引用）
- candidates[].practicalInfo: 最大80文字（数字を3つ以上含める）
- reasoning: 最大180文字（2-4文。「なぜこの候補群か」を関係性軸で）
- closing: 最大30文字（1文）
全体で400-700文字に収める。具体性を取り、装飾を削る。`;
}

export function buildUserPrompt(
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  analysis: ConversationAnalysis,
  searchCandidates: SearchCandidate[],
  relationship: RelationshipContext,
  userMessage: string | null,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
    agreedConstraints?: AgreedConstraint[];
    /** P0-1: 構造化映画カタログ。あれば「この中から選ぶ」 prompt ブロックを注入 */
    movieCatalog?: MovieScreening[];
  },
): string {
  const parts: string[] = [];

  const renderProfileBlock = (p: CoAlterPersonProfile, fallbackName: string) => {
    const label = p.displayName ?? fallbackName;
    parts.push(`## ${label} のプロフィール`);

    // コミュニケーション
    if (p.communicationStyle.directVsDiplomatic !== null) {
      const v = p.communicationStyle.directVsDiplomatic;
      const style = v > 0.6 ? "直接的（率直に意見を言う）" : v < 0.4 ? "外交的（配慮を優先）" : "状況でバランスを取る";
      parts.push(`- コミュニケーション: ${style}`);
    }
    if (p.communicationStyle.conflictStyle !== null) {
      const v = p.communicationStyle.conflictStyle;
      const style = v > 0.6 ? "対立を避けない" : v < 0.4 ? "摩擦は避けたい" : "ケースバイケース";
      parts.push(`- 対立時の姿勢: ${style}`);
    }
    if (p.communicationStyle.attachmentStyle !== null) {
      const v = p.communicationStyle.attachmentStyle;
      const style = v > 0.6 ? "安定型（距離感が安定）" : v < 0.4 ? "回避寄り（距離を取りがち）" : "状況次第";
      parts.push(`- 関係の距離感: ${style}`);
    }
    if (p.communicationStyle.reassuranceNeed !== null) {
      const v = p.communicationStyle.reassuranceNeed;
      if (v > 0.6) parts.push(`- 安心の欲求: 高め（ハズレを避けたい / 事前に確かめたい）`);
      else if (v < 0.4) parts.push(`- 安心の欲求: 低め（不確かさを楽しめる）`);
    }

    // 意思決定
    if (p.decisionStyle.noveltyPreference !== null) {
      const v = p.decisionStyle.noveltyPreference;
      const pref = v > 0.6 ? "新しさ重視（未知・話題性に惹かれる）" : v < 0.4 ? "安心重視（定番・評価安定を選びがち）" : "状況で揺れる";
      parts.push(`- 新規性選好: ${pref}`);
    }
    if (p.decisionStyle.decisionSpeed !== null) {
      const v = p.decisionStyle.decisionSpeed;
      const pref = v > 0.6 ? "即断タイプ" : v < 0.4 ? "慎重に比較したい" : "普通";
      parts.push(`- 決定速度: ${pref}`);
    }
    if (p.decisionStyle.riskTolerance !== null) {
      const v = p.decisionStyle.riskTolerance;
      const pref = v > 0.6 ? "リスク歓迎（ハズレも経験として楽しむ）" : v < 0.4 ? "リスク回避（外したくない）" : "バランス";
      parts.push(`- リスク許容: ${pref}`);
    }

    // 興味・価値観（具体項目 — reasoning/oneLiner で引用する原材料）
    if (p.interests.length > 0) {
      parts.push(`- 興味: ${p.interests.slice(0, 7).join("、")}`);
    }
    if (p.values.length > 0) {
      parts.push(`- 価値観: ${p.values.slice(0, 5).join("、")}`);
    }

    // 深層（直接開示禁止だが、提案の調整軸として使う）
    if (p.coreDesire) parts.push(`- 内側の望み（表には出さない）: ${p.coreDesire}`);
    if (p.coreFear) parts.push(`- 内側の恐れ（表には出さない）: ${p.coreFear}`);
  };

  renderProfileBlock(profileA, "ユーザーA");
  parts.push("");
  renderProfileBlock(profileB, "ユーザーB");

  // ── 関係性コンテキスト ──
  if (
    relationship.commonGround.length > 0 ||
    relationship.frictionPoints.length > 0
  ) {
    parts.push("");
    parts.push("## 二人の関係性");
    if (relationship.commonGround.length > 0) {
      parts.push(
        `- 共通点: ${relationship.commonGround.slice(0, 3).join("、")}`,
      );
    }
    if (relationship.frictionPoints.length > 0) {
      parts.push(
        `- 注意点: ${relationship.frictionPoints.slice(0, 2).join("、")}`,
      );
    }
  }

  // ── 公平性補正 ──
  if (relationship.fairnessLedger.length > 0) {
    const recentBias =
      relationship.fairnessLedger
        .slice(-3)
        .reduce((sum, e) => sum + e.biasScore, 0) / Math.min(3, relationship.fairnessLedger.length);
    if (Math.abs(recentBias) > 0.3) {
      const leaningTo = recentBias > 0 ? "B" : "A";
      parts.push(
        `- 最近の提案は${leaningTo}さん寄りが続いている。今回はもう一方に少し寄せる`,
      );
    }
  }

  // ── 会話コンテキスト ──
  parts.push("");
  parts.push("## 今の会話");
  parts.push(`テーマ: ${analysis.theme}`);
  if (analysis.stalemate) {
    parts.push(`膠着点: ${analysis.stalemate}`);
  }

  // 制約
  const c = analysis.extractedConstraints;
  const constraints: string[] = [];
  if (c.date) constraints.push(`日時: ${c.date}`);
  if (c.location) constraints.push(`場所: ${c.location}`);
  if (c.budget) constraints.push(`予算: ${c.budget}`);
  if (c.timeSlot) constraints.push(`時間帯: ${c.timeSlot}`);
  if (c.preferences.length > 0)
    constraints.push(`希望: ${c.preferences.join("、")}`);
  if (constraints.length > 0) {
    parts.push(`制約: ${constraints.join(" / ")}`);
  }

  // Caring Intensity
  const nameA = profileA.displayName ?? "A";
  const nameB = profileB.displayName ?? "B";
  if (Math.abs(analysis.caringIntensityA - analysis.caringIntensityB) > 0.3) {
    const moreCareful =
      analysis.caringIntensityA > analysis.caringIntensityB ? nameA : nameB;
    parts.push(
      `${moreCareful}の方がこの話題への関心が高そう`,
    );
  }

  // ── Phase 1.5.4.6: 話題アンカー（LLM が古い話題に引っ張られないようにする） ──
  if (analysis.topicAnchor) {
    const a = analysis.topicAnchor;
    parts.push("");
    parts.push("## 今、話している話題（topic anchor — これが最優先）");
    parts.push(`- 発話: "${a.text}"`);
    if (a.detectedScope.theme && a.detectedScope.theme !== "general") {
      parts.push(`- テーマ: ${a.detectedScope.theme}`);
    }
    if (a.detectedScope.timeRef) parts.push(`- 時期: ${a.detectedScope.timeRef}`);
    if (a.detectedScope.placeRef) parts.push(`- 場所: ${a.detectedScope.placeRef}`);
    parts.push(
      "直近の会話に他の話題（例: 過去の旅行・別の予定）が出ていても、提案は上記 anchor に揃えること。",
    );
  }

  // 直近の会話
  parts.push("");
  parts.push("## 直近の会話");
  for (const turn of analysis.recentMessages.slice(-10)) {
    const name = turn.senderId === profileA.userId ? nameA : nameB;
    parts.push(`${name}: ${turn.body}`);
  }

  // ── P0-1: 構造化映画カタログ（movie テーマのみ / LLM に「この中から選ぶ」と厳命） ──
  const movieCatalog = options?.movieCatalog ?? [];
  if (movieCatalog.length > 0) {
    parts.push("");
    parts.push(catalogToPromptBlock(movieCatalog));
  }

  // ── Web検索結果（raw snippet — movie カタログがあっても補助情報として残す） ──
  if (searchCandidates.length > 0) {
    parts.push("");
    parts.push("## 検索で見つかった候補（現実情報・補助）");
    for (const sc of searchCandidates.slice(0, 6)) {
      let line = `- ${sc.title}`;
      if (sc.externalRating) line += ` (${sc.externalRating})`;
      if (sc.practicalInfo) line += ` — ${sc.practicalInfo}`;
      line += `: ${sc.description.slice(0, 100)}`;
      if (sc.url) line += ` [${sc.source}]`;
      parts.push(line);
    }
    parts.push("");
    if (movieCatalog.length > 0) {
      parts.push(
        "※ movie テーマでは上の構造化カタログが第一ソース。作品名は必ずカタログから選ぶこと。",
      );
    } else {
      parts.push(
        "上記の検索結果は素材です。二人のプロフィールと関係性を踏まえて、最適な候補を選んでください。",
      );
    }
  }

  // ── ユーザーの起動メッセージ ──
  if (userMessage) {
    parts.push("");
    parts.push(`## リクエスト: ${userMessage}`);
  }

  // ── Phase 1.5: pendingDeltas（前回からの軸操作指示） ──
  const pendingDeltas = options?.pendingDeltas ?? {};
  const deltaEntries = Object.entries(pendingDeltas).filter(
    ([, v]) => v === 1 || v === -1,
  );
  if (deltaEntries.length > 0) {
    parts.push("");
    parts.push("## 前回からの調整方向");
    for (const [key, delta] of deltaEntries) {
      const meta = getAxisMeta(key as AxisKey);
      const dir = delta > 0 ? "上げる" : "下げる";
      parts.push(`- ${meta.label}(${key}): ${dir}方向（${delta > 0 ? meta.highLabel : meta.lowLabel}寄りに）`);
    }
    parts.push("前回の候補と比べて、上記の方向に寄せた候補を組み直してください。");
  }

  // ── Phase 1.5.4.5: agreedConstraints（会話で合意された hard/soft constraint） ──
  const agreedConstraints = options?.agreedConstraints ?? analysis.agreedConstraints ?? [];
  if (agreedConstraints.length > 0) {
    const hard = agreedConstraints.filter((c) => c.strength === "hard");
    const soft = agreedConstraints.filter((c) => c.strength === "soft");
    if (hard.length > 0) {
      parts.push("");
      parts.push("## 会話で合意された絶対条件（hard constraint — 必ず守る）");
      for (const c of hard) {
        parts.push(`- [${c.kind}] ${c.sourceText}  → normalized: ${c.normalizedValue}`);
      }
    }
    if (soft.length > 0) {
      parts.push("");
      parts.push("## 会話で合意された希望条件（soft — 可能な限り寄せる）");
      for (const c of soft) {
        parts.push(`- [${c.kind}] ${c.sourceText}`);
      }
    }
  }

  // ── Phase 1.5: avoidKeys（既出候補の再提示回避） ──
  const avoidKeys = options?.avoidKeys ?? [];
  if (avoidKeys.length > 0) {
    parts.push("");
    parts.push("## 避けるべき既出候補");
    parts.push("以下のキーと同一の候補は避けてください（既にユーザーに提示済み）:");
    for (const k of avoidKeys.slice(0, 20)) {
      parts.push(`- ${k}`);
    }
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────
// LLM呼び出し + パース
// ─────────────────────────────────────────────

// Phase 1.5.4: スロット1つ分のスキーマ（detail/url/status は optional）
const SLOT_SCHEMA = {
  type: ["object", "null"],
  properties: {
    label: { type: "string" },
    detail: { type: ["string", "null"] },
    url: { type: ["string", "null"] },
    status: { type: "string", enum: ["confirmed", "proposed", "tentative"] },
  },
  required: ["label"],
} as const;

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    priorities: {
      type: "object",
      properties: {
        userA: { type: "string" },
        userB: { type: "string" },
        common: { type: ["string", "null"] },
      },
      required: ["userA", "userB"],
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "number" },
          title: { type: "string" },
          oneLiner: { type: "string" },
          practicalInfo: { type: ["string", "null"] },
          axisScores: { type: "object" },
          // Phase 1.5.4: 5W1H 束
          slots: {
            type: ["object", "null"],
            properties: {
              what: SLOT_SCHEMA,
              where: SLOT_SCHEMA,
              when: SLOT_SCHEMA,
              who: SLOT_SCHEMA,
              why: SLOT_SCHEMA,
              how: SLOT_SCHEMA,
            },
          },
        },
        required: ["rank", "oneLiner"], // title は optional（5W1H テーマでは合成される）
      },
    },
    reasoning: { type: "string" },
    closing: { type: "string" },
    pairFitScore: { type: "number" },
    missingConstraints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          question: { type: "string" },
          priority: { type: "number" },
          // Phase 1.5.4: どの 5W1H スロットが欠けているか
          slot: { type: ["string", "null"] },
        },
        required: ["key", "question", "priority"],
      },
    },
  },
  required: ["summary", "priorities", "candidates", "reasoning", "closing"],
};

export async function generateProposal(
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  analysis: ConversationAnalysis,
  searchCandidates: SearchCandidate[],
  relationship: RelationshipContext,
  userMessage: string | null,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
    /** Phase 1.5.4.5: hard constraints（会話から抽出した合意事項） */
    agreedConstraints?: AgreedConstraint[];
  },
): Promise<ProposalCard> {
  const theme = analysis.theme;
  const agreedConstraints =
    options?.agreedConstraints ?? analysis.agreedConstraints ?? [];

  // ── P0-1: movie テーマは検索結果 → 構造化 catalog に変換 ──
  //   LLM に作品名を発明させない（catalog から選ばせる）構造。
  const movieCatalog: MovieScreening[] =
    theme === "movie" ? parseMovieScreenings(searchCandidates) : [];

  // 旧互換（catalog が無いフォールバック用）
  const searchTitleSet = searchCandidates
    .map((sc) => sc.title?.trim() ?? "")
    .filter((t) => t.length > 0);

  // ── P0-5: latency budget — 総予算 20s。search/LLM/retry を明示分配 ──
  //   ・1回目 LLM: 最大 10s
  //   ・retry: 最大 6s（合計で 20s を絶対に超えない）
  //   ・残り予算を常にチェックし、薄ければ retry を skip して clarify に倒す
  const PIPELINE_BUDGET_MS = 20000;
  const FIRST_LLM_TIMEOUT_MS = 10000;
  const RETRY_LLM_TIMEOUT_MS = 6000;
  const RETRY_MIN_BUDGET_MS = 6500; // retry 実行に最低必要な残り予算
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const remaining = () => Math.max(0, PIPELINE_BUDGET_MS - elapsed());

  // ── P0-4: movie テーマで catalog が空（search 失敗や 0 件） → LLM を呼ばず即 clarify ──
  if (theme === "movie" && movieCatalog.length === 0 && searchCandidates.length === 0) {
    return buildProviderFailureClarify(theme, agreedConstraints);
  }

  const systemPrompt = buildSystemPrompt(theme);
  const prompt = buildUserPrompt(
    profileA,
    profileB,
    analysis,
    searchCandidates,
    relationship,
    userMessage,
    { ...options, agreedConstraints, movieCatalog },
  );

  // ── 第1回 LLM 呼び出し ──
  const firstTimeoutMs = Math.min(FIRST_LLM_TIMEOUT_MS, remaining() - 1500);
  if (firstTimeoutMs < 3000) {
    // 既に予算がほぼ無い → 呼ばずに clarify
    return buildProviderFailureClarify(theme, agreedConstraints);
  }
  let result;
  try {
    result = await runAI({
      taskType: "coalter_proposal",
      prompt,
      systemPrompt,
      jsonSchema: PROPOSAL_SCHEMA,
      requireJson: true,
      temperature: 0.7,
      maxOutputTokens: 1536,
      timeoutMs: firstTimeoutMs,
    });
  } catch {
    // 1回目から例外（両 provider 失敗等） → clarify フォールバック
    return buildProviderFailureClarify(theme, agreedConstraints);
  }

  const raw = result.structured as Record<string, unknown> | null;
  const firstCard = raw
    ? validateAndNormalize(raw, profileA, profileB, theme, options)
    : parseFallback(result.text, profileA, profileB, theme, options);

  // ── slotValidator による機械的 reject ──
  const themeRule = getThemeRule(theme);
  if (!themeRule) {
    // 5W1H 対象外テーマは検証しない（従来挙動）
    return firstCard;
  }

  const firstCheck = validateCandidates(
    firstCard.candidates,
    theme,
    agreedConstraints,
    theme === "movie" ? searchTitleSet : undefined,
    theme === "movie" ? movieCatalog : undefined,
  );

  // 目標: 3 候補（スワイプ UI 前提）。accepted が 3 件揃っており、かつ意味的に違うなら即確定。
  // accepted が 1-2 件 or 3 件でも類似 → retry を試みて改善する
  const firstDiversity =
    firstCheck.accepted.length >= 3
      ? validateCandidatesDiversity(firstCheck.accepted.slice(0, 3), theme)
      : { ok: true as const };

  if (firstCheck.accepted.length >= 3 && firstDiversity.ok) {
    return rebuildWithAccepted(firstCard, firstCheck.accepted.slice(0, 3), firstCheck.rejected);
  }

  // ── 1回だけ retry: reject 理由 + 類似警告を再プロンプトに乗せる ──
  const needMoreCandidates = firstCheck.accepted.length < 3;
  const tooSimilar = !firstDiversity.ok;
  const retryPrompt = buildRetryPrompt(
    prompt,
    firstCheck.rejected,
    agreedConstraints,
    needMoreCandidates ? firstCheck.accepted.length : undefined,
    tooSimilar,
  );

  // ── P0-5: 残り予算が薄い場合は retry をスキップ（絞り込みに倒す） ──
  const canRetry = remaining() >= RETRY_MIN_BUDGET_MS;

  let retryCard: ProposalCard | null = null;
  let retryHardFailed = false; // P0-4: retry も例外なら provider failure とみなす
  if (canRetry) {
    const retryTimeoutMs = Math.min(RETRY_LLM_TIMEOUT_MS, Math.max(4000, remaining() - 1000));
    try {
      const retryResult = await runAI({
        taskType: "coalter_proposal",
        prompt: retryPrompt,
        systemPrompt,
        jsonSchema: PROPOSAL_SCHEMA,
        requireJson: true,
        temperature: 0.6, // 少し下げて堅めに
        maxOutputTokens: 1536,
        timeoutMs: retryTimeoutMs,
      });
      const retryRaw = retryResult.structured as Record<string, unknown> | null;
      retryCard = retryRaw
        ? validateAndNormalize(retryRaw, profileA, profileB, theme, options)
        : parseFallback(retryResult.text, profileA, profileB, theme, options);
    } catch {
      retryCard = null;
      retryHardFailed = true;
    }
  }

  if (retryCard) {
    const retryCheck = validateCandidates(
      retryCard.candidates,
      theme,
      agreedConstraints,
      theme === "movie" ? searchTitleSet : undefined,
      theme === "movie" ? movieCatalog : undefined,
    );
    const retryDiversity =
      retryCheck.accepted.length >= 3
        ? validateCandidatesDiversity(retryCheck.accepted.slice(0, 3), theme)
        : { ok: true as const };

    // retry で 3件以上かつ多様性OK → 採用
    if (retryCheck.accepted.length >= 3 && retryDiversity.ok) {
      return rebuildWithAccepted(retryCard, retryCheck.accepted.slice(0, 3), retryCheck.rejected);
    }
    // 件数が増えた or 1回目が類似で retry が違うなら retry 優先
    if (retryCheck.accepted.length > firstCheck.accepted.length) {
      return rebuildWithAccepted(retryCard, retryCheck.accepted, retryCheck.rejected);
    }
    // 1回目が類似だった場合、retry が 3件（類似でも）揃っていれば retry を優先採用
    if (tooSimilar && retryCheck.accepted.length >= 3) {
      return rebuildWithAccepted(retryCard, retryCheck.accepted.slice(0, 3), retryCheck.rejected);
    }
  }

  // ── retry 後も accepted=0 → clarify ──
  if (firstCheck.accepted.length === 0) {
    // P0-4: retry が例外 + 1回目も 0 件 = provider 失敗。明示的に絞り込み要請
    if (retryHardFailed) {
      return buildProviderFailureClarify(theme, agreedConstraints);
    }
    return buildClarifyFallback(
      firstCard,
      theme,
      firstCheck.rejected,
      agreedConstraints,
    );
  }

  // 1回目の accepted が 1-2 件あれば、clarify ではなくその分で返す（UX 優先）
  // 3件揃いで類似の場合もそのまま採用（clarify にするほどではない）
  return rebuildWithAccepted(firstCard, firstCheck.accepted.slice(0, 3), firstCheck.rejected);
}

/**
 * P0-4: provider 失敗 / 検索結果ゼロ時のフォールバック。
 * 弱い 3 件を返さず、明示的に「絞り込み要請」だけを返す。
 */
function buildProviderFailureClarify(
  theme: ConversationTheme,
  agreedConstraints: AgreedConstraint[],
): ProposalCard {
  const themeLabel =
    theme === "movie" ? "映画"
      : theme === "food" ? "ご飯"
        : theme === "travel" ? "旅行"
          : "予定";

  return {
    summary: `${themeLabel}の候補を出すために、もう少し情報がほしい`,
    priorities: {
      userA: "まだ判断材料が少ない",
      userB: "まだ判断材料が少ない",
      common: null,
    },
    candidates: [
      {
        rank: 1,
        title: "もう少し絞らせて",
        oneLiner:
          theme === "movie"
            ? "見たいジャンル・気分や上映場所が分かると、実在する作品から候補を絞れるよ"
            : "希望のエリア・予算・時間帯が分かると、具体的な候補を出せそう",
        practicalInfo: null,
        url: null,
      },
    ],
    reasoning:
      "今ある情報だけだと、二人に合う具体候補を自信を持って出せない。曖昧な3案を出すより、もう少し条件を聞かせてほしい。",
    closing: "条件が見えたらまた呼んでね！",
    availableAxes: getAxesForTheme(theme),
    pairFitScore: undefined,
    theme,
    missingConstraints:
      theme === "movie"
        ? [
            { key: "genre", question: "見たいジャンルや気分は？", priority: 1, slot: "what" as SlotKey },
            { key: "area", question: "どの映画館エリアで探す？", priority: 2, slot: "where" as SlotKey },
            { key: "time_slot", question: "時間帯はだいたいいつごろ？", priority: 3, slot: "when" as SlotKey },
          ]
        : theme === "food"
          ? [
              { key: "area", question: "どのあたりで探す？", priority: 1, slot: "where" as SlotKey },
              { key: "budget", question: "予算の目安は？", priority: 2, slot: "how" as SlotKey },
              { key: "genre", question: "ジャンルの希望は？", priority: 3, slot: "what" as SlotKey },
            ]
          : [
              { key: "scope", question: "希望をもう少し聞かせて", priority: 1, slot: "what" as SlotKey },
            ],
    validation: {
      rejectedCount: 0,
      rejectReasons: [],
      fallbackToClarify: true,
      hardConstraintsCount: agreedConstraints.filter((c) => c.strength === "hard").length,
      providerFailure: true,
    },
  };
}

/**
 * 候補配列を accepted のみに置き換え、rejected を validation 用メタとして保持。
 */
function rebuildWithAccepted(
  card: ProposalCard,
  accepted: ProposalCandidate[],
  rejected: Array<{ candidate: ProposalCandidate; result: CandidateValidationResult }>,
): ProposalCard {
  return {
    ...card,
    candidates: accepted.map((c, i) => ({ ...c, rank: i + 1 })),
    validation: rejected.length > 0
      ? {
          rejectedCount: rejected.length,
          rejectReasons: [
            ...new Set(rejected.flatMap((r) => r.result.reasons)),
          ],
        }
      : undefined,
  };
}

/**
 * retry 用プロンプト: 元プロンプト + 明示的な reject 理由。
 */
function buildRetryPrompt(
  basePrompt: string,
  rejected: Array<{ candidate: ProposalCandidate; result: CandidateValidationResult }>,
  agreedConstraints: AgreedConstraint[],
  acceptedShortfallCount?: number,
  tooSimilar?: boolean,
): string {
  const rejectSection: string[] = [];
  rejectSection.push("");
  rejectSection.push("## 再提案リクエスト（前回の候補は以下の理由で却下された）");

  // 候補数不足の明示
  if (typeof acceptedShortfallCount === "number" && acceptedShortfallCount < 3) {
    rejectSection.push(
      `（前回 accepted: ${acceptedShortfallCount} 件 — 必ず **3 件** 出すこと。スワイプで選ぶ UI 前提）`,
    );
  }

  // 3案類似の警告
  if (tooSimilar) {
    rejectSection.push(
      "（前回 3 案が意味的にほぼ同じだった — 3 案は **価格帯・エリア・ジャンル・雰囲気** のうち最低 2 軸で明確に差をつけ、axisScores も候補間で違いを付けること）",
    );
  }

  for (const { candidate, result } of rejected) {
    const reasons = result.reasons.map((r) => reasonCodeToText(r)).join(" / ");
    rejectSection.push(`- 「${candidate.title}」: ${reasons}`);
    if (result.violatedConstraints.length > 0) {
      rejectSection.push(`  違反した合意: ${result.violatedConstraints.join(" / ")}`);
    }
  }

  rejectSection.push("");
  rejectSection.push("### 今回の修正方針");
  rejectSection.push("- 抽象的な候補（「駅周辺」「人気店」「映画鑑賞」等）は出さず、**具体的な固有名詞**で答える");
  rejectSection.push("- movie: what slot は必ず**作品名**（「PERFECT DAYS」「ラストマイル」等）。活動ラベル（「映画鑑賞」）は不可");
  rejectSection.push("- **movie: user prompt の ##上映情報カタログ に列挙された作品名 / 映画館名からのみ選ぶ。カタログに無い作品名を発明したら即不合格**");
  rejectSection.push("- **movie: showing は showtime を practicalInfo に1つ以上 / upcoming は「公開予定」と明示**");
  rejectSection.push("- food: where slot は**店舗固有名詞**（「俺のフレンチ新宿」「一蘭 新宿店」等）");
  rejectSection.push("- travel: where slot は**施設・地名固有名詞**（「大塚国際美術館」「祖谷渓」等）");
  rejectSection.push("- 会話で合意された除外・予算・ジャンル条件を必ず守る");
  rejectSection.push("- core slot（テーマの主軸）を必ず埋める");
  rejectSection.push("- **必ず 3 候補**。2個や1個では不合格");
  rejectSection.push("- **3 案は違う選択肢を示す**: 🥇バランス / 🥈Aの優先軸寄り / 🥉Bの優先軸寄り。または 安全 / 冒険 / 発見 の 3 方向");
  rejectSection.push("- **practicalInfo には数字を最低 3 つ**（評価・時刻・料金・徒歩分・所要時間のうち 3 項目以上）");

  // agreedConstraints を再掲
  const hardConstraints = agreedConstraints.filter((c) => c.strength === "hard");
  if (hardConstraints.length > 0) {
    rejectSection.push("");
    rejectSection.push("### 絶対に守る合意事項（hard constraint）");
    for (const c of hardConstraints) {
      rejectSection.push(`- [${c.kind}] ${c.sourceText} (normalized: ${c.normalizedValue})`);
    }
  }

  return basePrompt + "\n" + rejectSection.join("\n");
}

/**
 * 2回目も失敗した場合の clarify フォールバック。
 * missingConstraints を埋め、具体候補の代わりに「情報不足」を明示。
 */
function buildClarifyFallback(
  firstCard: ProposalCard,
  theme: ConversationTheme,
  rejected: Array<{ candidate: ProposalCandidate; result: CandidateValidationResult }>,
  agreedConstraints: AgreedConstraint[],
): ProposalCard {
  const allReasons = [...new Set(rejected.flatMap((r) => r.result.reasons))];

  // reason code → 質問 に変換
  const questionsByReason: Record<ValidationReasonCode, { key: string; question: string; slot?: SlotKey }> = {
    abstract_where: { key: "venue", question: "もう少し具体的な場所の希望は？（駅名・店名等）", slot: "where" },
    abstract_what: { key: "genre", question: "どんな内容のものがいい？（具体的なジャンルや作品名）", slot: "what" },
    missing_movie_title: { key: "movie_title", question: "気になる作品名はある？", slot: "what" },
    missing_venue_proper_noun: { key: "venue_name", question: "候補の店名・場所はある？", slot: "where" },
    missing_station_or_area: { key: "area", question: "どのあたりで探す？（駅やエリア）", slot: "where" },
    missing_budget_band: { key: "budget", question: "予算の目安は？", slot: "how" },
    violates_exclusion: { key: "exclusion_confirm", question: "避けたい条件があれば教えて", slot: "what" },
    violates_budget: { key: "budget_band", question: "予算の幅はどれくらい？", slot: "how" },
    violates_companions: { key: "companions", question: "誰と行く予定？", slot: "who" },
    violates_style: { key: "style", question: "ジャンルの希望をもう一度聞かせて", slot: "what" },
    missing_core_slot: { key: "core", question: "まず何を決めたい？", slot: theme === "food" ? "where" : theme === "travel" ? "where" : "what" },
    duplicate_candidate: { key: "dup", question: "前回と違う方向の候補が欲しい？", slot: "what" },
    empty_slots: { key: "any", question: "もう少し希望を教えてもらえる？", slot: "what" },
    candidates_too_similar: { key: "variety", question: "3案の軸（価格・エリア・ジャンル等）で何を重視する？", slot: "what" },
    thin_practical_info: { key: "details_ok", question: "評価・料金・時刻などの現実情報は重視する？", slot: "how" },
    // P0-2: 映画カタログ照合の reason code
    movie_title_not_in_catalog: { key: "movie_from_catalog", question: "検索で見つかった作品から選ばせて。気になるジャンル・雰囲気は？", slot: "what" },
    theater_not_in_catalog: { key: "theater_area", question: "どの映画館で見る？（エリアでもOK）", slot: "where" },
    movie_missing_showtime: { key: "showtime", question: "何時ごろの回を見たい？", slot: "when" },
    movie_upcoming_without_note: { key: "show_status", question: "公開中のみ？ 公開予定の作品も含める？", slot: "what" },
  };

  const newMissing = allReasons
    .map((r) => questionsByReason[r])
    .filter((v): v is NonNullable<typeof v> => !!v)
    .map((q, i) => ({ ...q, priority: i + 1 }));

  const clarifyCandidate: ProposalCandidate = {
    rank: 1,
    title: "もう少し教えて",
    oneLiner:
      "2人の希望に合う具体的な候補を出すために、いくつか教えてほしいことがあるよ",
    practicalInfo: null,
    url: null,
  };

  return {
    ...firstCard,
    candidates: [clarifyCandidate],
    missingConstraints:
      newMissing.length > 0
        ? newMissing.slice(0, 3)
        : firstCard.missingConstraints,
    validation: {
      rejectedCount: rejected.length,
      rejectReasons: allReasons,
      fallbackToClarify: true,
      hardConstraintsCount: agreedConstraints.filter((c) => c.strength === "hard").length,
    },
  };
}

// ─────────────────────────────────────────────
// バリデーション
// ─────────────────────────────────────────────

/** 禁止表現チェック */
const FORBIDDEN_PATTERNS = [
  /すべきです/,
  /しなければ/,
  /最適な選択は/,
  /正しい(選択|答え|判断)は/,
  /本当は.{0,10}思って/,        // 「本当は〜と思っている」
  /マッチング度|一致度|適合率/,    // 機械的数値
  /\d{2,3}%/,                   // パーセンテージ
  /タイプです|タイプだから/,       // 性格ラベル
];

function validateAndNormalize(
  raw: Record<string, unknown>,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  theme: ConversationTheme,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
): ProposalCard {
  const nameA = profileA.displayName ?? "A";
  const nameB = profileB.displayName ?? "B";

  // 候補数の制約: ちょうど 3 に寄せる（スワイプ UI 前提）
  // LLM が 2 個しか返さない場合は呼び出し側で retry 判定するが、
  // ここでは形を崩さないため切り詰めのみ行う。
  let candidates = (raw.candidates as Array<Record<string, unknown>>) || [];
  if (candidates.length > 3) candidates = candidates.slice(0, 3);
  if (candidates.length < 1) {
    candidates = [
      { rank: 1, title: "情報が足りないかも", oneLiner: "もう少し教えてくれると候補を出せそう", practicalInfo: null, url: null },
    ];
  }

  // テーマから availableAxes を固定（LLMの変動を許容しない）
  const availableAxes = getAxesForTheme(theme);

  // pairFitScore のパース
  const rawPairFit = raw.pairFitScore;
  const pairFitScore = parsePairFitScore(rawPairFit);

  // reasoning: pendingDeltas があれば先頭にテンプレを差し込む
  const rawReasoning = sanitize(String(raw.reasoning || ""), nameA, nameB);
  const reasoning = prependDeltaTemplate(rawReasoning, options?.pendingDeltas);

  // Phase 1.5.4: テーマが 5W1H 対象なら、candidate.slots を正規化し title を合成で上書き
  const themeRule = getThemeRule(theme);

  const card: ProposalCard = {
    summary: sanitize(String(raw.summary || ""), nameA, nameB),
    priorities: {
      userA: sanitize(String((raw.priorities as Record<string, unknown>)?.userA || ""), nameA, nameB),
      userB: sanitize(String((raw.priorities as Record<string, unknown>)?.userB || ""), nameA, nameB),
      common: (raw.priorities as Record<string, unknown>)?.common
        ? sanitize(String((raw.priorities as Record<string, unknown>).common), nameA, nameB)
        : null,
    },
    candidates: candidates.map((c, i): ProposalCandidate => {
      const slots = normalizeSlotBundle(c.slots);
      const hasSlots = Object.keys(slots).length > 0;

      // title 合成: テーマルールがあり、かつ coreSlot が埋まっているなら合成を優先
      let title: string;
      if (themeRule) {
        const composed = tryComposeTitle(theme, slots);
        if (composed) {
          title = composed; // LLM の自由 title を捨てて合成版を採用
        } else {
          // 合成失敗 → LLM 元 title（無ければプレースホルダ）を使う
          title = String(c.title || `候補${i + 1}`);
        }
      } else {
        // 5W1H 対象外テーマ → 従来挙動
        title = String(c.title || `候補${i + 1}`);
      }

      return {
        rank: i + 1,
        title,
        oneLiner: String(c.oneLiner || ""),
        practicalInfo: c.practicalInfo ? String(c.practicalInfo) : null,
        url: c.url ? String(c.url) : null,
        axisScores: parseAxisScores(c.axisScores, availableAxes),
        // Phase 1.5.4
        slots: hasSlots ? slots : undefined,
        theme: hasSlots && themeRule ? theme : undefined,
        coreSlot: hasSlots && themeRule ? themeRule.core : undefined,
      };
    }),
    reasoning,
    closing: String(raw.closing || "あとは二人で決めてね！"),
    missingConstraints: parseMissingConstraints(raw.missingConstraints),
    availableAxes,
    pairFitScore,
    // Phase 1.5.4: カード全体のテーマ
    theme,
  };

  return card;
}

/** axisScores を 0-3 にクランプし、availableAxes のみ残す */
function parseAxisScores(
  raw: unknown,
  availableAxes: AxisKey[],
): AxisScores | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const result: AxisScores = {};
  for (const key of availableAxes) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const clamped = Math.max(0, Math.min(3, Math.round(v))) as 0 | 1 | 2 | 3;
      result[key] = clamped;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** pairFitScore を 0-3 にクランプ */
function parsePairFitScore(raw: unknown): 0 | 1 | 2 | 3 | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(0, Math.min(3, Math.round(raw))) as 0 | 1 | 2 | 3;
}

/** pendingDeltas があれば reasoning の先頭に固定テンプレを差し込む */
function prependDeltaTemplate(
  reasoning: string,
  pendingDeltas?: PendingAxisDeltas,
): string {
  if (!pendingDeltas) return reasoning;
  const deltasRecord: Record<string, number> = {};
  for (const [k, v] of Object.entries(pendingDeltas)) {
    if (v === 1 || v === -1) deltasRecord[k] = v;
  }
  if (Object.keys(deltasRecord).length === 0) return reasoning;
  const template = deltasToTemplate(deltasRecord);
  if (!template) return reasoning;
  return reasoning.length > 0 ? `${template} ${reasoning}` : template;
}

/** missingConstraintsをパースし、優先度順にソート */
function parseMissingConstraints(
  raw: unknown,
): ProposalCard["missingConstraints"] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && "key" in item && "question" in item,
    )
    .map((item) => {
      // Phase 1.5.4: slot フィールドが有効な SlotKey なら採用
      const slotRaw = item.slot;
      const slot: SlotKey | undefined = isSlotKey(slotRaw) ? slotRaw : undefined;
      return {
        key: String(item.key || "unknown"),
        question: String(item.question || ""),
        priority: typeof item.priority === "number" ? item.priority : 99,
        ...(slot ? { slot } : {}),
      };
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3); // 最大3つ
}

/** 禁止表現を除去し、名前を置換 */
function sanitize(text: string, nameA: string, nameB: string): string {
  let result = text;

  // 禁止表現をソフトに置換
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(result)) {
      // 強い表現をソフトに
      result = result
        .replace(/すべきです/g, "が良さそう")
        .replace(/しなければ/g, "した方が良さそう")
        .replace(/最適な選択は/g, "合いそうなのは")
        .replace(/正しい(選択|答え|判断)は/g, "良さそうなのは");
    }
  }

  // ユーザーA/B → 実名に置換
  result = result.replace(/ユーザーA|Aさん/g, nameA);
  result = result.replace(/ユーザーB|Bさん/g, nameB);

  return result;
}

/** テスト用に validateAndNormalize を内部 export */
export const __internal = { validateAndNormalize };

/** テキストからJSONを抽出するフォールバック */
function parseFallback(
  text: string,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
  theme: ConversationTheme,
  options?: {
    pendingDeltas?: PendingAxisDeltas;
    avoidKeys?: string[];
  },
): ProposalCard {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndNormalize(parsed, profileA, profileB, theme, options);
    }
  } catch {
    // パース失敗
  }

  // 完全フォールバック
  return {
    summary: "会話を見てみたけど、もう少し情報があると良い候補を出せそう",
    priorities: {
      userA: "まだはっきりしていない",
      userB: "まだはっきりしていない",
      common: null,
    },
    candidates: [
      {
        rank: 1,
        title: "もう少し教えて",
        oneLiner: "いつ、どこで、どんな気分かを教えてくれると候補を出せるよ",
        practicalInfo: null,
        url: null,
      },
    ],
    reasoning: "まだ情報が足りないので、もう少し話してみてね",
    closing: "二人で話してみて、また呼んでね！",
    availableAxes: getAxesForTheme(theme),
    theme,
  };
}
