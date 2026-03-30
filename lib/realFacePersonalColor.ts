export type RealFaceSide = "left" | "right" | "tie";

export type RealFaceAttribute = "warm" | "cool" | "light" | "deep" | "clear" | "soft";

export type RealFaceEvaluationAxis = "brightness" | "healthy_tone" | "clarity" | "contour";

export type RealFaceSeason = "spring" | "summer" | "autumn" | "winter";

export type RealFaceColorSwatch = {
    id: string;
    label: string;
    hex: string;
    attributes: RealFaceAttribute[];
};

export type RealFacePairDefinition = {
    id: string;
    title: string;
    summary: string;
    left: RealFaceColorSwatch;
    right: RealFaceColorSwatch;
};

export type RealFaceQuestion = {
    id: string;
    pairId: string;
    pairIndex: number;
    axisIndex: number;
    axisType: RealFaceEvaluationAxis;
    question: string;
    helper: string;
    pairTitle: string;
    pairSummary: string;
    left: RealFaceColorSwatch;
    right: RealFaceColorSwatch;
};

export type RealFaceAnswer = {
    questionId: string;
    selectedSide: RealFaceSide;
};

export type RealFaceAnswerLog = {
    pair_id: string;
    axis_type: RealFaceEvaluationAxis;
    left_color_id: string;
    right_color_id: string;
    selected_side: RealFaceSide;
    score_delta: number;
};

export type RealFaceAxisBreakdown = {
    axisType: RealFaceEvaluationAxis;
    label: string;
    winningAttribute: RealFaceAttribute | null;
    opposingAttribute: RealFaceAttribute | null;
    scoreGap: number;
    answers: number;
    summary: string;
};

export type RealFaceDiagnosisResult = {
    version: "real_face_pc_v2";
    totalQuestions: number;
    answeredCount: number;
    questionCompletionRate: number;
    warm_score: number;
    cool_score: number;
    light_score: number;
    deep_score: number;
    clear_score: number;
    soft_score: number;
    brightness_score: number;
    healthy_tone_score: number;
    clarity_score: number;
    contour_score: number;
    temp_score: number;
    value_score: number;
    chroma_score: number;
    contrast_score: number;
    axisBreakdown: RealFaceAxisBreakdown[];
    answerLogs: RealFaceAnswerLog[];
    season_primary: RealFaceSeason;
    season_secondary: RealFaceSeason;
    season_primary_label_ja: string;
    season_secondary_label_ja: string;
    confidence: number;
    summary: string;
    attributeSummary: {
        temperature: "warm" | "cool" | "balanced";
        value: "light" | "deep" | "balanced";
        chroma: "clear" | "soft" | "balanced";
    };
    recommended_colors: string[];
    avoid_tendencies: string[];
};

const AXIS_META: Record<
    RealFaceEvaluationAxis,
    { label: string; question: string; helper: string }
> = {
    brightness: {
        label: "明るさ / 透明感",
        question: "どちらの方が顔が明るく見えますか？",
        helper: "顔全体が軽く、くすまず、クリアに見える方を選んでください",
    },
    healthy_tone: {
        label: "血色 / 健康感",
        question: "どちらの方が顔色がよく見えますか？",
        helper: "健康的で、生き生きして見える方を選んでください",
    },
    clarity: {
        label: "くすみにくさ / 濁りの少なさ",
        question: "どちらの方がくすまず見えますか？",
        helper: "肌が濁らず、疲れて見えにくい方を選んでください",
    },
    contour: {
        label: "輪郭 / すっきり感",
        question: "どちらの方が顔立ちがすっきり見えますか？",
        helper: "輪郭や顔全体がぼやけず、引き締まって見える方を選んでください",
    },
};

const REAL_FACE_PC_PAIRS: RealFacePairDefinition[] = [
    {
        id: "RF_PAIR_WARM_COOL",
        title: "Warm vs Cool",
        summary: "黄みが得意か、青みが得意かを見ます",
        left: {
            id: "warm_beige",
            label: "ウォームベージュ",
            hex: "#d8b391",
            attributes: ["warm"],
        },
        right: {
            id: "cool_rose",
            label: "クールローズ",
            hex: "#cda3b1",
            attributes: ["cool"],
        },
    },
    {
        id: "RF_PAIR_LIGHT_DEEP",
        title: "Light vs Deep",
        summary: "明るいトーンと深いトーンの相性を見ます",
        left: {
            id: "soft_ivory",
            label: "ソフトアイボリー",
            hex: "#e5ddd2",
            attributes: ["light"],
        },
        right: {
            id: "deep_mocha",
            label: "ディープモカ",
            hex: "#7f665c",
            attributes: ["deep"],
        },
    },
    {
        id: "RF_PAIR_CLEAR_SOFT",
        title: "Clear vs Soft",
        summary: "クリアな色とくすみ色の相性を見ます",
        left: {
            id: "clear_peach",
            label: "クリアピーチ",
            hex: "#f0b395",
            attributes: ["clear"],
        },
        right: {
            id: "dusty_mauve",
            label: "ダスティモーブ",
            hex: "#b49ba1",
            attributes: ["soft"],
        },
    },
    {
        id: "RF_PAIR_WARM_CLEAR_COOL_SOFT",
        title: "Warm-clear vs Cool-soft",
        summary: "境界層を見分ける補助比較です",
        left: {
            id: "apricot_clear",
            label: "アプリコットコーラル",
            hex: "#df9f81",
            attributes: ["warm", "clear"],
        },
        right: {
            id: "berry_smoke",
            label: "スモーキーベリー",
            hex: "#9b8ca4",
            attributes: ["cool", "soft"],
        },
    },
];

