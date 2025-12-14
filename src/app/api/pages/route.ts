import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Helper: consistent error shape
function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json(
    { error: { message, ...(extra ? { extra } : {}) } },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const documentIdRaw = form.get("documentId");
    const fileRaw = form.get("file");

    const documentId = typeof documentIdRaw === "string" ? documentIdRaw : "";
    const file = fileRaw instanceof File ? fileRaw : null;

    if (!documentId) return jsonError("Missing documentId", 400);
    if (!file) return jsonError("Missing file", 400);

    // Basic validation (MVP)
    if (!file.type.startsWith("image/")) {
      return jsonError(`File must be an image. Got: ${file.type || "unknown"}`, 400);
    }
    if (file.size <= 0) return jsonError("Empty file", 400);

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "handnotes";

    // Safer extension parsing
    const nameParts = (file.name || "upload.png").split(".");
    const ext = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : "png";

    const storagePath = `${documentId}/${crypto.randomUUID()}.${ext}`;

    // Upload to storage
    const bytes = new Uint8Array(await file.arrayBuffer());
    const upload = await supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (upload.error) {
      return jsonError(upload.error.message, 500, { step: "storage.upload" });
    }

    // IMPORTANT:
    // Your schema requires image_original_url NOT NULL.
    // This works best if the bucket is PUBLIC.
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const imageOriginalUrl = publicUrlData?.publicUrl;

    if (!imageOriginalUrl) {
      // cleanup the uploaded object
      await supabase.storage.from(bucket).remove([storagePath]);
      return jsonError("Failed to create public URL for uploaded file.", 500, {
        step: "storage.getPublicUrl",
      });
    }

    // Auto-increment page_index per document (so you can upload more than 1 page)
    const latest = await supabase
      .from("pages")
      .select("page_index")
      .eq("document_id", documentId)
      .order("page_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest.error) {
      await supabase.storage.from(bucket).remove([storagePath]);
      return jsonError(latest.error.message, 500, { step: "pages.select_latest_index" });
    }

    const nextPageIndex = (latest.data?.page_index ?? 0) + 1;

    // Insert row
    // ✅ Only include fields you KNOW exist and/or are required.
    const insert = await supabase
      .from("pages")
      .insert({
        document_id: documentId,
        page_index: nextPageIndex,
        image_original_url: imageOriginalUrl, // required by your schema
        // optional if your table has them — keep them only if confirmed:
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
      })
      .select(
        "id, document_id, page_index, image_original_url, storage_path, original_filename, mime_type, created_at"
      )
      .single();

    if (insert.error) {
      // cleanup storage object on DB failure
      await supabase.storage.from(bucket).remove([storagePath]);
      return jsonError(insert.error.message, 500, { step: "pages.insert" });
    }

    return NextResponse.json({ page: insert.data }, { status: 200 });
  } catch (e: any) {
    return jsonError(e?.message || "Unknown server error", 500, { step: "catch" });
  }
}
