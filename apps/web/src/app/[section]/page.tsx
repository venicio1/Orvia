import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EmptySection } from "@/components/empty-section";
import { currentProfile, currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

const sections: Record<string, { label: string; description: string }> = {
  mercado: { label: "Inteligência de mercado", description: "Tendências e referências aparecerão aqui quando houver fontes verificadas e dados disponíveis." },
  diagnostico: { label: "Diagnóstico", description: "Seu diagnóstico será apresentado quando o perfil e os dados necessários estiverem disponíveis." },
  mentor: { label: "Mentor", description: "O mentor ficará disponível quando o perfil contextual e o provedor de IA forem configurados." },
  jornada: { label: "Jornada", description: "Desafios e progresso serão exibidos depois que uma jornada for criada para você." },
  planejamento: { label: "Planejamento", description: "Seu calendário aparecerá aqui quando houver itens de conteúdo registrados." },
  resultados: { label: "Resultados", description: "Métricas aparecerão quando existirem dados conectados ou registros feitos por você." },
  configuracoes: { label: "Configurações", description: "As preferências e integrações poderão ser configuradas nas próximas etapas." },
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const config = sections[section];
  if (!config) notFound();
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!user.onboardingCompleted) redirect("/onboarding");
  const profile = await currentProfile();
  return <AppShell active={section} email={user.email} professionalName={profile?.professionalName}><EmptySection {...config} /></AppShell>;
}
