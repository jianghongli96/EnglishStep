import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://english-step-practice.solar-peony-9290.chatgpt.site"),
  title: "基础英语练习站",
  description: "给基础薄弱的初高中学生使用的英语每日练习网站。",
  openGraph: {
    title: "基础英语练习站",
    description: "词汇、语法、阅读和错题复习组成的低门槛英语练习台。",
    images: ["/study-banner.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
