import type { Metadata } from "next";
import "./globals.css";
import "./creative.css";
export const metadata:Metadata={title:"映序 · Seedance Studio",description:"使用 Seedance 2.0、2.5 创作视频，使用 Seedream 创作图片。",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
