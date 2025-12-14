"use client";

import { useMemo, useState } from "react";

type CreateDocResponse = { id: string };

type PageRow = {
  id: string;
  document_id: string;
  page_index: number;
  image_original_url: string;
  storage_path?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  created_at?: string | null;
};

export default function HomePage() {
  const accent = "#7CFC98";
  const danger = "#ff6b6b";

  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [docId, setDocId] = useState<string>("");
  const [pageInfo, setPageInfo] = useState<PageRow | null>(null);

  // OCR
  const [ocrText, setOcrText] = useState<string>("");
  const [ocrStatus, setOcrStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [ocrError, setOcrError] = useState<string>("");

  const canRun = !!file && status !== "working";

  const headline = "🐔 Ceker Ayam Translator";
  const subhead = "Messy handwriting? Let's make it readable to you and others!";

  const buttonLabel = useMemo(() => {
    if (status === "working") return "Uploading & Translating...";
    return "Upload & Translate";
  }, [status]);

  function prettyBytes(bytes: number) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function resetFlow(nextFile: File | null) {
    setFile(nextFile);

    setStatus("idle");
    setErrorMsg("");
    setDocId("");
    setPageInfo(null);

    setOcrText("");
    setOcrStatus("idle");
    setOcrError("");
  }

  async function handleOneGo() {
    if (!file) return;

    setStatus("working");
    setErrorMsg("");
    setDocId("");
    setPageInfo(null);

    setOcrText("");
    setOcrStatus("idle");
    setOcrError("");

    try {
      // 1) Create document
      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", template_type: "paragraphs" }),
      });

      const docRaw = await docRes.text();
      if (!docRes.ok) {
        setStatus("error");
        setErrorMsg(docRaw || `Create document failed (${docRes.status})`);
        return;
      }

      const docData = JSON.parse(docRaw) as CreateDocResponse;
      if (!docData?.id) {
        setStatus("error");
        setErrorMsg("Create document succeeded but returned no document id.");
        return;
      }
      setDocId(docData.id);

      // 2) Upload page
      const fd = new FormData();
      fd.append("documentId", docData.id);
      fd.append("file", file);

      const pageRes = await fetch("/api/pages", { method: "POST", body: fd });

      const pageRaw = await pageRes.text();
      let pageJson: any = null;
      try {
        pageJson = JSON.parse(pageRaw);
      } catch {}

      if (!pageRes.ok) {
        setStatus("error");
        setErrorMsg(
          pageJson?.error?.message ||
            pageRaw ||
            `Upload failed (${pageRes.status})`
        );
        return;
      }

      const page = pageJson?.page as PageRow | undefined;
      if (!page?.id) {
        setStatus("error");
        setErrorMsg("Upload succeeded but returned no page id.");
        return;
      }

      setPageInfo(page);

      // 3) OCR automatically
      setOcrStatus("running");
      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: page.id }),
      });

      const ocrRaw = await ocrRes.text();
      let ocrJson: any = null;
      try {
        ocrJson = JSON.parse(ocrRaw);
      } catch {}

      if (!ocrRes.ok) {
        setOcrStatus("error");
        setOcrError(
          ocrJson?.error?.message || ocrRaw || `OCR failed (${ocrRes.status})`
        );
        setStatus("success"); // upload succeeded; OCR failed
        return;
      }

      setOcrText((ocrJson?.text ?? "") as string);
      setOcrStatus("done");

      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.message || "Unknown error");
    }
  }

  function downloadTxt(text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "handnotes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system",
        maxWidth: 1200,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <style>{`
        .hn-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
        @media (min-width: 900px) {
          .hn-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* Header */}
      <header style={{ paddingTop: 6 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.03)",
            fontSize: 12,
            opacity: 0.9,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: accent,
              boxShadow: "0 0 18px rgba(124,252,152,0.35)",
            }}
          />
          Handwriting → Notes
        </div>

        <h1 style={{ margin: "10px 0 0", fontSize: 40, letterSpacing: -0.7 }}>
          {headline}
        </h1>
        <p style={{ marginTop: 8, opacity: 0.78, fontSize: 15 }}>{subhead}</p>

        <hr style={{ margin: "16px 0", opacity: 0.14 }} />
      </header>

      {/* Upload (dropzone-like) */}
      <section
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 18,
          padding: 18,
          background:
            "radial-gradient(1200px 400px at 20% -20%, rgba(124,252,152,0.12), transparent 60%), rgba(255,255,255,0.03)",
          boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 650, fontSize: 14, opacity: 0.9 }}>
              Upload your handwriting
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
              PNG / JPG • 1 page • Auto create → upload → OCR
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px dashed rgba(255,255,255,0.25)",
                background: "rgba(0,0,0,0.25)",
                cursor: "pointer",
              }}
              title="Choose an image"
            >
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  resetFlow(f);
                }}
              />
              <span style={{ opacity: 0.9, fontWeight: 600 }}>Choose file</span>
              <span style={{ opacity: 0.55, fontSize: 12 }}>
                {file ? `${file.name} (${prettyBytes(file.size)})` : "No file selected"}
              </span>
            </label>

            <button
              onClick={handleOneGo}
              disabled={!canRun}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: canRun
                  ? "linear-gradient(135deg, rgba(124,252,152,0.28), rgba(124,252,152,0.10))"
                  : "rgba(255,255,255,0.03)",
                color: "inherit",
                cursor: canRun ? "pointer" : "not-allowed",
                opacity: canRun ? 1 : 0.55,
                fontWeight: 700,
              }}
            >
              {buttonLabel}
            </button>

            {status === "working" && (
              <span style={{ opacity: 0.75, fontSize: 13 }}>
                {ocrStatus === "running" ? "Reading handwriting…" : "Working…"}
              </span>
            )}
          </div>
        </div>

        {status === "error" && (
          <div style={{ marginTop: 12, color: danger }}>
            <strong>Failed:</strong> {errorMsg}
          </div>
        )}
      </section>

      {/* Results */}
      {(pageInfo || status === "success") && (
        <section className="hn-grid">
          {/* Left: Image card */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                <span style={{ color: accent }}>
                  {pageInfo ? "Uploaded ✅" : "Waiting…"}
                </span>
                <span style={{ marginLeft: 10, opacity: 0.65, fontWeight: 500 }}>
                  Preview
                </span>
              </div>

              {docId && (
                <div style={{ opacity: 0.85, fontSize: 12 }}>
                  <span style={{ opacity: 0.7 }}>Doc</span> <code>{docId}</code>
                </div>
              )}
            </div>

            {pageInfo?.image_original_url ? (
              <div style={{ marginTop: 12 }}>
                <img
                  src={pageInfo.image_original_url}
                  alt="uploaded page"
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "block",
                    maxHeight: 560,
                    objectFit: "contain",
                    background: "rgba(0,0,0,0.2)",
                  }}
                />
                <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                  Tip: clearer photo = better “ceker ayam decoding”.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7 }}>
                Upload an image to preview it here.
              </div>
            )}
          </div>

          {/* Right: Notes card */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(255,255,255,0.03)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                Notes
                <span style={{ marginLeft: 10, opacity: 0.65, fontWeight: 500 }}>
                  {ocrStatus === "running"
                    ? "(translating…)"
                    : ocrStatus === "done"
                    ? "(done)"
                    : ocrStatus === "error"
                    ? "(failed)"
                    : ""}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {pageInfo?.id && (
                  <div style={{ opacity: 0.85, fontSize: 12, marginRight: 6 }}>
                    <span style={{ opacity: 0.7 }}>Page</span>{" "}
                    <code>{pageInfo.id}</code>
                  </div>
                )}

                <button
                  disabled={!ocrText}
                  onClick={async () => {
                    const ok = await copyToClipboard(ocrText);
                    if (!ok) alert("Copy failed (browser blocked clipboard).");
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    cursor: ocrText ? "pointer" : "not-allowed",
                    opacity: ocrText ? 1 : 0.5,
                    fontSize: 12,
                  }}
                >
                  Copy
                </button>

                <button
                  disabled={!ocrText}
                  onClick={() => downloadTxt(ocrText)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    cursor: ocrText ? "pointer" : "not-allowed",
                    opacity: ocrText ? 1 : 0.5,
                    fontSize: 12,
                  }}
                >
                  Download
                </button>

                <button
                  disabled={status === "working" || !pageInfo?.id}
                  onClick={async () => {
                    if (!pageInfo?.id) return;
                    setOcrText("");
                    setOcrError("");
                    setOcrStatus("running");
                    try {
                      const ocrRes = await fetch("/api/ocr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ pageId: pageInfo.id }),
                      });
                      const raw = await ocrRes.text();
                      let json: any = null;
                      try {
                        json = JSON.parse(raw);
                      } catch {}

                      if (!ocrRes.ok) {
                        setOcrStatus("error");
                        setOcrError(
                          json?.error?.message || raw || `OCR failed (${ocrRes.status})`
                        );
                        return;
                      }

                      setOcrText((json?.text ?? "") as string);
                      setOcrStatus("done");
                    } catch (e: any) {
                      setOcrStatus("error");
                      setOcrError(e?.message || "Unknown error");
                    }
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    cursor:
                      status === "working" || !pageInfo?.id ? "not-allowed" : "pointer",
                    opacity: status === "working" || !pageInfo?.id ? 0.5 : 1,
                    fontSize: 12,
                  }}
                  title="Rerun OCR for this page"
                >
                  Retry OCR
                </button>
              </div>
            </div>

            {ocrStatus === "error" && (
              <div style={{ marginTop: 12, color: danger }}>
                <strong>OCR failed:</strong> {ocrError}
              </div>
            )}

            {/* Editable notes (feels more “product”) */}
            <textarea
              value={
                ocrStatus === "running"
                  ? "Reading your ceker ayam handwriting…\n\n(hold tight)"
                  : ocrText
                  ? ocrText
                  : "Upload an image and your notes will appear here."
              }
              onChange={(e) => {
                // allow edit only when done (so typing doesn’t fight with status text)
                if (ocrStatus === "done") setOcrText(e.target.value);
              }}
              readOnly={ocrStatus !== "done"}
              style={{
                marginTop: 12,
                width: "100%",
                whiteSpace: "pre-wrap",
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                padding: 12,
                minHeight: 320,
                lineHeight: 1.55,
                color: "inherit",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 13,
                resize: "vertical",
                outline: "none",
              }}
            />

            <div style={{ marginTop: 10, opacity: 0.65, fontSize: 12 }}>
              {ocrStatus === "done"
                ? "You can edit the notes above, then copy/download."
                : "Notes will appear here after upload."}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer
        style={{
          marginTop: "auto",
          paddingTop: 18,
          opacity: 0.65,
          fontSize: 13,
        }}
      >
        Vibe-coded by <span style={{ opacity: 0.95 }}>@frnkygabriel</span>
      </footer>
    </main>
  );
}
