/**
 * Stargazer x My-Style Auto-Insight Bridge
 *
 * Stargazer (性格・判断特性の深層観測) と My-Style (ワードローブ・ファッション自己理解) を接続し、
 * クロスドメインのインサイトを生成する。
 */

import type { SavedState, StyleLaneCode } from "./types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

/* ── Types ── */

export interface StargazerStyleInsight {
    id: string;
    type: "correlation" | "prediction" | "contradiction" | "growth" | "archetype";
    title: string;
    body: string;
    stargazerSignal: string;
    styleSignal: string;
    connectionNarrative: string;
    confidence: number;
    actionSuggestion?: string;
    generatedAt: string;
}

export interface StargazerProfileSnapshot {
    axisScores: Partial<Record<TraitAxisKey, number>>;
    archetypeCode?: string;
    archetypeLabel?: string;
    observationCount: number;
    tags?: string[];
    summary?: string;
}

export interface CorrelationResult {
    dimension: string;
    personalitySignal: string;
    styleSignal: string;
    strength: number; // 0-1
    narrative: string;
}

export interface ArchetypeLabel {
    label: string;
    description: string;
    gradient: [string, string];
}

/* ── Constants ── */

const ARCHETYPE_POOL: {
    condition: (p: StargazerProfileSnapshot, s: SavedState) => boolean;
    label: string;
    description: string;
    gradient: [string, string];
}[] = [
    {
        condition: (p, s) => {
            const introvert = (p.axisScores.introvert_vs_extrovert ?? 0) < -0.3;
            const hasModeLane = s.styleSelections.some(
                (sl) => sl.laneCode === "mode" || sl.laneCode === "street"
            );
            return introvert && hasModeLane;
        },
        label: "静かな革命家",
        description: "内面は静かで深いのに、外見で世界を揺さぶる。矛盾こそがあなたの武器。",
        gradient: ["#6c5ce7", "#2d3436"],
    },
    {
        condition: (p, s) => {
            const bold = (p.axisScores.cautious_vs_bold ?? 0) > 0.3;
            const minimal = s.styleSelections.some(
                (sl) => sl.laneCode === "minimal" || sl.laneCode === "clean"
            );
            return bold && minimal;
        },
        label: "情熱的なミニマリスト",
        description: "大胆な判断力を持ちながら、削ぎ落とされた美を選ぶ。少ないもので最大の自分を表現する。",
        gradient: ["#e17055", "#fdcb6e"],
    },
    {
        condition: (p, s) => {
            const gap = Math.abs(p.axisScores.public_private_gap ?? 0) > 0.3;
            const hasVariety = new Set(s.styleSelections.map((sl) => sl.laneCode)).size >= 3;
            return gap && hasVariety;
        },
        label: "矛盾を纏う人",
        description: "外の顔と内面が異なるからこそ、多面的なスタイルを着こなせる。それは弱さではなく深さ。",
        gradient: ["#a29bfe", "#fd79a8"],
    },
    {
        condition: (p, s) => {
            const analytical = (p.axisScores.analytical_vs_intuitive ?? 0) < -0.3;
            const classic = s.styleSelections.some(
                (sl) => sl.laneCode === "classic" || sl.laneCode === "trad"
            );
            return analytical && classic;
        },
        label: "論理の美学者",
        description: "分析的な思考で服を選び、確かな審美眼で自分だけのスタンダードを築く。",
        gradient: ["#2d3436", "#636e72"],
    },
    {
        condition: (p, s) => {
            const intuitive = (p.axisScores.analytical_vs_intuitive ?? 0) > 0.3;
            const expressive = s.styleSelections.some(
                (sl) => sl.laneCode === "vintage" || sl.laneCode === "feminine"
            );
            return intuitive && expressive;
        },
        label: "感性の錬金術師",
        description: "直感で素材と色を組み合わせ、誰にも真似できない空気をまとう。論理では説明できないセンスの人。",
        gradient: ["#f9a8d4", "#c084fc"],
    },
    {
        condition: (p, _s) => {
            const harmony = (p.axisScores.independence_vs_harmony ?? 0) > 0.3;
            const stable = (p.axisScores.emotional_regulation ?? 0) > 0.2;
            return harmony && stable;
        },
        label: "穏やかな調和者",
        description: "周囲との調和を大切にしながら、安定した自分軸でスタイルを選ぶ。一緒にいると心地よい存在感。",
        gradient: ["#55efc4", "#81ecec"],
    },
    {
        condition: (p, s) => {
            const novelty = (p.axisScores.tradition_vs_novelty ?? 0) > 0.3;
            const hasTechwear = s.styleSelections.some(
                (sl) => sl.laneCode === "techwear" || sl.laneCode === "sporty"
            );
            return novelty && hasTechwear;
        },
        label: "未来を着る人",
        description: "新しいものに惹かれ続ける好奇心と、機能美への信頼。今日のスタイルが明日のスタンダードになる。",
        gradient: ["#0984e3", "#00cec9"],
    },
    {
        condition: (_p, s) => {
            const secretLanes = s.styleSelections.filter(
                (sl) => sl.bucket === "secret"
            );
            return secretLanes.length >= 2;
        },
        label: "深層の探求者",
        description: "表には出さない秘密のスタイルレイヤーを複数持つ。自分自身すら気づいていない自分を、服で探索している。",
        gradient: ["#2d3436", "#6c5ce7"],
    },
];

