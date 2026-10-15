import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MetaConnectionPanel } from "@/components/meta-connection-panel";
import { currentProfile, currentUser } from "@/lib/auth";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ meta?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!user.onboardingCompleted) redirect("/onboarding");
  const profile = await currentProfile();
  const { meta } = await searchParams;
  return <AppShell active="configuracoes" email={user.email} professionalName={profile?.professionalName}>
    <div className="settings-page page-enter">
      <div className="eyebrow"><span className="eyebrow-line" /> CONEXÕES DO SEU ESPAÇO</div>
      <header className="settings-heading"><div><h1>Configurações</h1><p>Gerencie as conexões autorizadas para consultar dados da sua conta profissional.</p></div></header>
      <MetaConnectionPanel callbackResult={meta} />
    </div>
  </AppShell>;
}
