import "server-only";

import type { StructuredOutput } from "./types";

const INVISIBLE_CHARACTERS = /[\u200B-\u200D\u2060]/g;
const SMART_DOUBLE_QUOTES = /[\u201C\u201D]/g;
const SMART_SINGLE_QUOTES = /[\u2018\u2019]/g;

function removeInvisibleCharacters(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(INVISIBLE_CHARACTERS, "");
}

function normalizeQuotePunctuation(text: string): string {
  return text
    .replace(SMART_DOUBLE_QUOTES, "\"")
    .replace(SMART_SINGLE_QUOTES, "'");
}

export function stripMarkdownCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function extractFirstJsonEnvelope(text: string): string {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  if (startCandidates.length === 0) {
    return text.trim();
  }

  const start = Math.min(...startCandidates);
  const stack: string[] = [];
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (stack.length === 0) continue;
      if (stack[stack.length - 1] !== char) continue;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  const fallbackEnd = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (fallbackEnd > start) {
    return text.slice(start, fallbackEnd + 1).trim();
  }

  return text.slice(start).trim();
}

function nextMeaningfulCharacter(text: string, start: number): string {
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function normalizeStringContent(text: string): string {
  let output = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (!inString) {
      output += char;
      if (char === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaping) {
      output += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaping = true;
      continue;
    }

    if (char === "\r" || char === "\n" || char === "\t") {
      output += " ";
      continue;
    }

    if (char === "`") {
      continue;
    }

    if (char === "\"") {
      const nextChar = nextMeaningfulCharacter(text, index + 1);
      if (
        nextChar === "" ||
        nextChar === "," ||
        nextChar === "]" ||
        nextChar === "}" ||
        nextChar === ":"
      ) {
        output += char;
        inString = false;
      } else {
        output += " ";
      }
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingCommas(text: string): string {
  let output = "";
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      output += char;
      inString = true;
      continue;
    }

    if (char === ",") {
      const nextChar = nextMeaningfulCharacter(text, index + 1);
      if (nextChar === "}" || nextChar === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function repairStructuredJsonText(text: string): string {
  const withoutInvisibleCharacters = removeInvisibleCharacters(text);
  const withoutCodeFence = stripMarkdownCodeFence(withoutInvisibleCharacters.trim());
  const normalizedQuotes = normalizeQuotePunctuation(withoutCodeFence);
  const extractedEnvelope = extractFirstJsonEnvelope(normalizedQuotes);
  const normalizedStrings = normalizeStringContent(extractedEnvelope);
  return removeTrailingCommas(normalizedStrings).trim();
}

function ensureStructuredOutput(value: unknown): StructuredOutput {
  if (value && typeof value === "object") {
    return value as StructuredOutput;
  }
  throw new Error("Structured response is not a JSON object or array");
}

export function sanitizeStructuredJsonText(text: string): string {
  return repairStructuredJsonText(text);
}

export type StructuredJsonRecoveryDebug = {
  rawText: string;
  baseCandidate: string;
  extractedCandidate: string;
  repairedCandidate: string;
};

export function buildStructuredJsonRecoveryDebug(
  text: string,
): StructuredJsonRecoveryDebug {
  const baseCandidate = removeInvisibleCharacters(stripMarkdownCodeFence(text.trim()));
  return {
    rawText: text,
    baseCandidate,
    extractedCandidate: extractFirstJsonEnvelope(baseCandidate),
    repairedCandidate: repairStructuredJsonText(text),
  };
}

function parseCandidate(candidate: string): StructuredOutput {
  let parsed: unknown = JSON.parse(candidate);

  for (let depth = 0; depth < 2; depth++) {
    if (parsed && typeof parsed === "object") {
      return parsed as StructuredOutput;
    }

    if (typeof parsed !== "string") {
      break;
    }

    const nestedCandidate = repairStructuredJsonText(parsed);
    if (!nestedCandidate) {
      break;
    }
    parsed = JSON.parse(nestedCandidate);
  }

  throw new Error("Structured response is not a JSON object or array");
}

export function parseStructuredJsonWithRecovery(text: string): StructuredOutput {
  const debug = buildStructuredJsonRecoveryDebug(text);

  const candidates = Array.from(new Set([
    debug.baseCandidate.trim(),
    debug.extractedCandidate.trim(),
    debug.repairedCandidate.trim(),
  ].filter(Boolean)));

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return ensureStructuredOutput(parseCandidate(candidate));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("json_parse_failed");
}
