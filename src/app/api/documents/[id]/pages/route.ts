import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const documentId = params.id;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.name.split(".").pop() || "jpg";
    const storagePath = `documents/${documentId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("handnotes") // <-- make sure your bucket name is "handnotes"
      .upload(storagePath, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("UPLOAD ERROR:", uploadError);
      return NextResponse.json({ error: uploadError }, { status: 500 });
    }

    const { data: publicUrl } = supabaseAdmin.storage
      .from("handnotes")
      .getPublicUrl(storagePath);

    const imageUrl = publicUrl.publicUrl;

    const { data, error } = await supabaseAdmin
      .from("pages")
      .insert({
        document_id: documentId,
        page_number: 1,
        image_url: imageUrl,
      })
      .select("*")
      .single();

    if (error) {
      console.error("DB ERROR:", error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ page: data });
  } catch (e: any) {
    console.error("SERVER ERROR:", e);
    return NextResponse.json(
      { error: { message: e?.message ?? "Unknown error" } },
      { status: 500 }
    );
  }
}