const AXIS_ORDER: RealFaceEvaluationAxis[] = [
    "brightness",
    "healthy_tone",
    "clarity",
    "contour",
];

const ATTRIBUTE_GROUPS: Record<
    RealFaceEvaluationAxis,
    [RealFaceAttribute, RealFaceAttribute, RealFaceAttribute]
> = {
    brightness: ["light", "deep", "clear"],
    healthy_tone: ["warm", "cool", "light"],
    clarity: ["clear", "soft", "cool"],
    contour: ["clear", "soft", "deep"],
};

const SEASON_RECOMMENDATIONS: Record<
    RealFaceSeason,
    { label: string; recommended: string[]; avoid: string[] }
> = {
    spring: {
        label: "Spring",
        recommended: ["アイボリー", "コーラル", "キャメル", "明るめベージュ"],
        avoid: ["青みが強いグレー", "重いダークネイビー", "冷たいモーブ"],
    },
    summer: {
        label: "Summer",
        recommended: ["ソフトホワイト", "ラベンダーグレー", "スモーキーブルー", "ローズベージュ"],
        avoid: ["黄みの強いオレンジ", "強すぎる黒", "ビビッドキャメル"],
    },
    autumn: {
        label: "Autumn",
        recommended: ["オリーブ", "テラコッタ", "ブロンズ", "ウォームトープ"],
        avoid: ["青みピンク", "シャープな白", "氷のようなパステル"],
    },
    winter: {
        label: "Winter",
        recommended: ["アイシーホワイト", "ロイヤルブルー", "ボルドー", "チャコール"],
        avoid: ["黄みベージュ", "くすんだブラウン", "曖昧なアースカラー"],
    },
};

export const REAL_FACE_PC_QUESTIONS: RealFaceQuestion[] = REAL_FACE_PC_PAIRS.flatMap(
    (pair, pairIndex) =>
        AXIS_ORDER.map((axisType, axisIndex) => ({
            id: `${pair.id}_${axisType}`,
            pairId: pair.id,
            pairIndex,
            axisIndex,
            axisType,
            question: AXIS_META[axisType].question,
            helper: AXIS_META[axisType].helper,
            pairTitle: pair.title,
            pairSummary: pair.summary,
            left: pair.left,
            right: pair.right,
        }))
);

function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function getSeasonScores(scores: Record<RealFaceAttribute, number>) {
    return {
        spring: scores.warm + scores.light + scores.clear,
        summer: scores.cool + scores.light + scores.soft,
        autumn: scores.warm + scores.deep + scores.soft,
        winter: scores.cool + scores.deep + scores.clear,
    };
}

function compareDimension(
    leftLabel: "warm" | "light" | "clear",
    leftScore: number,
    rightLabel: "cool" | "deep" | "soft",
    rightScore: number
) {
    const diff = leftScore - rightScore;
    if (Math.abs(diff) < 1) return "balanced" as const;
    return diff >= 0 ? leftLabel : rightLabel;
}

function describeAxis(
    axisType: RealFaceEvaluationAxis,
    scoreByAttribute: Record<RealFaceAttribute, number>,
    answers: number
): RealFaceAxisBreakdown {
    const [a, b] = ATTRIBUTE_GROUPS[axisType];
    const winning = scoreByAttribute[a] >= scoreByAttribute[b] ? a : b;
    const opposing = winning === a ? b : a;
    const gap = Math.abs(scoreByAttribute[a] - scoreByAttribute[b]);
    const label = AXIS_META[axisType].label;

    let summary = "どちらでもない回答が多く、差はまだ小さいです。";
    if (gap >= 2) {
        summary = `${winning} 側がはっきり有利です。`;
    } else if (gap >= 1) {
        summary = `${winning} 側がやや有利です。`;
    } else if (answers > 0) {
        summary = `${winning} と ${opposing} が拮抗しています。`;
    }

    return {
        axisType,
        label,
        winningAttribute: answers > 0 ? winning : null,
        opposingAttribute: answers > 0 ? opposing : null,
        scoreGap: gap,
        answers,
        summary,
    };
}

export function seasonLabelJa(season: RealFaceSeason) {
    return SEASON_RECOMMENDATIONS[season].label;
}

