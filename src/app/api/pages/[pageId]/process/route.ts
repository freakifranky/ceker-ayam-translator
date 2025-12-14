import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Params = { pageId: string };

export async function POST(_req: Request, ctx: { params: Params }) {
  try {
    const pageId = ctx.params.pageId;

    if (!pageId) {
      return NextResponse.json(
        { error: { message: "Missing pageId" } },
        { status: 400 }
      );
    }

    // 1) Load page
    const pageRes = await supabase
      .from("pages")
      .select("id, document_id, page_index, image_original_url")
      .eq("id", pageId)
      .single();

    if (pageRes.error) {
      return NextResponse.json(
        { error: { message: pageRes.error.message } },
        { status: 500 }
      );
    }

    const page = pageRes.data;
    if (!page?.image_original_url) {
      return NextResponse.json(
        { error: { message: "Page missing image_original_url" } },
        { status: 400 }
      );
    }

    // 2) OCR + structure
    const resp = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract handwriting from the image.\n" +
                "Return STRICT JSON ONLY with keys:\n" +
                `{"cleaned_text": string, "structured_json": {"doc_type":"paragraphs","items":[{"type":"paragraph","text":string}]}}\n` +
                "No markdown. No extra keys.",
            },
            { type: "input_image", image_url: page.image_original_url },
          ],
        },
      ],
    });

    const out = (resp.output_text || "").trim();
    if (!out) {
      return NextResponse.json(
        { error: { message: "Empty model output" } },
        { status: 500 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(out);
    } catch {
      return NextResponse.json(
        {
          error: { message: "Model output not valid JSON" },
          raw: out.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    const cleanedText = parsed?.cleaned_text;
    const structuredJson = parsed?.structured_json;

    if (!cleanedText || !structuredJson) {
      return NextResponse.json(
        { error: { message: "JSON missing cleaned_text / structured_json" } },
        { status: 500 }
      );
    }

    // 3) Persist results to pages
    const update = await supabase
      .from("pages")
      .update({
        ocr_text: cleanedText,
        ocr_json: structuredJson,
        processed_at: new Date().toISOString(),
      })
      .eq("id", pageId)
      .select(
        "id, document_id, page_index, image_original_url, ocr_text, ocr_json, processed_at"
      )
      .single();

    if (update.error) {
      return NextResponse.json(
        { error: { message: update.error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ page: update.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Unknown server error" } },
      { status: 500 }
    );
  }
}
