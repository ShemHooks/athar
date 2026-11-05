import './globals.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'ATHAR AI | Nursing Follow-up',description:'Synthetic oncology follow-up coordination demonstration'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
