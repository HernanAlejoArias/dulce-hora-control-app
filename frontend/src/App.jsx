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
  ClipboardCheck
} from 'lucide-react';
import StockControl from './StockControl';
import GeneradorPedidos from './GeneradorPedidos';
import ConfiguradorMapeo from './ConfiguradorMapeo';
import { API_URL } from './api';

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

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
          <div className="glass-card danger-indicator pulse-danger">
            <div className="kpi-title">
              <AlertTriangle size={16} color="var(--color-danger)"/>
              Vencido / Vence Hoy
            </div>
            <div className="kpi-value">{unidades_vencidas + unidades_vencen_hoy} un.</div>
          </div>
          
          <div className="glass-card warning-high-indicator">
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-high)"/>
              Vence en 1 día
            </div>
            <div className="kpi-value">{unidades_vencen_1d} un.</div>
          </div>

          <div className="glass-card warning-med-indicator">
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-med)"/>
              Vence en 2 días
            </div>
            <div className="kpi-value">{unidades_vencen_2d} un.</div>
          </div>

          <div className="glass-card warning-low-indicator">
            <div className="kpi-title">
              <Clock size={16} color="var(--color-warning-low)"/>
              Vence en 3 días
            </div>
            <div className="kpi-value">{unidades_vencen_3d} un.</div>
          </div>

          <div className="glass-card danger-indicator">
            <div className="kpi-title">
              <TrendingDown size={16} color="var(--color-danger)"/>
              Valor en Riesgo
            </div>
            <div className="kpi-value">${valor_en_riesgo.toLocaleString('es-AR')}</div>
          </div>
        </div>

        <h2>Atención Requerida (Stock en Riesgo)</h2>
        <div className="table-container" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Lote</th>
                <th>Cantidad</th>
                <th>Vencimiento</th>
                <th>Acción Sugerida</th>
              </tr>
            </thead>
            <tbody>
              {productos_riesgo.length === 0 && (
                <tr>
                  <td colSpan="6" style={{textAlign: 'center', padding: '2rem'}}>No hay productos en riesgo</td>
                </tr>
              )}
              {productos_riesgo.map((p, idx) => {
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
                        {p.dias_restantes < 0 ? 'Vencido' : p.dias_restantes === 0 ? 'Hoy' : `En ${p.dias_restantes} días`}
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

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2 style={{ color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <Package color="#3b82f6"/>
          Dulce Hora
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button 
            className={`btn ${activeTab === 'dashboard' ? '' : 'inactive'}`} 
            style={{background: activeTab === 'dashboard' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: activeTab === 'dashboard' ? '#60a5fa' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'dashboard' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent'}}
            onClick={() => setActiveTab('dashboard')}
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
            Campañas
          </button>
          <button 
            className={`btn ${activeTab === 'auditoria' ? '' : 'inactive'}`} 
            style={{background: activeTab === 'auditoria' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: activeTab === 'auditoria' ? '#60a5fa' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'auditoria' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent'}}
            onClick={() => setActiveTab('auditoria')}
          >
            <ClipboardCheck size={18} />
            Control Stock
          </button>
          <button 
            className={`btn ${activeTab === 'pedidos' ? '' : 'inactive'}`} 
            style={{background: activeTab === 'pedidos' ? 'rgba(234, 179, 8, 0.2)' : 'transparent', color: activeTab === 'pedidos' ? '#facc15' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'pedidos' ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent'}}
            onClick={() => setActiveTab('pedidos')}
          >
            <ShoppingCart size={18} />
            Generar Pedido
          </button>
          <button 
            className={`btn ${activeTab === 'config_ventas' ? '' : 'inactive'}`} 
            style={{background: activeTab === 'config_ventas' ? 'rgba(236, 72, 153, 0.2)' : 'transparent', color: activeTab === 'config_ventas' ? '#f472b6' : 'var(--text-muted)', justifyContent: 'flex-start', border: activeTab === 'config_ventas' ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid transparent'}}
            onClick={() => setActiveTab('config_ventas')}
          >
            <ClipboardCheck size={18} />
            Config. Ventas
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' && renderDashboard()}
      {activeTab === 'auditoria' && <StockControl />}
      {activeTab === 'pedidos' && <GeneradorPedidos />}
      {activeTab === 'config_ventas' && <ConfiguradorMapeo />}
      
    </div>
  )
}

export default App
