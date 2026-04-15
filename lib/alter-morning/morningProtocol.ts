/**
 * Morning Protocol — オーケストレーター
 *
 * Alter APIから呼ばれ、Morning Protocolのフェーズを管理する。
 * 各フェーズで適切なエンジンを呼び出し、レスポンスを構築する。
 */

import type {
  MorningSession,
  MorningPhase,
  MorningProtocolResponse,
  MorningPlan,
  DayConditions,
  PlanItem,
  ParsedDayIntent,
} from "./types";
import { todayJST } from "./dateUtils";
import {
  checkSufficiency,
  extractDayConditions,
  buildClarifyQuestion,
  buildPlanClarifyQuestion,
  checkPlanIntakeSufficiency,
  checkOutfitSufficiency,
  buildOutfitClarifyQuestion,
  applyOutfitClarifyResponse,
  inferVenueFromPlan,
  inferVenueFromCategory,
} from "./sufficiencyGate";
import type { MissingField } from "./types";
import { parseUserInput, buildDayPlan } from "./planningEngine";
import { parseIntent, intentToPlanItems, buildIntentConfirmMessage } from "./intentParser";
import { applyPlanEdit, addDifferentialItems } from "./planEditor";
import { applyImplicitLocationFill, buildLocationClarifyQuestion } from "./locationClarify";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Morning Protocol 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 強い確信: 直接 Morning Protocol に入る ──
//
// P0-3: 「明日」パターンと日常活動（散歩・買い物等）を追加。
// 「明日は、車で公園に行って散歩する」等が Morning Protocol に入らない問題を修正。
const STRONG_TRIGGERS = [
  /今日.*(やる|する|予定|やりたい|したい|計画|プラン)/,
  /明日.*(やる|する|予定|やりたい|したい|計画|プラン)/,
  /やること.*(決|作|考)/,
  /予定.*(決|作|立|組)/,
  /1日.*(計画|プラン|流れ|過ご)/,
  /タスク|to\s*do/i,
  /朝.*(始|スタート)/,
  /今日は.*[、。]/,       // 「今日は〇〇と△△。」のような列挙
  /明日は.*[、。]/,       // 「明日は〇〇と△△。」のような列挙
  /今日.*\d{1,2}時/,     // 「今日14時に歯医者」— 時刻を含むプラン
  /明日.*\d{1,2}時/,     // 「明日14時に歯医者」— 時刻を含むプラン
  /今日は.{2,}と.{2,}/,  // 「今日は資料作りと歯医者」— と区切りの列挙
  /明日は.{2,}と.{2,}/,  // 「明日は資料作りと歯医者」
  /今日は.{6,}/,          // 「今日は資料作りに行く」— 今日は+具体的な内容
  /明日は?.{2,}(で|にて|に).{2,}/, // 「明日マックで仕事する」— 明日+場所+活動
  // ── 行動宣言パターン（「今日は」なしでも活動内容が明確）──
  /外(に|へ)?(行|出|でかけ).{4,}/, // 「外に行くよ。マックでコード修正」— 外出+活動
  /家(に|で)?い[るた].{4,}/,       // 「家にいるよ。掃除と洗濯」— 在宅+活動
  /.+(で|にて).*(修正|勉強|作業|仕事|コード|開発|読書|執筆|作り|散歩|買い物|ランニング|運動|掃除|洗濯|料理)/, // 場所+具体的活動（散歩等の日常活動を追加）
  /\d{1,2}時に.{2,}/,             // 「14時に歯医者」— 今日なしでも時刻+予定
  /.{2,}[とや、].{2,}[とや、].{2,}/, // 「掃除と洗濯、あとはNetflix」— 3つ以上の列挙
  // ── 移動手段 + 場所パターン（「車で公園に行って散歩する」）──
  /(車|電車|バス|自転車|チャリ|タクシー|徒歩)で.{2,}(行|出|向か)/, // 移動手段+行動
  /.+(に|へ)(行って|いって|寄って).{2,}(する|やる)/, // 「公園に行って散歩する」— 訪問+活動
];

