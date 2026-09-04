import type { Metadata } from "next";
import "./globals.css"; //stile globale per tutta l'applicazione

export const metadata: Metadata = {
  title: "Monitoraggio della qualità dell'aria ",
  description:
    "Superamenti dei limiti di legge sui dati ARPA Lombardia.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
