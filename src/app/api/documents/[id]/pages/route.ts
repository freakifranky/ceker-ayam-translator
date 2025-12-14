// src/app/api/documents/[id]/pages/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const documentId = params.id;

    const body = await req.json().catch(() => ({}));
    const pageIndex =
      typeof body?.page_index === "number" ? body.page_index : 1;

    // Example insert (adjust table/columns to match your schema)
    const { data, error } = await supabase
      .from("pages")
      .insert({
        document_id: documentId,
        page_index: pageIndex,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({ page: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: { message: e?.message || "Unknown error" } },
      { status: 500 }
    );
  }
}
