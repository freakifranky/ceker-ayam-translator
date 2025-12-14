import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs"; // important: keep supabase + env stable

export async function POST() {
  try {
    const payload = {
      title: "Untitled",
      template_type: "work_doc_notes",
    };

    const { data, error } = await supabaseAdmin
      .from("documents")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      // This is the money log — you should see it in the terminal running `npm run dev`
      console.error("SUPABASE ERROR (full):", JSON.stringify(error, null, 2));

      // Return ALL fields, not just message
      return NextResponse.json(
        { error: { ...error }, payload },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    console.error("SERVER ERROR (full):", e);

    return NextResponse.json(
      {
        error: {
          message: e?.message ?? "Unknown server error",
          name: e?.name,
          stack: e?.stack,
        },
      },
      { status: 500 }
    );
  }
}
