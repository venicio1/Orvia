"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProfessionalProfile } from "@/lib/auth";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleDashed, Compass, RefreshCw, Sparkles } from "lucide-react";

type HealthState = "loading" | "ready" | "error";

export function Dashboard({ profile }: { profile?: ProfessionalProfile | null }) {
  const [health, setHealth] = useState<HealthState>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void fetch("/api/health", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("API indisponível");
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("status" in data) || data.status !== "ok") throw new Error("Resposta inválida");
        if (current) setHealth("ready");
      })
      .catch(() => { if (current) setHealth("error"); });
    return () => { current = false; };
  }, [attempt]);

  return <div className="dashboard page-enter">
    <div className="eyebrow"><span className="eyebrow-line" /> UM ESPAÇO PARA CRESCER COM INTENÇÃO</div>
    <section className="hero-row">
      <div><h1>Seu crescimento,<br /><span>no seu ritmo.</span></h1><p className="hero-copy">Clareza para entender onde você está. Intenção para escolher seu próximo passo.</p></div>
      <div className="hero-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-ring ring-three" /><div className="art-core"><span>o</span></div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✧</span><span className="art-orbit-dot" /></div>
    </section>

    <section className="setup-banner" aria-labelledby="setup-title">
      <div className="setup-icon"><Compass size={19} /></div>
      <div className="setup-content"><div className="setup-heading"><div><span className="section-kicker">PONTO DE PARTIDA</span><h2 id="setup-title">{profile?.professionalName ? `Olá, ${profile.professionalName}` : "Seu perfil profissional"}</h2></div></div>
        <p className="setup-description">{profile?.profession ? `${profile.profession}${profile.specialty ? ` · ${profile.specialty}` : ""}${profile.region ? ` · ${profile.region}` : ""}` : "Seu perfil está salvo e pode ser atualizado quando quiser."}</p>
      </div>
      <ArrowRight size={17} className="banner-arrow" aria-hidden="true" />
    </section>

    <div className="section-heading"><div><span className="section-kicker">SEU ESPAÇO</span><h2>Um começo consciente</h2></div><span className="quiet-label">Os dados aparecerão conforme você avança</span></div>
    <section className="overview-grid" aria-label="Resumo do espaço">
      <article className="overview-card focus-card"><div className="card-top"><span className="card-icon"><Sparkles size={17} /></span><span className="card-label">PRÓXIMO PASSO</span></div><h3>{profile?.professionalGoals?.length ? profile.professionalGoals[0] : "Ainda não há um plano ativo"}</h3><p>{profile?.weeklyTimeMinutes ? `${Math.round(profile.weeklyTimeMinutes / 60)} horas semanais reservadas para sua presença digital.` : "Seu plano será construído a partir do seu perfil, das suas prioridades e do tempo que você tem disponível."}</p><div className="card-bottom"><Link href="/perfil">Revisar perfil</Link><ArrowUpRight size={15} /></div></article>
      <article className="overview-card"><div className="card-top"><span className="card-icon card-icon-soft"><Activity size={16} /></span><span className="card-label">MOVIMENTO DA SEMANA</span></div><div className="empty-number">—</div><p className="metric-note">Sem registros neste período</p><div className="card-bottom subdued"><span>As atividades ficam sob seu controle</span><ArrowDownRight size={15} /></div></article>
      <article className="overview-card"><div className="card-top"><span className="card-icon card-icon-soft"><CircleDashed size={16} /></span><span className="card-label">SUA JORNADA</span></div><div className="empty-number">—</div><p className="metric-note">Nenhuma jornada iniciada</p><div className="card-bottom subdued"><span>Sem pressão, no seu tempo</span><Check size={15} /></div></article>
    </section>

    <section className="lower-grid">
      <article className="lower-card market-card"><div className="lower-card-heading"><div><span className="section-kicker">INTELIGÊNCIA DE MERCADO</span><h2>O que está em movimento</h2></div><span className="source-badge">Critérios de fonte</span></div><div className="empty-state compact-empty"><div className="empty-symbol"><Activity size={18} /></div><strong>Nenhuma observação disponível</strong><p>As tendências só aparecem quando há uma fonte identificável, evidência e data de observação.</p><span className="empty-footnote">Sem fontes conectadas ou registros nesta etapa</span></div></article>
      <article className="lower-card api-card"><div className="lower-card-heading"><div><span className="section-kicker">SISTEMA</span><h2>Conexão do espaço</h2></div><div className={`connection-indicator ${health}`}><span className="connection-dot" />{health === "loading" ? "Verificando" : health === "ready" ? "Disponível" : "Indisponível"}</div></div>
        {health === "loading" && <div className="connection-message" role="status"><span className="loader" /><div><strong>Verificando a API</strong><p>Consultando o serviço Orvia.</p></div></div>}
        {health === "error" && <div className="connection-message error-message" role="alert"><div><strong>Não foi possível conectar à API</strong><p>Confira se o serviço está ativo e tente novamente.</p></div><button className="retry-button" onClick={() => { setHealth("loading"); setAttempt(value => value + 1); }}><RefreshCw size={14} /> Tentar de novo</button></div>}
        {health === "ready" && <div className="connection-message success-message" role="status"><div className="success-check"><Check size={15} /></div><div><strong>API respondendo</strong><p>Conexão local confirmada agora.</p></div></div>}
        <div className="api-footnote">Verificação ao vivo · sem integrações externas</div>
      </article>
    </section>
    <div className="closing-note"><span className="closing-star">✳</span><p>Um crescimento sustentável começa com uma direção que faz sentido para você.</p></div>
  </div>;
}
