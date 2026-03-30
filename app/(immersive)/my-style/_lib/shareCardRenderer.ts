/**
 * Share Card Renderer -- Canvas API
 *
 * Generates a 1080x1080px share card image from an AssertionInsight.
 * Used for SNS sharing and download.
 */

import type { AssertionInsight, AssertionCategory } from "./assertionEngine";

/* ── Category gradients ── */

const CATEGORY_GRADIENTS: Record<AssertionCategory, [string, string]> = {
    identity: ["#1e293b", "#334155"],
    pattern: ["#0f766e", "#14b8a6"],
    hidden: ["#7c3aed", "#a78bfa"],
    evolution: ["#0369a1", "#38bdf8"],
    contradiction: ["#b91c1c", "#f87171"],
};

const CATEGORY_LABELS: Record<AssertionCategory, string> = {
    identity: "\u30A2\u30A4\u30C7\u30F3\u30C6\u30A3\u30C6\u30A3",
    pattern: "\u30D1\u30BF\u30FC\u30F3",
    hidden: "\u96A0\u3055\u308C\u305F\u81EA\u5206",
    evolution: "\u9032\u5316",
    contradiction: "\u77DB\u76FE",
};

/* ── Canvas helpers ── */

const SIZE = 1080;
const PADDING = 80;
const TEXT_AREA_WIDTH = SIZE - PADDING * 2;

function createLinearGradient(
    ctx: CanvasRenderingContext2D,
    colorA: string,
    colorB: string,
): CanvasGradient {
    const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    return grad;
}

/**
 * Wrap text to fit within maxWidth, returning lines.
 */
function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
): string[] {
    const lines: string[] = [];
    // Split by character for Japanese text (no spaces)
    const chars = [...text];
    let currentLine = "";

    for (const char of chars) {
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = char;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

/* ── Public API ── */

/**
 * Render an AssertionInsight as a 1080x1080 PNG data URL using Canvas API.
 */
export async function renderShareCard(
    insight: AssertionInsight,
): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const [colorA, colorB] = CATEGORY_GRADIENTS[insight.category];

    // ── Background gradient ──
    ctx.fillStyle = createLinearGradient(ctx, colorA, colorB);
    ctx.fillRect(0, 0, SIZE, SIZE);

    // ── Decorative glow circles ──
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(SIZE * 0.85, SIZE * 0.15, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(SIZE * 0.15, SIZE * 0.85, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Category label ──
    const catLabel = CATEGORY_LABELS[insight.category];
    ctx.font = "bold 28px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "center";
    ctx.fillText(
        `\u2014 ${catLabel} \u2014`,
        SIZE / 2,
        PADDING + 60,
    );

    // ── Confidence badge ──
    ctx.font = "bold 22px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fillText(
        `\u78BA\u4FE1\u5EA6 ${Math.round(insight.confidence * 100)}%`,
        SIZE / 2,
        PADDING + 100,
    );

    // ── Main statement (centered, bold) ──
    ctx.font = "bold 48px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";

    const statementLines = wrapText(ctx, insight.statement, TEXT_AREA_WIDTH);
    const lineHeight = 68;
    const totalTextHeight = statementLines.length * lineHeight;
    const textStartY = (SIZE - totalTextHeight) / 2 + 20;

    for (let i = 0; i < statementLines.length; i++) {
        ctx.fillText(statementLines[i], SIZE / 2, textStartY + i * lineHeight);
    }

    // ── Evidence (smaller text, below statement) ──
    const evidenceStartY = textStartY + totalTextHeight + 40;
    ctx.font = "24px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";

    const maxEvidence = Math.min(insight.evidence.length, 3);
    for (let i = 0; i < maxEvidence; i++) {
        const evText = `\u2022 ${insight.evidence[i]}`;
        const evLines = wrapText(ctx, evText, TEXT_AREA_WIDTH - 40);
        for (let j = 0; j < Math.min(evLines.length, 2); j++) {
            ctx.fillText(
                evLines[j],
                SIZE / 2,
                evidenceStartY + i * 70 + j * 32,
            );
        }
    }

    // ── Divider line ──
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING + 100, SIZE - PADDING - 80);
    ctx.lineTo(SIZE - PADDING - 100, SIZE - PADDING - 80);
    ctx.stroke();

    // ── Watermark ──
    ctx.font = "bold 26px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.textAlign = "center";
    ctx.fillText("Aneurasync", SIZE / 2, SIZE - PADDING - 30);

    ctx.font = "18px 'Hiragino Sans', 'Noto Sans JP', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillText(
        "\u65AD\u8A00\u30A4\u30F3\u30B5\u30A4\u30C8",
        SIZE / 2,
        SIZE - PADDING,
    );

    return canvas.toDataURL("image/png");
}

/**
 * Download a data URL as a file.
 */
export function downloadShareCard(
    dataUrl: string,
    filename = "aneurasync-insight.png",
): void {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
