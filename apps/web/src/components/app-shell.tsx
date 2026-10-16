"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, CalendarDays, Compass, Images, Menu, MessageCircle, Settings2, Sparkles, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

const navigation = [
  { id: "inicio", label: "Visão geral", href: "/", icon: Compass },
  { id: "diagnostico", label: "Diagnóstico", href: "/diagnostico", icon: Activity },
  { id: "publicacoes", label: "Publicações", href: "/publicacoes", icon: Images },
  { id: "mercado", label: "Inteligência de mercado", href: "/mercado", icon: BarChart3 },
  { id: "jornada", label: "Jornada", href: "/jornada", icon: Sparkles },
  { id: "planejamento", label: "Planejamento", href: "/planejamento", icon: CalendarDays },
  { id: "mentor", label: "Mentor", href: "/mentor", icon: MessageCircle },
];

export function AppShell({ active, children, email, professionalName }: { active: string; children: React.ReactNode; email?: string; professionalName?: string | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const restoreMenuFocusRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const updateViewport = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      if (restoreMenuFocusRef.current) {
        menuButtonRef.current?.focus();
        restoreMenuFocusRef.current = false;
      }
      return;
    }
    closeButtonRef.current?.focus();
    const handleMenuKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        restoreMenuFocusRef.current = true;
        setMobileOpen(false);
        return;
      }
      if (event.key === "Tab") {
        const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleMenuKeys);
    return () => window.removeEventListener("keydown", handleMenuKeys);
  }, [mobileOpen]);

  function closeMenu(restoreFocus = false) {
    restoreMenuFocusRef.current = restoreFocus;
    setMobileOpen(false);
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      {mobileOpen && <div className="mobile-scrim" aria-hidden="true" onClick={() => closeMenu(true)} />}
      <aside ref={sidebarRef} id="orvia-sidebar" className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} role={isMobile && mobileOpen ? "dialog" : undefined} aria-modal={isMobile && mobileOpen ? true : undefined} aria-label="Navegação principal" aria-hidden={isMobile && !mobileOpen} inert={isMobile && !mobileOpen}>
        <div className="brand-row">
          <Link className="brand" href="/" aria-label="Orvia, início"><span className="brand-mark"><span /></span><span>orvia</span></Link>
          <button ref={closeButtonRef} type="button" className="icon-button mobile-close" onClick={() => closeMenu(true)} aria-label="Fechar menu"><X size={19} /></button>
        </div>
          <div className="workspace-chip"><span className="workspace-avatar">O</span><span><strong>Seu espaço</strong><small>{professionalName || "Perfil profissional"}</small></span><span className="chevron">⌄</span></div>
        <p className="nav-label">ESPAÇO DE TRABALHO</p>
        <nav className="main-nav">
          {navigation.map(({ id, label, href, icon: Icon }) => <Link key={id} href={href} onClick={() => closeMenu()} className={`nav-item ${active === id ? "nav-active" : ""}`} aria-current={active === id ? "page" : undefined}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><Sparkles size={15} /></span><div><strong>Um passo de cada vez</strong><p>Consistência nasce de escolhas possíveis.</p></div></div>
          <Link className={`nav-item ${active === "resultados" ? "nav-active" : ""}`} href="/resultados"><BarChart3 size={17} /><span>Resultados</span></Link>
          <Link className={`nav-item ${active === "configuracoes" ? "nav-active" : ""}`} href="/configuracoes"><Settings2 size={17} /><span>Configurações</span></Link>
          <div className="profile-row"><div className="profile-avatar">{professionalName?.slice(0, 1).toUpperCase() ?? "·"}</div><div className="profile-meta"><Link href="/perfil"><strong>{professionalName || "Seu perfil"}</strong></Link><small title={email}>{email ?? "Perfil profissional"}</small></div><ArrowUpRight size={15} className="profile-arrow" /><LogoutButton /></div>
        </div>
      </aside>
      <div className="main-column" inert={isMobile && mobileOpen}>
        <header className="topbar">
          <button ref={menuButtonRef} type="button" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu" aria-controls="orvia-sidebar" aria-expanded={mobileOpen}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Seu espaço</span><span className="crumb-slash">/</span><strong>{navigation.find(item => item.id === active)?.label ?? (active === "resultados" ? "Resultados" : active === "perfil" ? "Perfil profissional" : "Configurações")}</strong></div>
          <div className="topbar-right"><span className="topbar-caption">SEU ESPAÇO DE CRESCIMENTO</span><span className="topbar-orb"><Sparkles size={15} /></span></div>
        </header>
        <main id="conteudo" className="main-content">{children}</main>
        <footer className="footer"><span>Orvia <span className="footer-sep">·</span> Um espaço para crescer com intenção</span><span>Fundação em construção</span></footer>
      </div>
    </div>
  );
}
