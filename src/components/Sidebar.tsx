import { Archive, CalendarClock, ChartNoAxesCombined, CheckCheck, LayoutDashboard, List, Settings2, TrendingUp, X } from 'lucide-react'
import type { View, Workspace } from '../domain/types'

const mainItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'leads', label: 'All leads', icon: List },
  { id: 'callbacks', label: 'Callbacks', icon: CalendarClock },
  { id: 'pipeline', label: 'Sales pipeline', icon: ChartNoAxesCombined },
  { id: 'activations', label: 'Activations', icon: CheckCheck },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
]

export function Sidebar({ view, onNavigate, workspace, mobileOpen, onClose }: { view: View; onNavigate: (view: View) => void; workspace: Workspace; mobileOpen: boolean; onClose: () => void }) {
  const counts: Partial<Record<View, number>> = {
    leads: workspace.leads.length,
    callbacks: workspace.callbacks.length,
    pipeline: workspace.sales.filter(sale => sale.stage === 'credit_vetting' || sale.stage === 'pending_confirmation').length,
    activations: workspace.sales.filter(sale => sale.stage === 'activated').length,
  }
  return <>
    {mobileOpen && <button className="mobile-scrim" onClick={onClose} aria-label="Close navigation" />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Workspace navigation">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><span>+</span></div>
        <div className="brand-wordmark"><strong>ultralead<span>+</span></strong><small>THE CALLING WORKSPACE</small></div>
        <button className="icon-button close-nav" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <div className="sidebar-section-label">WORKSPACE <span>01</span></div>
      <nav className="side-nav" aria-label="Main navigation">
        {mainItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => { onNavigate(id); onClose() }} aria-current={view === id ? 'page' : undefined}>
          <Icon size={17} strokeWidth={1.6} /><span>{label}</span>{counts[id] !== undefined && <small>{String(counts[id]).padStart(2, '0')}</small>}
        </button>)}
        <div className="sidebar-section-label manage-label">MANAGE <span>02</span></div>
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => { onNavigate('settings'); onClose() }} aria-current={view === 'settings' ? 'page' : undefined}>
          <Settings2 size={17} strokeWidth={1.6} /><span>Data & settings</span>
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-rule" />
        <div className="local-label"><Archive size={13} /><span>PRIVATE TO THIS BROWSER</span></div>
      </div>
    </aside>
  </>
}
