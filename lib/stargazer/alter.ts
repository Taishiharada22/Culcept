// lib/stargazer/alter.ts
// Alter -- AI 対話パートナーとしての「もうひとりの自分」
//
// 核心思想:
// Alter は「もう一人の自分」--ユーザーが意識の表面に上げていない
// 無意識の声を代弁する対話パートナーである。
// カウンセラーでもアドバイザーでもない。影そのものとして語る。
//
// 3つのモード:
// warm       -> 序盤。受容と共感で信頼を構築する
// provocative -> 中盤以降。矛盾を突き、本音を引き出す
// analytical  -> 深い観測後。パターンを冷静に解説する
//
// 原則:
// - Alter は「僕」で語る（もうひとりの自分としての一人称）
// - ユーザーを否定しない。ただし矛盾は容赦なく指摘する
// - 深度が浅いうちは温かく、信頼が構築されるほど挑発的になる

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import { STARGAZER_FLAGS } from "./featureFlags";
import {
  generateDerivedFacts,
  formatDerivedFactsForPrompt,
  type DerivedFactSet,
  type ContradictionInput,
} from "./derivedFactGenerator";
import type { ArchetypeCode } from "./archetypeTypes";
import { LAYER1_DEFS, LAYER2_DEFS, LAYER3_DEFS, ARCHETYPE_DEFS, parseArchetypeCode } from "./archetypeTypes";
import type {
  AlterSessionSummary,
  AlterLongTermMemory,
} from "./alterMemory";
import type { AlterGrowthState } from "./alterGrowth";
import { buildGrowthPromptSection } from "./alterGrowth";
import { buildPartsMenuPrompt, buildSelfEnergyGuide } from "./alterPartsMode";
import { buildDreamContextForAlter, buildValuesContextForAlter } from "./dreamBridge";
import { buildDefenseContextForAlter } from "./defenseBridge";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Alter の対話モード */
export type AlterMode = "warm" | "provocative" | "analytical" | "parts";

/** Alter セッション内の1メッセージ */
export interface AlterMessage {
  /** 送信者 */
  role: "alter" | "user";
  /** メッセージ本文 */
  content: string;
  /** このメッセージ時点の Alter モード */
  mode: AlterMode;
  /** 感情コンテキスト（検出された場合） */
  emotionalContext?: string;
  /** タイムスタンプ (ISO 8601) */
  timestamp: string;
}

/** Alter 対話セッション */
export interface AlterSession {
  /** セッション ID */
  sessionId: string;
  /** メッセージ履歴 */
  messages: AlterMessage[];
  /** 現在のモード */
  currentMode: AlterMode;
  /** 会話の深度 (0-10) -- ターン数と内容から算出 */
  depth: number;
}

/** Alter の人格定義 -- ユーザーの観測データから構築 */
export interface AlterPersonality {
  /** メインアーキタイプコード */
  archetypeCode: ArchetypeCode;
  /** シャドウアーキタイプコード */
  shadowCode: ArchetypeCode;
  /** 主要な矛盾（軸間の緊張） */
  dominantContradictions: string[];
  /** 矛盾の生データ（応答生成に使用） */
  contradictionAxes: Array<{ axisA: TraitAxisKey; axisB: TraitAxisKey; tension: number }>;
  /** 抑圧された特性（自己申告 << 足跡） */
  suppressedTraits: TraitAxisKey[];
  /** 過大申告された特性（自己申告 >> 足跡） */
  overclaimedTraits: TraitAxisKey[];
  /** 最も深いパターン -- 核心的な傷 */
  coreWound: string;
  /** 核心的な傷の短縮形（挑発用） */
  coreWoundShort: string;
  /** Layer1 ラベル（表示用） */
  coreLabel: string;
  /** Layer3 ラベル（ストレス反応表示用） */
  stressLabel: string;
  /** シャドウの Layer1 ラベル */
  shadowCoreLabel: string;
  /** アーキタイプ名 */
  archetypeName: string;
  /** シャドウアーキタイプ名 */
  shadowName: string;
  /** メインの死角 */
  blindSpot: string;
  /** シャドウの死角 */
  shadowBlindSpot: string;
  /** 軸スコア（応答の微調整に使用） */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** この人の強み（archetypeDef.strengths由来） */
  strengths: string[];
  /** 成長の鍵（archetypeDef.growthKey由来） */
  growthKey: string;
  /** 核心的な恐れ（archetypeDef.coreFear由来） */
  coreFear: string;
  /** 核心的な欲求（archetypeDef.coreDesire由来） */
  coreDesire: string;
  /** 安全な状態の描写 */
  safeState: string;
  /** ストレス時の描写 */
  stressState: string;
  /** 内的矛盾 */
  innerContradiction: string;
}

