import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Clock,
  Package,
  TrendingDown,
  LayoutDashboard,
  ShoppingCart,
  Megaphone,
  ClipboardCheck,
  BarChart3,
  WalletCards,
  Menu,
  X
} from 'lucide-react';
import StockControl from './StockControl';
import GeneradorPedidos from './GeneradorPedidos';
import ConfiguradorMapeo from './ConfiguradorMapeo';
import EconomiaInsights from './EconomiaInsights';
import CashFlow from './CashFlow';
import { API_URL } from './api';

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardFilter, setDashboardFilter] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard`);
      setDashboard(res.data);
    } catch (err) {
      console.error("Error fetching dashboard", err);
    }
  };

  const renderDashboard = () => {
    if (!dashboard) return <div style={{padding: '2rem'}}>Cargando...</div>;

    const {
      unidades_vencidas,
      unidades_vencen_hoy,
      unidades_vencen_1d,
      unidades_vencen_2d,
      unidades_vencen_3d,
      valor_en_riesgo,
      productos_riesgo
    } = dashboard;

    const filterOptions = {
      overdue_today: {
        title: 'Vencido / Vence Hoy',
        matches: (p) => p.dias_restantes <= 0
      },
      one_day: {
        title: 'Vence en 1 dia',
        matches: (p) => p.dias_restantes === 1
      },
      two_days: {
        title: 'Vence en 2 dias',
        matches: (p) => p.dias_restantes === 2
      },
      three_days: {
        title: 'Vence en 3 dias',
        matches: (p) => p.dias_restantes === 3
      },
      all: {
        title: 'Stock en Riesgo',
        matches: () => true
      }
    };

    const filteredProductos = productos_riesgo.filter(filterOptions[dashboardFilter].matches);
    const setFilter = (filter) => {
      setDashboardFilter(prev => prev === filter ? 'all' : filter);
    };

    return (
      <div className="main-content">
        <div className="header">
          <h1>Panel de Control</h1>
          <button className="btn" onClick={() => setActiveTab('pedidos')}>
            <ShoppingCart size={18} />
            Generar Pedido
          </button>
        </div>

        <div className="kpi-grid">
          <button
            type="button"
            className={`glass-card kpi-card danger-indicator pulse-danger ${dashboardFilter === 'overdue_today' ? 'active' : ''}`}
            onClick={() => setFilter('overdue_today')}
            aria-pressed={dashboardFilter === 'overdue_today'}
          >
            <div className="kpi-title">
              <AlertTriangle size={16} color="var(--color-danger)"/>
              Vencido / Vence Hoy
            </div>
            <div className="kpi-value">{unidades_vencidas + unidades_vencen_hoy} un.</div>
          </button>

          <button
            type="button"
            className={`glass-card kpi-card warning-high-indicator ${dashboardFilter === 'one_day' ? 'active' : ''}`}
            onClick={() => setFilter('one_day')}
            aria-pressed={dashboardFilter === 'one_day'}
          >
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-high)"/>
              Vence en 1 dia
            </div>
            <div className="kpi-value">{unidades_vencen_1d} un.</div>
          </button>

          <button
            type="button"
            className={`glass-card kpi-card warning-med-indicator ${dashboardFilter === 'two_days' ? 'active' : ''}`}
            onClick={() => setFilter('two_days')}
            aria-pressed={dashboardFilter === 'two_days'}
          >
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-med)"/>
              Vence en 2 dias
            </div>
            <div className="kpi-value">{unidades_vencen_2d} un.</div>
          </button>

          <button
            type="button"
            className={`glass-card kpi-card warning-low-indicator ${dashboardFilter === 'three_days' ? 'active' : ''}`}
            onClick={() => setFilter('three_days')}
            aria-pressed={dashboardFilter === 'three_days'}
          >
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-low)"/>
              Vence en 3 dias
            </div>
            <div className="kpi-value">{unidades_vencen_3d} un.</div>
          </button>

          <button
            type="button"
            className={`glass-card kpi-card danger-indicator ${dashboardFilter === 'all' ? 'active' : ''}`}
            onClick={() => setDashboardFilter('all')}
            aria-pressed={dashboardFilter === 'all'}
          >
            <div className="kpi-title">
              <TrendingDown size={16} color="var(--color-danger)"/>
              Valor en Riesgo
            </div>
            <div className="kpi-value">${valor_en_riesgo.toLocaleString('es-AR')}</div>
          </button>
        </div>

        <h2>Atencion Requerida ({filterOptions[dashboardFilter].title})</h2>
        <div className="table-container" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Producto</th>
                <th>Lote</th>
                <th>Cantidad</th>
                <th>Vencimiento</th>
                <th>Accion Sugerida</th>
              </tr>
            </thead>
            <tbody>
              {filteredProductos.length === 0 && (
                <tr>
                  <td colSpan="6" style={{textAlign: 'center', padding: '2rem'}}>No hay productos en riesgo</td>
                </tr>
              )}
              {filteredProductos.map((p, idx) => {
                let badgeClass = 'safe';
                let action = '';

                if (p.dias_restantes < 0) { badgeClass = 'danger'; action = 'Descartar'; }
                else if (p.dias_restantes === 0) { badgeClass = 'danger'; action = 'Promo 2x1 Urgente'; }
                else if (p.dias_restantes === 1) { badgeClass = 'warning-high'; action = 'Descuento Fuerte / Mostrador'; }
                else if (p.dias_restantes === 2) { badgeClass = 'warning-med'; action = 'Descuento Moderado / Combo'; }
                else if (p.dias_restantes === 3) { badgeClass = 'warning-low'; action = 'Destacar en redes'; }

                return (
                  <tr key={idx}>
                    <td>{p.codigo}</td>
                    <td style={{fontWeight: 500}}>{p.descripcion}</td>
                    <td style={{color: 'var(--text-muted)'}}>{p.id_lote}</td>
                    <td style={{fontWeight: 700}}>{p.cantidad}</td>
                    <td>
                      <span className={`badge ${badgeClass}`}>
                        {p.dias_restantes < 0 ? 'Vencido' : p.dias_restantes === 0 ? 'Hoy' : `En ${p.dias_restantes} dias`}
                      </span>
                    </td>
                    <td>
                      <button className="btn" style={{padding: '0.4rem 0.8rem', fontSize: '0.8rem'}}>
                        {action}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className={`app-container ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>
      <button
        type="button"
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        aria-label="Cerrar menu"
      />

      <div className="sidebar">
        <div className="sidebar-header">
          <h2 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <Package color="#3b82f6"/>
          Dulce Hora
        </h2>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-nav">
          <button
            className={`btn ${activeTab === 'dashboard' ? '' : 'inactive'}`}
            style={{background: activeTab === 'dashboard' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: activeTab === 'dashboard' ? '#60a5fa' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'dashboard' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('dashboard')}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>

          <button
            className={`btn`}
            style={{background: 'transparent', color: 'var(--text-muted)', justifyContent: 'flex-start', border: '1px solid transparent'}}
          >
            <ShoppingCart size={18} />
            Pedidos
          </button>

          <button
            className={`btn`}
            style={{background: 'transparent', color: 'var(--text-muted)', justifyContent: 'flex-start', border: '1px solid transparent'}}
          >
            <Megaphone size={18} />
            Campanas
          </button>
          <button
            className={`btn ${activeTab === 'economia' ? '' : 'inactive'}`}
            style={{background: activeTab === 'economia' ? 'rgba(34, 197, 94, 0.2)' : 'transparent', color: activeTab === 'economia' ? '#86efac' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'economia' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('economia')}
          >
            <BarChart3 size={18} />
            Economia
          </button>
          <button
            className={`btn ${activeTab === 'cashflow' ? '' : 'inactive'}`}
            style={{background: activeTab === 'cashflow' ? 'rgba(14, 165, 233, 0.2)' : 'transparent', color: activeTab === 'cashflow' ? '#7dd3fc' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'cashflow' ? '1px solid rgba(14, 165, 233, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('cashflow')}
          >
            <WalletCards size={18} />
            CashFlow
          </button>
          <button
            className={`btn ${activeTab === 'auditoria' ? '' : 'inactive'}`}
            style={{background: activeTab === 'auditoria' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: activeTab === 'auditoria' ? '#60a5fa' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'auditoria' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('auditoria')}
          >
            <ClipboardCheck size={18} />
            Control Stock
          </button>
          <button
            className={`btn ${activeTab === 'pedidos' ? '' : 'inactive'}`}
            style={{background: activeTab === 'pedidos' ? 'rgba(234, 179, 8, 0.2)' : 'transparent', color: activeTab === 'pedidos' ? '#facc15' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'pedidos' ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('pedidos')}
          >
            <ShoppingCart size={18} />
            Generar Pedido
          </button>
          <button
            className={`btn ${activeTab === 'config_ventas' ? '' : 'inactive'}`}
            style={{background: activeTab === 'config_ventas' ? 'rgba(236, 72, 153, 0.2)' : 'transparent', color: activeTab === 'config_ventas' ? '#f472b6' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'config_ventas' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid transparent'}}
            onClick={() => handleTabChange('config_ventas')}
          >
            <ClipboardCheck size={18} />
            Config. Ventas
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'economia' && <EconomiaInsights />}
      {activeTab === 'cashflow' && <CashFlow />}
      {activeTab === 'auditoria' && <StockControl />}
      {activeTab === 'pedidos' && <GeneradorPedidos />}
      {activeTab === 'config_ventas' && <ConfiguradorMapeo />}

    </div>
  )
}

export default App
