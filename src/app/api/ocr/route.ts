import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // make sure Buffer is available (Vercel-safe)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Default to GPT-5.2 (you can override in Vercel env)
const OCR_MODEL = process.env.OPENAI_OCR_MODEL || "gpt-5.2";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // We can't throw at module load in some build contexts, but runtime will fail anyway.
  // We'll handle it in the handler for a nicer error.
}

const supabase = createClient(SUPABASE_URL || "", SUPABASE_SERVICE_ROLE_KEY || "", {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY || "" });

const OCR_PROMPT = `
You are an OCR/transcription engine.

The handwriting may contain mixed languages: English and Bahasa Indonesia (including slang/abbreviations like:
- gmn, bgt, cmiiw, yg, dgn
), plus symbols, arrows (->), diagrams, and checklists.

Task:
1) Transcribe EXACTLY what is written.
2) Preserve original language (do NOT translate).
3) Preserve line breaks, bullets, numbering, arrows, and simple diagram structure as best as possible.
4) If a word is unclear, keep it as [unreadable] rather than guessing.
Return only the transcription text.
`.trim();

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: { message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env vars." } },
        { status: 500 }
      );
    }
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: { message: "Missing OPENAI_API_KEY in env vars." } },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const pageId = String(body?.pageId || "").trim();

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

    const imageUrl = String(page.image_original_url).trim();

    // 2) Download image server-side
    const imgRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imgRes.ok) {
      return NextResponse.json(
        { error: { message: `Failed to download image: ${imgRes.status} ${imgRes.statusText}` } },
        { status: 500 }
      );
    }

    const contentType = imgRes.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: { message: `URL did not return an image (got ${contentType})` } },
        { status: 400 }
      );
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    // 3) OpenAI OCR
    const resp = await openai.responses.create({
      model: OCR_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: OCR_PROMPT },
            {
              type: "input_image",
              image_url: dataUrl, // your SDK expects string
              detail: "high",
            },
          ],
        },
      ],
    });

    const text = (resp.output_text || "").trim();

    // 4) Save OCR to DB (best-effort; don't fail OCR response if schema differs)
    const { error: updateErr } = await supabase
      .from("pages")
      .update({
        ocr_text: text,
        processed_at: new Date().toISOString(),
      })
      .eq("id", pageId);

    // If your schema doesn't have these columns, updateErr will exist.
    // We'll ignore it to keep UX smooth, but you can log it.
    if (updateErr) {
      // console.warn("OCR update skipped:", updateErr.message);
    }

    return NextResponse.json({ text, model: OCR_MODEL }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Unknown OCR error" } },
      { status: 500 }
    );
  }
}
