import { cookies } from "next/headers";

export type CurrentUser = { id: string; email: string; emailVerified: boolean; onboardingCompleted: boolean };
export type ProfessionalProfile = {
  professionalName: string | null; profession: string | null; specialty: string | null; city: string | null; region: string | null;
  serviceMode: string | null; targetAudience: string | null; professionalGoals: string[]; weeklyTimeMinutes: number | null;
  socialExperience: string | null; postingFrequency: string | null; communicationPreferences: string[]; onboardingStep: number;
  onboardingCompletedAt: string | null;
};

async function apiGet<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  const origin = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
  const response = await fetch(`${origin.replace(/\/$/, "")}${path}`, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Não foi possível consultar ${path}.`);
  return response.json() as Promise<T>;
}

export async function currentUser() {
  const result = await apiGet<{ user: CurrentUser }>("/auth/me");
  return result?.user ?? null;
}
export async function currentProfile() {
  const result = await apiGet<{ profile: ProfessionalProfile }>("/auth/profile");
  return result?.profile ?? null;
}