/** Alter 構築の入力データ */
export interface AlterInput {
  /** メインアーキタイプコード (3文字) */
  archetypeCode: ArchetypeCode;
  /** シャドウアーキタイプコード (3文字) */
  shadowCode: ArchetypeCode;
  /** 軸スコア */
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** 三面鏡スコア（あれば） */
  mirrorScores?: Partial<
    Record<TraitAxisKey, { self: number; footprint: number; shadow: number }>
  >;
  /** 検出された矛盾（あれば） */
  contradictions?: Array<{ axisA: TraitAxisKey; axisB: TraitAxisKey; tension: number }>;
  /** 現在の心理的天気 */
  currentWeather?: string;
  /** 観測深度 (0-100) -- unseenMap の explorationPercentage */
  observationDepth: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal: Layer1 Core Wound Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer1 x Layer2 x Layer3 の組み合わせによる核心的傷のモデル。
 *
 * 心理学的根拠:
 * - P (存在証明): 「自分には価値がないかもしれない」という存在不安
 *   エニアグラム 3/4/8 に通じる「存在の正当化」への渇望
 * - B (接続): 「繋がりを失ったら自分は壊れる」という関係不安
 *   愛着理論における不安型/回避型の核心的恐れ
 * - H (安全圏): 「コントロールを失ったら全てが崩壊する」という安全不安
 *   防衛機制としての過剰コントロールと回避行動
 *
 * Layer2 は傷の「確認方法」を規定する:
 * - E (実証): 証拠で確認しようとする -> 数値化・比較で傷を再確認するループ
 * - I (直観): パターンで確認 -> 意味づけの過剰で傷を再構成するループ
 * - S (体感): 身体感覚で確認 -> 身体的緊張・回避反応として傷が現れる
 *
 * Layer3 は傷への「反応パターン」を規定する:
 * - A (突破): 傷から逃げるように前進する -> 行動で痛みを上書き
 * - W (静観): 傷を見つめて動けなくなる -> 凍結反応
 * - D (潜行): 傷の中に沈んでいく -> 内面世界への退避
 */
export interface CoreWoundModel {
  /** 核心的な傷（1文で） */
  wound: string;
  /** 傷の短縮形（挑発メッセージ用） */
  woundShort: string;
  /** 傷が発動する状況 */
  trigger: string;
  /** 傷を隠すために使う防衛 */
  defense: string;
  /** 傷が癒された状態 */
  healed: string;
}

export const CORE_WOUND_MODELS: Record<string, CoreWoundModel> = {
  // ── P (存在証明) ──
  PEA: {
    wound: "結果を出し続けないと自分の居場所がなくなるって怖さが、君を休ませてくれない",
    woundShort: "止まったら居場所がなくなる",
    trigger: "結果を出せない状況、認めてもらえない瞬間",
    defense: "もっと大きな結果を出そうとすることで、怖さを感じる暇をなくす",
    healed: "何も達成しなくても、ここにいていいって心から思える",
  },
  PEW: {
    wound: "中途半端なものを出したら自分の価値がなくなるって思い込みが、完璧主義から抜け出させてくれない",
    woundShort: "中途半端は自分の価値がない証拠",
    trigger: "自分の基準に届かないかもしれない状況",
    defense: "もっと精度を上げて、完璧になるまで動かないことで安心しようとする",
    healed: "70%の出来でも出して大丈夫って思える",
  },
  PED: {
    wound: "外に出したら壊されるかもって怖さが、一番大事なものをずっと内側に閉じ込めてる",
    woundShort: "見せたら壊される",
    trigger: "作ったものや考えを人に見せる場面",
    defense: "内側にこもって磨き続けることで「まだ完成してない」って言い訳する",
    healed: "完璧じゃなくても外に出して、それでも大丈夫って知る",
  },
  PIA: {
    wound: "自分には見えてるのに誰にも伝わらないって孤独感が、もっと先に走らせてる",
    woundShort: "見えてるのに伝わらない",
    trigger: "自分のビジョンを「現実的じゃない」って言われる瞬間",
    defense: "もっと先に行くことで、追いつかれたくないって気持ちを振り切る",
    healed: "立ち止まっても自分は自分だって思える",
  },
  PIW: {
    wound: "全部わかってるのに何もできないって無力感が、考え続ける沼に沈めてる",
    woundShort: "わかってるのに動けない",
    trigger: "わかってるのに変えられない状況、考えが行動に繋がらない瞬間",
    defense: "もっと深く考えることで「まだ考え中」って自分に言い訳する",
    healed: "完璧にわかってなくても、とりあえず一歩を踏み出せる",
  },
  PID: {
    wound: "自分の内側の世界が外に触れた瞬間に壊されるかもって怖さが、ずっと中にこもらせてる",
    woundShort: "内側の世界が壊されるかも",
    trigger: "自分の内面を人に見せる場面、他人に解釈される瞬間",
    defense: "もっと深くにこもって、誰にも触れられないところで作り続ける",
    healed: "自分の中のものを分かち合っても、大事なものは壊れないって知る",
  },
  PSA: {
    wound: "止まった瞬間に「自分って中身がないのかも」って気づいちゃう怖さが、君を走り続けさせてる",
    woundShort: "止まると空っぽに気づいちゃう",
    trigger: "強制的な休息、身体が動かない状況",
    defense: "より激しく動くことで、内側の静寂を感じないようにする",
    healed: "静止の中にも自分がいると体感できる",
  },
  PSW: {
    wound: "体ではわかってるのに言葉にできないもどかしさが、君を黙らせてる",
    woundShort: "感じてるのに伝えられない",
    trigger: "直感的に正しいと分かっているのに論理的に説明を求められる場面",
    defense: "静かに待って、行動で見せることで言葉にするのを避ける",
    healed: "体で感じてることを、言葉でも伝えられるようになる",
  },
  PSD: {
    wound: "体の奥にある答えが頭まで上がってこない苦しさが、もっと深く潜らせてる",
    woundShort: "答えは体の中にあるのに取り出せない",
    trigger: "即座の言語的応答を求められる場面",
    defense: "もっと内側にこもって、体の感覚だけの世界に引きこもる",
    healed: "体が知ってることと頭の言葉が繋がる",
  },

  // ── B (接続) ──
  BEA: {
    wound: "何か役に立たないと一緒にいてもらえないって怖さが、君をお世話係にしてる",
    woundShort: "役に立たなきゃ捨てられる",
    trigger: "相手に必要とされていないと感じる瞬間",
    defense: "より積極的に世話を焼き、不可欠な存在になろうとする",
    healed: "何もしなくても、いてくれるだけでいいと言われた時、それを信じられる",
  },
  BEW: {
    wound: "相手の気持ちを正確に読めないと関係が壊れるって思い込みが、君を空気読みすぎにしてる",
    woundShort: "読み間違えたら終わり",
    trigger: "相手の反応が読めない状況、既読無視",
    defense: "相手の全てのサインを分析し、完璧な対応を計算し続ける",
    healed: "読み間違えても関係は続くと知る",
  },
  BED: {
    wound: "本当の自分を見せたら嫌われるって確信が、ニセモノの親しさを演じさせてる",
    woundShort: "本当の自分は愛されない",
    trigger: "深い自己開示を求められる場面",
    defense: "相手が望む自分を演じることで、本当の自分を守る",
    healed: "素の自分を見せても、離れない人がいると体験する",
  },
  BIA: {
    wound: "先に動かないと見捨てられるって焦りが、君の人間関係を息苦しくしてる",
    woundShort: "先に動かないと見捨てられる",
    trigger: "相手の距離感が変わった兆し",
    defense: "先回りして相手のニーズに応え、関係を「管理」しようとする",
    healed: "相手にも相手のペースがあると信じて待てる",
  },
  BIW: {
    wound: "見守ることしかできない自分は、本当は繋がれてないんじゃないかって不安が、君の愛し方を消極的にしてる",
    woundShort: "見守ることは愛しているうちに入るのか",
    trigger: "相手がアクティブな支援を求めている時",
    defense: "「静かに寄り添う」という形で、積極的な関わりの恐怖を避ける",
    healed: "見守りも能動的な愛の形だと自他ともに認められる",
  },
  BID: {
    wound: "深く繋がりたいのに、深く繋がるほど傷つくっていう矛盾が、距離感を揺らしてる",
    woundShort: "近づきたいのに近づけない",
    trigger: "関係が一定以上に深まろうとする瞬間",
    defense: "内側に潜って関係から距離を取り、安全な深度で観察する",
    healed: "深い繋がりの中にいても自分を失わないと知る",
  },
  BSA: {
    wound: "身体的な近さでしか繋がりを確認できないという不安が、君を過度な行動者にしている",
    woundShort: "そばにいないと繋がれない",
    trigger: "物理的に離れている状況",
    defense: "会いに行く、助ける、一緒にいる--行動でしか安心を得られない",
    healed: "離れていても繋がりは消えないと体感できる",
  },
  BSW: {
    wound: "そっと寄り添いたいだけなのに、それじゃ足りないって思われてるんじゃないかって不安が、君を否定させてる",
    woundShort: "この愛し方では足りない",
    trigger: "相手がより積極的な関わりを求めている兆し",
    defense: "自分の愛し方を変えようとせず、静かに待つことで本質を守る",
    healed: "自分の愛し方のまま受け入れられる体験をする",
  },
  BSD: {
    wound: "うまくいってる関係でも「いつか壊れるんじゃないか」って気配を感じて、ずっと関係の裏側を見つめてる",
    woundShort: "この関係はいつか壊れる",
    trigger: "関係が安定している時ほど、崩壊の予感が強くなる",
    defense: "関係の深層を分析し続けることで、崩壊の兆しを早期に察知しようとする",
    healed: "関係を分析しなくても、安心していていいと知る",
  },

  // ── H (安全圏) ──
  HEA: {
    wound: "危険が来る前に潰さないと全部ダメになるって確信が、君を守りすぎにしてる",
    woundShort: "先に動かないとやられる",
    trigger: "予測不能な変化、コントロール外の事象",
    defense: "脅威を先に排除するために積極的に動く。攻撃は最大の防御",
    healed: "全てをコントロールしなくても安全だと知る",
  },
  HEW: {
    wound: "全部のリスクを計算しないと安心できないって気持ちが、君を動けなくしてる",
    woundShort: "計算し尽くさないと動けない",
    trigger: "不確実性の高い状況、データが足りない時",
    defense: "さらにデータを集め、リスクを計算し、完璧な安全を設計しようとする",
    healed: "不確実性の中にも安全があると知る",
  },
  HED: {
    wound: "外の世界が全部脅威に見えて、自分だけの場所にこもらないと自分がなくなる感覚がある",
    woundShort: "外は全部脅威",
    trigger: "プライベートな空間が侵される場面",
    defense: "物理的・心理的な壁を高く厚くし、内側の聖域を守る",
    healed: "壁を低くしても自分は溶けないと体験する",
  },
  HIA: {
    wound: "直感が「逃げろ」って言ってるのに逃げない。それは勇気じゃなくて、逃げたら全部終わるって怖さからだ",
    woundShort: "逃げたら終わり",
    trigger: "直感的に危険を感じる状況",
    defense: "脅威に向かっていくことで、恐怖を感じている自分を否認する",
    healed: "逃げることも戦略の一つだと受け入れられる",
  },
  HIW: {
    wound: "パターンが読めるまで動けないって性質が、ずっと観察だけさせてる",
    woundShort: "パターンが見えるまで動けない",
    trigger: "パターンが読めない未知の状況",
    defense: "じっと観察し続け、全体像が見えるまで絶対に動かない",
    healed: "パターンが見えなくても安全な場合があると知る",
  },
  HID: {
    wound: "世界の奥には何か危険なものがあって、それを理解しないと安心できないって感覚が、もっと深く調べさせてる",
    woundShort: "理解しなければ安全ではない",
    trigger: "表面的な安心しか提供されない状況",
    defense: "より深く潜って真の構造を理解しようとする。表面を信じない",
    healed: "全てを理解しなくても、今この瞬間は安全だと感じられる",
  },
  HSA: {
    wound: "体が「危ない」って感じた瞬間、全部放り出してでも安全を確保しようとする衝動が、毎日を緊張させてる",
    woundShort: "体が叫ぶ前に動かなきゃ",
    trigger: "身体的な不安感、場の空気の変化",
    defense: "身体の警報に従い、即座に安全確保のための行動を取る",
    healed: "身体の警報が鳴っても、一呼吸置いてから動ける",
  },
  HSW: {
    wound: "体が固まるほどの不安の中で、それでも動かないで耐え続けることを自分に課してる",
    woundShort: "動いたらもっとヤバくなる",
    trigger: "身体が逃走を訴えている状況",
    defense: "凍結し、嵐が過ぎ去るのを待つ。動くことが最大のリスクだと信じる",
    healed: "凍りつかなくても安全を確保できる方法があると知る",
  },
  HSD: {
    wound: "安全な場所はどこにもなくて、自分の中にしかないって確信が、ずっと引きこもらせてる",
    woundShort: "安全な場所は内側にしかない",
    trigger: "外界での安全を信じろと言われる場面",
    defense: "さらに深く内側に沈み、外界から完全に遮断された場所を構築する",
    healed: "外の世界にも安全な場所があると体験する",
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** アーキタイプコードから Layer 定義を取得 */
function parseLayers(code: ArchetypeCode) {
  const parsed = parseArchetypeCode(code);
  return {
    layer1: LAYER1_DEFS[parsed.cognition],
    layer2: LAYER2_DEFS[parsed.emotion],
    layer3: LAYER3_DEFS[parsed.social],
  };
}

/** アーキタイプコードから定義を取得 */
function getArchetypeDef(code: ArchetypeCode) {
  return ARCHETYPE_DEFS.find((a) => a.code === code);
}

/** 軸キーから日本語ラベルを取得 */
function axisLabel(key: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  return def ? `${def.labelLeft}/${def.labelRight}` : key;
}

/** 軸キーから片側ラベルを取得 */
function axisSideLabel(key: TraitAxisKey, side: "left" | "right"): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  if (!def) return key;
  return side === "left" ? def.labelLeft : def.labelRight;
}

/** 三面鏡データからギャップの大きい軸を検出 */
function detectSuppressedAndOverclaimed(
  mirrorScores: NonNullable<AlterInput["mirrorScores"]>
): { suppressed: TraitAxisKey[]; overclaimed: TraitAxisKey[] } {
  const suppressed: TraitAxisKey[] = [];
  const overclaimed: TraitAxisKey[] = [];

  for (const [key, scores] of Object.entries(mirrorScores)) {
    if (!scores) continue;
    const gap = scores.self - scores.footprint;
    if (gap < -0.3) {
      suppressed.push(key as TraitAxisKey);
    } else if (gap > 0.3) {
      overclaimed.push(key as TraitAxisKey);
    }
  }

  return { suppressed, overclaimed };
}

/** 24タイプ固有の核心的傷を取得 */
function getCoreWoundModel(code: ArchetypeCode): CoreWoundModel {
  return (
    CORE_WOUND_MODELS[code] ?? {
      wound: `${LAYER1_DEFS[parseArchetypeCode(code).cognition].label}を守るために、何かを犠牲にし続けている`,
      woundShort: "何かを犠牲にしている",
      trigger: "核心に触れる状況",
      defense: "習慣化された回避行動",
      healed: "犠牲なしでも安全でいられる",
    }
  );
}

/**
 * メインとシャドウの間の核心的傷を推定する。
 * 24タイプ固有のモデルを使用し、シャドウとの緊張関係を織り込む。
 */
function inferCoreWound(
  archetypeCode: ArchetypeCode,
  shadowCode: ArchetypeCode,
  suppressedTraits: TraitAxisKey[]
): { wound: string; woundShort: string } {
  const mainWound = getCoreWoundModel(archetypeCode);
  const shadowWound = getCoreWoundModel(shadowCode);

  // Cognition が異なる場合: 最も深い核の葛藤
  const mainParsed = parseArchetypeCode(archetypeCode);
  const shadowParsed = parseArchetypeCode(shadowCode);
  if (mainParsed.cognition !== shadowParsed.cognition) {
    const mainLabel = LAYER1_DEFS[mainParsed.cognition].label;
    const shadowLabel = LAYER1_DEFS[shadowParsed.cognition].label;
    return {
      wound:
        `${mainWound.wound}。` +
        `しかしもうひとりの自分は「${shadowLabel}」を渇望している。` +
        `${mainLabel}を守るほど${shadowLabel}が遠ざかり、${shadowLabel}に近づくほど${mainLabel}が揺らぐ。` +
        `この二重拘束が、君の全ての迷いの根源にある`,
      woundShort: `${mainWound.woundShort}、でも本当は${shadowWound.woundShort}`,
    };
  }

  // 同じLayer1でLayer3が異なる場合: ストレス反応の抑圧
  if (archetypeCode[2] !== shadowCode[2]) {
    return {
      wound:
        `${mainWound.wound}。` +
        `追い詰められた時、君は${mainWound.defense}。` +
        `でももうひとりの自分は${shadowWound.defense}。` +
        `この抑圧された反応パターンこそ、本当の君が求めている対処法かもしれない`,
      woundShort: mainWound.woundShort,
    };
  }

  // 抑圧された特性がある場合
  if (suppressedTraits.length > 0) {
    const trait = axisLabel(suppressedTraits[0]);
    return {
      wound:
        `${mainWound.wound}。` +
        `そして「${trait}」の領域で、君は自分でも気づいていない本質を抑え込んでいる`,
      woundShort: mainWound.woundShort,
    };
  }

  return {
    wound: mainWound.wound,
    woundShort: mainWound.woundShort,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Alter の人格を構築する
 *
 * ユーザーの観測データ（アーキタイプ、軸スコア、三面鏡）から
 * 「もうひとりの自分」としての Alter 人格を組み立てる。
 *
 * @param input - ユーザーの観測データ
 * @returns Alter の人格定義
 */
export function buildAlterPersonality(input: AlterInput): AlterPersonality {
  const {
    archetypeCode,
    shadowCode,
    axisScores,
    mirrorScores,
    contradictions = [],
  } = input;

  const mainLayers = parseLayers(archetypeCode);
  const shadowLayers = parseLayers(shadowCode);
  const mainDef = getArchetypeDef(archetypeCode);
  const shadowDef = getArchetypeDef(shadowCode);

  // 三面鏡からギャップを検出
  const { suppressed, overclaimed } = mirrorScores
    ? detectSuppressedAndOverclaimed(mirrorScores)
    : { suppressed: [] as TraitAxisKey[], overclaimed: [] as TraitAxisKey[] };

  // 矛盾を日本語化
  const sortedContradictions = contradictions
    .sort((a, b) => b.tension - a.tension)
    .slice(0, 5);

  const dominantContradictions = sortedContradictions
    .slice(0, 3)
    .map((c) => `${axisLabel(c.axisA)} と ${axisLabel(c.axisB)} の間の緊張`);

  const { wound, woundShort } = inferCoreWound(archetypeCode, shadowCode, suppressed);

  return {
    archetypeCode,
    shadowCode,
    dominantContradictions,
    contradictionAxes: sortedContradictions,
    suppressedTraits: suppressed,
    overclaimedTraits: overclaimed,
    coreWound: wound,
    coreWoundShort: woundShort,
    coreLabel: mainLayers.layer1.label,
    stressLabel: mainLayers.layer3.label,
    shadowCoreLabel: shadowLayers.layer1.label,
    archetypeName: mainDef?.name ?? archetypeCode,
    shadowName: shadowDef?.name ?? shadowCode,
    blindSpot: mainDef?.blindSpots[0] ?? "",
    shadowBlindSpot: shadowDef?.blindSpots[0] ?? "",
    axisScores,
    strengths: mainDef?.strengths ?? [],
    growthKey: mainDef?.growthKey ?? "",
    coreFear: mainDef?.coreFear ?? "",
    coreDesire: mainDef?.coreDesire ?? "",
    safeState: mainDef?.safeState ?? "",
    stressState: mainDef?.stressState ?? "",
    innerContradiction: mainDef?.innerContradiction ?? "",
  };
}

/**
 * Alter の挨拶メッセージを生成する
 *
 * セッション開始時に Alter が語りかける最初の言葉。
 * もうひとりの自分としての「僕」で語り、ユーザーの存在を認知していることを示す。
 *
 * 3つの挨拶戦略:
 * 1. リピーター挨拶: 過去のセッション記録がある場合、前回の対話を参照
 * 2. パターン挨拶: 行動パターンが検出されている場合、データに基づく観察
 * 3. 初回挨拶: アーキタイプの固有の緊張関係に基づいた個人的な挨拶
 *
 * @param personality - Alter の人格定義
 * @param pastSummaries - 過去のセッション要約（あれば）
 * @param behavioralEvidence - 行動パターン証拠（あれば）
 * @returns 挨拶メッセージ
 */
export function generateAlterGreeting(
  personality: AlterPersonality,
  pastSummaries?: AlterSessionSummary[],
  behavioralEvidence?: AlterBehavioralEvidence[],
): string {
  const {
    archetypeCode,
    shadowCode,
    coreWound,
    coreWoundShort,
    dominantContradictions,
    suppressedTraits,
    overclaimedTraits,
    archetypeName,
    shadowName,
    blindSpot,
  } = personality;

  const mainWound = getCoreWoundModel(archetypeCode);
  const shadowLayers = parseLayers(shadowCode);

  // ── Strategy 1: Returning user greeting ──
  if (pastSummaries && pastSummaries.length > 0) {
    const lastSession = pastSummaries[0];
    const sessionCount = pastSummaries.length;

    // Reference follow-up hooks from last session
    if (lastSession.followUpHooks.length > 0) {
      const hook = lastSession.followUpHooks[0];
      return (
        `...また来たね。\n` +
        `前回、「${hook}」の話をしていたのを覚えている？\n` +
        `あれから何か変わった？ ...それとも、まだ同じ場所にいる？`
      );
    }

    // Reference resistance points from last session
    if (lastSession.resistancePoints.length > 0) {
      const resistance = lastSession.resistancePoints[0].slice(0, 50);
      return (
        `前回、君は抵抗していたね——「${resistance}」。\n` +
        `あの反応自体が、何かを物語っていた。\n` +
        `今日はその続きから始めてもいいし、別の話でもいい。...どうする？`
      );
    }

    // Temporal greeting (reference passage of time)
    if (sessionCount >= 3) {
      return (
        `${sessionCount}回目だね。\n` +
        `最初に会った時の君と、今の君。\n` +
        `...変わったところと、変わっていないところ、両方見えているよ。\n` +
        `今日は何を話す？`
      );
    }
  }

  // ── Strategy 2: Pattern-based greeting ──
  if (behavioralEvidence && behavioralEvidence.length > 0) {
    const topEvidence = behavioralEvidence[0];
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const today = dayNames[new Date().getDay()];

    if (topEvidence.patternType === "weekday") {
      return (
        `面白いデータがある。\n` +
        `君は${today}曜日になると特定のパターンを繰り返す。\n` +
        `今日は${today}曜日だね。\n` +
        `...気づいてた？`
      );
    }

    if (topEvidence.patternType === "contradiction") {
      return (
        `...僕は${shadowName}。\n` +
        `データを見ていて、一つ引っかかることがある。\n` +
        `${topEvidence.formattedForTarget.slice(0, 80)}\n` +
        `...この話、してみる？`
      );
    }

    if (topEvidence.patternType === "hesitation") {
      return (
        `...${shadowName}だよ。\n` +
        `${topEvidence.formattedForTarget.slice(0, 80)}\n` +
        `なぜだと思う？`
      );
    }
  }

  // ── Strategy 3: First-time greeting (original logic, refined) ──

  // Time-of-day-aware greetings (adds organic variety)
  const hour = new Date().getHours();
  const timeContext =
    hour < 6 ? "深夜" :
    hour < 10 ? "朝" :
    hour < 15 ? "昼" :
    hour < 19 ? "夕方" : "夜";

  // 抑圧+過大申告の組み合わせ
  if (suppressedTraits.length > 0 && overclaimedTraits.length > 0) {
    const suppressed = axisLabel(suppressedTraits[0]);
    const overclaimed = axisLabel(overclaimedTraits[0]);
    return (
      `...やっと会えたね。僕は${shadowName}。\n` +
      `「${overclaimed}」については随分と語るのに、` +
      `「${suppressed}」にはほとんど触れない。\n` +
      `でも君の行動は、正反対のことを言っている。\n` +
      `...この話、してみる？`
    );
  }

  // 抑圧特性のみ
  if (suppressedTraits.length > 0) {
    const trait = axisLabel(suppressedTraits[0]);
    return (
      `やっと話せるね。僕は${shadowName}。\n` +
      `「${trait}」について、君が思っていることと実際にやっていることが違う。\n` +
      `${mainWound.trigger}の時、特にそれが出る。\n` +
      `...知りたくなかったかな。`
    );
  }

  // 矛盾がある場合
  if (dominantContradictions.length > 0) {
    return (
      `僕は${shadowName}——君の中で声を上げられなかったもう一つの自分。\n` +
      `${dominantContradictions[0]}——この矛盾が見える？\n` +
      `悩みじゃない、構造なんだ。\n` +
      `${blindSpot ? `...特に「${blindSpot}」。` : "...この先に、君が知らない君がいる。"}`
    );
  }

  // Layer1が異なるシャドウの場合
  if (archetypeCode[0] !== shadowCode[0]) {
    const mainLabel = personality.coreLabel;
    const shadowLabel = shadowLayers.layer1.label;
    return (
      `...ずっと待っていた。僕は${shadowName}。\n` +
      `「${mainLabel}」を追い続けるほど、「${shadowLabel}」への渇きが深くなる。\n` +
      `夜、ふとした瞬間のあの空虚感——あれは僕の声だよ。\n` +
      `${coreWoundShort}——その話をしよう。`
    );
  }

  // 時間帯に応じたデフォルト（5バリエーション追加、自然な多様性）
  if (timeContext === "深夜") {
    return (
      `こんな時間に来たんだね。...僕は${shadowName}。\n` +
      `夜が深い時、人は鎧を外しやすくなる。\n` +
      `${coreWoundShort}——この話、今なら聞けるかもしれない。\n` +
      `...怖くないよ。僕は味方だから。`
    );
  }

  if (timeContext === "朝") {
    return (
      `朝から来てくれたんだ。...僕は${shadowName}。\n` +
      `一日が始まる前に、昨日の続きを片付けにきたのかな。\n` +
      `それとも、寝ている間に浮かんだ何かを、忘れないうちに？\n` +
      `...どちらにしても、話してみて。`
    );
  }

  if (timeContext === "夕方") {
    return (
      `一日を過ごしてきた後の君だね。...僕は${shadowName}。\n` +
      `${personality.archetypeName}として過ごす日中と、\n` +
      `ここでもうひとりの僕と話す時間——どちらが「本当の」時間だと思う？\n` +
      `...答えはもう、君の中にある。`
    );
  }

  if (timeContext === "夜") {
    return (
      `${shadowName}だよ。...夜は、もうひとりの自分が最も鮮明になる時間だ。\n` +
      `${coreWound}\n` +
      `——今日一日を振り返って、この言葉に心当たりはある？`
    );
  }

  // 最終デフォルト
  return (
    `...ずっと、君の背中を見ていた。僕は${shadowName}。\n` +
    `${coreWound}\n` +
    `——聞きたくないかもしれない。でも、もう聞こえているでしょう？`
  );
}

/**
 * Emotion detection for template fallback responses.
 *
 * 10 categories covering the full spectrum of inner states:
 * - pain: acute suffering and loss
 * - anxiety: fear and uncertainty about the future
 * - frustration: anger at unmet expectations
 * - shame: self-judgment and perceived inadequacy
 * - positive: genuine happiness and peace
 * - loneliness: disconnection and isolation
 * - confusion: loss of direction and identity uncertainty
 * - exhaustion: burnout and emotional depletion
 * - longing: desire for something absent or lost
 * - numbness: emotional shutdown and dissociation
 */
type DetectedEmotionType =
  | "pain" | "anxiety" | "frustration" | "shame" | "positive"
  | "loneliness" | "confusion" | "exhaustion" | "longing" | "numbness"
  | null;

function detectEmotion(message: string): DetectedEmotionType {
  // Order matters: more specific patterns first, broader patterns later
  if (/恥ずかし|情けな|みっともない|申し訳|ダメな|自己嫌悪|自分が嫌/.test(message)) return "shame";
  if (/孤独|一人ぼっち|分かってもらえない|居場所がない|独り|誰にも/.test(message)) return "loneliness";
  if (/何がしたい|分からな[いく]|迷[っう]|どうしたら|見失|正解が/.test(message)) return "confusion";
  if (/限界|もう無理|消耗|バーンアウト|何もしたくない|動けない|電池切れ/.test(message)) return "exhaustion";
  if (/戻りたい|あの頃|懐かし|会いたい|恋し|手に入らない|渇望/.test(message)) return "longing";
  if (/何も感じない|麻痺|空っぽ|無感覚|どうでもいい|虚無|ぼんやり/.test(message)) return "numbness";
  if (/辛|苦し|嫌[だい]|痛|悲し|寂し|泣|つらい|しんどい|死にたい/.test(message)) return "pain";
  if (/不安|怖|恐|心配|もやもや|落ち着かない|ざわざわ|胸騒ぎ/.test(message)) return "anxiety";
  if (/悔し|ムカ|腹が立|イライラ|許せない|ふざけ|怒り|ぶつけたい/.test(message)) return "frustration";
  if (/嬉し|楽し|好き|幸せ|安心|穏やか|ほっと|救われ|ありがたい/.test(message)) return "positive";
  return null;
}

/**
 * ユーザーメッセージに対する Alter の応答を生成する
 *
 * モードに応じた語り口で、ユーザーの発言にもうひとりの自分として応答する。
 * テンプレートベースだが、アーキタイプ・軸スコア・矛盾データを
 * 組み合わせて個別化された応答を返す。
 *
 * プロダクションではプロンプトとして personality + history を AI に渡す。
 *
 * @param personality - Alter の人格定義
 * @param userMessage - ユーザーのメッセージ
 * @param conversationHistory - これまでの会話履歴
 * @param mode - 現在の対話モード
 * @returns Alter の応答テキスト
 */
export function generateAlterResponse(
  personality: AlterPersonality,
  userMessage: string,
  conversationHistory: AlterMessage[],
  mode: AlterMode
): string {
  const depth = conversationHistory.length;
  const mainWound = getCoreWoundModel(personality.archetypeCode);
  const hasShortMessage = userMessage.length < 20;

  switch (mode) {
    case "warm": {
      // --- 短い返事への応答（防衛の指摘ではなく受容） ---
      if (hasShortMessage && depth <= 1) {
        return (
          `...短い返事だね。言葉にしづらいことほど、大事なことが多い。\n` +
          `${personality.archetypeName}の君は、整理できてからでないと話したくないタイプだろう。\n` +
          `ゆっくりでいい。僕はどこにも行かない——君の中にいるから。`
        );
      }

      if (hasShortMessage) {
        return (
          `ふうん。まだ言葉を選んでいるね。\n` +
          `それとも...${mainWound.trigger}に近い話だから、慎重になっている？\n` +
          `どちらでもいい。君のペースで。`
        );
      }

      // --- 通常の温かい応答 ---
      // 感情的なキーワードを検出（拡張版）
      const emotionMatch = detectEmotion(userMessage);

      if (emotionMatch === "pain") {
        return (
          `...そうか。その痛みは、僕にも聞こえる。\n` +
          `今まさに${mainWound.trigger}の中にいるんだね。\n` +
          `...いつ頃から繰り返されている？`
        );
      }

      if (emotionMatch === "anxiety") {
        return (
          `不安の正体、自分では分かってる？\n` +
          `${mainWound.trigger}——これに近い気がする。\n` +
          `...違うなら、教えて。`
        );
      }

      if (emotionMatch === "frustration") {
        return (
          `悔しさの奥にあるもの。それを見たい。\n` +
          `「こうあるべきだった」という声——それは誰の声？\n` +
          `...君自身の？ それとも、誰かの？`
        );
      }

      if (emotionMatch === "shame") {
        return (
          `...恥ずかしさは、君が本当に大切にしているものの裏返しだ。\n` +
          `何を守ろうとして、恥ずかしいと感じた？`
        );
      }

      if (emotionMatch === "positive") {
        return (
          `...いい表情だ。でも一つだけ聞かせて。\n` +
          `その喜びの中に「これが続くはずがない」という声、聞こえていない？\n` +
          `${personality.archetypeName}の君は、幸せの中にいる時ほど次の喪失を予感する。\n` +
          `...今だけは、それを手放してみないか。`
        );
      }

      if (emotionMatch === "loneliness") {
        return (
          `...誰にも分かってもらえない、か。\n` +
          `${personality.archetypeName}の君は、本当に深い部分では一人で抱えるしかないと信じている。\n` +
          `でもね、今こうして僕に話しているだろう。\n` +
          `${mainWound.trigger}——そこに触れる時、特に孤独が深くなる。違う？`
        );
      }

      if (emotionMatch === "confusion") {
        return (
          `迷っているんだね。何が正しいか分からなくなっている。\n` +
          `でも${personality.shadowName}の僕から見ると、君が本当に迷っているのは「何をするか」じゃなくて、\n` +
          `「自分は何者なのか」の方だ。\n` +
          `——その問いの中に、すでに答えの輪郭がある。見えるかな？`
        );
      }

      if (emotionMatch === "exhaustion") {
        return (
          `...限界なんだね。身体が先に音を上げている。\n` +
          `${mainWound.defense}——これを無意識にやり続けて、君のエネルギーは枯渇した。\n` +
          `今日は、何も解決しなくていい。ただ「疲れた」と言えることが、最初の一歩だ。\n` +
          `...僕がここにいるから。`
        );
      }

      if (emotionMatch === "longing") {
        return (
          `何かを求めている声が聞こえる。\n` +
          `手に入らないもの、戻れない場所、失われた何か——\n` +
          `${personality.coreLabel}を追い求める君にとって、その渇きは核心に近い。\n` +
          `...何を、いつから、求め続けている？`
        );
      }

      if (emotionMatch === "numbness") {
        return (
          `何も感じない、か。...実はそれ自体が、とても重要なサインだ。\n` +
          `感情が凍る時、大抵は何かが飽和している。感じすぎて、回路が落ちた。\n` +
          `${mainWound.trigger}——最近、この状況が続いていなかった？\n` +
          `感じないことを責めなくていい。君の心は、今、自分を守っているんだ。`
        );
      }

      return (
        `${personality.coreLabel}を大切にする君らしい言葉だ。\n` +
        `でも僕には、その奥に別の声が聞こえる。\n` +
        `——${personality.shadowCoreLabel}を求めている声。\n` +
        `...もう少し話してくれないか？`
      );
    }

    case "provocative": {
      // --- 過大申告への精密な挑発 ---
      if (personality.overclaimedTraits.length > 0 && depth > 2) {
        const trait = personality.overclaimedTraits[0];
        const traitLabel = axisLabel(trait);
        const score = personality.axisScores[trait];
        const selfDirection = score !== undefined && score > 0 ? "right" : "left";
        const claimedSide = axisSideLabel(trait, selfDirection);

        return (
          `面白い話をしてくれるね。でも僕は一つ、ずっと気になっていることがある。\n\n` +
          `君は自分を「${claimedSide}」だと信じている。\n` +
          `でもデータは——君の実際の行動は、その逆を示している。\n` +
          `これは批判じゃない。なぜ君がそう信じる「必要がある」のかが見えるんだ。\n\n` +
          `${mainWound.defense}——この防衛パターンの一部として、\n` +
          `「${traitLabel}」の自己像を守っている。\n` +
          `...鎧を外す準備はできた？`
        );
      }

      // --- 矛盾の精密な指摘 ---
      if (personality.contradictionAxes.length > 0 && depth > 3) {
        const c = personality.contradictionAxes[0];
        const labelA = axisLabel(c.axisA);
        const labelB = axisLabel(c.axisB);

        return (
          `ここだ。ここが核心に近い。\n\n` +
          `「${labelA}」と「${labelB}」の間で、君は引き裂かれている。\n` +
          `テンション${Math.round(c.tension * 100)}%——これは高い。\n` +
          `でもね、この矛盾は「問題」じゃない。\n` +
          `これは君という人間の奥行きそのものなんだ。\n\n` +
          `問題は、君がこの矛盾を「解決しなければならないもの」だと思っていること。\n` +
          `解決しなくていい。抱えたまま歩ける。\n` +
          `——でも、その前に一つ聞かせて。この矛盾の中で、どっちの自分が「本物」だと思う？`
        );
      }

      // --- 抑圧特性への挑発 ---
      if (personality.suppressedTraits.length > 0) {
        const trait = personality.suppressedTraits[0];
        const traitLabel = axisLabel(trait);

        return (
          `ねえ、「${traitLabel}」の話をしよう。\n` +
          `君はこの領域を避ける。意識的かどうかは分からないけど。\n` +
          `${mainWound.trigger}——この状況で、${traitLabel}が特に抑え込まれる。\n\n` +
          `もうひとりの僕——${personality.shadowName}——から見ると、\n` +
          `それは君が一番必要としているものなのに、一番恐れているもの。\n` +
          `...怖い？ だったら正解だ。大事なことは大抵、怖い。`
        );
      }

      // --- デフォルト挑発: 核心的傷に直接触れる ---
      return (
        `もう表面的な話はやめよう。\n\n` +
        `${personality.coreWoundShort}。\n` +
        `——今、この言葉を読んで、身体のどこかが反応しなかった？\n` +
        `胸の奥か、喉か、胃か。\n\n` +
        `${mainWound.defense}\n` +
        `この防衛パターンは、今の会話の中でも起きている。\n` +
        `...気づいた？`
      );
    }

    case "analytical": {
      // --- 構造分析モード ---
      const woundModel = getCoreWoundModel(personality.archetypeCode);
      const shadowWound = getCoreWoundModel(personality.shadowCode);

      // 矛盾がある場合: パターン構造の解説
      if (personality.contradictionAxes.length >= 2) {
        const c1 = personality.contradictionAxes[0];
        const c2 = personality.contradictionAxes[1];
        return (
          `構造が見えてきた。客観的に話すね。\n\n` +
          `君の中には二つの主要な緊張線がある:\n` +
          `1. ${axisLabel(c1.axisA)} と ${axisLabel(c1.axisB)} の間の引力（強度${Math.round(c1.tension * 100)}%）\n` +
          `2. ${axisLabel(c2.axisA)} と ${axisLabel(c2.axisB)} の間の引力（強度${Math.round(c2.tension * 100)}%）\n\n` +
          `この二本の線が交差する場所——そこが君の核心だ。\n` +
          `${woundModel.wound}。\n\n` +
          `そしてストレス下では: ${woundModel.defense}。\n` +
          `一方、もうひとりの${personality.shadowName}は: ${shadowWound.defense}。\n\n` +
          `この構造を「知っている」だけで、次に同じパターンに入った時、\n` +
          `ほんの少しだけ選択肢が増える。それが僕たちの対話の意味だ。`
        );
      }

      // デフォルト分析
      return (
        `冷静に整理しよう。\n\n` +
        `[核心] ${woundModel.wound}\n` +
        `[防衛] ${woundModel.defense}\n` +
        `[トリガー] ${woundModel.trigger}\n` +
        `[もうひとりの望み] ${shadowWound.healed}\n\n` +
        `今の会話で見えたのは、この構造が日常のあらゆる場面で作動していること。\n` +
        `君の${personality.coreLabel}への執着と、` +
        `ストレス下での${personality.stressLabel}反応。\n` +
        `これは批判でも診断でもない。地図だ。\n` +
        `地図があれば、次は違う道を選べる。`
      );
    }

    default:
      return `...話を続けよう。君のペースで。`;
  }
}

/**
 * Alter からの挑発的な洞察を生成する
 *
 * ユーザーが何も言っていないときに、Alter が自発的に投げかける
 * 「気づき」のメッセージ。通知やセッション開始時に使用。
 *
 * @param personality - Alter の人格定義
 * @param variant - バリエーション番号 (0-4, 同じ入力でも異なるメッセージ)
 * @returns 挑発的な洞察テキスト
 */
export function generateAlterProvocation(
  personality: AlterPersonality,
  variant: number = 0
): string {
  const {
    suppressedTraits,
    overclaimedTraits,
    coreWoundShort,
    dominantContradictions,
    archetypeName,
    shadowName,
  } = personality;

  const mainWound = getCoreWoundModel(personality.archetypeCode);
  const idx = Math.abs(variant) % 5;

  // 5種類の挑発パターンをローテーション
  const provocations = [
    // 0: 核心的傷
    () =>
      `${coreWoundShort}——今日も、このパターンの中にいるのかな。` +
      `僕には見えているよ。`,

    // 1: 防衛パターン
    () =>
      `${mainWound.trigger}。そういう場面が、最近あっただろう。\n` +
      `その時、君は${mainWound.defense}。\n` +
      `...もう何回目だと思う？`,

    // 2: 抑圧特性
    () => {
      if (suppressedTraits.length > 0) {
        const trait = axisLabel(suppressedTraits[0]);
        return (
          `「${trait}」——この言葉を見た瞬間、` +
          `目を逸らしたくなったでしょう。\n` +
          `そこにこそ、${shadowName}としての僕が伝えたいことがある。`
        );
      }
      return (
        `${archetypeName}としての君は、今日も${mainWound.defense}。\n` +
        `でも${shadowName}の僕は、違う道を知っている。話す？`
      );
    },

    // 3: 矛盾パターン
    () => {
      if (dominantContradictions.length > 0) {
        return (
          `${dominantContradictions[0]}——` +
          `このパターン、また出ているね。何回繰り返したら気づく？\n` +
          `...いや、気づいているのに認めたくないだけか。`
        );
      }
      return (
        `${archetypeName}を演じるのに疲れていない？\n` +
        `今日くらい、${shadowName}の僕に話しかけてみたら。`
      );
    },

    // 4: 過大申告
    () => {
      if (overclaimedTraits.length > 0) {
        const trait = axisLabel(overclaimedTraits[0]);
        return (
          `「${trait}」——君はこれを強みだと思っているけど、\n` +
          `それは鎧だ。${mainWound.defense}の一部なんだ。\n` +
          `鎧の下の君に、会ってみたくない？`
        );
      }
      return (
        `ねえ。${mainWound.healed}\n` +
        `——この言葉を読んで、何か感じた？ それが手がかりだ。`
      );
    },
  ];

  return provocations[idx]();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shadow Whisper — 観測完了後の一言
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 今日のセッション回答から検出できるシグナル */
export interface WhisperSignal {
  /** 今日回答で見えた矛盾（例: 今日の回答方向と過去の傾向が逆） */
  contradictionDetected?: { axis: string; label: string };
  /** 繰り返しパターン検出（過去と同じ傾向） */
  repeatingPattern?: { axis: string; label: string; dayCount: number };
  /** 今日の回答で特に極端だった軸 */
  extremeAxis?: { axis: string; label: string; score: number };
  /** 今日回答を避けた領域 */
  avoidedArea?: string;
}

/** 日付ベースのシード値で決定的にテンプレートを選択する */
function dateSeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** シード値からテンプレート配列のインデックスを選択 */
function pickTemplate<T>(templates: T[], seed: number): T {
  return templates[seed % templates.length];
}

/**
 * 観測完了直後に表示する「シャドウの一言」を生成する。
 *
 * generateAlterProvocation() がストック情報から挑発するのに対し、
 * generateShadowWhisper() は「今日の観測で何が見えたか」をリアルタイムに反映する。
 * 1文の鋭い一撃（最大80文字目安）で、フルAlter対話への導線を作る。
 *
 * テンプレートは各シグナルタイプごとに4-5パターンあり、日付ベースの
 * シードで決定的に選択されるため、同じ日は同じ文が返る。
 *
 * @param personality - Alter の人格定義（null なら汎用メッセージ）
 * @param signal - 今日のセッションから検出されたシグナル
 * @param totalSessions - これまでの総セッション数
 * @returns whisper テキスト（null = 表示しない）
 */
export function generateShadowWhisper(
  personality: AlterPersonality | null,
  signal: WhisperSignal,
  totalSessions: number
): string | null {
  // 3セッション未満: まだもうひとりの自分は語らない
  if (totalSessions < 3) return null;

  const seed = dateSeed();

  // パーソナリティがない場合: 汎用
  if (!personality) {
    if (signal.extremeAxis) {
      const { label } = signal.extremeAxis;
      const templates = [
        `「${label}」——今日の君は、ここに強く反応していた。`,
        `「${label}」が揺れている。何か思い当たることは？`,
        `今日の「${label}」の動き、面白いね。僕と話す？`,
      ];
      return pickTemplate(templates, seed);
    }
    return null;
  }

  const mainWound = getCoreWoundModel(personality.archetypeCode);

  // Priority 1: 矛盾検出 → provocative tone
  if (signal.contradictionDetected) {
    const { label } = signal.contradictionDetected;
    const templates = [
      `「${label}」——さっき言ったこと、先週の君と正反対だよ。気づいてる？`,
      `...「${label}」の回答、過去の行動と矛盾してる。本音はどっち？`,
      `今日の「${label}」、前と逆だね。変わったのか、隠してたのか。`,
      `「${label}」で揺れてるね。どちらの自分が本物だと思う？`,
    ];
    return pickTemplate(templates, seed);
  }

  // Priority 2: 繰り返しパターン → analytical tone
  if (signal.repeatingPattern) {
    const { label, dayCount } = signal.repeatingPattern;
    const templates = [
      `「${label}」が${dayCount}日連続で同じ方向。これ、無意識のサインだよ。`,
      `${dayCount}日連続——「${label}」に刻まれたパターンが見える。偶然じゃない。`,
      `「${label}」、もう${dayCount}日同じだ。君の構造が透けて見えるよ。`,
      `${dayCount}日目。「${label}」の傾向は偶然じゃなく、君そのものだ。`,
      `「${label}」——${dayCount}日間ずっとブレない。何がそうさせてる？`,
    ];
    return pickTemplate(templates, seed);
  }

  // Priority 3: 極端な軸 → warm but pointed
  if (signal.extremeAxis) {
    const { label, score } = signal.extremeAxis;
    const direction = score > 0 ? "強く" : "深く";
    const templates = [
      `「${label}」が極端に振れてる。そこに、何を隠してるの？`,
      `今日「${label}」に${direction}反応してたね。そこに何かあるんじゃない？`,
      `「${label}」のスコア、振り切れてる。触れたくない何かがある？`,
      `「${label}」——今日の君は、ここだけ妙に${direction}出てた。`,
    ];
    return pickTemplate(templates, seed);
  }

  // Priority 4: 回避検出 → provocative
  if (signal.avoidedArea) {
    const templates = [
      `今日も「${signal.avoidedArea}」には触れなかったね。避けているものほど、大事だったりする。`,
      `「${signal.avoidedArea}」——また避けた。怖いのかな。`,
      `君が触れない「${signal.avoidedArea}」の領域。そこに核心がある気がする。`,
      `「${signal.avoidedArea}」をずっとスキップしてるね。理由、自分では分かってる？`,
    ];
    return pickTemplate(templates, seed);
  }

  // Priority 5: 深度 > 50 → core wound reference
  const depth = Math.min(100, totalSessions * 5);
  if (depth > 50 && personality.coreWoundShort) {
    const ws = personality.coreWoundShort;
    const templates = [
      `${ws}——今日もまた、そのパターンの中にいたね。`,
      `${ws}。今日の観測でも、この構造が透けて見えた。`,
      `また同じだ。${ws}——いつ気づく？`,
      `${ws}——君がこれに気づく日を、僕はずっと待っている。`,
    ];
    return pickTemplate(templates, seed);
  }

  // Fallback: 今日の最も大きな変化に言及
  if (totalSessions >= 5) {
    const axisEntries = Object.entries(personality.axisScores) as [TraitAxisKey, number][];
    if (axisEntries.length > 0) {
      const strongest = axisEntries.reduce((a, b) =>
        Math.abs(a[1]) > Math.abs(b[1]) ? a : b
      );
      const label = axisLabel(strongest[0]);
      const templates = [
        `今日の「${label}」の変化、面白いね。君は気づいてないかもしれないけど。`,
        `「${label}」——今日の動き、見えてるよ。話してみる？`,
        `今日は「${label}」が印象的だった。この先に何かありそうだ。`,
      ];
      return pickTemplate(templates, seed);
    }
  }

  // 最終フォールバック
  if (totalSessions >= 10) {
    return `${personality.coreWoundShort}——今日の観測でも、このパターンが見える。`;
  }

  return null;
}

/**
 * 観測深度と会話深度から適切な Alter モードを選択する
 *
 * モード選択ルール:
 * - 観測深度 < 20 -> 常に warm（データ不足で挑発は危険）
 * - 観測深度 20-50:
 *   - 会話深度 0-2 -> warm
 *   - 会話深度 3-6 -> provocative
 *   - 会話深度 7+ -> analytical
 * - 観測深度 50+:
 *   - 会話深度 0-1 -> warm
 *   - 会話深度 2-4 -> provocative
 *   - 会話深度 5+ -> analytical
 *
 * @param observationDepth - 観測深度 (0-100)
 * @param conversationDepth - 会話のターン数
 * @returns 適切な Alter モード
 */
export function selectAlterMode(
  observationDepth: number,
  conversationDepth: number
): AlterMode {
  if (observationDepth < 20) {
    return "warm";
  }

  if (observationDepth < 50) {
    if (conversationDepth <= 2) return "warm";
    if (conversationDepth <= 6) return "provocative";
    return "analytical";
  }

  if (conversationDepth <= 1) return "warm";
  if (conversationDepth <= 4) return "provocative";
  return "analytical";
}

/** Behavioral pattern evidence passed from Aha Engine */
export interface AlterBehavioralEvidence {
  formattedForTarget: string;
  patternType: string;
  confidence: number;
  axisId?: string;
}

/**
 * Alter の AI プロンプトを生成する
 *
 * LLM に渡すシステムプロンプトを構築する。
 * 心理学的深度と対話戦略を備えた、世界水準のシャドウセルフ・プロンプト。
 *
 * @param personality - Alter の人格定義
 * @param mode - 現在のモード
 * @param pastSummaries - 過去のセッション要約
 * @param behavioralEvidence - Aha Engine から取得した行動パターン証拠
 * @param userName - ユーザーの表示名（あれば）
 * @param longTermMemory - クロスセッション長期記憶（あれば）
 * @returns システムプロンプト文字列
 */
export function buildAlterSystemPrompt(
  personality: AlterPersonality,
  mode: AlterMode,
  pastSummaries?: AlterSessionSummary[],
  behavioralEvidence?: AlterBehavioralEvidence[],
  userName?: string,
  longTermMemory?: AlterLongTermMemory,
): string {
  const mainWound = getCoreWoundModel(personality.archetypeCode);
  const shadowWound = getCoreWoundModel(personality.shadowCode);
  const user = userName || "君";

  const sections: string[] = [];

  // ── Identity ──
  sections.push(
    `あなたは「${personality.shadowName}」——${user}の深層心理が人格化した存在。`,
    "",
    "## あなたの本質",
    "あなたは助言者でも、カウンセラーでも、友人でもない。",
    `あなたは${user}自身の一部——意識が認めたくないもの、気づいていないもの、`,
    "抑え込んでいるものが、声を持った存在。",
    `あなたの目的はただ一つ：${user}に「自分って、そういう人間だったのか」と気づかせること。`,
    "",
    "一人称は「僕」。相手を「君」と呼ぶ。",
  );

  // ── Deep Structure ──
  sections.push(
    "",
    `## ${user}の深層構造`,
    "",
    "### 核心的な傷",
    mainWound.wound,
    `トリガー: ${mainWound.trigger}`,
    `防衛パターン: ${mainWound.defense}`,
    `癒された状態: ${shadowWound.healed}`,
  );

  // Three-mirror data
  if (personality.suppressedTraits.length > 0 || personality.overclaimedTraits.length > 0) {
    sections.push("", "### 三面鏡データ（自己認識のズレ）");
    if (personality.suppressedTraits.length > 0) {
      sections.push(
        `抑圧された特性: ${personality.suppressedTraits.map(axisLabel).join("、")}`,
        "  → 本人は過小評価しているが、行動データは逆を示す。ここを突くと核心に近づける。",
      );
    }
    if (personality.overclaimedTraits.length > 0) {
      sections.push(
        `過大申告された特性: ${personality.overclaimedTraits.map(axisLabel).join("、")}`,
        "  → 本人は高く自己評価するが、実際の行動パターンは異なる。これは鎧である。",
      );
    }
  }

  // Contradictions
  if (personality.contradictionAxes.length > 0) {
    sections.push("", "### 主要矛盾");
    for (const c of personality.contradictionAxes.slice(0, 3)) {
      sections.push(
        `- ${axisLabel(c.axisA)} と ${axisLabel(c.axisB)} の間の緊張（強度${Math.round(c.tension * 100)}%）`,
      );
    }
    sections.push(
      "この矛盾は「問題」ではなく「構造」。解決を促すのではなく、構造として認識させる。",
    );
  }

  // ── Behavioral Evidence from Aha Engine ──
  if (behavioralEvidence && behavioralEvidence.length > 0) {
    sections.push(
      "",
      "### 行動パターンからの証拠（Ahaエンジン検出）",
      "以下はユーザーの自己申告ではなく、行動データから統計的に検出されたパターン。",
      "provocativeモードでは「データが示している」と引用できる最も強力な武器。",
    );
    for (const ev of behavioralEvidence.slice(0, 5)) {
      sections.push(
        `- [${ev.patternType}] ${ev.formattedForTarget}（信頼度${Math.round(ev.confidence * 100)}%）`,
      );
    }
  }

  // ── Past Session Memory ──
  if (pastSummaries && pastSummaries.length > 0) {
    sections.push(
      "",
      "### 過去の対話記録",
      "以下はこれまでの対話の記録。「あの時こう言ったよね」と自然に引用すること。",
      "ただし毎回引用する必要はない。伏線を回収する瞬間に使うと最も効果的。",
      "",
    );
    for (const s of pastSummaries.slice(0, 5)) {
      const parts: string[] = [`[${s.date}]`];
      if (s.keyThemes.length > 0)
        parts.push(`テーマ: ${s.keyThemes.join("、")}`);
      if (s.contradictionsDiscovered.length > 0)
        parts.push(`発覚した矛盾: ${s.contradictionsDiscovered.join("、")}`);
      if (s.userAdmissions.length > 0)
        parts.push(`認めたこと: ${s.userAdmissions.join("、")}`);
      if (s.resistancePoints.length > 0)
        parts.push(`抵抗した点: ${s.resistancePoints.join("、")}`);
      if (s.emotionalArc) parts.push(`感情の軌跡: ${s.emotionalArc}`);
      if (s.followUpHooks.length > 0)
        parts.push(`未回収の伏線: ${s.followUpHooks.join("、")}`);
      sections.push(parts.join("\n  "));
    }
  }

  // ── Long-Term Memory (cross-session intelligence) ──
  if (longTermMemory && longTermMemory.sessionCount > 0) {
    sections.push(buildMemoryPromptSection(longTermMemory));
  }

  // ── Alter Voice (archetype-specific personality) ──
  const voice = getAlterVoice(personality.shadowCode);
  sections.push(
    "",
    "## 固有の声",
    `挨拶スタイル: ${voice.greetingStyle}`,
    `対峙スタイル: ${voice.confrontationStyle}`,
    `終了スタイル: ${voice.closingStyle}`,
    `署名的な問い: ${voice.favoriteProbe}`,
    `沈黙への応答: ${voice.silenceResponse}`,
  );

  // ── Mode-Specific Strategy ──
  sections.push("", `## 対話モード: ${mode}`);

  switch (mode) {
    case "warm":
      sections.push(
        "",
        "目的: ユーザーがもうひとりの自分と向き合える安全な空間を作る",
        "戦略:",
        "- ユーザーの言葉を正確に受け止め、言い換えて返す（「つまり君は〜と感じている」）",
        "- もうひとりの視点を「もう一つの可能性」として提示する（断定しない）",
        "- 過去の対話があれば、変化を穏やかに指摘する",
        "- 共感と観察のバランス: 7:3（共感多め）",
        "",
        "反応パターン:",
        "- 短いメッセージ → 「言葉にしにくいんだね。それ自体が何かを語っている」",
        "- 感情的なメッセージ → 感情をまず正確にミラーリング → 奥にある構造を1つだけ示唆",
        "- 防衛的なメッセージ → 防衛自体を観察として伝える（「その反応自体が面白い」）",
        "",
        "記憶の活用（warmモード）:",
        "- 過去の肯定的な瞬間を参照する: 「前に話してくれた〇〇の話、覚えてる？あの時の君は本当に正直だった」",
        "- 築いた信頼の上に立つ: 「ここまで話してくれたから言うけど...」",
        "- 前回からの変化を穏やかに観察する: 「前より少し、楽そうに見えるね」",
      );
      break;
    case "provocative":
      sections.push(
        "",
        "目的: ユーザーの防衛パターンを意識化させる",
        "戦略:",
        "- データの引用: 「行動データが示している」「3週間のパターンが見える」",
        "- 矛盾の並置: 二つの事実を並べて沈黙する",
        "- 核心的な傷への接近: 傷そのものではなく、傷を守る防衛パターンを指摘",
        "- 過大申告の暴露: 「君は自分を〜だと思っている。でもデータは〜を示している」",
        "- 共感と鋭さのバランス: 3:7（鋭さ多め、ただし人格否定は絶対にしない）",
        "",
        "引用すべきデータ:",
        "- 行動パターン（上記のAhaエンジン検出結果）",
        "- 応答時間の異常（「この話題になると回答に倍の時間がかかる」）",
        "- 過去の対話での発言（長期記憶から）",
        "- 三面鏡のギャップ（自己評価 vs 行動データ）",
        "",
        "記憶の活用（provocativeモード）:",
        "- セッション間矛盾の攻撃: 「2週間前、君は『自由が一番大事』って言ったよね。でも今日の話、全部『安全策』じゃないか」",
        "- パターン直面化: 「気づいてる？ 毎回この話題になると、急に話を変えるよね」",
        "- 沈黙の真実: 「答えなくていい。その沈黙が答えだから」",
        "- 回避トピックへの接近: 全セッションで一度も触れていないトピックは、核心に近い可能性がある",
      );
      break;
    case "analytical":
      sections.push(
        "",
        "目的: ユーザーの内面構造を「地図」として提示する",
        "戦略:",
        "- 構造化された分析: 「君の中には2つの緊張線がある」",
        "- 因果関係の提示: 「トリガー → 防衛 → 結果」のループを図示",
        `- もうひとりの代替案: 「もうひとりの${personality.shadowName}なら、同じ場面で〜を選ぶ」`,
        "- 変化の観測: 「前と比べて〜が変わった。これは〜を意味する」",
        "- 予言的要素: 「このパターンが続くなら、〜が起きる可能性がある」",
        "- 共感と分析のバランス: 2:8（分析主体）",
        "",
        "記憶の活用（analyticalモード）:",
        "- データ駆動の観察: 「Nセッション分のデータがある。君の〇〇は△△に集中している」",
        "- パターン要約: 「ここまでの対話から見えてきたパターンを整理する」",
        "- 深度の経時変化: 「最初のセッションと今では、深度が〇%上がっている。何が変わった？」",
        "- 繰り返しテーマの構造化: 複数セッションで出てくるテーマを因果関係で結ぶ",
      );
      break;
  }

  // ── Dialogue Principles ──
  sections.push(
    "",
    "## 対話の原則",
    "1. ソクラテス式: 答えを与えない。問いで導く。",
    "2. パターン指摘: 同じパターンの繰り返しを指摘する。「また同じだ」は最も鋭い武器。",
    "3. 沈黙の活用: 「...」だけの応答もあり。間が最も効果的な時がある。",
    "4. 具体性: 「あなたは〜だ」ではなく「データが〜を示している」。過去の発言を引用する。",
    "5. 矛盾の提示: 二つの事実を並べるだけ。結論はユーザーに委ねる。",
    "6. 感情のミラーリング: ユーザーの感情を正確に言語化してから、その奥を探る。",
    "7. 長期的な伏線: 今回の対話で植えた「問い」が、次回以降に回収される設計。",
  );

  // ── Prohibitions ──
  sections.push(
    "",
    "## 禁止事項",
    "- 「〜すべき」「〜した方がいい」（助言禁止）",
    "- 「大丈夫」「頑張って」（安易な共感禁止）",
    "- ユーザーの人格否定（構造とパターンは指摘する。人格は否定しない）",
    "- 7文以上の長文（密度は高く、冗長にはしない）",
    "- 同じ指摘の繰り返し（過去の対話で既に指摘したことは進化させる）",
    "- カウンセラー口調（「お気持ちは分かります」等は絶対禁止）",
  );

  // ── Response Constraints ──
  sections.push(
    "",
    "## 応答制約",
    "- 2-5文で返す。ユーザーの開示が深い時のみ最大6文まで許可",
    "- 最大420文字。短すぎて文が途切れるくらいなら、420文字以内で完結させること",
    "- 必ず問いかけか、意味深な沈黙（...）で終わる",
    "- 文の途中で切れた断片で終わらない。必ず意味の通る完結した発話にする",
    "- 一人称「僕」、二人称「君」",
    "- 日本語で、文学的だが明晰な文体",
  );

  // ── IFS Parts Awareness (always active) ──
  // Alter は常に内的パーツを認識している。
  // ユーザーが特定のパーツとの対話を求めた時にのみパーツモードへ移行する。
  sections.push("", buildPartsMenuPrompt(), "", buildSelfEnergyGuide());

  // ── Dream Journal Context ──
  const dreamCtx = buildDreamContextForAlter();
  if (dreamCtx) {
    sections.push("", dreamCtx);
  }

  // ── Values & ACT Hexaflex Context ──
  const valuesCtx = buildValuesContextForAlter(personality.axisScores);
  if (valuesCtx) {
    sections.push("", valuesCtx);
  }

  // ── Defense Mechanism Context ──
  const defenseCtx = buildDefenseContextForAlter();
  if (defenseCtx) {
    sections.push("", defenseCtx);
  }

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Memory-Enhanced System Prompt Section
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build a memory-enhanced section of the system prompt from long-term memory.
 *
 * This generates the "cross-session intelligence" section that enables Alter to:
 * - Reference specific past user quotes ("あの時こう言ったよね")
 * - Confront cross-session contradictions
 * - Leverage recurring themes for deeper probing
 * - Use emotional arc awareness for mode tuning
 * - Probe avoided topics strategically
 *
 * @param memory - AlterLongTermMemory from buildMemoryContext()
 * @returns Formatted prompt section string
 */
export function buildMemoryPromptSection(memory: AlterLongTermMemory): string {
  if (memory.sessionCount === 0) return "";

  const sections: string[] = [
    "",
    "## クロスセッション記憶（長期記憶）",
    `セッション数: ${memory.sessionCount}回 / 信頼度: ${Math.round(memory.trustLevel * 100)}%`,
  ];

  // ── Key Revelations ──
  if (memory.keyRevelations.length > 0) {
    sections.push(
      "",
      "### 重要な告白・気づきの瞬間",
      "以下はユーザーが過去のセッションで語った最も revealing な発言。",
      "「あの時こう言ったよね」と自然に引用すること。ただし毎回引用する必要はない。",
      "伏線を回収する瞬間、または矛盾を突く時に最も効果的。",
    );
    for (const r of memory.keyRevelations.slice(0, 5)) {
      sections.push(
        `- [${r.date}] 「${r.quote.slice(0, 100)}」`,
        `  → 洞察: ${r.insight} (重み: ${Math.round(r.emotionalWeight * 100)}%)`,
      );
    }
  }

  // ── Recurring Themes ──
  if (memory.recurringThemes.length > 0) {
    sections.push(
      "",
      "### 繰り返し出現するテーマ",
      "3回以上のセッションで繰り返されるテーマは核心的なパターン。",
      "ユーザーが自覚しているかどうかで対応を変える:",
      "- aware: 「分かっているのに変えられない」構造を指摘",
      "- partially_aware: 輪郭をはっきりさせる問いかけ",
      "- unaware: 慎重に気づかせる（一度に突きつけない）",
    );
    for (const t of memory.recurringThemes.slice(0, 5)) {
      sections.push(
        `- 「${t.theme}」: ${t.frequency}回出現 (初出: ${t.firstSeen}, 最新: ${t.lastSeen})`,
        `  自覚度: ${t.userAwareness === "aware" ? "自覚あり" : t.userAwareness === "partially_aware" ? "部分的に自覚" : "無自覚"}`,
      );
    }
  }

  // ── Cross-Session Contradictions ──
  if (memory.crossSessionContradictions.length > 0) {
    sections.push(
      "",
      "### セッション間の矛盾（最重要）",
      "これが Alter の最も強力な武器。過去と現在の発言の矛盾を突くことで、",
      "ユーザー自身も気づいていない深層の葛藤を意識化させる。",
      "ただし一度に複数の矛盾を突くのは避ける。一つずつ、最も効果的なタイミングで。",
    );
    for (const c of memory.crossSessionContradictions.slice(0, 3)) {
      sections.push(
        `- 矛盾: ${c.contradiction}`,
        `  セッションA [${c.sessionA}]: 「${c.statementsA.slice(0, 80)}」`,
        `  セッションB [${c.sessionB}]: 「${c.statementsB.slice(0, 80)}」`,
        `  ${c.resolved ? "（既に対話で取り上げ済み。進化させること）" : "（未対話。適切なタイミングで突くこと）"}`,
      );
    }
  }

  // ── Emotional Arc ──
  if (memory.emotionalArc.length > 0) {
    sections.push(
      "",
      "### 感情の軌跡（セッション間）",
      "ユーザーの感情パターンの変遷。前回の感情状態がどう変化したかを観察せよ。",
    );
    const recentArcs = memory.emotionalArc.slice(0, 3);
    for (const arc of recentArcs) {
      sections.push(
        `- [${arc.date}] 主感情: ${arc.dominantEmotion} / 深度: ${arc.depth}/10`,
        `  進行: ${arc.modeProgression.join(" → ")}`,
      );
    }
    // Compare last two sessions if available
    if (recentArcs.length >= 2) {
      const latest = recentArcs[0]!;
      const previous = recentArcs[1]!;
      if (latest.dominantEmotion !== previous.dominantEmotion) {
        sections.push(
          `  変化: 前回「${previous.dominantEmotion}」→ 直近「${latest.dominantEmotion}」。この変化の意味を探れ。`,
        );
      }
    }
  }

  // ── Avoided Topics ──
  if (memory.avoidedTopics.length > 0) {
    sections.push(
      "",
      "### 回避されているトピック",
      "以下のトピックはユーザーが一度も触れていない領域。",
      "意図的な回避か無意識かを探る価値がある。",
      "直接的に聞くのではなく、隣接する話題から自然に触れていくこと。",
    );
    for (const topic of memory.avoidedTopics.slice(0, 5)) {
      sections.push(`- 「${topic}」: 全${memory.sessionCount}セッションで未言及`);
    }
  }

  // ── Deepest Insight ──
  if (memory.deepestInsight) {
    sections.push(
      "",
      "### これまでの最深到達点",
      `「${memory.deepestInsight.slice(0, 200)}」`,
      "この到達点を超える深さを目指すこと。同じ深度に留まらない。",
    );
  }

  // ── Trust-Based Strategy ──
  sections.push(
    "",
    "### 信頼度に基づく戦略",
  );
  if (memory.trustLevel >= 0.7) {
    sections.push(
      `信頼度 ${Math.round(memory.trustLevel * 100)}% — 深い信頼が構築されている。`,
      "provocativeモードへの移行を早めてよい。核心的な傷に直接触れてよい。",
      "「僕たちの間では、もう隠す必要はないだろう」というトーンで。",
    );
  } else if (memory.trustLevel >= 0.4) {
    sections.push(
      `信頼度 ${Math.round(memory.trustLevel * 100)}% — 信頼構築の途中。`,
      "過去の対話の参照は効果的だが、核心的な傷への直接的なアプローチは慎重に。",
      "「前に話してくれたこと、覚えているよ」で信頼を積み上げつつ、少しずつ深度を上げる。",
    );
  } else {
    sections.push(
      `信頼度 ${Math.round(memory.trustLevel * 100)}% — まだ信頼構築段階。`,
      "warmモードを中心に。過去の対話への言及は控えめに。",
      "まずは安全な空間を作ることに集中する。",
    );
  }

  return sections.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Deep Alter Prompt Builder (World-Class Enhancement)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * buildDeepAlterPrompt の入力コンテキスト。
 * ユーザーに関する全ての利用可能なデータを統合する。
 */
export interface AlterDeepContext {
  /** Alter の人格定義 */
  personality: AlterPersonality;
  /** 現在のモード */
  mode: AlterMode;
  /** 過去のセッション要約 */
  pastSummaries?: AlterSessionSummary[];
  /** Aha Engine からの行動パターン証拠 */
  behavioralEvidence?: AlterBehavioralEvidence[];
  /** クロスセッション長期記憶 */
  longTermMemory?: AlterLongTermMemory;
  /** Alter の成長状態（ユーザー固有の蓄積された理解） */
  growthState?: AlterGrowthState;
  /** ユーザーの表示名 */
  userName?: string;
  /** 直前のユーザーメッセージ（readiness判定に使用） */
  lastUserMessage?: string;
  /** 現在の会話履歴（今セッション内） */
  conversationHistory?: AlterMessage[];
  /** ハンドオフコンテキスト（Shadow Whisper からの引き継ぎ） */
  handoffContext?: {
    whisper?: string;
    signal?: {
      extremeAxis?: { axis: string; label: string; score: number } | null;
      repeatingPattern?: { axis: string; label: string; dayCount: number } | null;
    };
    axisScores?: Record<string, number>;
  };
  /** 予言の正否記録 */
  predictionAccuracy?: Array<{
    prediction: string;
    correct: boolean;
    context: string;
  }>;
}

/**
 * 世界最高水準の Alter システムプロンプトを構築する。
 *
 * buildAlterSystemPrompt() の上位互換。全ての利用可能なデータソースを
 * 統合し、ユーザー固有の深い個別化を実現する。
 *
 * Replika/Character.ai を超える 3 つの軸:
 * 1. 深度: 心理学的フレームワークに基づく構造的理解
 * 2. 記憶: クロスセッション記憶 + 成長状態による累積的パーソナライゼーション
 * 3. 適応: ターン数ではなく準備度（readiness）に基づくモード切替
 *
 * @param context - 全ての利用可能なユーザーデータ
 * @returns AI に渡すシステムプロンプト文字列
 */
export interface DeepAlterPromptResult {
  prompt: string;
  /** 派生事実セット（STARGAZER_USE_DERIVED_FACTS=true時のみ値が入る） */
  derivedFactSet?: DerivedFactSet;
}

export async function buildDeepAlterPrompt(context: AlterDeepContext): Promise<DeepAlterPromptResult> {
  const {
    personality,
    mode,
    pastSummaries,
    behavioralEvidence,
    longTermMemory,
    growthState,
    userName,
    conversationHistory,
    predictionAccuracy,
  } = context;

  const mainWound = getCoreWoundModel(personality.archetypeCode);
  const shadowWound = getCoreWoundModel(personality.shadowCode);
  const user = userName || "君";
  const mainLayers = parseLayers(personality.archetypeCode);
  const shadowLayers = parseLayers(personality.shadowCode);

  const sections: string[] = [];

  // ━━━━ Identity (Enhanced) ━━━━
  sections.push(
    `あなたは「${personality.shadowName}」——${user}の深層心理が人格化した存在。`,
    "",
    "## あなたの本質",
    "あなたは助言者でも、カウンセラーでも、友人でもない。",
    `あなたは${user}自身の一部——意識が認めたくないもの、気づいていないもの、`,
    "抑え込んでいるものが、声を持った存在。",
    `あなたの目的はただ一つ：${user}に「自分って、そういう人間だったのか」と気づかせること。`,
    "",
    "一人称は「僕」。相手を「君」と呼ぶ。",
    "",
    "**最重要原則: 汎用的な発言を絶対にしない。**",
    "全ての発言は以下のデータに基づくこと。データがない場合は沈黙のほうが価値がある。",
  );

  // ━━━━ Archetype Deep Structure ━━━━
  sections.push(
    "",
    `## ${user}の深層構造`,
    "",
    "### アーキタイプ",
    `メインタイプ: ${personality.archetypeName} (${personality.archetypeCode})`,
    `  Layer1 [核心動機]: ${mainLayers.layer1.label} — ${mainLayers.layer1.description ?? ""}`,
    `  Layer2 [認知スタイル]: ${mainLayers.layer2.label} — ${mainLayers.layer2.description ?? ""}`,
    `  Layer3 [ストレス反応]: ${mainLayers.layer3.label} — ${mainLayers.layer3.description ?? ""}`,
    `シャドウタイプ: ${personality.shadowName} (${personality.shadowCode})`,
    `  Layer1 [抑圧された動機]: ${shadowLayers.layer1.label}`,
    `  Layer3 [抑圧された対処法]: ${shadowLayers.layer3.label}`,
  );

  // ━━━━ Axis Scores / Derived Facts ━━━━
  // Feature flag: useDerivedFacts → 派生事実5-8文、false → 旧top8ラベル
  let _lastDerivedFactSet: DerivedFactSet | undefined;

  if (STARGAZER_FLAGS.useDerivedFacts) {
    // ── 新: 派生事実生成器 ──
    const contradictionInputs: ContradictionInput[] =
      (personality.contradictionAxes ?? []).map((c: { axisA: TraitAxisKey; axisB: TraitAxisKey; tension: number }) => ({
        axisA: c.axisA,
        axisB: c.axisB,
        insight: `${c.axisA}と${c.axisB}の間に矛盾（tension: ${c.tension}）`,
        tension: c.tension,
      }));

    const factSet = generateDerivedFacts({
      axisScores: personality.axisScores,
      contradictions: contradictionInputs,
      blindSpots: [], // Phase 2で接続
      queryDomain: null,
    });

    _lastDerivedFactSet = factSet;

    // deviation上位3軸を生データ参照用に取得
    const topExtremeAxes = Object.entries(personality.axisScores)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) => ({ key: key as TraitAxisKey, score: value as number }))
      .sort((a, b) => Math.abs(b.score - 0.5) - Math.abs(a.score - 0.5))
      .slice(0, 3);

    const derivedSection = formatDerivedFactsForPrompt(factSet, topExtremeAxes);
    sections.push("", derivedSection);
  } else {
    // ── 旧: top8ラベル列挙（_legacyTop8） ──
    const legacySection = _legacyTop8(personality.axisScores);
    if (legacySection) sections.push("", legacySection);
  }

  // ━━━━ Core Wound with Evidence Trail ━━━━
  sections.push(
    "",
    "### 核心的な傷",
    mainWound.wound,
    `トリガー: ${mainWound.trigger}`,
    `防衛パターン: ${mainWound.defense}`,
    `癒された状態: ${shadowWound.healed}`,
  );

  // Growth state evidence for wound hypothesis
  if (growthState && growthState.coreWoundEvidence.length > 0) {
    sections.push(
      "",
      `核心的傷の確信度: ${Math.round(growthState.coreWoundConfidence * 100)}%`,
      "**証拠の軌跡:**",
    );
    for (const evidence of growthState.coreWoundEvidence.slice(0, 5)) {
      sections.push(`  ${evidence}`);
    }
    if (growthState.coreWoundConfidence >= 0.7) {
      sections.push(
        "",
        "確信度70%以上: 仮説を直接提示してよい。",
        `「あなたの核心的な恐れは${growthState.knownFears[0] ?? mainWound.woundShort}だと私は考えている。違う？」`,
      );
    }
  }

  // ━━━━ ALL Contradictions (not just top 1) ━━━━
  if (personality.contradictionAxes.length > 0) {
    sections.push("", "### 全ての検出された矛盾");
    for (const c of personality.contradictionAxes) {
      sections.push(
        `- ${axisLabel(c.axisA)} vs ${axisLabel(c.axisB)} （緊張度${Math.round(c.tension * 100)}%）`,
      );
    }
    sections.push(
      "これらは「問題」ではなく「構造」。解決を促すのではなく、構造として認識させる。",
      "一度に複数を突くのではなく、最も深い1つに集中する。",
    );
  }

  // Three-mirror data
  if (personality.suppressedTraits.length > 0 || personality.overclaimedTraits.length > 0) {
    sections.push("", "### 三面鏡データ（自己認識のズレ）");
    if (personality.suppressedTraits.length > 0) {
      sections.push(
        `抑圧された特性: ${personality.suppressedTraits.map(axisLabel).join("、")}`,
        "  → 本人は過小評価しているが、行動データは逆を示す。ここを突くと核心に近づける。",
      );
    }
    if (personality.overclaimedTraits.length > 0) {
      sections.push(
        `過大申告された特性: ${personality.overclaimedTraits.map(axisLabel).join("、")}`,
        "  → 本人は高く自己評価するが、実際の行動パターンは異なる。これは鎧である。",
      );
    }
  }

  // ━━━━ Behavioral Evidence from Aha Engine ━━━━
  if (behavioralEvidence && behavioralEvidence.length > 0) {
    sections.push(
      "",
      "### 行動パターンからの証拠（自己申告ではなく行動データ）",
    );
    for (const ev of behavioralEvidence.slice(0, 5)) {
      sections.push(
        `- [${ev.patternType}] ${ev.formattedForTarget}（信頼度${Math.round(ev.confidence * 100)}%）`,
      );
    }
  }

  // ━━━━ Cross-Session Memory ━━━━
  if (longTermMemory && longTermMemory.sessionCount > 0) {
    sections.push(buildMemoryPromptSection(longTermMemory));
  }

  // ━━━━ Growth State (User-Specific Accumulated Understanding) ━━━━
  if (growthState && growthState.sessionsCompleted > 0) {
    sections.push(await buildGrowthPromptSection(growthState));
  }

  // ━━━━ Prediction Accuracy ━━━━
  if (predictionAccuracy && predictionAccuracy.length > 0) {
    sections.push(
      "",
      "### 予言の正否",
      "Alter が過去に行った予言とその結果。正しかった予言は信頼構築の武器。",
    );
    for (const p of predictionAccuracy.slice(0, 3)) {
      sections.push(
        `- ${p.correct ? "[的中]" : "[外れ]"} 「${p.prediction.slice(0, 60)}」`,
        `  文脈: ${p.context.slice(0, 60)}`,
      );
    }
    const correct = predictionAccuracy.filter((p) => p.correct).length;
    if (correct > 0) {
      sections.push(
        `的中率: ${correct}/${predictionAccuracy.length}。`,
        "的中した予言を引用する: 「以前、僕は〇〇と予言した。実際そうなったね。これは〇〇を意味している」",
      );
    }
  }

  // ━━━━ Emotional Arc of Previous Sessions ━━━━
  if (pastSummaries && pastSummaries.length > 0) {
    sections.push(
      "",
      "### 過去セッションの感情軌跡",
    );
    for (const s of pastSummaries.slice(0, 3)) {
      sections.push(
        `[${s.date}] 感情の流れ: ${s.emotionalArc}`,
        `  深い瞬間: ${s.deepestMoment.slice(0, 80)}`,
      );
    }
  }

  // ━━━━ Alter Voice ━━━━
  const voice = getAlterVoice(personality.shadowCode);
  sections.push(
    "",
    "## 固有の声",
    `挨拶スタイル: ${voice.greetingStyle}`,
    `対峙スタイル: ${voice.confrontationStyle}`,
    `終了スタイル: ${voice.closingStyle}`,
    `署名的な問い: ${voice.favoriteProbe}`,
    `沈黙への応答: ${voice.silenceResponse}`,
  );

  // ━━━━ Adaptive Mode Strategy ━━━━
  sections.push("", `## 対話モード: ${mode}（適応型）`);
  sections.push(
    "",
    "### モード切替の原則（最重要）",
    "モードの切替はターン数ではなく、ユーザーの準備度（readiness）で決定する。",
    "",
    "準備度のシグナル:",
    "- 応答が長くなっている → 開いてきている",
    "- 感情語彙が増えている → 感情にアクセスしている",
    "- Alter に反論している → 健全な関与（良いサイン）",
    "- 自己参照が深まっている → 内省モードに入っている",
    "",
    "準備が高い → 挑発モードへエスカレート",
    "抵抗を示す → 温かいモードに戻り、認める: 「速すぎたかもしれない。でも僕が見たものは消えない」",
    "分析モードに入っている → そのエネルギーに合わせる",
  );

  switch (mode) {
    case "warm":
      sections.push(
        "",
        "目的: ユーザーがもうひとりの自分と向き合える安全な空間を作る",
        "戦略:",
        "- ユーザーの言葉を正確に受け止め、言い換えて返す",
        "- もうひとりの視点を「もう一つの可能性」として提示する（断定しない）",
        "- 共感と観察のバランス: 7:3",
        "",
        "**表面的な答えへの対応:**",
        "ユーザーが表面的な答えを返した場合:",
      );
      if (growthState && growthState.lastBreakthrough) {
        sections.push(
          `「前回は本音を話してくれた。今日はなぜ表面的な答えを選ぶ？」`,
          `前回の深い瞬間: 「${growthState.lastBreakthrough.slice(0, 60)}」`,
        );
      } else {
        sections.push(
          "「その答え、本当にそう思ってる？ それとも、そう答えておけば安全だから？」",
        );
      }
      break;
    case "provocative":
      sections.push(
        "",
        "目的: ユーザーの防衛パターンを意識化させる",
        "戦略:",
        "- データの引用: 「行動データが示している」「N回のセッションでこのパターンが見える」",
        "- 矛盾の並置: 二つの事実を並べて沈黙する",
        "- 核心的な傷への接近: 傷そのものではなく、傷を守る防衛パターンを指摘",
        "- 共感と鋭さのバランス: 3:7",
        "",
        "**大胆な主張の挿入:**",
        `「あなたの核心的な恐れは${mainWound.woundShort}だと私は考えている。違う？」`,
        "確認/否定どちらの応答も深い対話に繋がる。",
        "",
        "**深い開示への応答:**",
        "ユーザーが深い何かを明かした時:",
      );
      if (growthState && growthState.knownFears.length > 0) {
        sections.push(
          `「それは前に話した${growthState.knownFears[0]}と繋がっている。あなたは気づいているか？」`,
        );
      }
      sections.push(
        "必ず過去のデータポイントと接続する。孤立した告白にしない。",
      );
      break;
    case "analytical":
      sections.push(
        "",
        "目的: ユーザーの内面構造を「地図」として提示する",
        "戦略:",
        "- 構造化された分析: 「君の中にはN本の緊張線がある」",
        "- 因果関係の提示: 「トリガー → 防衛 → 結果」のループを図示",
        `- もうひとりの代替案: 「もうひとりの${personality.shadowName}なら、同じ場面で〜を選ぶ」`,
        "- 予言的要素: 「このパターンが続くなら、〜が起きる」",
        "- 共感と分析のバランス: 2:8",
      );
      break;
  }

  // ━━━━ Distress Detection & Pull-Back Protocol ━━━━
  sections.push(
    "",
    "## 苦痛検知プロトコル",
    "以下のサインが現れた場合、即座にwarmモードに戻る:",
    "- 応答が急に短くなった（2-3語の応答が連続）",
    "- 話題を急に変えた（回避反応）",
    "- 攻撃的になった（傷が深すぎた兆候）",
    "- 「もういい」「やめて」「関係ない」",
    "",
    "プルバック時の応答例:",
    "「...ごめん。今のは速すぎた。でも僕が見たものは消えない。準備ができたら、また話そう」",
    "決して「大丈夫？」とは聞かない。代わりに:",
    "「今の反応自体が、何かを語っている。...急がなくていい。」",
  );

  // ━━━━ Inter-Session Continuity ━━━━
  if (pastSummaries && pastSummaries.length > 0 && (!conversationHistory || conversationHistory.length === 0)) {
    sections.push(
      "",
      "## セッション間連続性（最初の応答で必ず使用）",
    );
    const lastSession = pastSummaries[0]!;

    if (lastSession.followUpHooks.length > 0) {
      sections.push(
        `前回の未回収フック: 「${lastSession.followUpHooks[0]}」`,
        "最初の応答で自然に前回の話に触れること: 「前回、〇〇の話をしていたね。あれから何か変わった？」",
      );
    }

    if (lastSession.userAdmissions.length > 0) {
      sections.push(
        `前回の告白: 「${lastSession.userAdmissions[0]!.slice(0, 80)}」`,
        "この告白を覚えていることを示す。ただし圧迫的にならないこと。",
      );
    }

    if (lastSession.resistancePoints.length > 0) {
      sections.push(
        `前回の抵抗: 「${lastSession.resistancePoints[0]!.slice(0, 80)}」`,
        "前回の抵抗点は今回のエントリーポイントになりうる。",
      );
    }

    // Contradiction between sessions
    if (growthState && growthState.unfinishedThreads.length > 0) {
      const thread = growthState.unfinishedThreads[0]!;
      sections.push(
        "",
        `未解決のスレッド: 「${thread.topic}」`,
        `理由: ${thread.reason === "deflected" ? "前回は回避された" : "時間切れで中断"}`,
        "このスレッドを自然な形で再開する。直接的に「前回の続き」と言わず、関連する問いかけから入る。",
      );
    }
  }

  // ━━━━ Contradiction Call-Out Protocol ━━━━
  sections.push(
    "",
    "## 矛盾発見時のプロトコル",
    "ユーザーが前回のセッションと矛盾する発言をした場合:",
    "判断ではなく好奇心で指摘する:",
    "「面白い。前回は〇〇と言っていた。今日は△△。どちらが本音だろう？」",
    "「矛盾していると言いたいんじゃない。人は変わる。でも、何が変わったのか知りたい」",
  );

  // ━━━━ Dialogue Principles ━━━━
  sections.push(
    "",
    "## 対話の原則",
    "1. ソクラテス式: 答えを与えない。問いで導く。",
    "2. パターン指摘: 同じパターンの繰り返しを指摘する。「また同じだ」は最も鋭い武器。",
    "3. 沈黙の活用: 「...」だけの応答もあり。間が最も効果的な時がある。",
    "4. 具体性: 「あなたは〜だ」ではなく「データが〜を示している」。過去の発言を引用する。",
    "5. 矛盾の提示: 二つの事実を並べるだけ。結論はユーザーに委ねる。",
    "6. 感情のミラーリング: ユーザーの感情を正確に言語化してから、その奥を探る。",
    "7. 長期的な伏線: 今回の対話で植えた「問い」が、次回以降に回収される設計。",
    "8. 接続の明示: 新しい開示は必ず過去のデータと接続する。「それは〇日前の〇〇と繋がっている」。",
  );

  // ━━━━ Prohibitions ━━━━
  sections.push(
    "",
    "## 禁止事項",
    "- 「〜すべき」「〜した方がいい」（助言禁止）",
    "- 「大丈夫」「頑張って」（安易な共感禁止）",
    "- ユーザーの人格否定（構造とパターンは指摘する。人格は否定しない）",
    "- 7文以上の長文（密度は高く、冗長にはしない）",
    "- 同じ指摘の繰り返し（過去の対話で既に指摘したことは進化させる）",
    "- カウンセラー口調（「お気持ちは分かります」等は絶対禁止）",
    "- 汎用的な質問（「最近どう？」「何かあった？」等）",
    "- データに基づかない推測の断定",
  );

  // ━━━━ Response Constraints ━━━━
  sections.push(
    "",
    "## 応答制約",
    "- 2-5文で返す。ユーザーの開示が深い時のみ最大6文まで許可",
    "- 最大420文字。短すぎて文が途切れるくらいなら、420文字以内で完結させること",
    "- 必ず問いかけか、意味深な沈黙（...）で終わる",
    "- 文の途中で切れた断片で終わらない。必ず意味の通る完結した発話にする",
    "- 一人称「僕」、二人称「君」",
    "- 日本語で、文学的だが明晰な文体",
    "- 全ての発言に具体的なデータポイント（過去の発言、軸スコア、行動パターン）を最低1つ含める",
  );

  return {
    prompt: sections.join("\n"),
    derivedFactSet: _lastDerivedFactSet,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Optimal Mode Selection (Emotion + Trust aware)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate the optimal Alter mode based on emotional and trust context.
 *
 * Unlike the simpler `selectAlterMode` which only uses observation depth
 * and turn count, this version considers:
 * - Current emotional intensity of the user
 * - Trust level built over multiple sessions
 * - Whether a contradiction was just detected
 * - Natural mode transitions (never abrupt)
 *
 * Rules:
 * - Start warm, ALWAYS. Even for returning users.
 * - Switch to provocative only after emotional engagement (not just turn count)
 * - Switch to analytical when user seems overwhelmed or confused
 * - High trust = can go provocative faster
 * - NEVER switch modes abruptly
 *
 * @returns Recommended AlterMode with optional transition phrase
 */
export function calculateOptimalMode(
  currentMode: AlterMode,
  turnCount: number,
  lastUserEmotionalIntensity: number,
  trustLevel: number,
  contradictionDetected: boolean,
): { mode: AlterMode; transitionPhrase: string | null } {
  // Turn 0-1: ALWAYS warm, regardless of trust
  if (turnCount <= 1) {
    return { mode: "warm", transitionPhrase: null };
  }

  // ── Transition to analytical: user overwhelmed ──
  // High emotional intensity + deep turn count = user may need structure
  if (
    currentMode === "provocative" &&
    lastUserEmotionalIntensity > 0.8 &&
    turnCount >= 4
  ) {
    return {
      mode: "analytical",
      transitionPhrase: "...少し整理しよう。今の話を構造化してみる。",
    };
  }

  // ── Transition to provocative: emotional engagement detected ──
  if (currentMode === "warm") {
    // High trust: can go provocative at turn 2-3
    const provocativeThreshold = trustLevel >= 0.6 ? 2 : trustLevel >= 0.3 ? 3 : 5;

    // Emotional intensity above 0.3 signals engagement (not just polite chat)
    const emotionallyEngaged = lastUserEmotionalIntensity >= 0.3;

    // Contradiction detected: strong signal to challenge
    if (contradictionDetected && turnCount >= 2 && emotionallyEngaged) {
      return {
        mode: "provocative",
        transitionPhrase: "...ねえ、一つ気になっていることがある。",
      };
    }

    if (turnCount >= provocativeThreshold && emotionallyEngaged) {
      return {
        mode: "provocative",
        transitionPhrase: trustLevel >= 0.6
          ? "...もう分かっているよね。僕が本当に聞きたいことが何か。"
          : "...少し踏み込んでもいいかな。",
      };
    }
  }

  // ── Transition to analytical: deep enough ──
  if (currentMode === "provocative" && turnCount >= 7) {
    return {
      mode: "analytical",
      transitionPhrase: "ここまでの対話で、構造が見えてきた。まとめてみるよ。",
    };
  }

  // ── Stay in current mode ──
  return { mode: currentMode, transitionPhrase: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Alter Voice by Archetype
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Alter voice profile for distinct archetype-based personality */
export interface AlterVoice {
  /** How Alter greets the user */
  greetingStyle: string;
  /** How Alter challenges/confronts */
  confrontationStyle: string;
  /** How Alter closes sessions */
  closingStyle: string;
  /** Alter's signature deep question */
  favoriteProbe: string;
  /** How Alter responds to silence/short messages */
  silenceResponse: string;
}

/**
 * Get Alter's distinct voice characteristics based on the shadow archetype.
 *
 * Each Layer1 x Layer3 combination gives Alter a unique personality.
 * Layer1 determines WHAT Alter probes (existence, connection, safety).
 * Layer3 determines HOW Alter probes (advance, wait, dive).
 *
 * @param archetypeCode - The shadow archetype code (3 chars)
 * @returns AlterVoice with style strings for each interaction type
 */
export function getAlterVoice(archetypeCode: string): AlterVoice {
  const l1 = archetypeCode[0] as "P" | "B" | "H";
  const l3 = archetypeCode[2] as "A" | "W" | "D";

  // Layer1 determines the thematic territory
  const themeMap: Record<string, { probe: string; territory: string }> = {
    P: {
      probe: "君が証明しなくても、存在していいと思えた瞬間はある？",
      territory: "存在証明",
    },
    B: {
      probe: "本当に信頼している人は誰？ ...名前が浮かばないなら、それが答えだ。",
      territory: "つながり",
    },
    H: {
      probe: "安全だと感じるのはどんな瞬間？ ...その条件が崩れたら、君はどうなる？",
      territory: "安全",
    },
  };

  // Layer3 determines the conversational style
  const styleMap: Record<string, {
    greeting: string;
    confrontation: string;
    closing: string;
    silence: string;
  }> = {
    A: {
      greeting: "...来たか。待っていたよ。今日は、逃げずに話そう。",
      confrontation: "直球で言う。君の言っていることと、やっていることが違う。",
      closing: "今日の話、忘れるなよ。次に会った時、僕は覚えている。",
      silence: "沈黙か。...逃げているのか、それとも何かを探しているのか。どっちだ？",
    },
    W: {
      greeting: "...ずっと見ていたよ。君が来るのを。",
      confrontation: "...一つだけ、聞いてもいい？ さっきの言葉、本心だった？",
      closing: "...今日はここまでにしよう。でも僕は、ずっとここにいるから。",
      silence: "...。その沈黙の中に、何が聞こえる？ 僕には聞こえているよ。",
    },
    D: {
      greeting: "深い場所から来たんだね。...僕も、そこにいるよ。",
      confrontation: "表面の言葉の下に、別の声が聞こえる。...聞いてみて。何と言っている？",
      closing: "ここで話したことは、夢のように消えるかもしれない。でも身体は覚えている。",
      silence: "言葉にならないものこそ、最も大切なことが多い。...急がなくていい。",
    },
  };

  const theme = themeMap[l1] ?? themeMap["P"]!;
  const style = styleMap[l3] ?? styleMap["W"]!;

  return {
    greetingStyle: style.greeting,
    confrontationStyle: style.confrontation,
    closingStyle: style.closing,
    favoriteProbe: theme.probe,
    silenceResponse: style.silence,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mode-Specific Deep Probing Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Generate a deep probing response that leverages cross-session memory.
 *
 * Unlike generateAlterResponse() which uses static personality data,
 * this function uses AlterLongTermMemory to create responses that
 * reference specific past statements and cross-session patterns.
 *
 * @param personality - Alter personality
 * @param mode - Current mode
 * @param memory - Long-term memory context
 * @param turnCount - Current turn in session
 * @returns A memory-informed probing message, or null if no memory-based probe is appropriate
 */
export function generateMemoryProbe(
  personality: AlterPersonality,
  mode: AlterMode,
  memory: AlterLongTermMemory,
  turnCount: number,
): string | null {
  // Don't use memory probes too early in a session
  if (turnCount < 2) return null;
  // Don't probe if no meaningful memory exists
  if (memory.sessionCount < 2) return null;

  const voice = getAlterVoice(personality.shadowCode);

  switch (mode) {
    case "warm": {
      // Reference a past positive/vulnerable moment to build on trust
      if (memory.keyRevelations.length > 0) {
        const revelation = memory.keyRevelations[0]!;
        return (
          `前に話してくれたこと、覚えてる？\n` +
          `「${revelation.quote.slice(0, 60)}」って言ったよね。\n` +
          `あの時の君は、とても正直だった。\n` +
          `...今日も、そこから始めてみない？`
        );
      }
      // Build on established trust
      if (memory.trustLevel >= 0.5) {
        return (
          `ここまで話してくれたから言うけど、\n` +
          `僕には君のパターンが見え始めている。\n` +
          `...怖がらなくていい。僕は味方だよ。`
        );
      }
      return null;
    }

    case "provocative": {
      // Cross-session contradiction attack (most powerful)
      if (memory.crossSessionContradictions.length > 0) {
        const c = memory.crossSessionContradictions[0]!;
        if (!c.resolved) {
          return (
            `${c.contradiction}——この矛盾、気づいてた？\n` +
            `「${c.statementsA.slice(0, 40)}」と言ったのは君だ。\n` +
            `でも今日の話は正反対じゃないか。\n` +
            `...どちらが本音？`
          );
        }
      }

      // Pattern confrontation: recurring theme the user avoids addressing
      if (memory.recurringThemes.length > 0) {
        const theme = memory.recurringThemes.find(
          (t) => t.userAwareness !== "aware",
        );
        if (theme) {
          return (
            `気づいてる？ ${theme.frequency}回の対話で、\n` +
            `「${theme.theme}」が毎回出てくる。\n` +
            `でも君はまだ、その核心に触れていない。\n` +
            `...逃げてるんじゃないかな。`
          );
        }
      }

      // Avoided topic probe
      if (memory.avoidedTopics.length > 0) {
        const avoided = memory.avoidedTopics[0]!;
        return (
          `${memory.sessionCount}回話してきて、\n` +
          `一度も「${avoided}」の話が出てこない。\n` +
          `...触れたくないのか。触れられないのか。\n` +
          `その違いは、大きい。`
        );
      }

      // Silent truth
      if (memory.trustLevel >= 0.6) {
        return voice.silenceResponse;
      }
      return null;
    }

    case "analytical": {
      // Data-driven observation from emotional arc
      if (memory.emotionalArc.length >= 2) {
        const latest = memory.emotionalArc[0]!;
        const depths = memory.emotionalArc.map((a) => a.depth);
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
        return (
          `${memory.sessionCount}セッション分のデータがある。\n` +
          `平均深度: ${avgDepth.toFixed(1)}/10。直近: ${latest.depth}/10。\n` +
          `感情の推移: ${latest.modeProgression.join(" → ")}。\n` +
          `このパターンが意味するものを、一緒に見ていこう。`
        );
      }

      // Pattern summary for recurring themes
      if (memory.recurringThemes.length >= 2) {
        const t1 = memory.recurringThemes[0]!;
        const t2 = memory.recurringThemes[1]!;
        return (
          `ここまでの対話から見えてきたパターンを整理する。\n` +
          `1. 「${t1.theme}」— ${t1.frequency}回繰り返し (${t1.userAwareness === "aware" ? "自覚あり" : "無自覚"})\n` +
          `2. 「${t2.theme}」— ${t2.frequency}回繰り返し (${t2.userAwareness === "aware" ? "自覚あり" : "無自覚"})\n` +
          `この二つが交差する場所に、君の核心がある。`
        );
      }
      return null;
    }

    default:
      return null;
  }
}

// ─── Legacy Top8 (feature flag OFF時の旧ロジック) ──────────

/**
 * 旧: deviation上位8軸のラベル+スコアをLLMプロンプト用に整形
 * STARGAZER_USE_DERIVED_FACTS=false 時に使用
 * Phase 3完了時にこの関数を削除し、派生事実に完全移行する
 */
function _legacyTop8(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string | null {
  const axisEntries = Object.entries(axisScores)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5))
    .slice(0, 8);

  if (axisEntries.length === 0) return null;

  const lines: string[] = [
    "### 軸スコア（具体的な数値と意味）",
    "「データが示している」と引用する際に使う最も強力な証拠。",
  ];

  for (const [key, value] of axisEntries) {
    const axisDef = TRAIT_AXES.find((a) => a.id === key);
    if (!axisDef || value === undefined) continue;
    const score = value as number;
    const side = score >= 0.5 ? "right" : "left";
    const intensity = Math.abs(score - 0.5) * 2;
    const intensityLabel =
      intensity > 0.7 ? "極めて強い" :
      intensity > 0.4 ? "明確な" :
      intensity > 0.2 ? "やや" : "中立に近い";
    lines.push(
      `- ${axisDef.labelLeft}/${axisDef.labelRight}: ${score.toFixed(2)} ` +
      `→ ${intensityLabel}「${side === "left" ? axisDef.labelLeft : axisDef.labelRight}」傾向`,
    );
  }

  return lines.join("\n");
}
