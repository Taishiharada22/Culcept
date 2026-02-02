// app/drops/new/actions.ts
"use server";

import { createDropAction as createDropActionImpl } from "@/app/_actions/drops";
export type { DropActionState } from "@/app/_actions/drops";
import type { DropActionState } from "@/app/_actions/drops";

// ✅ "use server" ファイルでは re-export がNGなので、async関数としてラップする
export async function createDropAction(arg1: any, arg2?: any): Promise<DropActionState> {
    return await createDropActionImpl(arg1, arg2);
}