const DEFAULT_ARCHETYPE: ArchetypeLabel = {
    label: "スタイルの旅人",
    description: "まだ性格とスタイルの交差点が見えていない。でもそれは、これから最も大きな発見が待っているということ。",
    gradient: ["#94a3b8", "#64748b"],
};

/* ── Personality-Style Dimension Mapping ── */

interface DimensionMapping {
    axisKey: TraitAxisKey;
    styleDimension: string;
    negativeLabel: string;
    positiveLabel: string;
    negativeStyleSignal: (s: SavedState) => boolean;
    positiveStyleSignal: (s: SavedState) => boolean;
    correlationNarrative: string;
    contradictionNarrative: string;
}

const DIMENSION_MAPPINGS: DimensionMapping[] = [
    {
        axisKey: "introvert_vs_extrovert",
        styleDimension: "色の温度",
        negativeLabel: "内向的",
        positiveLabel: "外向的",
        negativeStyleSignal: (s) => {
            const neutralColors = s.wardrobe.filter((i) =>
                ["black", "white", "gray", "navy", "beige", "黒", "白", "グレー", "ネイビー", "ベージュ"].includes(
                    i.color.toLowerCase()
                )
            );
            return neutralColors.length > s.wardrobe.length * 0.5;
        },
        positiveStyleSignal: (s) => {
            const brightColors = s.wardrobe.filter((i) =>
                ["red", "yellow", "orange", "pink", "赤", "黄", "オレンジ", "ピンク"].includes(
                    i.color.toLowerCase()
                )
            );
            return brightColors.length > s.wardrobe.length * 0.2;
        },
        correlationNarrative:
            "内向的な性格傾向と控えめな色選びが呼応している -- 静けさは内面から衣服へと自然に流れ出ている",
        contradictionNarrative:
            "性格は内向的なのに、服では鮮やかな色を選ぶ。外見で補おうとしているのか、それとも服だけが本音を語っているのか",
    },
    {
        axisKey: "cautious_vs_bold",
        styleDimension: "スタイルの幅",
        negativeLabel: "慎重",
        positiveLabel: "大胆",
        negativeStyleSignal: (s) => {
            const uniqueLanes = new Set(s.styleSelections.map((sl) => sl.laneCode));
            return uniqueLanes.size <= 2;
        },
        positiveStyleSignal: (s) => {
            const uniqueLanes = new Set(s.styleSelections.map((sl) => sl.laneCode));
            return uniqueLanes.size >= 4;
        },
        correlationNarrative:
            "慎重な判断パターンが、限定されたスタイルレーンの選択に表れている -- 安全圏を知っている人の選び方",
        contradictionNarrative:
            "判断は慎重なのに、スタイルの幅は意外と広い。服が、普段抑えている冒険心の出口になっているのかもしれない",
    },
    {
        axisKey: "minimal_vs_maximal",
        styleDimension: "ワードローブ量",
        negativeLabel: "ミニマル志向",
        positiveLabel: "マキシマル志向",
        negativeStyleSignal: (s) => s.wardrobe.length < 15,
        positiveStyleSignal: (s) => s.wardrobe.length > 30,
        correlationNarrative:
            "ミニマルな判断パターンが、少数精鋭のワードローブに反映されている -- 「足りている」を知る感性がある",
        contradictionNarrative:
            "判断はミニマルなのに、ワードローブは豊富。服を通じて「もうひとりの自分」を増やしている可能性がある",
    },
    {
        axisKey: "classic_vs_trendy",
        styleDimension: "トレンド追従度",
        negativeLabel: "定番好き",
        positiveLabel: "トレンド好き",
        negativeStyleSignal: (s) =>
            s.styleSelections.some(
                (sl) => sl.laneCode === "classic" || sl.laneCode === "trad"
            ),
        positiveStyleSignal: (s) =>
            s.styleSelections.some(
                (sl) => sl.laneCode === "koreanclean" || sl.laneCode === "street"
            ),
        correlationNarrative:
            "定番を信頼する性格が、クラシックなスタイル選びに一貫している -- ブレない軸がある人",
        contradictionNarrative:
            "性格は定番を好むのに、スタイルではトレンドに敏感。社会的な変化への適応を服で試しているのかもしれない",
    },
    {
        axisKey: "function_vs_expression",
        styleDimension: "装飾度",
        negativeLabel: "機能重視",
        positiveLabel: "表現重視",
        negativeStyleSignal: (s) =>
            s.styleSelections.some(
                (sl) =>
                    sl.laneCode === "workwear" ||
                    sl.laneCode === "outdoor" ||
                    sl.laneCode === "techwear"
            ),
        positiveStyleSignal: (s) =>
            s.styleSelections.some(
                (sl) =>
                    sl.laneCode === "mode" ||
                    sl.laneCode === "vintage" ||
                    sl.laneCode === "elegant"
            ),
        correlationNarrative:
            "機能を重視する性格が、実用的なスタイルレーンの選択に表れている -- 「使える美」に価値を見出す人",
        contradictionNarrative:
            "判断は機能重視なのに、スタイルでは表現を選ぶ。服が唯一の「非合理的な自分」の居場所なのかもしれない",
    },
];

