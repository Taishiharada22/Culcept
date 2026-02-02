// app/shops/types.ts
export type ActionState = {
    ok: boolean;
    error: string | null;
    message?: string | null;
    fieldErrors?: Record<string, string | undefined>;
};
