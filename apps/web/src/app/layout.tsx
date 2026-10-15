import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orvia — crescimento com intenção",
  description: "Um espaço de estratégia e evolução para profissionais da saúde.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