// ── Soft Bridge 確認への肯定応答（「今日のプラン立てる？」→「うん」等） ──
const SOFT_BRIDGE_CONFIRM = [
  /^(うん|はい|お願い|やる|やって|いいよ|いいね|そうする|そうしよう|立てて|組んで|yes|ok)/i,
  /^(プラン|予定).*(立て|作|決|組)/,
];

// ── 弱い確信: 確認を挟んでから Morning Protocol ──
/** ファッション/コーデ系キーワード（Morning Protocol 誤発火防止用） */
const FASHION_KEYWORDS = /アウタ|コーデ|服|着る|ファッション|スタイル|コーディネート|トップス|ボトムス|靴|アクセサリ/;
/** P1.8-fix: Web検索・比較判断の明示的要求（PE が処理すべき — Morning Protocol 除外） */
const SEARCH_INTENT_KEYWORDS = /調べ(て|てみて|てきて)|ネットで|WEBで|webで|検索して|探して(きて|みて)|どっち.*(合う|いい|向い)|比較して/;

const SOFT_TRIGGERS = [
  /今日.*(どうし|何す|何や|何し)/,     // 「今日どうしよう」「今日何する」— プラン系のみ
  /明日.*(どうし|何す|何や|何し)/,     // 「明日どうしよう」「明日何する」
  /このあと/,                         // 「このあと」— 行動文脈だが不確定
  /〜しようかな|しようかな/,           // 意図の萌芽
  /買い物|用事|出かけ/,               // 行動ワードだが判断の相談かもしれない
  /外(に|へ)?(行|出)/,               // 「外に行く」だけ（活動なし）→ 確認
  /家(に|で)?い[るた]よ?$/,           // 「家にいるよ」だけ → 確認
  /明日は?[、。]?\s*$/,              // 「明日は」だけ → 確認
];

export type MorningQueryConfidence = "strong" | "soft" | "none";

/**
 * ユーザーのメッセージが Morning Protocol 対象かを3段階で判定する。
 *
 * - "strong": 直接 Morning Protocol に入る
 * - "soft": 「今日のプラン立てる？」と確認を挟む
 * - "none": Morning Protocol 対象外
 *
 * 既にセッションが進行中の場合は常に "strong"。
 */
export function detectMorningIntent(
  message: string,
  existingSession?: MorningSession
): MorningQueryConfidence {
  // セッション進行中なら常にstrong
  if (existingSession && !["completed", "skipped"].includes(existingSession.phase)) {
    return "strong";
  }

  // ファッション/コーデ系の質問は Morning Protocol 対象外
  if (FASHION_KEYWORDS.test(message)) return "none";

  // P1.8-fix: Web検索の明示的要求・比較判断要求は Morning Protocol 対象外
  // 「調べて」「ネットで」「WEBで」「どっちが合う」等は PE が処理すべき
  if (SEARCH_INTENT_KEYWORDS.test(message)) return "none";

  if (STRONG_TRIGGERS.some((pattern) => pattern.test(message))) return "strong";
  if (SOFT_TRIGGERS.some((pattern) => pattern.test(message))) return "soft";
  return "none";
}

/**
 * 後方互換: boolean を返す旧API（strong or soft のいずれかでtrue）
 */
export function isMorningProtocolQuery(
  message: string,
  existingSession?: MorningSession
): boolean {
  return detectMorningIntent(message, existingSession) !== "none";
}

/**
 * Soft Bridge 確認メッセージを返す。
 */
