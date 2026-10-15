"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authRequest } from "@/lib/csrf";
import type { ProfessionalProfile } from "@/lib/auth";

type Values = Omit<ProfessionalProfile, "onboardingCompletedAt">;
const empty: Values = { professionalName: "", profession: "", specialty: "", city: "", region: "", serviceMode: "", targetAudience: "", professionalGoals: [], weeklyTimeMinutes: null, socialExperience: "", postingFrequency: "", communicationPreferences: [], onboardingStep: 0 };
const goals = ["Atrair novos clientes", "Fortalecer minha presença digital", "Comunicar meu trabalho com clareza", "Organizar minha rotina de conteúdo", "Consolidar minha marca profissional"];
const formats = ["Orientação direta", "Tom acolhedor", "Linguagem técnica", "Mensagens objetivas"];

export function ProfileWorkflow({ mode, initialProfile = null }: { mode: "onboarding" | "edit"; initialProfile?: ProfessionalProfile | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => initialProfile ? { ...empty, ...initialProfile } : empty);
  const [step, setStep] = useState(initialProfile ? Math.max(0, Math.min(4, initialProfile.onboardingStep)) : 0);
  const [loading, setLoading] = useState(!initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(Boolean(initialProfile));

  async function load() {
    setLoading(true); setError("");
    try {
      const result = await authRequest("profile", undefined, "GET") as { profile: ProfessionalProfile };
      const next = { ...empty, ...result.profile };
      setValues(next); setStep(Math.max(0, Math.min(4, next.onboardingStep))); setLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar seu perfil."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!initialProfile) void load(); }, [initialProfile]);

  function change<K extends keyof Values>(key: K, value: Values[K]) { setValues(previous => ({ ...previous, [key]: value })); }
  function toggle(key: "professionalGoals" | "communicationPreferences", value: string) {
    const current = values[key]; change(key, current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  }

  async function save(nextStep: number, complete = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = {
        professionalName: values.professionalName, profession: values.profession, specialty: values.specialty, city: values.city,
        region: values.region, serviceMode: values.serviceMode, targetAudience: values.targetAudience,
        professionalGoals: values.professionalGoals, weeklyTimeMinutes: values.weeklyTimeMinutes,
        socialExperience: values.socialExperience, postingFrequency: values.postingFrequency,
        communicationPreferences: values.communicationPreferences, onboardingStep: nextStep, completeOnboarding: complete,
      };
      await authRequest("profile", payload, "PATCH");
      setValues(previous => ({ ...previous, onboardingStep: nextStep }));
      setNotice(complete || mode === "edit" ? "Seu perfil foi salvo. Seu espaço está pronto." : "Progresso salvo. Você pode continuar quando quiser.");
      if (complete) { router.replace("/"); router.refresh(); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente."); return false; }
    finally { setBusy(false); }
  }

  if (loading) return <div className="profile-loading" role="status">Carregando seu perfil…</div>;
  if (!loaded) return <section className="profile-loading" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => void load()}>Tentar novamente</button></section>;

  const field = (key: keyof Values, label: string, props: { maxLength?: number; placeholder?: string } = {}) => <label className="workflow-field">{label}<input value={String(values[key] ?? "")} maxLength={props.maxLength ?? 160} placeholder={props.placeholder} onChange={event => change(key, event.target.value as Values[typeof key])} /></label>;
  const select = (key: keyof Values, label: string, options: string[]) => <label className="workflow-field">{label}<select value={String(values[key] ?? "")} onChange={event => change(key, event.target.value as Values[typeof key])}><option value="">Selecione uma opção</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
  const goalOptions = (key: "professionalGoals" | "communicationPreferences", options: string[], label: string) => <fieldset className="workflow-options"><legend>{label}</legend><div>{options.map(option => <label key={option} className="check-option"><input type="checkbox" checked={values[key].includes(option)} onChange={() => toggle(key, option)} /><span>{option}</span></label>)}</div></fieldset>;

  return <div className="workflow-page page-enter">
    <div className="eyebrow"><span className="eyebrow-line" /> {mode === "onboarding" ? "SEU PONTO DE PARTIDA" : "SEU PERFIL PROFISSIONAL"}</div>
    <div className="workflow-heading"><div><h1>{mode === "onboarding" ? "Vamos conhecer seu trabalho." : "Seu perfil, do seu jeito."}</h1><p>{mode === "onboarding" ? "Conte apenas o que fizer sentido agora. Suas respostas ficam salvas para você continuar depois." : "Atualize suas informações e preferências quando quiser."}</p></div>{mode === "edit" && <Link href="/" className="text-link">Voltar ao espaço</Link>}</div>
    {mode === "onboarding" && <div className="step-progress" aria-label={`Etapa ${step + 1} de 5`}>{Array.from({ length: 5 }, (_, index) => <span key={index} className={index <= step ? "step-active" : ""} />)}<small>Etapa {step + 1} de 5</small></div>}
    <form className="workflow-card" onSubmit={event => event.preventDefault()}>
      {mode === "edit" || step === 0 ? <section className="workflow-section"><h2>Sobre sua atuação</h2><p>Uma base para contextualizar seu espaço profissional.</p><div className="workflow-grid">{field("professionalName", "Nome profissional")}{field("profession", "Profissão")}{field("specialty", "Especialidade")}{select("serviceMode", "Modalidade de atendimento", ["Presencial", "Online", "Híbrido"])}</div></section> : null}
      {mode === "edit" || step === 1 ? <section className="workflow-section"><h2>Região e público</h2><p>Compartilhe informações gerais da sua atuação. Não inclua dados de pacientes.</p><div className="workflow-grid">{field("city", "Cidade")}{field("region", "Estado ou região")}{field("targetAudience", "Público-alvo", { maxLength: 2000, placeholder: "Ex.: adultos que buscam orientação preventiva" })}</div></section> : null}
      {mode === "edit" || step === 2 ? <section className="workflow-section"><h2>Seus objetivos</h2><p>Escolha o que gostaria de desenvolver primeiro.</p>{goalOptions("professionalGoals", goals, "Objetivos profissionais")}
        <label className="workflow-field compact-field">Disponibilidade semanal para sua presença digital (horas)<input type="number" min="0" max="40" step="0.5" value={values.weeklyTimeMinutes === null ? "" : values.weeklyTimeMinutes / 60} onChange={event => change("weeklyTimeMinutes", event.target.value === "" ? null : Math.round(Number(event.target.value) * 60))} /><small>Informe uma estimativa; você pode alterar depois.</small></label></section> : null}
      {mode === "edit" || step === 3 ? <section className="workflow-section"><h2>Sua experiência com redes sociais</h2><p>Isso ajuda a ajustar o ritmo às suas preferências.</p><div className="workflow-grid">{select("socialExperience", "Experiência", ["Estou começando", "Tenho alguma experiência", "Tenho experiência avançada", "Prefiro não informar"])}{select("postingFrequency", "Frequência de publicações", ["Ainda não publico", "Menos de uma vez por semana", "1 a 2 vezes por semana", "3 ou mais vezes por semana", "Prefiro não informar"])}</div></section> : null}
      {mode === "edit" || step === 4 ? <section className="workflow-section"><h2>Como prefere se comunicar?</h2><p>Escolha estilos de comunicação que funcionam para você.</p>{goalOptions("communicationPreferences", formats, "Preferências de comunicação")}<p className="privacy-note">O Orvia não solicita nem armazena dados clínicos ou informações que identifiquem pacientes.</p></section> : null}
      <p className={error ? "form-error" : "workflow-feedback-empty"} role="alert" aria-live="assertive" aria-atomic="true">{error}</p>
      <p className={notice ? "form-success" : "workflow-feedback-empty"} role="status" aria-live="polite" aria-atomic="true">{notice}</p>
      {mode === "edit" ? <div className="workflow-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void save(values.onboardingStep)}> {busy ? "Salvando…" : "Salvar alterações"}</button></div> : <div className="workflow-actions">
        {step > 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setStep(value => Math.max(0, value - 1)); setNotice(""); }}>Voltar</button>}
        {step < 4 ? <button type="button" className="primary-button" disabled={busy} onClick={() => void save(step + 1).then(ok => { if (ok) setStep(value => Math.min(4, value + 1)); })}>{busy ? "Salvando…" : "Salvar e continuar"}</button> : <button type="button" className="primary-button" disabled={busy} onClick={() => void save(5, true)}>{busy ? "Salvando…" : "Concluir meu perfil"}</button>}
        <button type="button" className="text-link save-exit" disabled={busy} onClick={() => void save(step).then(ok => { if (ok) router.push("/perfil"); })}>Salvar e sair</button>
      </div>}
    </form>
    <p className="workflow-footnote">Suas informações são privadas e podem ser editadas a qualquer momento.</p>
  </div>;
}