/* ── Public API ── */

/**
 * Stargazer プロファイルを取得
 * API 経由で取得するのが正式だが、ここではクライアントサイドの
 * キャッシュ（localStorage）から読み取りを試みる。
 * 見つからない場合は null を返す。
 */
export function getStargazerProfile(): StargazerProfileSnapshot | null {
    if (typeof window === "undefined") return null;

    // Try multiple possible localStorage keys
    const CANDIDATE_KEYS = [
        "stargazer_profile_cache",
        "stargazer_axis_scores",
        "stargazer_resolved_type",
        "aneurasync_stargazer_profile",
    ];

    for (const key of CANDIDATE_KEYS) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                // Normalize various possible shapes
                const axisScores: Partial<Record<TraitAxisKey, number>> =
                    parsed.axisScores ??
                    parsed.axis_scores ??
                    parsed.dimensions ??
                    {};

                if (Object.keys(axisScores).length === 0) continue;

                const code = parsed.archetypeCode ?? parsed.type;
                const label = parsed.archetypeLabel ?? parsed.label;
                return {
                    axisScores,
                    archetypeCode: code,
                    archetypeLabel: label,
                    observationCount:
                        parsed.observationCount ??
                        parsed.observation_count ??
                        parsed.totalAnswered ??
                        0,
                    tags: parsed.tags ?? [],
                    summary: parsed.summary,
                };
            }
        } catch {
            // Silently skip malformed data
        }
    }

    // Also scan for any key with stargazer_ prefix that might contain profile data
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith("stargazer_")) continue;
            if (k.endsWith("__ts")) continue;

            try {
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    (parsed.axisScores || parsed.dimensions || parsed.axis_scores)
                ) {
                    const axisScores: Partial<Record<TraitAxisKey, number>> =
                        parsed.axisScores ?? parsed.axis_scores ?? parsed.dimensions ?? {};
                    if (Object.keys(axisScores).length >= 5) {
                        const code2 = parsed.archetypeCode ?? parsed.type;
                        const label2 = parsed.archetypeLabel ?? parsed.label;
                        return {
                            axisScores,
                            archetypeCode: code2,
                            archetypeLabel: label2,
                            observationCount: parsed.observationCount ?? 0,
                            tags: parsed.tags ?? [],
                            summary: parsed.summary,
                        };
                    }
                }
            } catch {
                // skip
            }
        }
    } catch {
        // localStorage iteration failed
    }

    return null;
}

