import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pageId = String(body?.pageId || "").trim();

    if (!pageId) {
      return NextResponse.json(
        { error: { message: "Missing pageId" } },
        { status: 400 }
      );
    }

    // 1) Load page row
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .select("id, image_original_url")
      .eq("id", pageId)
      .single();

    if (pageErr || !page?.image_original_url) {
      return NextResponse.json(
        {
          error: {
            message:
              pageErr?.message || "Page not found / missing image_original_url",
          },
        },
        { status: 404 }
      );
    }

    const imageUrl = String(page.image_original_url).trim();

    // 2) Download image server-side
    const imgRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imgRes.ok) {
      return NextResponse.json(
        {
          error: {
            message: `Failed to download image: ${imgRes.status} ${imgRes.statusText}`,
          },
        },
        { status: 500 }
      );
    }

    const contentType =
      imgRes.headers.get("content-type") || "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: { message: `URL did not return an image (got ${contentType})` } },
        { status: 400 }
      );
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    // 3) OpenAI vision extract (FIX: add detail + object form)
    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract the handwritten text exactly. Preserve line breaks. " +
                "If some words are unclear, keep them as [unreadable].",
            },
            {
              type: "input_image",
              image_url: { url: dataUrl },
              detail: "high",
            },
          ],
        },
      ],
    });

    const text = (resp.output_text || "").trim();

    // (Optional but recommended) save OCR result to DB
    // comment this out if your pages table doesn't have these columns
    await supabase
      .from("pages")
      .update({
        ocr_text: text,
        processed_at: new Date().toISOString(),
      })
      .eq("id", pageId);

    return NextResponse.json({ text }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Unknown OCR error" } },
      { status: 500 }
    );
  }
}