export function buildRealFaceDiagnosis(answers: RealFaceAnswer[]): RealFaceDiagnosisResult {
    const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.selectedSide]));
    const scores: Record<RealFaceAttribute, number> = {
        warm: 0,
        cool: 0,
        light: 0,
        deep: 0,
        clear: 0,
        soft: 0,
    };
    const axisCounts: Record<RealFaceEvaluationAxis, number> = {
        brightness: 0,
        healthy_tone: 0,
        clarity: 0,
        contour: 0,
    };
    const axisAttributeScores: Record<RealFaceEvaluationAxis, Record<RealFaceAttribute, number>> = {
        brightness: { warm: 0, cool: 0, light: 0, deep: 0, clear: 0, soft: 0 },
        healthy_tone: { warm: 0, cool: 0, light: 0, deep: 0, clear: 0, soft: 0 },
        clarity: { warm: 0, cool: 0, light: 0, deep: 0, clear: 0, soft: 0 },
        contour: { warm: 0, cool: 0, light: 0, deep: 0, clear: 0, soft: 0 },
    };
    const answerLogs: RealFaceAnswerLog[] = [];

    REAL_FACE_PC_QUESTIONS.forEach((question) => {
        const selectedSide = answerMap.get(question.id) ?? "tie";
        const winningSwatch =
            selectedSide === "left" ? question.left : selectedSide === "right" ? question.right : null;

        if (winningSwatch) {
            winningSwatch.attributes.forEach((attribute) => {
                scores[attribute] += 1;
                axisAttributeScores[question.axisType][attribute] += 1;
            });
            axisCounts[question.axisType] += 1;
        }

        answerLogs.push({
            pair_id: question.pairId,
            axis_type: question.axisType,
            left_color_id: question.left.id,
            right_color_id: question.right.id,
            selected_side: selectedSide,
            score_delta: winningSwatch ? 1 : 0,
        });
    });

    const seasonScores = getSeasonScores(scores);
    const rankedSeasons = (Object.entries(seasonScores) as Array<[RealFaceSeason, number]>).sort(
        (a, b) => b[1] - a[1]
    );

    const [primary, secondary] = rankedSeasons.map(([season]) => season);
    const topScore = rankedSeasons[0]?.[1] ?? 0;
    const secondScore = rankedSeasons[1]?.[1] ?? 0;
    const confidence = clamp01(topScore === 0 ? 0 : 0.45 + (topScore - secondScore) / Math.max(topScore, 1) * 0.55);

    const attributeSummary: {
        temperature: "warm" | "cool" | "balanced";
        value: "light" | "deep" | "balanced";
        chroma: "clear" | "soft" | "balanced";
    } = {
        temperature: compareDimension("warm", scores.warm, "cool", scores.cool) as "warm" | "cool" | "balanced",
        value: compareDimension("light", scores.light, "deep", scores.deep) as "light" | "deep" | "balanced",
        chroma: compareDimension("clear", scores.clear, "soft", scores.soft) as "clear" | "soft" | "balanced",
    };

    const axisBreakdown = AXIS_ORDER.map((axisType) =>
        describeAxis(axisType, axisAttributeScores[axisType], axisCounts[axisType])
    );

    const recommended = SEASON_RECOMMENDATIONS[primary].recommended;
    const avoid = SEASON_RECOMMENDATIONS[primary].avoid;
    const answeredCount = answers.filter((answer) => answer.selectedSide !== "tie").length;

    const temperatureLabel =
        attributeSummary.temperature === "balanced"
            ? "Warm / Cool は拮抗"
            : `${attributeSummary.temperature === "warm" ? "Warm" : "Cool"} 寄り`;
    const valueLabel =
        attributeSummary.value === "balanced"
            ? "Light / Deep は拮抗"
            : `${attributeSummary.value === "light" ? "Light" : "Deep"} 寄り`;
    const chromaLabel =
        attributeSummary.chroma === "balanced"
            ? "Clear / Soft は拮抗"
            : `${attributeSummary.chroma === "clear" ? "Clear" : "Soft"} 寄り`;

    return {
        version: "real_face_pc_v2",
        totalQuestions: REAL_FACE_PC_QUESTIONS.length,
        answeredCount,
        questionCompletionRate: clamp01(answeredCount / REAL_FACE_PC_QUESTIONS.length),
        warm_score: scores.warm,
        cool_score: scores.cool,
        light_score: scores.light,
        deep_score: scores.deep,
        clear_score: scores.clear,
        soft_score: scores.soft,
        brightness_score: axisCounts.brightness,
        healthy_tone_score: axisCounts.healthy_tone,
        clarity_score: axisCounts.clarity,
        contour_score: axisCounts.contour,
        temp_score: scores.warm - scores.cool,
        value_score: scores.light - scores.deep,
        chroma_score: scores.clear - scores.soft,
        contrast_score: scores.clear + scores.deep - (scores.soft + scores.light),
        axisBreakdown,
        answerLogs,
        season_primary: primary,
        season_secondary: secondary,
        season_primary_label_ja: seasonLabelJa(primary),
        season_secondary_label_ja: seasonLabelJa(secondary),
        confidence,
        summary: `${temperatureLabel} / ${valueLabel} / ${chromaLabel}`,
        attributeSummary,
        recommended_colors: recommended,
        avoid_tendencies: avoid,
    };
}

export function getRealFacePairCount() {
    return REAL_FACE_PC_PAIRS.length;
}

export function getAxisMeta(axisType: RealFaceEvaluationAxis) {
    return AXIS_META[axisType];
}