/**
 * 性格とスタイルの相関を計算
 */
export function computePersonalityStyleCorrelation(
    profile: StargazerProfileSnapshot,
    state: SavedState,
): CorrelationResult[] {
    const results: CorrelationResult[] = [];

    for (const mapping of DIMENSION_MAPPINGS) {
        const score = profile.axisScores[mapping.axisKey];
        if (score === undefined) continue;

        const isNegativePersonality = score < -0.2;
        const isPositivePersonality = score > 0.2;
        const isNegativeStyle = mapping.negativeStyleSignal(state);
        const isPositiveStyle = mapping.positiveStyleSignal(state);

        // Correlation: personality and style align
        if (
            (isNegativePersonality && isNegativeStyle) ||
            (isPositivePersonality && isPositiveStyle)
        ) {
            results.push({
                dimension: mapping.styleDimension,
                personalitySignal: isNegativePersonality
                    ? mapping.negativeLabel
                    : mapping.positiveLabel,
                styleSignal: mapping.styleDimension,
                strength: Math.min(1, Math.abs(score) * 1.5),
                narrative: mapping.correlationNarrative,
            });
        }
        // Contradiction: personality and style diverge
        else if (
            (isNegativePersonality && isPositiveStyle) ||
            (isPositivePersonality && isNegativeStyle)
        ) {
            results.push({
                dimension: mapping.styleDimension,
                personalitySignal: isNegativePersonality
                    ? mapping.negativeLabel
                    : mapping.positiveLabel,
                styleSignal: mapping.styleDimension,
                strength: Math.min(1, Math.abs(score) * 1.2),
                narrative: mapping.contradictionNarrative,
            });
        }
    }

    return results.sort((a, b) => b.strength - a.strength);
}

/**
 * 性格 x スタイルのアーキタイプラベルを生成
 */
export function generateArchetypeLabel(
    profile: StargazerProfileSnapshot,
    state: SavedState,
): ArchetypeLabel {
    for (const archetype of ARCHETYPE_POOL) {
        if (archetype.condition(profile, state)) {
            return {
                label: archetype.label,
                description: archetype.description,
                gradient: archetype.gradient,
            };
        }
    }
    return DEFAULT_ARCHETYPE;
}

/**
 * クロスドメインインサイトを生成
 */
