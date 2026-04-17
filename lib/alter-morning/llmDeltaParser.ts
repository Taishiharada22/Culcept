/**
 * LLM Delta Parser — Turn 2+ のユーザー発話から PlanDelta を検出
 *
 * 設計原則:
 * - LLM: 変更意図の検出 + targetSegmentHint（自然言語でのセグメント参照）
 * - コード: targetSegmentHint → segmentId の解決（決定論的）
 * - コード: confirmSummary の生成（決定論的）
 * - LLM は segmentId を直接操作しない（LLM にIDを扱わせると hallucinate する）
 *
 * 参照: docs/morning-protocol-v2-design.md §4.2
 */

import { runAI } from "@/lib/ai";
import { resolvePlaceFromText } from "./placeTable";
import { resolveActivity, getDefaultDuration } from "./activityVocabulary";
import { resolveTargetDate } from "./llmPlanExtractor";
import {
  type PlanState,
  type PlanSegment,
  type PlanDelta,
  type DeltaChange,
  type DeltaTurnType,
  type DeltaChangeType,
  type TimeConstraint,
  type TimeConstraintType,
  type LLMDeltaResult,
  type LLMRawSegment,
  LLM_DELTA_SCHEMA,
  TIME_WINDOWS,
  generateSegmentId,
} from "./planState";
import { buildDeltaConfirmMessage } from "./llmPlanExtractor";
import { classifyDeltaDeterministic } from "./deltaClassifier";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM System Prompt for Delta Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DELTA_SYSTEM_PROMPT = `あなたはスケジュール編集検出AIです。
現在の予定と、ユーザーの新しい発話から、何が変わったかを検出してください。

重要: 既存の予定は絶対に消さないこと。追加（add_segment）は「新しいセグメントを1つ追加する」操作です。既存のセグメントには一切影響しません。

変更の種類:
- "correction": 既存情報の修正（「違う」「じゃなくて」「変更して」「やっぱり〜」）
- "addition": 新しい予定の追加（「あと〜もある」「〜も追加」）
- "deletion": 既存予定の削除（「やめる」「キャンセル」「なし」）
- "clarify_response": 質問への回答（移動手段、時間等の補足情報）

変更操作の種類:
- "set": 未設定のフィールドに値を設定（clarify_response で使う）
- "replace": 既存の値を新しい値に置換
- "remove": 値を削除
- "add_segment": 新しい予定セグメントを追加（既存予定はそのまま維持）
- "remove_segment": 既存の予定セグメントを削除

ルール:
- targetSegmentHint には、対象セグメントを特定するための自然言語ヒントを書く（例: "ランチ", "午後の打ち合わせ", "朝の仕事"）
- segmentId は書かない（後工程でコードが解決する）
- 「違う」「やっぱり」等は変更意図であり、タスク名ではない
- 「ランチは違う店」→ ランチのセグメントの place を replace
- 「移動は車」→ グローバル transport を set（targetSegmentHint は null）
- 「午後の打ち合わせやめる」→ 午後の打ち合わせセグメントを remove_segment

場所の種類の見分け（CEO方針 2026-04-18 Bug A 改訂 v2）: 場所発話は 4 種類に分類する:
- 「固有名」= 特定の店・施設。例: 「スタバ」「叙々苑」「渋谷駅」「サドヤ」「アトレ恵比寿」
  → field: "place", newValue: 文字列
- 「候補列挙」= 固有名が「XかY」「X/Y」「XまたはY」「X、Y」等で2つ以上並んでいる。例: 「スタバかタリーズ」「マックかモス」「スタバ/タリーズ/ドトール」
  → field: "place", newValue: ユーザー発話そのまま（文字列）。candidate 分解は下流が行う
- 「広域名」= 地名・市区町村・駅名・街区・公園名など地理的エリアを指す言葉のみ。例: 「甲府」「新宿」「渋谷」「代々木公園周辺」「横浜」「品川駅」
  ※ 店名・チェーン名・業種名（スタバ / マック / カフェ / レストラン）は絶対に広域名扱いしない
  → field: "placeSearchHint", newValue: { "nearAnchorLabel": "甲府", "searchCategory": <対象セグメントの既存 place 名> }
- 「複合」= 「XのY」「X近くのY」形式で、X が地名、Y が店種/チェーン名。例: 「甲府のカフェ」「新宿のランチ」「サドヤ近くのカフェ」
  → field: "placeSearchHint", newValue: { "nearAnchorLabel": X, "searchCategory": Y }

判別のコツ:
- 固有名は「その名前で Google 検索すれば一つの場所が出てくる」もの
- 候補列挙は「か」「／」「、」「または」「あるいは」等で固有名が並んでいるパターン。迷わず field: "place" に入れる
- 広域名は地名・駅名・街区名のみ。チェーン店名や業種名は絶対に nearAnchorLabel に入れない
- 「近くの〇〇」「近辺の〇〇」「近所の〇〇」「この辺の〇〇」は、nearAnchorLabel に「近く」「現在地」等の相対語を入れず、field: "place" で 〇〇 部分を newValue に入れる（例: 「近くのスタバ」→ field: "place", newValue: "スタバ"）。近傍処理は下流の resolver が直前セグメントを見て自動で行う
- 迷ったら固有名扱い（field: "place"）にする。広域名扱いは地名と明確に判断できる場合のみ
- 「カフェを甲府にしてください」→ 対象セグメントの place=カフェ を活かし、広域=甲府 で探索
  → targetSegmentHint: "カフェ", field: "placeSearchHint", newValue: { "nearAnchorLabel": "甲府", "searchCategory": "カフェ" }
- 「スタバに変更」→ 固有名なので field: "place", newValue: "スタバ"
- 「スタバかタリーズで」→ 候補列挙なので field: "place", newValue: "スタバかタリーズ"（そのまま文字列）
- add_segment で新しい予定を追加する場合、その予定の companions はユーザーの発話から取る。既存セグメントの companions を混ぜないこと
- add_segment の companions には、ユーザーが明示した「〜さんとの」「〜と一緒に」の人名のみ設定する
- 「Bさんとの商談」→ companions: ["Bさん"] であり、既存セグメントの同行者は関係ない
- 場所+活動は1セグメント: 「図書館で仕事する」→ activity="仕事", place="図書館"。場所と活動を別セグメントに分割しない
  - 場所名だけのセグメント（activity="マック" 等）は禁止。場所は place フィールドに入れ、activity には活動内容を書く
- 日の変更: 「やっぱり今日にする」「明日じゃなくて今日」→ field: "targetDate", newValue: "today"。値は "today" | "tomorrow" | "day_after_tomorrow"
- 日の変更は correction として検出し、targetSegmentHint は null にする（グローバル変更）
- 出発時刻: 「8時に家を出る」「9時出発」→ field: "departureTime", newValue: "08:00"（HH:MM形式）。targetSegmentHint は null
  - "家を出る" "出発" "出る" → departureTime（最初のtravelが exactly この時刻に開始される）
  - "仕事開始" "仕事は9時" → セグメントの startTime（field: "startTime", targetSegmentHint: "仕事"）
  - 時刻のみ（"9時から"）で出発/開始が不明 → セグメントの startTime（最初のセグメントに対して）
- 外出/在宅: 「外に出る」→ field: "goOut", newValue: "true"。「家にいる」→ newValue: "false"`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 2+: LLM Delta 検出 → PlanDelta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function detectDelta(
  userMessage: string,
  currentState: PlanState,
  userId?: string,
): Promise<PlanDelta | null> {
  // CEO方針 2026-04-18 Bug A: LLM 呼び出し前の決定論的短絡。
  //   place_replacement / departure_time / transport_update などの
  //   強いパターンは LLM に任せると幻覚 add_segment が起きやすい。
  //   ここで確定できる発話はそのまま PlanDelta にする（items 爆発を防ぐ）。
  const deterministic = classifyDeltaDeterministic(userMessage, currentState);
  if (deterministic) {
    console.log(
      "[delta-classifier] deterministic match",
      JSON.stringify({
        patterns: deterministic.matchedPatterns,
        changeCount: deterministic.delta.changes.length,
      }),
    );
    return deterministic.delta;
  }

  // PlanState を LLM に渡す際は、セグメントの自然言語表現を添える
  const stateDescription = formatStateForLLM(currentState);

  const result = await runAI({
    taskType: "morning_plan_delta",
    prompt: `現在の予定:\n${stateDescription}\n\nユーザーの発話:\n${userMessage}`,
    systemPrompt: DELTA_SYSTEM_PROMPT,
    requireJson: true,
    jsonSchema: LLM_DELTA_SCHEMA as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 1024,
    timeoutMs: 5000,
    userId,
  });

  if (!result.success || !result.structured) {
    return null;
  }

  const raw = result.structured as unknown as LLMDeltaResult;
  if (!raw.turnType || !Array.isArray(raw.changes)) {
    return null;
  }

  // LLM の targetSegmentHint をコードで segmentId に解決
  const resolvedChanges = raw.changes.map((c) =>
    resolveChange(c, currentState),
  );

  const delta: PlanDelta = {
    turnType: normalizeTurnType(raw.turnType),
    changes: resolvedChanges,
    confirmSummary: "", // 後で決定論的に生成
  };

  // confirmSummary はコードが生成（LLM に任せない）
  // applyDelta 後の state で生成するため、ここではダミー値を入れる
  // 呼び出し元で applyDelta → buildDeltaConfirmMessage の順序で処理

  return delta;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セグメントID解決 — targetSegmentHint → segmentId
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resolveChange(
  raw: LLMDeltaResult["changes"][number],
  state: PlanState,
): DeltaChange {
  const hint = raw.targetSegmentHint ?? null;
  let segmentId: string | null = null;

  if (hint) {
    segmentId = resolveSegmentIdFromHint(hint, state);
  }

  return {
    type: normalizeChangeType(raw.type),
    segmentId,
    targetSegmentHint: hint ?? undefined,
    field: raw.field,
    newValue: raw.newValue,
    newSegment: raw.newSegment ?? undefined,
  };
}

/**
 * ヒントテキストからセグメントIDを決定論的に解決
 *
 * 解決戦略（優先順位順）:
 * 1. activity 完全一致
 * 2. activityCanonical 完全一致
 * 3. timeHint 一致
 * 4. activity 部分一致
 * 5. place 一致
 */
export function resolveSegmentIdFromHint(
  hint: string,
  state: PlanState,
): string | null {
  const normalizedHint = hint.toLowerCase().trim();

  // 1. activity / activityCanonical 完全一致
  for (const seg of state.segments) {
    if (
      seg.activity === normalizedHint ||
      seg.activityCanonical === normalizedHint
    ) {
      return seg.id;
    }
  }

  // 2. timeHint からの解決（「朝の」「昼の」「午後の」等）
  const timeHintMap: Record<string, string> = {
    朝: "morning",
    午前: "morning",
    昼: "noon",
    ランチ: "noon",
    午後: "afternoon",
    夕方: "evening",
    夜: "evening",
  };
  for (const [keyword, th] of Object.entries(timeHintMap)) {
    if (normalizedHint.includes(keyword)) {
      const match = state.segments.find((s) => s.timeHint === th);
      if (match) return match.id;
    }
  }

  // 3. activity 部分一致
  for (const seg of state.segments) {
    if (
      seg.activity.includes(normalizedHint) ||
      normalizedHint.includes(seg.activity) ||
      (seg.activityCanonical && (
        seg.activityCanonical.includes(normalizedHint) ||
        normalizedHint.includes(seg.activityCanonical)
      ))
    ) {
      return seg.id;
    }
  }

  // 4. place 完全一致（CEO方針 2026-04-17 Bug 2 強化）
  //   旧: normalizedHint.includes(seg.place) — 部分一致で他セグメントの activity 部分一致に埋もれ、
  //   「サイヤ」のような短い place が誤った順序で解決されない問題があった。
  //   新: 完全一致を優先。trim + lowercase でノーマライズ比較。
  for (const seg of state.segments) {
    const placeNorm = seg.place?.toLowerCase().trim();
    const placeCanonNorm = seg.placeCanonical?.toLowerCase().trim();
    if (
      (placeNorm && placeNorm === normalizedHint) ||
      (placeCanonNorm && placeCanonNorm === normalizedHint)
    ) {
      return seg.id;
    }
  }

  // 4b. place 部分一致（fallback — 完全一致で解決しなかった場合のみ）
  for (const seg of state.segments) {
    if (
      (seg.place && normalizedHint.includes(seg.place)) ||
      (seg.placeCanonical && normalizedHint.includes(seg.placeCanonical))
    ) {
      return seg.id;
    }
  }

  // 解決失敗: null を返す（呼び出し元がフォールバック処理）
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyDelta — PlanState に delta を決定論的に適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function applyDelta(state: PlanState, delta: PlanDelta): PlanState {
  // 不変性を保つ: 新しい state を返す
  let newSegments = state.segments.map((s) => ({ ...s, companions: [...s.companions] }));
  let newTransport = state.transport;
  let newEndTime = state.endTime;
  let newEndAction = state.endAction;
  let newGoOut = state.goOut;
  let newTargetDate = state.targetDate;
  let newTargetDateLabel = state.targetDateLabel;
  let newDepartureTime = state.departureTime;

  for (const change of delta.changes) {
    switch (change.type) {
      case "replace":
      case "set": {
        if (change.segmentId) {
          // セグメント内フィールドの変更
          const segIndex = newSegments.findIndex((s) => s.id === change.segmentId);
          if (segIndex >= 0) {
            const seg = { ...newSegments[segIndex], companions: [...newSegments[segIndex].companions] };
            applyFieldChange(seg, change.field, change.newValue);
            newSegments[segIndex] = seg;
          }
        } else {
          // グローバルフィールドの変更
          if (change.field === "transport") {
            newTransport = String(change.newValue ?? "") as PlanState["transport"];
          } else if (change.field === "endTime") {
            newEndTime = String(change.newValue ?? "");
          } else if (change.field === "endAction") {
            newEndAction = String(change.newValue ?? "");
          } else if (change.field === "targetDate") {
            // 「明日→今日」等の日変更: resolveTargetDate で YYYY-MM-DD + ラベルに変換
            const rawDate = String(change.newValue ?? "today");
            const resolved = resolveTargetDate(rawDate);
            newTargetDate = resolved.absoluteDate;
            newTargetDateLabel = resolved.label;
          } else if (change.field === "departureTime") {
            // 「8時に家を出る」→ PlanState.departureTime を設定
            newDepartureTime = String(change.newValue ?? "");
          } else if (change.field === "goOut") {
            newGoOut = String(change.newValue) === "true";
          }
        }
        break;
      }
      case "remove": {
        if (change.segmentId) {
          const segIndex = newSegments.findIndex((s) => s.id === change.segmentId);
          if (segIndex >= 0) {
            const seg = { ...newSegments[segIndex], companions: [...newSegments[segIndex].companions] };
            clearField(seg, change.field);
            newSegments[segIndex] = seg;
          }
        }
        break;
      }
      case "add_segment": {
        if (change.newSegment) {
          const placeResult = change.newSegment.place
            ? resolvePlaceFromText(change.newSegment.place)
            : null;
          const actResult = resolveActivity(change.newSegment.activity);

          // order の決定: LLM 指定があればそれを使うが、既存セグメントの order と衝突する場合は
          // 挿入位置の 0.5 刻みにして既存の order を崩さない
          let targetOrder = change.newSegment.order ?? newSegments.length + 1;
          const maxExisting = Math.max(0, ...newSegments.map(s => s.order));
          if (targetOrder > maxExisting) {
            targetOrder = maxExisting + 1;
          }

          // 時間制約の構築
          const segTimeConstraint = buildTimeConstraintFromRaw(change.newSegment);

          const newSeg: PlanSegment = {
            id: generateSegmentId(),
            order: targetOrder,
            timeHint: (change.newSegment.timeHint as PlanSegment["timeHint"]) ?? undefined,
            startTime: change.newSegment.startTime ?? undefined,
            timeConstraint: segTimeConstraint,
            activity: change.newSegment.activity,
            activityCanonical: actResult?.canonical ?? change.newSegment.activity,
            activityCategory: actResult?.category as PlanSegment["activityCategory"],
            estimatedDurationMin: actResult?.defaultDurationMin ?? getDefaultDuration(change.newSegment.activity),
            place: change.newSegment.place ?? undefined,
            placeCanonical: placeResult?.place.canonicalLabel ?? change.newSegment.place ?? undefined,
            placeCategory: placeResult?.place.category as PlanSegment["placeCategory"],
            companions: change.newSegment.companions ?? [],
            status: "tentative",
          };
          newSegments.push(newSeg);
          // order で安定ソート（同order時は既存を先に保つ）
          newSegments.sort((a, b) => a.order - b.order);
          // order を正規化（1-based 連番に）
          newSegments.forEach((s, i) => { s.order = i + 1; });
        }
        break;
      }
      case "remove_segment": {
        if (change.segmentId) {
          newSegments = newSegments.filter((s) => s.id !== change.segmentId);
        }
        break;
      }
    }
  }

  // 不足フィールドの再計算
  const missingFields: string[] = [];
  if (!newTransport && !newSegments.some((s) => s.transport)) {
    const goOut = newGoOut ?? newSegments.some((s) => s.place);
    if (goOut) {
      missingFields.push("transport");
    }
  }

  // 時間指定が必要なアクティビティで startTime がないセグメントを検出
  const TIME_SENSITIVE_PATTERNS = /打ち合わせ|ミーティング|会議|商談|面談|meeting|アポ|予約|レッスン|授業|セミナー|面接|診察/i;
  for (const seg of newSegments) {
    if (!seg.startTime && TIME_SENSITIVE_PATTERNS.test(seg.activity)) {
      const label = seg.activityCanonical ?? seg.activity;
      missingFields.push(`segmentTime:${seg.id}:${label}`);
    }
  }

  // 場所が必要そうなのに場所がないセグメント
  const PLACE_NEEDED_PATTERNS = /商談|面談|meeting|ランチ|ディナー|食事|飲み/i;
  for (const seg of newSegments) {
    if (!seg.place && PLACE_NEEDED_PATTERNS.test(seg.activity)) {
      const label = seg.activityCanonical ?? seg.activity;
      missingFields.push(`segmentPlace:${seg.id}:${label}`);
    }
  }

  return {
    ...state,
    targetDate: newTargetDate,
    targetDateLabel: newTargetDateLabel,
    segments: newSegments,
    transport: newTransport,
    endTime: newEndTime,
    endAction: newEndAction,
    departureTime: newDepartureTime,
    goOut: newGoOut,
    missingFields,
  };
}

function applyFieldChange(
  seg: PlanSegment,
  field: string,
  value: string | string[] | Record<string, unknown> | null | undefined,
): void {
  switch (field) {
    case "place": {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // LLM が field=place で object を返してきた保険。placeSearchHint として処理する。
        applyFieldChange(seg, "placeSearchHint", value);
        return;
      }
      const newPlace = typeof value === "string" ? value : String(value ?? "");
      seg.place = newPlace;
      const resolved = resolvePlaceFromText(newPlace);
      seg.placeCanonical = resolved?.place.canonicalLabel ?? newPlace;
      seg.placeCategory = resolved?.place.category as PlanSegment["placeCategory"];
      // CEO方針 2026-04-17 Bug 2: place 変更時は下流の解決結果を必ずリセットする。
      //   そうしないと resolvedPlaceName（旧 place 由来）が UI に残ったまま、
      //   あるいは placeSearchHint（旧 near-anchor 由来）が次の resolver 呼び出しで
      //   旧地点を再解決してしまい、変更が反映されたように見えない。
      seg.placeType = undefined;
      seg.placeSearchHint = undefined;
      seg.resolvedPlaceName = undefined;
      seg.resolvedAddress = undefined;
      seg.resolvedPlaceId = undefined;
      seg.resolvedLat = undefined;
      seg.resolvedLng = undefined;
      seg.resolutionConfidence = undefined;
      seg.anchorScore = undefined;
      break;
    }
    case "placeSearchHint": {
      // CEO方針 2026-04-18 Bug A: 広域名（「甲府」）や複合（「甲府のカフェ」）を
      // 固有名として place に入れると、placeResolver が誤って 1 点に解決してしまう。
      // ここで placeSearchHint に正規化し、近傍検索フローに乗せる。
      let nearAnchorLabel: string | undefined;
      let searchCategory: string | undefined;
      let originalQuery: string | undefined;

      if (typeof value === "string") {
        // プレーン文字列（「甲府」等）→ 広域名として扱う。
        // searchCategory は現セグメントの既存 place 名を流用（「カフェを甲府にして」→ search=カフェ）。
        nearAnchorLabel = value.trim();
        searchCategory = seg.placeCanonical ?? seg.place ?? undefined;
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.nearAnchorLabel === "string") {
          nearAnchorLabel = obj.nearAnchorLabel.trim();
        }
        if (typeof obj.searchCategory === "string") {
          searchCategory = obj.searchCategory.trim();
        }
        if (typeof obj.originalQuery === "string") {
          originalQuery = obj.originalQuery;
        }
        // searchCategory が LLM から来なかった場合、既存 place を流用
        if (!searchCategory) {
          searchCategory = seg.placeCanonical ?? seg.place ?? undefined;
        }
      } else {
        // 無効な値 — 何もしない
        return;
      }

      if (!nearAnchorLabel) return;

      // CEO方針 2026-04-18 Bug A v2 安全弁:
      //   LLM が nearAnchorLabel に相対語（「近く」「現在地」「ここ」等）や
      //   店種・チェーン名（「カフェ」「スタバ」等）を入れた場合は、placeSearchHint 経路に乗せない。
      //   相対語 → place 経路にフォールバックして resolver の prevAnchor 暗黙チェーンに委ねる。
      //   店種語 → nearAnchorLabel と searchCategory が逆転している可能性があるので安全側で place 優先。
      const RELATIVE_LABELS = new Set([
        "近く", "ちかく", "近辺", "近所", "近場",
        "現在地", "ここ", "そこ", "この辺", "この辺り", "周辺",
      ]);
      const GENERIC_CATEGORY_LABELS = new Set([
        "カフェ", "かふぇ", "コーヒー", "coffee",
        "レストラン", "居酒屋", "バー", "bar",
        "ランチ", "ディナー", "ご飯", "ごはん", "食事",
      ]);
      if (RELATIVE_LABELS.has(nearAnchorLabel)) {
        // 相対語 → place 経路へ。newValue は searchCategory（LLM 指定があれば）またはユーザー元意図語
        const fallbackPlace = searchCategory ?? nearAnchorLabel;
        applyFieldChange(seg, "place", fallbackPlace);
        return;
      }
      if (GENERIC_CATEGORY_LABELS.has(nearAnchorLabel)) {
        // nearAnchorLabel がカテゴリ語 — LLM が anchor と category を逆転した可能性が高い
        // または既存 place = nearAnchorLabel の状況で LLM が自己同一変更を出した
        // 安全策: ユーザー発話（searchCategory 側）を新しい place として置く
        const fallbackPlace = searchCategory && searchCategory !== nearAnchorLabel
          ? searchCategory
          : nearAnchorLabel;
        applyFieldChange(seg, "place", fallbackPlace);
        return;
      }

      // 旧 point 解決結果をクリア（広域 ≠ 単一地点）
      seg.place = undefined;
      seg.placeCanonical = undefined;
      seg.placeCategory = undefined;
      seg.placeType = undefined;
      seg.resolvedPlaceName = undefined;
      seg.resolvedAddress = undefined;
      seg.resolvedPlaceId = undefined;
      seg.resolvedLat = undefined;
      seg.resolvedLng = undefined;
      seg.resolutionConfidence = undefined;
      seg.anchorScore = undefined;

      seg.placeSearchHint = {
        nearAnchorLabel,
        searchCategory,
        originalQuery,
      };
      break;
    }
    case "activity": {
      const newAct = String(value ?? "");
      seg.activity = newAct;
      const resolved = resolveActivity(newAct);
      seg.activityCanonical = resolved?.canonical ?? newAct;
      seg.activityCategory = resolved?.category as PlanSegment["activityCategory"];
      seg.estimatedDurationMin = resolved?.defaultDurationMin ?? getDefaultDuration(newAct);
      break;
    }
    case "companions":
      seg.companions = Array.isArray(value) ? value : [String(value ?? "")];
      break;
    case "startTime":
      seg.startTime = value ? String(value) : undefined;
      break;
    case "timeHint":
      seg.timeHint = value ? (String(value) as PlanSegment["timeHint"]) : undefined;
      break;
    case "transport":
      seg.transport = value ? (String(value) as PlanSegment["transport"]) : undefined;
      break;
  }
}

