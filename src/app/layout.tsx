import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Handnotes",
  description: "Turn messy handwriting into structured notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        style={{
          margin: 0,
          background: "#0b0b0b",
          color: "white",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
