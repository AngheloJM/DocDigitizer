import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archivo Central UTEPSA — Inicio de sesión",
  description: "Sistema de gestión, digitalización y organización automatizada de documentos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased text-on-surface bg-white">{children}</body>
    </html>
  );
}
