import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * 共鳴フィード — Resonance Feed API
 *
 * Anonymized style DNA matching.
 * POST: Submit own DNA vector + get matching count & tendencies
 * No PII is stored — only hashed user_id + 12-dim vector.
 */

type DnaVector = number[];

function cosineSimilarity(a: DnaVector, b: DnaVector): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

function hashUserId(userId: string): string {
    return crypto.createHash("sha256").update(`resonance_${userId}`).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await supabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const vector: DnaVector = body.vector;

        if (!Array.isArray(vector) || vector.length < 3 || vector.length > 20) {
            return NextResponse.json({ error: "Invalid vector" }, { status: 400 });
        }

        const hashedId = hashUserId(user.id);

        // Upsert own DNA
        const { error: upsertError } = await supabase
            .from("anonymized_style_dna")
            .upsert(
                {
                    hashed_user_id: hashedId,
                    vector: vector,
                    dimension_count: vector.length,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "hashed_user_id" },
            );

        if (upsertError) {
            console.error("Resonance upsert error:", upsertError);
            return NextResponse.json({ error: "Failed to save" }, { status: 500 });
        }

        // Fetch all other vectors
        const { data: others, error: fetchError } = await supabase
            .from("anonymized_style_dna")
            .select("vector")
            .neq("hashed_user_id", hashedId)
            .limit(500);

        if (fetchError) {
            console.error("Resonance fetch error:", fetchError);
            return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
        }

        // Compute similarities
        const THRESHOLD = 0.85;
        const matches: number[] = [];
        const avgVector = new Array(vector.length).fill(0);
        let matchCount = 0;

        for (const row of others ?? []) {
            const otherVec = row.vector as DnaVector;
            if (!Array.isArray(otherVec) || otherVec.length !== vector.length) continue;

            const sim = cosineSimilarity(vector, otherVec);
            if (sim >= THRESHOLD) {
                matchCount++;
                for (let i = 0; i < vector.length; i++) {
                    avgVector[i] += otherVec[i];
                }
            }
        }

        // Compute average matched vector
        if (matchCount > 0) {
            for (let i = 0; i < avgVector.length; i++) {
                avgVector[i] /= matchCount;
            }
        }

        return NextResponse.json({
            matchCount,
            totalUsers: (others ?? []).length,
            avgMatchedVector: matchCount > 0 ? avgVector : null,
            similarity: matchCount > 0
                ? cosineSimilarity(vector, avgVector)
                : null,
        });
    } catch (err) {
        console.error("Resonance API error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