export function buildSoftBridgeMessage(): string {
  const variants = [
    "今日のプラン、一緒に立てる？",
    "このまま今日の流れも組んでみる？",
    "予定の整理までやる？",
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Soft Bridge 確認への肯定応答を検出する。
 */
export function isSoftBridgeConfirm(message: string): boolean {
  return SOFT_BRIDGE_CONFIRM.some((p) => p.test(message.trim()));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セッション管理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function createSession(): MorningSession {
  return {
    sessionId: `ms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    phase: "greeting",
    rawInputs: [],
    personalizeHints: [],
    startedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン処理
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Morning Protocolのメインエントリーポイント。
 * セッションの現在フェーズに応じて処理を分岐する。
 */
export function processMorningMessage(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  session.rawInputs.push(message);

  switch (session.phase) {
    case "greeting":
      return handleGreetingPhase(message, session);

    case "collecting":
      return handleCollectingPhase(message, session);

    case "clarifying":
      return handleClarifyingPhase(message, session);

    case "plan_presented":
      return handlePlanPresentedPhase(message, session);

    case "plan_confirmed":
      return handlePlanConfirmedPhase(message, session);

    case "outfit_offered":
      return handleOutfitOfferedPhase(message, session);

    case "outfit_clarifying":
      return handleOutfitClarifyingPhase(message, session);

    default:
      // 完了済みのセッション → 通常フローへ
      return {
        session: { ...session, phase: "completed" },
        response: {
          phase: "completed",
          message: "",
        },
      };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// フェーズ別ハンドラー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function handleGreetingPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // ユーザーの最初の入力を処理
  // メッセージ自体にタスク情報が含まれている場合はそのまま処理
  const hasContent = message.length > 10 || /[、。\n]/.test(message);

  if (hasContent) {
    // 直接collecting → intent parse & sufficiency checkへ
    return handleCollectingPhase(message, session);
  }

  // 短い挨拶の場合は collecting フェーズへ
  return {
    session: { ...session, phase: "collecting" },
    response: {
      phase: "collecting",
      message: "おはよう。今日はどんな1日にする？\nやりたいこと、決まってる予定、なんでも教えて",
    },
  };
}

function handleCollectingPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // ── Step 1: 新しい構造化パーサーでインテントを抽出 ──
  const intent = parseIntent(message);

  // 既存のインテントとマージ
  const mergedIntent = mergeIntents(session.parsedIntent, intent);

  // 旧パーサーも補助的に実行（語彙テーブルに未登録のものを拾う）
  const { items: legacyItems, personalizeHints } = parseUserInput(message);
  session.personalizeHints.push(...personalizeHints);

  // Intent → PlanItems 変換
  const intentItems = intentToPlanItems(mergedIntent);

  // 新パーサーが有効な結果を出した場合は旧パーサーの結果を混ぜない
  // （旧パーサーは生テキスト分割のため「外に行くよ」等がタスク化してしまう）
  let allItems: PlanItem[];
  if (intentItems.length > 0) {
    allItems = intentItems;
  } else {
    allItems = legacyItems;
  }

  // テキストベースの基礎充足判定
  const rawSufficiency = checkSufficiency(message, allItems);

  if (rawSufficiency.level === "no_plan" && mergedIntent.primaryTasks.length === 0 && mergedIntent.fixedEvents.length === 0) {
    return {
      session: { ...session, phase: "skipped" },
      response: { phase: "skipped", message: "" },
    };
  }

  // 条件を抽出
  const dayConditions = extractDayConditions(session.rawInputs.join(" "));

  // ── Plan Intake Gate ──
  //
  // 3段構成:
  //   1. Plan Intake Gate（ここ） — 5W1H 充足判定
  //      What → primaryTasks（パーサーが抽出済み）
  //      When → fixedEvents.startTime / startWindow（パーサーが抽出済み）
  //      Where → mainLocation / locationSequence（パーサーが抽出済み）
  //      How → transport（移動手段 — 外出時は移動時間計算に必須）
  //      Who → withWhom（社会的活動時は必須 — 「Aさんとミーティング」等）
  //      Why → flowContext から暗黙的に取得
  //      venue → placeTable から自動推定（質問しない）
  //      mood → プラン成立の必須ではない → Outfit Gate で扱う
  //
  //   2. Tour Builder（buildDayPlan + insertTravelItems）
  //      Intake 完了後にツアー構造へ展開
  //
  //   3. Outfit Gate（checkOutfitSufficiency）
  //      プラン確定後、コーデ提案前に mood 等を聞く

  const intake = checkPlanIntakeSufficiency(
    rawSufficiency,
    mergedIntent,
    allItems,
    dayConditions,
    session.rawInputs.join(" ")
  );

  // venue 自動推定結果を DayConditions に反映
  if (intake.autoInferred.venue && !dayConditions.venue) {
    dayConditions.venue = intake.autoInferred.venue as DayConditions["venue"];
  }
  // intent の transport → DayConditions に引き継ぎ（未設定の場合）
  if (mergedIntent.flowContext.transport && !dayConditions.mainTransport) {
    dayConditions.mainTransport = mergedIntent.flowContext.transport;
  }

  // ── Step 2: Plan Intake Gate の結果で分岐 ──

  if (intake.level === "sufficient" || intake.level === "partial") {
    // ── 場所 clarify: 暗黙補完 + 質問候補の抽出 ──
    const { updatedItems: locFilledItems, pendingClarify } = applyImplicitLocationFill(allItems);

    // 5W1H の必須項目が揃っている → Tour Builder → プラン提示
    const plan = buildDayPlan(locFilledItems, dayConditions as DayConditions, undefined, {
      goOut: intake.goingOut,
      endpointAnchor: mergedIntent.endpointAnchor,
      returnDestination: mergedIntent.returnDestination,
    });
    plan.mainLocation = mergedIntent.mainLocation;
    plan.flowContext = mergedIntent.flowContext;
    plan.parsedIntent = mergedIntent;

    // 場所の clarify が必要なアイテムがある → clarify フェーズに回す
    if (pendingClarify.length > 0) {
      const locQuestion = buildLocationClarifyQuestion(pendingClarify);
      const confirmMsg = buildIntentConfirmMessage(mergedIntent);
      return {
        session: {
          ...session,
          phase: "clarifying",
          plan,
          parsedIntent: mergedIntent,
          sufficiency: { ...rawSufficiency, level: "insufficient", missingFields: [...intake.missingFields, "location_area"] },
        },
        response: {
          phase: "clarifying",
          message: `${confirmMsg}\n\n${locQuestion}`,
          clarifyQuestion: locQuestion ?? undefined,
          plan,
        },
      };
    }

    const confirmMsg = buildIntentConfirmMessage(mergedIntent);

    return {
      session: {
        ...session,
        phase: "plan_presented",
        plan,
        parsedIntent: mergedIntent,
        sufficiency: { ...rawSufficiency, level: intake.level, missingFields: intake.missingFields },
      },
      response: {
        phase: "plan_presented",
        message: confirmMsg,
        plan,
        personalizeHints: session.personalizeHints,
      },
    };
  }

  if (intake.level === "insufficient" && intake.missingFields.length > 0) {
    // プラン成立に必要な情報が不足 → 不足分を 1 問に束ねて聞く
    const plan: MorningPlan = {
      date: mergedIntent.targetDate ?? todayJST(),
      items: allItems,
      dayConditions: dayConditions as DayConditions,
      createdAt: new Date().toISOString(),
      confirmed: false,
      mainLocation: mergedIntent.mainLocation,
      flowContext: mergedIntent.flowContext,
      parsedIntent: mergedIntent,
    };

    const clarifyQuestion = buildPlanClarifyQuestion(intake.missingFields);
    const confirmMsg = buildIntentConfirmMessage(mergedIntent);

    return {
      session: {
        ...session,
        phase: "clarifying",
        plan,
        parsedIntent: mergedIntent,
        sufficiency: { ...rawSufficiency, level: intake.level, missingFields: intake.missingFields },
      },
      response: {
        phase: "clarifying",
        message: `${confirmMsg}\n\n${clarifyQuestion}`,
        clarifyQuestion,
        plan,
      },
    };
  }

  // アイテムなし → 収集を続ける
  return {
    session: { ...session, phase: "collecting", parsedIntent: mergedIntent },
    response: {
      phase: "collecting",
      message: "今日はどんなことする予定？\nやりたいこと、決まってる予定、なんでも教えて",
    },
  };
}

function handleClarifyingPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // clarify回答から条件を追加抽出
  const newConditions = extractDayConditions(message);
  const existingConditions = session.plan?.dayConditions ?? {};
  const mergedConditions: DayConditions = {
    ...existingConditions,
    ...newConditions,
  };

  // 追加のインテントを解析
  const newIntent = parseIntent(message);
  const mergedIntent = mergeIntents(session.parsedIntent, newIntent);

  // 追加のアイテムがあるかチェック
  const { items: additionalItems, personalizeHints } = parseUserInput(message);
  const intentItems = intentToPlanItems(mergedIntent);
  session.personalizeHints.push(...personalizeHints);

  // intentItems（構造化パーサー由来）を優先。旧パーサーは intentItems が空の時のみ使用
  let finalItems: PlanItem[];
  if (intentItems.length > 0) {
    finalItems = intentItems;
  } else if (additionalItems.length > 0) {
    // 旧パーサーの新規アイテム + 既存プランアイテム
    const existingTexts = new Set((session.plan?.items ?? []).map(i => i.text));
    const extraItems = additionalItems.filter(i => !existingTexts.has(i.text));
    finalItems = [...(session.plan?.items ?? []), ...extraItems];
  } else {
    finalItems = session.plan?.items ?? [];
  }

  // プラン生成 → 即提示（clarify後は必ずプラン提示）
  // goOut 判定: intent の flowContext または場所情報から推定（home カテゴリを除外）
  const goingOutClarify =
    mergedIntent.flowContext.goOut === true ||
    (mergedIntent.locationSequence ?? []).some(ls => ls.category !== "home") ||
    (mergedIntent.mainLocation != null && mergedIntent.mainLocation.category !== "home");
  const plan = buildDayPlan(finalItems, mergedConditions, undefined, {
    goOut: goingOutClarify,
    endpointAnchor: mergedIntent.endpointAnchor,
    returnDestination: mergedIntent.returnDestination,
  });
  plan.mainLocation = mergedIntent.mainLocation ?? session.plan?.mainLocation;
  plan.flowContext = mergedIntent.flowContext;
  plan.parsedIntent = mergedIntent;

  const confirmMsg = buildIntentConfirmMessage(mergedIntent);

  return {
    session: {
      ...session,
      phase: "plan_presented",
      plan,
      parsedIntent: mergedIntent,
    },
    response: {
      phase: "plan_presented",
      message: confirmMsg || "こんな感じで組んでみたよ。長さ変えたいものある？",
      plan,
      personalizeHints: session.personalizeHints,
    },
  };
}

function handlePlanPresentedPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  const trimMsg = message.trim();
  const isConfirm = /^(これ|ok|おk|いい|いく|決定|確定|大丈夫|了解|りょ)/i.test(trimMsg);

  if (isConfirm) {
    const confirmedPlan = session.plan
      ? { ...session.plan, confirmed: true }
      : undefined;
    return {
      session: {
        ...session,
        phase: "outfit_offered",
        plan: confirmedPlan,
      },
      response: {
        phase: "outfit_offered",
        message: "今日のプラン決まったね。コーデも見る？",
        plan: confirmedPlan,
      },
    };
  }

  // ── 変更リクエストの検出（「変更する」ボタン等） ──
  // パースせずに直接編集モードへ遷移する。
  // 旧挙動: 「変更する」をパースして新タスクとして追加してしまっていた。
  const isEditRequest = /^(変更|変えたい|変える|修正|直す|やめ|取り消|キャンセル|やり直|編集)/i.test(trimMsg);
  if (isEditRequest) {
    return {
      session,
      response: {
        phase: "plan_presented",
        message: "どこを変えたい？\n・タスクの追加や削除\n・時間の長さ\n・順番の入れ替え\nなんでも言ってね。",
        plan: session.plan,
      },
    };
  }

  // 変更リクエスト → planEditor で編集を試行
  if (session.plan) {
    const editResult = applyPlanEdit(message, session.plan);

    if (editResult.applied) {
      // 編集が成功 → プランを再構築
      const goOutForRebuild =
        session.plan.flowContext?.goOut === true ||
        (session.plan.mainLocation != null && session.plan.mainLocation.category !== "home");
      const plan = buildDayPlan(editResult.items, session.plan.dayConditions, undefined, { goOut: goOutForRebuild });
      plan.mainLocation = session.plan.mainLocation;
      plan.flowContext = session.plan.flowContext;
      plan.parsedIntent = session.parsedIntent;

      return {
        session: { ...session, plan, parsedIntent: plan.parsedIntent },
        response: {
          phase: "plan_presented",
          message: editResult.message,
          plan,
        },
      };
    }

    // planEditor で編集できなかった場合 → 差分追加（全量再パース禁止）
    const turnIndex = session.rawInputs.length - 1; // 現在のターン番号
    const diffResult = addDifferentialItems(message, session.plan, turnIndex);

    if (diffResult.applied) {
      // 新しいアイテムの intent 情報もマージ
      const newIntent = parseIntent(message);
      const mergedFlow = { ...session.plan.flowContext, ...newIntent.flowContext };
      const goOutForRebuild =
        mergedFlow?.goOut === true ||
        (newIntent.mainLocation != null && newIntent.mainLocation.category !== "home") ||
        (session.plan.mainLocation != null && session.plan.mainLocation.category !== "home");
      const plan = buildDayPlan(diffResult.items, session.plan.dayConditions, undefined, {
        goOut: goOutForRebuild,
        endpointAnchor: newIntent.endpointAnchor ?? session.parsedIntent?.endpointAnchor,
        returnDestination: newIntent.returnDestination ?? session.parsedIntent?.returnDestination,
      });
      plan.mainLocation = newIntent.mainLocation ?? session.plan.mainLocation;
      plan.flowContext = mergedFlow;
      plan.parsedIntent = mergeIntents(session.parsedIntent, newIntent);

      return {
        session: { ...session, plan, parsedIntent: plan.parsedIntent },
        response: {
          phase: "plan_presented",
          message: diffResult.message,
          plan,
        },
      };
    }
  }

  // 変更の意図はあるが具体的でない場合
  return {
    session,
    response: {
      phase: "plan_presented",
      message: "どこを変えたい？\n・タスクの追加や削除\n・開始時間の変更\n・時間の長さ\n・順番の入れ替え\nなんでも言ってね。",
      plan: session.plan,
    },
  };
}

function handlePlanConfirmedPhase(
  _message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // プラン確定後 → コーデ提案へ
  return {
    session: { ...session, phase: "outfit_offered" },
    response: {
      phase: "outfit_offered",
      message: "コーデも見る？",
      plan: session.plan,
    },
  };
}

function handleOutfitOfferedPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  const wantsOutfit = /^(見|みる|見る|うん|はい|お願い|yes)/i.test(message.trim());

  if (wantsOutfit) {
    // ── Outfit Sufficiency Gate ──
    // コーデ提案に必要な情報が揃っているか確認。
    // venue は placeTable から自動推定する。
    // transport / mood / withWhom は不足分だけ 1 問で聞く。
    if (session.plan) {
      const outfitCheck = checkOutfitSufficiency(session.plan, session.rawInputs);

      // venue 自動推定を DayConditions に反映
      if (outfitCheck.inferredVenue && !session.plan.dayConditions.venue) {
        session.plan.dayConditions = {
          ...session.plan.dayConditions,
          venue: outfitCheck.inferredVenue as DayConditions["venue"],
        };
      }

      if (!outfitCheck.sufficient) {
        // 不足あり → 1 問に束ねて聞く
        const clarifyQ = buildOutfitClarifyQuestion(outfitCheck.missingFields);
        return {
          session: { ...session, phase: "outfit_clarifying" },
          response: {
            phase: "outfit_clarifying",
            message: clarifyQ,
            plan: session.plan,
          },
        };
      }
    }

    // 情報十分 → 即コーデ提示
    return {
      session: { ...session, phase: "outfit_presented" },
      response: {
        phase: "outfit_presented",
        message: "今日のプランに合わせたコーデ、チェックしてみて",
        plan: session.plan,
      },
    };
  }

  // コーデ不要 → 完了
  return {
    session: { ...session, phase: "completed" },
    response: {
      phase: "completed",
      message: "了解。今日もいい1日にしよう",
      plan: session.plan,
    },
  };
}

function handleOutfitClarifyingPhase(
  message: string,
  session: MorningSession
): { session: MorningSession; response: MorningProtocolResponse } {
  // ユーザーの回答から DayConditions を更新
  if (session.plan) {
    session.plan.dayConditions = applyOutfitClarifyResponse(
      message,
      session.plan.dayConditions
    );

    // venue が未設定なら自動推定を再適用
    if (!session.plan.dayConditions.venue) {
      const inferred = inferVenueFromPlan(session.plan);
      if (inferred) {
        session.plan.dayConditions = {
          ...session.plan.dayConditions,
          venue: inferred as DayConditions["venue"],
        };
      }
    }
  }

  // 回答を受けたらコーデ提示へ（追加質問はしない — 1 問ルール）
  return {
    session: { ...session, phase: "outfit_presented" },
    response: {
      phase: "outfit_presented",
      message: "ありがとう。今日のプランに合わせたコーデ、チェックしてみて",
      plan: session.plan,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intent マージ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function mergeIntents(
  existing: ParsedDayIntent | undefined,
  incoming: ParsedDayIntent
): ParsedDayIntent {
  if (!existing) return incoming;

  // 重複タスクを除外してマージ
  const existingTaskTexts = new Set(existing.primaryTasks.map(t => t.text));
  const newTasks = incoming.primaryTasks.filter(t => !existingTaskTexts.has(t.text));

  const existingEventTitles = new Set(existing.fixedEvents.map(e => e.title));
  const newEvents = incoming.fixedEvents.filter(e => !existingEventTitles.has(e.title));

  // locationSequence マージ（重複ラベル除外）
  const existingLocLabels = new Set((existing.locationSequence ?? []).map(ls => ls.label));
  const newLocs = (incoming.locationSequence ?? []).filter(ls => !existingLocLabels.has(ls.label));
  const mergedLocs = [...(existing.locationSequence ?? []), ...newLocs];

  return {
    primaryTasks: [...existing.primaryTasks, ...newTasks],
    fixedEvents: [...existing.fixedEvents, ...newEvents],
    flowContext: {
      ...existing.flowContext,
      ...incoming.flowContext,
    },
    mainLocation: incoming.mainLocation ?? existing.mainLocation,
    taskLocations: [
      ...(existing.taskLocations ?? []),
      ...(incoming.taskLocations ?? []),
    ],
    locationSequence: mergedLocs.length > 0 ? mergedLocs : undefined,
    endpointAnchor: incoming.endpointAnchor ?? existing.endpointAnchor,
    returnDestination: incoming.returnDestination ?? existing.returnDestination,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メッセージ構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildStructuredSummary(items: PlanItem[]): string {
  const fixed = items.filter((i) => i.kind === "fixed");
  const todos = items.filter((i) => i.kind === "todo");

  const parts: string[] = ["整理するとこんな感じかな。"];

  if (fixed.length > 0) {
    parts.push("\n━━ 予定 ━━");
    for (const item of fixed) {
      parts.push(`・${item.startTime ?? ""} ${item.text}`);
    }
  }

  if (todos.length > 0) {
    parts.push("\n━━ やること ━━");
    for (const item of todos) {
      parts.push(`・${item.text}`);
    }
  }

  return parts.join("\n");
}

function buildPlanMessage(plan: MorningPlan, hints: string[]): string {
  const parts: string[] = [];

  if (hints.length > 0) {
    // パーソナライズヒントを1つだけ表示（多すぎると冗長）
    parts.push(hints[0]);
    parts.push("");
  }

  parts.push("こんな感じで組んでみたよ。長さ変えたいものある？");

  return parts.join("\n");
}
