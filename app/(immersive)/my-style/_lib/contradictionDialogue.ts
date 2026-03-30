/**
 * 矛盾ダイアログ — Contradiction Dialogue Engine
 *
 * Turn passive contradiction detection into an interactive
 * self-discovery conversation. Questions go from "what" to "why"
 * to "what does this mean about me."
 */

import type { Contradiction } from "./contradictionDetector";
import { uid } from "./constants";

/* ── Types ── */

export interface DialogueOption {
    id: string;
    label: string;
    leadsTo: "deeper" | "resolve" | "accept";
    insight?: string;
}

export interface ContradictionQuestion {
    id: string;
    contradictionId: string;
    question: string;
    options: DialogueOption[];
    depth: number; // 0=surface, 1=exploring, 2=deep
    followUps: Record<string, ContradictionQuestion>; // optionId → next question
}

export interface ContradictionSession {
    id: string;
    startedAt: string;
    contradictionId: string;
    answers: Array<{ questionId: string; selectedOptionId: string }>;
    resolution?: "understood" | "accepted" | "unresolved";
    discoveredInsight?: string;
}

const DIALOGUE_SESSIONS_KEY = "culcept_contradiction_sessions_v1";

/* ── Dialogue templates per axis ── */

type AxisDialogueTemplate = {
    surfaceQuestion: string;
    options: Array<{
        label: string;
        leadsTo: "deeper" | "resolve" | "accept";
        followUp: {
            question: string;
            options: Array<{
                label: string;
                leadsTo: "deeper" | "resolve" | "accept";
                insight: string;
                deepFollowUp?: {
                    question: string;
                    options: Array<{
                        label: string;
                        leadsTo: "resolve" | "accept";
                        insight: string;
                    }>;
                };
            }>;
        };
    }>;
};

