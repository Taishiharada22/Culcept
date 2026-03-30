import { NextRequest, NextResponse } from "next/server";
import { resolveShoeWidthCodeServer } from "@/lib/shoeWidthServer";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await resolveShoeWidthCodeServer({
      audience: body?.audience,
      footLengthCm: Number(body?.footLengthCm ?? NaN),
      footGirthCm: Number(body?.footGirthCm ?? NaN),
      subcategoryId: body?.subcategoryId,
    });

    return NextResponse.json({
      ok: true,
      audience: result.audience,
      rounded_foot_length_cm: result.roundedFootLengthCm,
      width_code: result.widthCode,
      display_value: result.displayValue,
    });
  } catch (error: any) {
    console.error("shoe-width resolve error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? "Internal error"),
      },
      { status: 500 }
    );
  }
}