export function generateCrossInsights(
    profile: StargazerProfileSnapshot,
    state: SavedState,
): StargazerStyleInsight[] {
    const insights: StargazerStyleInsight[] = [];
    const now = new Date().toISOString();
    let idCounter = 0;

    const nextId = () => `sg-style-${++idCounter}-${Date.now()}`;

    // 1. CORRELATION insights
    const correlations = computePersonalityStyleCorrelation(profile, state);
    for (const corr of correlations.slice(0, 2)) {
        const isContradiction = corr.narrative.includes("なのに");
        insights.push({
            id: nextId(),
            type: isContradiction ? "contradiction" : "correlation",
            title: isContradiction
                ? `${corr.personalitySignal}なのに、${corr.styleSignal}は異なる道を行く`
                : `${corr.personalitySignal}が${corr.styleSignal}に共鳴している`,
            body: corr.narrative,
            stargazerSignal: `性格傾向: ${corr.personalitySignal}`,
            styleSignal: `スタイル傾向: ${corr.dimension}`,
            connectionNarrative: corr.narrative,
            confidence: corr.strength,
            generatedAt: now,
        });
    }

    // 2. PREDICTION insight
    const changeEmbrace = profile.axisScores.change_embrace_vs_resist ?? 0;
    const spontaneous = profile.axisScores.plan_vs_spontaneous ?? 0;
    const styleCount = new Set(state.styleSelections.map((sl) => sl.laneCode)).size;

    if (changeEmbrace < -0.2 && spontaneous > 0.2) {
        insights.push({
            id: nextId(),
            type: "prediction",
            title: "次のスタイル変化は「突然」来る",
            body: `Stargazerの判断パターンから、あなたは変化を受け入れつつ即興的に動くタイプ。計画的な衣替えより、ある日突然新しいスタイルに切り替える傾向があります。${styleCount >= 3 ? "すでに複数のスタイルレーンを持っているので、次の変化は近いかもしれません。" : ""}`,
            stargazerSignal: "変化受容 + 即興性が高い",
            styleSignal: `${styleCount}つのスタイルレーン`,
            connectionNarrative:
                "判断パターンが示す「突然の切り替え」は、スタイルの世界でも同じリズムで起きる",
            confidence: 0.6,
            actionSuggestion:
                "今のスタイルに飽きてきたら、それは変化の予兆。無理に抑えず、新しいレーンを試してみて",
            generatedAt: now,
        });
    } else if (changeEmbrace > 0.3) {
        insights.push({
            id: nextId(),
            type: "prediction",
            title: "安定の中の小さな冒険",
            body: "安定を好む判断パターンを持ちながら、ワードローブには微妙な変化の兆しが見えています。大きく変わることはないけれど、小さなアクセントやディテールの変化が、あなたの成長を映し出します。",
            stargazerSignal: "安定志向の判断パターン",
            styleSignal: "ワードローブの微細な変化",
            connectionNarrative:
                "大きな変化を避ける性格でも、スタイルの細部には成長が刻まれる",
            confidence: 0.55,
            actionSuggestion:
                "いつもと違う素材や、わずかに違うシルエットから始めてみて",
            generatedAt: now,
        });
    }

    // 3. GROWTH insight
    const wardrobeSize = state.wardrobe.length;
    const observationCount = profile.observationCount;
    if (wardrobeSize >= 5 && observationCount >= 10) {
        const diversity = new Set(state.wardrobe.map((i) => i.category)).size;
        const identityDepth =
            state.iam.likedTags.length +
            state.iseek.attractedWorldviews.length +
            state.ibecome.pairs.length;

        if (diversity >= 3 && identityDepth >= 3) {
            insights.push({
                id: nextId(),
                type: "growth",
                title: "自己理解の深まりがスタイルに反映され始めている",
                body: `Stargazerで${observationCount}回の観測を重ね、My-Styleでは${wardrobeSize}着のワードローブと${identityDepth}個の自己定義を持っています。両方の世界で自分を見つめた量が、確実にスタイルの解像度を上げています。`,
                stargazerSignal: `${observationCount}回の深層観測`,
                styleSignal: `${wardrobeSize}着 / ${identityDepth}個の自己定義`,
                connectionNarrative:
                    "性格の観測とスタイルの記録が、相互に自己理解の精度を高めている",
                confidence: 0.7,
                generatedAt: now,
            });
        }
    }

    // 4. ARCHETYPE insight
    const archetype = generateArchetypeLabel(profile, state);
    if (archetype.label !== DEFAULT_ARCHETYPE.label) {
        insights.push({
            id: nextId(),
            type: "archetype",
            title: `あなたの型: ${archetype.label}`,
            body: archetype.description,
            stargazerSignal: profile.archetypeLabel
                ? `Stargazerタイプ: ${profile.archetypeLabel}`
                : "性格軸スコアから算出",
            styleSignal: `主要レーン: ${state.styleSelections
                .slice(0, 3)
                .map((sl) => sl.laneCode)
                .join(", ")}`,
            connectionNarrative: `性格特性とスタイル選択の交差から見えた、あなただけの型 -- 「${archetype.label}」`,
            confidence: 0.75,
            generatedAt: now,
        });
    }

    return insights
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
}
