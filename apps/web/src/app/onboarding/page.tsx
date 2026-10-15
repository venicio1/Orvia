import { redirect } from "next/navigation";
import { ProfileWorkflow } from "@/components/profile-workflow";
import { currentProfile, currentUser } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.onboardingCompleted) redirect("/");
  const profile = await currentProfile();
  return <main className="workflow-layout"><ProfileWorkflow mode="onboarding" initialProfile={profile} /></main>;
}
