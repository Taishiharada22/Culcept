import "server-only";

export type AIProviderName = "gemini" | "ollama";

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

export type AIProviderResponse = {
  provider: AIProviderName;
  model: string;
  text: string;
  structured: Record<string, unknown> | null;
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
  structured: Record<string, unknown> | null;
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

  constructor(args: {
    provider: AIProviderName;
    code: string;
    message: string;
    retryable: boolean;
    status?: number;
  }) {
    super(args.message);
    this.name = "AIProviderError";
    this.provider = args.provider;
    this.code = args.code;
    this.retryable = args.retryable;
    this.status = args.status;
  }
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError;
}
