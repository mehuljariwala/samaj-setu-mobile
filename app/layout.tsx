import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'સમાજ સેતુ · Samaj Setu',description:'A private Gujarati-first community experience. Interactive design prototype with fictional data.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="gu"><body>{children}</body></html>}
