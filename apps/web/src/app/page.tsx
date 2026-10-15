import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { currentProfile, currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!user.onboardingCompleted) redirect("/onboarding");
  const profile = await currentProfile();
  return <AppShell active="inicio" email={user.email} professionalName={profile?.professionalName}><Dashboard profile={profile} /></AppShell>;
}
