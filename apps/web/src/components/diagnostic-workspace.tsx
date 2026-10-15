"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Clock3, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { authRequest } from "@/lib/csrf";

type DiagnosticResult = {
  professionalSummary: string; summary: string; score: number; scoreLabel: string; scoreMethod: string; evidenceBoundary: string;
  dimensions: { id: string; label: string; score: number; explanation: string; evidence: string[]; missing: string[] }[];
  strengths: string[]; opportunities: { title: string; reason: string }[]; limitations: string[];
};
type StrategyPlan = {
  objective: string; weeklyBudgetHours: number | null;
  priorities: { title: string; rationale: string; actions: { title: string; description: string; why: string; effortHours: number; indicator: string; sequence: number }[] }[];
  estimateNote: string; indicators: string[]; guardrails: string[];
};
type DiagnosticRecord = {
  id: string; version: number; criteriaVersion: string; status: "current" | "superseded"; reviewedAt: string | null; createdAt: string;
  result: DiagnosticResult; strategy: { plan: StrategyPlan } | null;
};
type WorkspaceState = "loading" | "ready" | "error";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function DiagnosticWorkspace() {
  const [state, setState] = useState<WorkspaceState>("loading");
  const [records, setRecords] = useState<DiagnosticRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useMemo(() => records.find(record => record.id === selectedId) ?? records[0] ?? null, [records, selectedId]);

  async function load() {
    setState("loading"); setError("");
    try {
      const response = await authRequest("diagnostics", undefined, "GET") as { diagnostics: DiagnosticRecord[] };
      setRecords(response.diagnostics); setSelectedId(response.diagnostics[0]?.id ?? null); setState("ready");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus diagnósticos."); setState("error"); }
  }

  useEffect(() => {
    let active = true;
    void authRequest("diagnostics", undefined, "GET").then((response: unknown) => {
      if (!active) return;
      const payload = response as { diagnostics: DiagnosticRecord[] };
      setRecords(payload.diagnostics); setSelectedId(payload.diagnostics[0]?.id ?? null); setState("ready");
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus diagnósticos."); setState("error");
    });
    return () => { active = false; };
  }, []);

  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authRequest("diagnostics", {}, "POST") as { diagnostic: DiagnosticRecord };
      setRecords(current => {
        const updated = current.map(item => item.id === response.diagnostic.id ? response.diagnostic : item.status === "current" ? { ...item, status: "superseded" as const } : item);
        return [response.diagnostic, ...updated.filter(item => item.id !== response.diagnostic.id)].sort((a, b) => b.version - a.version);
      });
      setSelectedId(response.diagnostic.id);
      setNotice("Diagnóstico atualizado com as informações atuais do seu perfil.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o diagnóstico. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function markReviewed() {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authRequest(`diagnostics/${selected.id}/review`, {}, "PATCH") as { diagnostic: DiagnosticRecord };
      setRecords(current => current.map(item => item.id === response.diagnostic.id ? response.diagnostic : item));
      setNotice("Diagnóstico marcado como revisado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a revisão."); }
    finally { setBusy(false); }
  }

  if (state === "loading") return <div className="diagnostic-loading" role="status"><span className="loader" /><p>Carregando seus diagnósticos salvos…</p></div>;
  if (state === "error") return <section className="diagnostic-error" role="alert"><AlertCircle size={20} /><div><h1>Não foi possível abrir o diagnóstico</h1><p>{error}</p><button className="secondary-button" onClick={() => void load()}><RefreshCw size={15} /> Tentar novamente</button></div></section>;

  return <div className="diagnostic-workspace page-enter">
    <div className="eyebrow"><span className="eyebrow-line" /> UM RETRATO DO QUE VOCÊ INFORMOU</div>
    <header className="diagnostic-heading"><div><h1>Diagnóstico profissional</h1><p>Uma leitura transparente do seu perfil para escolher próximos passos que caibam na sua rotina.</p></div><Link className="diagnostic-profile-link" href="/perfil">Revisar meu perfil <ArrowRight size={15} /></Link></header>

    <div className="diagnostic-notice" role="note"><ShieldCheck size={17} /><p>Este diagnóstico usa apenas o que você informou no perfil. Ele não consulta redes sociais, tendências, audiência ou dados de pacientes.</p></div>
    {notice && <p className="diagnostic-feedback" role="status" aria-live="polite"><Check size={16} />{notice}</p>}
    {error && <p className="diagnostic-feedback diagnostic-feedback-error" role="alert">{error}</p>}

    {records.length === 0 ? <section className="diagnostic-empty"><span className="diagnostic-empty-icon"><Sparkles size={21} /></span><h2>Seu primeiro diagnóstico começa pelo perfil</h2><p>Vamos organizar as informações já salvas, mostrar o que ainda está em aberto e sugerir um primeiro plano. Os campos ausentes aparecem como desconhecidos, não como avaliações negativas.</p><button className="primary-button" onClick={() => void generate()} disabled={busy}>{busy ? <><span className="button-spinner" /> Preparando…</> : "Gerar meu diagnóstico"}</button><small>Você pode atualizar o diagnóstico depois de editar o perfil.</small></section>
      : <>
        <section className="diagnostic-summary-card" aria-labelledby="diagnostic-summary-title">
          <div className="diagnostic-score-block"><span className="section-kicker">{selected?.result.scoreLabel}</span><div className="diagnostic-score">{selected?.result.score}<span>/100</span></div><p>Preenchimento das informações do perfil</p></div>
          <div className="diagnostic-summary-copy"><div className="diagnostic-version"><span>Versão {selected?.version}</span><span>{selected?.status === "current" ? "Atual" : "Histórico"}</span><span>{selected && dateLabel(selected.createdAt)}</span></div><h2 id="diagnostic-summary-title">Resumo da situação profissional</h2><p>{selected?.result.professionalSummary || selected?.result.summary}</p><p>{selected?.result.summary}</p><p>{selected?.result.scoreMethod}</p><small>{selected?.result.evidenceBoundary}</small></div>
          <button className="secondary-button diagnostic-refresh" onClick={() => void generate()} disabled={busy} aria-label="Atualizar diagnóstico com o perfil atual">{busy ? <span className="button-spinner" /> : <RefreshCw size={15} />} Atualizar</button>
        </section>
        <div className="diagnostic-content-grid">
          <section className="diagnostic-panel diagnostic-dimensions" aria-labelledby="dimensions-title"><div className="diagnostic-panel-heading"><div><span className="section-kicker">COMO CHEGAMOS AQUI</span><h2 id="dimensions-title">Dimensões consideradas</h2></div><span className="diagnostic-method-tag">4 dimensões · pesos iguais</span></div>
            <div className="diagnostic-dimension-list">{selected?.result.dimensions.map(item => <article className="diagnostic-dimension" key={item.id}><div className="diagnostic-dimension-top"><h3>{item.label}</h3><span>{item.score}/100</span></div><div className="diagnostic-meter" role="meter" aria-label={item.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.score}><span aria-hidden="true" style={{ width: `${item.score}%` }} /></div><p>{item.explanation}</p>{item.evidence.length > 0 && <ul className="diagnostic-evidence">{item.evidence.map(evidence => <li key={evidence}>{evidence}</li>)}</ul>}{item.missing.length > 0 && <p className="diagnostic-missing">Em aberto: {item.missing.join(" · ")}</p>}</article>)}</div>
          </section>
          <div className="diagnostic-side-column">
            <section className="diagnostic-panel"><span className="section-kicker">PONTOS DE PARTIDA</span><h2>O que já existe</h2>{selected?.result.strengths.length ? <ul className="diagnostic-list">{selected.result.strengths.map(item => <li key={item}><Check size={15} />{item}</li>)}</ul> : <p className="diagnostic-empty-copy">Ainda não há informações suficientes para destacar pontos de partida. Complete o perfil para personalizar a leitura.</p>}</section>
            <section className="diagnostic-panel"><span className="section-kicker">POSSIBILIDADES</span><h2>O que pode ser desenvolvido</h2>{selected?.result.opportunities.length ? <ul className="diagnostic-opportunities">{selected.result.opportunities.slice(0, 6).map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.reason}</p></li>)}</ul> : <p className="diagnostic-empty-copy">Não há campos pendentes nas dimensões usadas nesta versão.</p>}</section>
          </div>
        </div>
        {selected?.strategy?.plan && <section className="diagnostic-panel diagnostic-strategy"><header className="diagnostic-panel-heading"><div><span className="section-kicker">ESTRATÉGIA INICIAL</span><h2>Pequenos passos, no seu ritmo</h2><p>{selected.strategy.plan.objective}</p></div><span className="diagnostic-budget"><Clock3 size={15} />{selected.strategy.plan.weeklyBudgetHours === null ? "Disponibilidade não informada" : `${selected.strategy.plan.weeklyBudgetHours} h/semana informadas`}</span></header>
          {selected.strategy.plan.priorities.map((priority, index) => <article className="diagnostic-priority" key={`${priority.title}-${index}`}><div className="priority-number">0{index + 1}</div><div className="priority-body"><h3>{priority.title}</h3><p>{priority.rationale}</p>{priority.actions.map(action => <div className="diagnostic-action" key={action.sequence}><div><strong>{action.title}</strong><p>{action.description}</p><small>Por quê: {action.why}</small><small>Indicador simples: {action.indicator}</small></div><span className="action-effort">{action.effortHours} h<small>estimadas</small></span></div>)}</div></article>)}
          <p className="diagnostic-estimate-note">{selected.strategy.plan.estimateNote}</p><details className="diagnostic-guardrails"><summary>Cuidados gerais para comunicação profissional</summary><ul>{selected.strategy.plan.guardrails.map(item => <li key={item}>{item}</li>)}</ul></details>
        </section>}
        <div className="diagnostic-bottom-grid"><section className="diagnostic-panel"><span className="section-kicker">LIMITES DA ANÁLISE</span><h2>O que este diagnóstico não sabe</h2><ul className="diagnostic-list diagnostic-limit-list">{selected?.result.limitations.map(item => <li key={item}>{item}</li>)}</ul></section><section className="diagnostic-panel"><span className="section-kicker">HISTÓRICO PESSOAL</span><h2>Versões anteriores</h2><div className="diagnostic-history">{records.map(item => <button key={item.id} className={`diagnostic-history-item ${item.id === selected?.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)} aria-current={item.id === selected?.id ? "true" : undefined}><span>Versão {item.version} · {item.status === "current" ? "atual" : "histórico"}</span><small>{dateLabel(item.createdAt)} · {item.result.score}/100</small></button>)}</div>{selected?.status === "current" && <button className="text-link diagnostic-review" onClick={() => void markReviewed()} disabled={busy}>{selected.reviewedAt ? `Revisado em ${dateLabel(selected.reviewedAt)}` : "Marcar como revisado"}</button>}</section></div>
      </>}
  </div>;
}
