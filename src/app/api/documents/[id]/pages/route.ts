import { NextRequest, NextResponse } from "next/server";

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;

    // If you're receiving a multipart form upload:
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { message: "Missing file" } },
        { status: 400 }
      );
    }

    // TODO: your existing logic here:
    // - upload to storage
    // - insert row into pages table
    // - return { page: ... }

    return NextResponse.json({ page: { ok: true, document_id: id } });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message ?? "Unknown error" } },
      { status: 500 }
    );
  }
}
