"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ArrowUpRight, BarChart3, CalendarDays, Compass, Menu, MessageCircle, Settings2, Sparkles, X } from "lucide-react";

const navigation = [
  { id: "inicio", label: "Visão geral", href: "/", icon: Compass },
  { id: "diagnostico", label: "Diagnóstico", href: "/diagnostico", icon: Activity },
  { id: "mercado", label: "Inteligência de mercado", href: "/mercado", icon: BarChart3 },
  { id: "jornada", label: "Jornada", href: "/jornada", icon: Sparkles },
  { id: "planejamento", label: "Planejamento", href: "/planejamento", icon: CalendarDays },
  { id: "mentor", label: "Mentor", href: "/mentor", icon: MessageCircle },
];

export function AppShell({ active, children }: { active: string; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-frame">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      {mobileOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Navegação principal">
        <div className="brand-row">
          <Link className="brand" href="/" aria-label="Orvia, início"><span className="brand-mark"><span /></span><span>orvia</span></Link>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={19} /></button>
        </div>
        <div className="workspace-chip"><span className="workspace-avatar">O</span><span><strong>Seu espaço</strong><small>Profissional independente</small></span><span className="chevron">⌄</span></div>
        <p className="nav-label">ESPAÇO DE TRABALHO</p>
        <nav className="main-nav">
          {navigation.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} onClick={() => setMobileOpen(false)} className={`nav-item ${active === id ? "nav-active" : ""}`} aria-current={active === id ? "page" : undefined}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><Sparkles size={15} /></span><div><strong>Um passo de cada vez</strong><p>Consistência nasce de escolhas possíveis.</p></div></div>
          <Link className={`nav-item ${active === "resultados" ? "nav-active" : ""}`} href="/resultados"><BarChart3 size={17} /><span>Resultados</span></Link>
          <Link className={`nav-item ${active === "configuracoes" ? "nav-active" : ""}`} href="/configuracoes"><Settings2 size={17} /><span>Configurações</span></Link>
          <div className="profile-row"><div className="profile-avatar">·</div><div><strong>Perfil profissional</strong><small>Configure seu espaço</small></div><ArrowUpRight size={15} className="profile-arrow" /></div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Seu espaço</span><span className="crumb-slash">/</span><strong>{navigation.find(item => item.id === active)?.label ?? (active === "resultados" ? "Resultados" : "Configurações")}</strong></div>
          <div className="topbar-right"><span className="topbar-caption">SEU ESPAÇO DE CRESCIMENTO</span><span className="topbar-orb"><Sparkles size={15} /></span></div>
        </header>
        <main id="conteudo" className="main-content">{children}</main>
        <footer className="footer"><span>Orvia <span className="footer-sep">·</span> Um espaço para crescer com intenção</span><span>Fundação em construção</span></footer>
      </div>
    </div>
  );
}