function buildTemplateForContradiction(
    swipeLabel: string,
    statedLabel: string,
    severity: Contradiction["severity"],
): AxisDialogueTemplate {
    return {
        surfaceQuestion: `\u3042\u306A\u305F\u306F\u300C${statedLabel}\u300D\u304C\u597D\u304D\u3068\u8A00\u3044\u307E\u3057\u305F\u3002\u3067\u3082\u30B9\u30EF\u30A4\u30D7\u3067\u306F\u300C${swipeLabel}\u300D\u306B\u60F9\u304B\u308C\u3066\u3044\u307E\u3059\u3002\u3069\u3061\u3089\u304C\u672C\u5F53\uFF1F`,
        options: [
            {
                label: `\u300C${statedLabel}\u300D\u304C\u672C\u5F53\u306E\u81EA\u5206`,
                leadsTo: "deeper",
                followUp: {
                    question: `\u3067\u306F\u3001\u300C${swipeLabel}\u300D\u306B\u60F9\u304B\u308C\u308B\u77AC\u9593\u306F\u4F55\u304C\u8D77\u304D\u3066\u3044\u308B\u306E\u3067\u3057\u3087\u3046\uFF1F`,
                    options: [
                        {
                            label: "\u7591\u308C\u3084\u30B9\u30C8\u30EC\u30B9\u304C\u3042\u308B\u3068\u304D\u306B\u60F9\u304B\u308C\u308B",
                            leadsTo: "deeper",
                            insight: `\u300C${swipeLabel}\u300D\u3078\u306E\u60F9\u304B\u308C\u306F\u3001\u65E5\u5E38\u306E\u30B9\u30C8\u30EC\u30B9\u3078\u306E\u53CD\u52D5\u304B\u3082\u3057\u308C\u307E\u305B\u3093`,
                            deepFollowUp: {
                                question: `\u3064\u307E\u308A\u300C${swipeLabel}\u300D\u306F\u3042\u306A\u305F\u306B\u3068\u3063\u3066\u300C\u89E3\u653E\u300D\u306E\u8C61\u5FB4\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002\u5FC3\u5F53\u305F\u308A\u306F\u3042\u308A\u307E\u3059\u304B\uFF1F`,
                                options: [
                                    {
                                        label: "\u78BA\u304B\u306B\u305D\u3046\u304B\u3082\u3057\u308C\u306A\u3044",
                                        leadsTo: "resolve",
                                        insight: `\u3042\u306A\u305F\u306E\u300C${swipeLabel}\u300D\u3078\u306E\u60F9\u304B\u308C\u306F\u3001\u65E5\u5E38\u304B\u3089\u306E\u89E3\u653E\u6B32\u6C42\u306E\u8868\u308C\u3067\u3059\u3002\u300C${statedLabel}\u300D\u304C\u300C\u5B89\u5168\u300D\u3067\u3001\u300C${swipeLabel}\u300D\u304C\u300C\u81EA\u7531\u300D\u2014\u2014\u4E21\u65B9\u304C\u3042\u306A\u305F\u306E\u672C\u7269\u3067\u3059`,
                                    },
                                    {
                                        label: "\u3088\u304F\u308F\u304B\u3089\u306A\u3044",
                                        leadsTo: "accept",
                                        insight: `\u305D\u308C\u306F\u81EA\u7136\u306A\u3053\u3068\u3067\u3059\u3002\u6B21\u306B\u300C${swipeLabel}\u300D\u306A\u3082\u306E\u306B\u624B\u304C\u4F38\u3073\u305F\u3068\u304D\u3001\u305D\u306E\u77AC\u9593\u306E\u611F\u899A\u3092\u89B3\u5BDF\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044`,
                                    },
                                ],
                            },
                        },
                        {
                            label: "\u7279\u306B\u7406\u7531\u306A\u304F\u76EE\u304C\u884C\u304F",
                            leadsTo: "resolve",
                            insight: `\u7406\u7531\u306A\u304F\u60F9\u304B\u308C\u308B\u3082\u306E\u3053\u305D\u3001\u672C\u80FD\u7684\u306A\u597D\u307F\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002\u300C${statedLabel}\u300D\u306F\u300C\u7406\u60F3\u306E\u81EA\u5206\u300D\u3067\u3001\u300C${swipeLabel}\u300D\u306F\u300C\u7D20\u306E\u81EA\u5206\u300D\u304B\u3082`,
                        },
                    ],
                },
            },
            {
                label: `\u5B9F\u306F\u300C${swipeLabel}\u300D\u3082\u597D\u304D`,
                leadsTo: "deeper",
                followUp: {
                    question: `\u300C${statedLabel}\u300D\u3092\u9078\u3076\u7406\u7531\u306F\u300C\u597D\u304D\u300D\u3067\u306F\u306A\u304F\u300C\u5B89\u5168\u300D\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002\u5FC3\u5F53\u305F\u308A\u306F\uFF1F`,
                    options: [
                        {
                            label: "\u78BA\u304B\u306B\u3001\u5B89\u5FC3\u611F\u3067\u9078\u3093\u3067\u3044\u308B\u304B\u3082",
                            leadsTo: "resolve",
                            insight: `\u3042\u306A\u305F\u306E\u300C${statedLabel}\u300D\u306F\u300C\u597D\u304D\u300D\u3067\u306F\u306A\u304F\u300C\u5B89\u5168\u300D\u306E\u9078\u629E\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002\u672C\u5F53\u306E\u597D\u304D\u306F\u300C${swipeLabel}\u300D\u306E\u5074\u306B\u3042\u308B\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059`,
                        },
                        {
                            label: "\u4E21\u65B9\u306E\u826F\u3044\u3068\u3053\u308D\u304C\u597D\u304D",
                            leadsTo: "resolve",
                            insight: `\u300C${statedLabel}\u300D\u3068\u300C${swipeLabel}\u300D\u306E\u878D\u5408\u2014\u2014\u305D\u308C\u304C\u3042\u306A\u305F\u3060\u3051\u306E\u30AA\u30EA\u30B8\u30CA\u30EB\u30B9\u30BF\u30A4\u30EB\u304B\u3082\u3057\u308C\u307E\u305B\u3093\u3002\u77DB\u76FE\u3067\u306F\u306A\u304F\u3001\u72EC\u81EA\u6027\u3067\u3059`,
                        },
                    ],
                },
            },
            {
                label: "\u308F\u304B\u3089\u306A\u3044",
                leadsTo: "accept",
                followUp: {
                    question: `\u305D\u308C\u306F\u81EA\u7136\u306A\u3053\u3068\u3067\u3059\u3002\u77DB\u76FE\u306F\u300C\u7B54\u3048\u304C\u5FC5\u8981\u306A\u554F\u984C\u300D\u3067\u306F\u306A\u304F\u3001\u300C\u89B3\u5BDF\u3059\u3079\u304D\u73FE\u8C61\u300D\u3067\u3059\u3002\u6B21\u306B\u300C${swipeLabel}\u300D\u306A\u3082\u306E\u306B\u624B\u304C\u4F38\u3073\u305F\u3068\u304D\u3001\u305D\u306E\u611F\u899A\u3092\u89B3\u5BDF\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044`,
                    options: [
                        {
                            label: "\u305D\u3046\u3057\u3066\u307F\u308B",
                            leadsTo: "accept",
                            insight: `\u77DB\u76FE\u306F\u5F31\u70B9\u3067\u306F\u306A\u304F\u3001\u6DF1\u3055\u306E\u8A3C\u3067\u3059\u3002\u300C${statedLabel}\u300D\u3068\u300C${swipeLabel}\u300D\u306E\u9593\u306E\u7DCA\u5F35\u304C\u3001\u3042\u306A\u305F\u306E\u30B9\u30BF\u30A4\u30EB\u306B\u5E45\u3092\u4E0E\u3048\u3066\u3044\u307E\u3059`,
                        },
                    ],
                },
            },
        ],
    };
}

/* ── Build dialogue tree ── */

