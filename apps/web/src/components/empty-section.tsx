import { Compass, Sparkles } from "lucide-react";

export function EmptySection({ label, description }: { label: string; description: string }) {
  return <div className="empty-page page-enter">
    <div className="eyebrow"><span className="eyebrow-line" /> ORVIA · SEU ESPAÇO DE CRESCIMENTO</div>
    <div className="empty-page-heading"><span className="empty-page-icon"><Compass size={19} /></span><div><span className="section-kicker">ÁREA DE TRABALHO</span><h1>{label}</h1></div></div>
    <section className="empty-page-panel"><div className="empty-page-art"><span /><Sparkles size={20} /></div><span className="section-kicker">EM PREPARAÇÃO</span><h2>Este espaço ainda não tem dados</h2><p>{description}</p><span className="empty-footnote">Nenhuma informação demonstrativa está sendo exibida.</span></section>
  </div>;
}
