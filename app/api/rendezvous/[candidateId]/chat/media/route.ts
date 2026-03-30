import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/rendezvous/[candidateId]/chat/media
 * チャットにメディア（画像/音声）を送信
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { candidateId } = await params;
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify candidate and chat availability
    const { data: candidate } = await supabaseAdmin
      .from("rendezvous_candidates")
      .select("id, user_a, user_b, state")
      .eq("id", candidateId)
      .single();

    if (!candidate)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (candidate.user_a !== user.id && candidate.user_b !== user.id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (candidate.state !== "mutual_liked" && candidate.state !== "chat_opened")
      return NextResponse.json({ error: "Chat not available" }, { status: 400 });

    // Get chat thread
    const { data: chat } = await supabaseAdmin
      .from("rendezvous_chats")
      .select("thread_id")
      .eq("candidate_id", candidateId)
      .maybeSingle();

    if (!chat?.thread_id)
      return NextResponse.json({ error: "No chat thread" }, { status: 400 });

    // Parse file
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file)
      return NextResponse.json({ error: "ファイルが必要です" }, { status: 400 });

    // Determine message type
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isAudio = ALLOWED_AUDIO_TYPES.includes(file.type);

    if (!isImage && !isAudio)
      return NextResponse.json({ error: "JPEG/PNG/WebP/WebM/OGG/MP4 のみ対応" }, { status: 400 });

    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_AUDIO_SIZE;
    if (file.size > maxSize)
      return NextResponse.json({
        error: `ファイルサイズは${maxSize / 1024 / 1024}MB以下にしてください`,
      }, { status: 400 });

    const messageType = isImage ? "image" : "voice";
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const storagePath = `chat/${candidateId}/${user.id}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("rendezvous-photos")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error("[chat/media] upload error:", uploadErr);
      return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("rendezvous-photos")
      .getPublicUrl(storagePath);

    const mediaUrl = urlData?.publicUrl ?? "";

    // Build metadata
    const mediaMetadata: Record<string, unknown> = {
      size_bytes: file.size,
      content_type: file.type,
    };

    // Insert message
    const { data: msg, error: insertErr } = await supabaseAdmin
      .from("rendezvous_messages")
      .insert({
        thread_id: chat.thread_id,
        sender_id: user.id,
        body: messageType === "image" ? "📷 写真" : "🎤 ボイスメッセージ",
        message_type: messageType,
        media_url: mediaUrl,
        media_metadata: mediaMetadata,
      })
      .select("id, sender_id, body, message_type, media_url, media_metadata, created_at")
      .single();

    if (insertErr) {
      await supabaseAdmin.storage.from("rendezvous-photos").remove([storagePath]);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Update candidate state if first message
    if (candidate.state === "mutual_liked") {
      await supabaseAdmin
        .from("rendezvous_candidates")
        .update({ state: "chat_opened" })
        .eq("id", candidateId)
        .eq("state", "mutual_liked");
    }

    // Orbiter signal (fire-and-forget)
    supabaseAdmin.from("orbiter_signals").insert({
      user_id: user.id,
      candidate_id: candidateId,
      signal_type: "chat_media_sent",
      payload: { threadId: chat.thread_id, mediaType: messageType },
    });

    return NextResponse.json({ ok: true, message: msg });
  } catch (err: any) {
    console.error("[chat/media] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