function buildQuestionFromTemplate(
    contradictionId: string,
    template: AxisDialogueTemplate,
): ContradictionQuestion {
    const rootId = uid();

    const followUps: Record<string, ContradictionQuestion> = {};
    const rootOptions: DialogueOption[] = [];

    for (const opt of template.options) {
        const optId = uid();
        const level1Id = uid();
        const level1FollowUps: Record<string, ContradictionQuestion> = {};
        const level1Options: DialogueOption[] = [];

        for (const subOpt of opt.followUp.options) {
            const subOptId = uid();
            const level2FollowUps: Record<string, ContradictionQuestion> = {};

            if (subOpt.deepFollowUp) {
                const level2Id = uid();
                const level2Options: DialogueOption[] = [];
                for (const deepOpt of subOpt.deepFollowUp.options) {
                    const deepOptId = uid();
                    level2Options.push({
                        id: deepOptId,
                        label: deepOpt.label,
                        leadsTo: deepOpt.leadsTo,
                        insight: deepOpt.insight,
                    });
                }
                level2FollowUps[subOptId] = {
                    id: level2Id,
                    contradictionId,
                    question: subOpt.deepFollowUp.question,
                    options: level2Options,
                    depth: 2,
                    followUps: {},
                };
            }

            level1Options.push({
                id: subOptId,
                label: subOpt.label,
                leadsTo: subOpt.leadsTo,
                insight: subOpt.insight,
            });
            Object.assign(level1FollowUps, level2FollowUps);
        }

        followUps[optId] = {
            id: level1Id,
            contradictionId,
            question: opt.followUp.question,
            options: level1Options,
            depth: 1,
            followUps: level1FollowUps,
        };

        rootOptions.push({
            id: optId,
            label: opt.label,
            leadsTo: opt.leadsTo,
        });
    }

    return {
        id: rootId,
        contradictionId,
        question: template.surfaceQuestion,
        options: rootOptions,
        depth: 0,
        followUps: followUps,
    };
}

/* ── Public API ── */

/**
 * Build an interactive dialogue tree for a contradiction.
 */
export function buildDialogue(
    contradiction: Contradiction,
): ContradictionQuestion {
    const labels = contradiction.axisLabel.split(" \u27F7 ");
    const swipeLabel =
        contradiction.swipeDirection < 0
            ? labels[0]
            : labels[1] ?? labels[0];
    const statedLabel =
        contradiction.statedPreference < 0
            ? labels[0]
            : labels[1] ?? labels[0];

    const template = buildTemplateForContradiction(
        swipeLabel,
        statedLabel,
        contradiction.severity,
    );

    return buildQuestionFromTemplate(contradiction.id, template);
}

export type ProcessAnswerResult =
    | { type: "next_question"; question: ContradictionQuestion }
    | { type: "resolution"; insight: string; resolution: ContradictionSession["resolution"] };

/**
 * Process a user answer and return the next question or resolution.
 */
export function processAnswer(
    currentQuestion: ContradictionQuestion,
    selectedOptionId: string,
): ProcessAnswerResult {
    const selectedOption = currentQuestion.options.find(
        (o) => o.id === selectedOptionId,
    );

    if (!selectedOption) {
        return {
            type: "resolution",
            insight: "\u77DB\u76FE\u306F\u5F31\u70B9\u3067\u306F\u306A\u304F\u3001\u6DF1\u3055\u306E\u8A3C\u3067\u3059",
            resolution: "unresolved",
        };
    }

    // Check for follow-up question
    const nextQuestion = currentQuestion.followUps[selectedOptionId];
    if (nextQuestion && selectedOption.leadsTo === "deeper") {
        return { type: "next_question", question: nextQuestion };
    }

    // Resolution
    const insight =
        selectedOption.insight ??
        "\u3053\u306E\u77DB\u76FE\u3092\u8A8D\u3081\u308B\u3053\u3068\u81EA\u4F53\u304C\u3001\u81EA\u5DF1\u7406\u89E3\u306E\u4E00\u6B69\u3067\u3059";
    const resolution: ContradictionSession["resolution"] =
        selectedOption.leadsTo === "resolve" ? "understood" : "accepted";

    return { type: "resolution", insight, resolution };
}

/**
 * Save a completed session.
 */
export function saveSession(session: ContradictionSession): void {
    if (typeof window === "undefined") return;
    try {
        const sessions = getCompletedSessions();
        sessions.unshift(session);
        localStorage.setItem(
            DIALOGUE_SESSIONS_KEY,
            JSON.stringify(sessions.slice(0, 30)),
        );
    } catch {
        // silent fail
    }
}

/**
 * Get all completed sessions.
 */
export function getCompletedSessions(): ContradictionSession[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(DIALOGUE_SESSIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Get contradictions that have not been explored yet.
 */
export function getUnexploredContradictions(
    allContradictions: Contradiction[],
): Contradiction[] {
    const sessions = getCompletedSessions();
    const explored = new Set(sessions.map((s) => s.contradictionId));
    return allContradictions.filter((c) => !explored.has(c.id));
}

/**
 * Create a new empty session.
 */
export function createSession(
    contradictionId: string,
): ContradictionSession {
    return {
        id: uid(),
        startedAt: new Date().toISOString(),
        contradictionId,
        answers: [],
    };
}
