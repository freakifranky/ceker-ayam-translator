import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { pageId } = await req.json();

    if (!pageId) {
      return NextResponse.json({ error: { message: "Missing pageId" } }, { status: 400 });
    }

    // 1) Load page row
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .select("id, image_original_url")
      .eq("id", pageId)
      .single();

    if (pageErr || !page?.image_original_url) {
      return NextResponse.json(
        { error: { message: pageErr?.message || "Page not found / missing image_original_url" } },
        { status: 404 }
      );
    }

    const imageUrl = String(page.image_original_url).trim(); // keep clean

    // 2) Fetch the image on YOUR server
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json(
        { error: { message: `Failed to download image: ${imgRes.status} ${imgRes.statusText}` } },
        { status: 500 }
      );
    }

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    // 3) Send image bytes to OpenAI (no URL download needed)
    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Extract the handwritten text exactly. Preserve line breaks." },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
    });

    const text =
      resp.output_text?.trim() ||
      "";

    return NextResponse.json({ text }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Unknown OCR error" } },
      { status: 500 }
    );
  }
}
