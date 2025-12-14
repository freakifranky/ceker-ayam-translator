import { NextRequest, NextResponse } from "next/server";

type Ctx = {
  params: Promise<{ pageId: string }>;
};

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const { pageId } = await params;

    // ✅ keep your existing processing logic here
    // - fetch page by pageId
    // - run OCR / processing
    // - update DB
    // - return updated page payload

    return NextResponse.json({
      page: {
        id: pageId,
        // ...your real fields here
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? "Unknown error" } },
      { status: 500 }
    );
  }
}
