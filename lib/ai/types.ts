import "server-only";

export const PRIMARY_AI_PROVIDER = "gemini" as const;

export type AIProviderName = "gemini" | "openai";

export type AIProviderRequest = {
  prompt: string;
  systemPrompt?: string;
  jsonSchema?: Record<string, unknown>;
  requireJson?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  inputParts?: unknown[];
};

/** Structured JSON output — object or array (Gemini may return either) */
export type StructuredOutput = Record<string, unknown> | unknown[];

export type AIProviderResponse = {
  provider: AIProviderName;
  model: string;
  text: string;
  structured: StructuredOutput | null;
  inputTokens: number | null;
  outputTokens: number | null;
  confidence: number | null;
};

export type RunAIParams = {
  taskType: string;
  prompt: string;
  systemPrompt?: string;
  jsonSchema?: Record<string, unknown>;
  requireJson?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  inputParts?: unknown[];
  userId?: string;
  sessionId?: string;
  preferredProvider?: AIProviderName;
  allowFallback?: boolean;
  metadata?: Record<string, unknown>;
};

export type AIRunResult = {
  text: string;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
  success: boolean;
  structured: StructuredOutput | null;
  fallbackUsed: boolean;
  cacheHit: boolean;
  cacheKey: string | null;
  confidence: number | null;
  errorMessage: string | null;
  aiRunId: string | null;
};

export class AIProviderError extends Error {
  provider: AIProviderName;
  code: string;
  retryable: boolean;
  status?: number;
  responseText?: string | null;
  structured?: StructuredOutput | null;
  metadata?: Record<string, unknown>;

  constructor(args: {
    provider: AIProviderName;
    code: string;
    message: string;
    retryable: boolean;
    status?: number;
    responseText?: string | null;
    structured?: StructuredOutput | null;
    metadata?: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "AIProviderError";
    this.provider = args.provider;
    this.code = args.code;
    this.retryable = args.retryable;
    this.status = args.status;
    this.responseText = args.responseText ?? null;
    this.structured = args.structured ?? null;
    this.metadata = args.metadata;
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
