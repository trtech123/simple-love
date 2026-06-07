import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LovLov",
  description: "שאלון התאמה ודוח אישי בעברית",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, overflowX: "hidden" }}>{children}</body>
    </html>
  );
}
