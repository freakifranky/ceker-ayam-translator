import { NextRequest, NextResponse } from "next/server";

type Ctx = {
  params: Promise<{ pageId: string }>;
};

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { pageId } = await params;

    // call your existing OCR endpoint (same deployment)
    const baseUrl = req.nextUrl.origin;

    const ocrRes = await fetch(`${baseUrl}/api/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
      cache: "no-store",
    });

    const ocrJson = await ocrRes.json();

    if (!ocrRes.ok) {
      return NextResponse.json(
        { error: { message: ocrJson?.error?.message || "OCR failed" } },
        { status: ocrRes.status }
      );
    }

    return NextResponse.json(
      { page: { id: pageId, ocr_text: ocrJson.text } },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? "Unknown error" } },
      { status: 500 }
    );
  }
}