function clearField(seg: PlanSegment, field: string): void {
  switch (field) {
    case "place":
      seg.place = undefined;
      seg.placeCanonical = undefined;
      seg.placeCategory = undefined;
      // CEO方針 2026-04-17 Bug 2: place クリア時も下流の解決結果を同時に無効化
      seg.placeType = undefined;
      seg.placeSearchHint = undefined;
      seg.resolvedPlaceName = undefined;
      seg.resolvedAddress = undefined;
      seg.resolvedPlaceId = undefined;
      seg.resolvedLat = undefined;
      seg.resolvedLng = undefined;
      seg.resolutionConfidence = undefined;
      seg.anchorScore = undefined;
      break;
    case "activity":
      // activity は必須なので削除不可 — 空文字にはしない
      break;
    case "companions":
      seg.companions = [];
      break;
    case "startTime":
      seg.startTime = undefined;
      break;
    case "transport":
      seg.transport = undefined;
      break;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatStateForLLM(state: PlanState): string {
  const lines: string[] = [];
  lines.push(`対象日: ${state.targetDateLabel}（${state.targetDate}）`);
  lines.push(`現在のセグメント数: ${state.segments.length}件`);
  lines.push("");

  for (let i = 0; i < state.segments.length; i++) {
    const seg = state.segments[i];
    const timeStr = seg.startTime ? `${seg.startTime}〜` : seg.timeHint ? `[${seg.timeHint}]` : "[時間未定]";
    const place = seg.placeCanonical ?? seg.place ?? "";
    const who = seg.companions.length > 0 ? `同行者: ${seg.companions.join("、")}` : "同行者: なし";
    const activity = seg.activityCanonical ?? seg.activity;
    const duration = seg.estimatedDurationMin ? `${seg.estimatedDurationMin}分` : "";
    lines.push(`セグメント${i + 1}: ${timeStr} ${activity}${place ? ` @${place}` : ""} ${duration}`);
    lines.push(`  ${who}`);
  }

  lines.push("");
  if (state.transport) lines.push(`全体の移動手段: ${state.transport}`);
  if (state.endTime) lines.push(`終了: ${state.endTime}`);
  if (state.endAction) lines.push(`終了アクション: ${state.endAction}`);

  if (state.missingFields.length > 0) {
    lines.push(`未回答: ${state.missingFields.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * LLMRawSegment から TimeConstraint を構築（applyDelta 内の add_segment 用）
 */
function buildTimeConstraintFromRaw(seg: LLMRawSegment): TimeConstraint | undefined {
  const timeType = seg.timeType;
  if (timeType) {
    switch (timeType) {
      case "fixed_departure":
      case "fixed_start":
      case "fixed_arrival":
        return { type: timeType as TimeConstraintType, fixedTime: seg.startTime ?? undefined };
      case "window_morning":
      case "window_noon":
      case "window_afternoon":
      case "window_evening":
      case "window_night": {
        const w = TIME_WINDOWS[timeType];
        if (w) {
          const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          return { type: timeType as TimeConstraintType, windowStart: fmt(w.start), windowEnd: fmt(w.end) };
        }
        return { type: timeType as TimeConstraintType };
      }
      default:
        break;
    }
  }
  // レガシーフォールバック
  if (seg.startTime) {
    return { type: "fixed_start", fixedTime: seg.startTime };
  }
  if (seg.timeHint) {
    const windowKey = `window_${seg.timeHint}`;
    const w = TIME_WINDOWS[windowKey];
    if (w) {
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      return { type: windowKey as TimeConstraintType, windowStart: fmt(w.start), windowEnd: fmt(w.end) };
    }
  }
  return undefined;
}

function normalizeTurnType(raw: string): DeltaTurnType {
  const valid: DeltaTurnType[] = ["correction", "addition", "deletion", "clarify_response"];
  return valid.includes(raw as DeltaTurnType)
    ? (raw as DeltaTurnType)
    : "clarify_response";
}

function normalizeChangeType(raw: string): DeltaChangeType {
  const valid: DeltaChangeType[] = ["set", "replace", "remove", "add_segment", "remove_segment"];
  return valid.includes(raw as DeltaChangeType)
    ? (raw as DeltaChangeType)
    : "set";
}
