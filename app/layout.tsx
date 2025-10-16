import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Veo Video Generator',
  description: 'Generate videos using Google Veo 2.0',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
