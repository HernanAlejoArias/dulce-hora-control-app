import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, Settings } from 'lucide-react';
import { API_URL } from './api';

export default function GeneradorPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Params
  const [diasCobertura, setDiasCobertura] = useState(2);
  const [plusPorcentaje, setPlusPorcentaje] = useState(10);

  useEffect(() => {
    fetchPedidos();
  }, []);

  const fetchPedidos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/generar_pedido`, {
        params: {
          dias_cobertura: diasCobertura,
          plus_porcentaje: plusPorcentaje
        }
      });
      setPedidos(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleRecalculate = (e) => {
    e.preventDefault();
    fetchPedidos();
  };

  return (
    <div className="main-content">
      <div className="header">
        <h1>Sugerencia Inteligente de Pedidos</h1>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleRecalculate} style={{display: 'flex', gap: '2rem', alignItems: 'flex-end'}}>
          <div>
            <label style={{display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem'}}>
              Días a Cubrir (próx. entrega)
            </label>
            <input 
              type="number" 
              value={diasCobertura} 
              onChange={e => setDiasCobertura(Number(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                width: '150px'
              }}
              min={1}
              max={30}
            />
          </div>
          <div>
            <label style={{display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem'}}>
              Plus de Crecimiento (%)
            </label>
            <input 
              type="number" 
              value={plusPorcentaje} 
              onChange={e => setPlusPorcentaje(Number(e.target.value))}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                width: '150px'
              }}
              min={0}
              max={100}
            />
          </div>
          <button type="submit" className="btn" disabled={loading}>
            <Settings size={18} className={loading ? "spin" : ""} />
            {loading ? 'Calculando...' : 'Recalcular Demanda'}
          </button>
        </form>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Basado en el promedio de ventas de la última semana y descartando el stock que vencerá pronto.
          El pedido ha sido redondeado automáticamente según las unidades por bulto del sistema.
        </p>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Código</th>
                <th>Producto</th>
                <th style={{textAlign: 'center'}}>Promedio Día</th>
                <th style={{textAlign: 'center'}}>Stock Útil</th>
                <th style={{textAlign: 'center', color: '#ef4444'}}>Stock a Vencer</th>
                <th style={{textAlign: 'center'}}>Pedido Sugerido</th>
                <th style={{textAlign: 'center', background: 'rgba(255,255,255,0.02)'}}>A Pedir (Bultos)</th>
                <th style={{textAlign: 'center', background: 'rgba(255,255,255,0.02)'}}>Total (Unidades)</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((item, idx) => (
                 <tr key={idx} style={{ background: item.pedido_redondeado === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>{item.categoria}</td>
                  <td style={{fontFamily: 'monospace', color: 'var(--text-muted)'}}>{item.codigo}</td>
                  <td style={{fontWeight: 500, color: item.pedido_redondeado === 0 ? 'rgba(255,255,255,0.6)' : '#ffffff'}}>
                    {item.descripcion}
                    {item.requiere_revision && (
                      <span title="Revisar: Posible venta por gramos" style={{marginLeft: '8px', color: '#fbbf24', cursor: 'help'}}>
                        <AlertTriangle size={14} style={{display: 'inline', verticalAlign: 'text-bottom'}} />
                      </span>
                    )}
                  </td>
                  <td style={{textAlign: 'center', fontWeight: '600', color: item.promedio_diario > 0 ? '#60a5fa' : 'var(--text-muted)'}}>
                    {item.promedio_diario} <span style={{fontSize:'0.75rem', fontWeight:'normal', color:'var(--text-muted)'}}>{item.unidad_base}</span>
                  </td>
                  <td style={{textAlign: 'center', fontWeight: '600', color: item.stock_util > 0 ? '#34d399' : 'var(--text-muted)'}}>
                    {item.stock_util} <span style={{fontSize:'0.75rem', fontWeight:'normal', color:'var(--text-muted)'}}>{item.unidad_base}</span>
                  </td>
                  <td style={{textAlign: 'center', fontWeight: '600', color: item.stock_vencido > 0 ? '#ef4444' : 'var(--text-muted)'}}>
                    {item.stock_vencido > 0 ? item.stock_vencido : '-'} {item.stock_vencido > 0 && <span style={{fontSize:'0.75rem', fontWeight:'normal', color:'var(--text-muted)'}}>{item.unidad_base}</span>}
                  </td>
                  <td style={{textAlign: 'center', color: item.pedido_redondeado === 0 ? 'var(--text-muted)' : 'inherit'}}>
                    {item.pedido_bruto} <span style={{fontSize:'0.75rem', fontWeight:'normal', color:'var(--text-muted)'}}>{item.unidad_base}</span>
                  </td>
                  <td style={{textAlign: 'center', background: 'rgba(255,255,255,0.01)', fontWeight: 600, color: item.pedido_redondeado === 0 ? 'var(--text-muted)' : 'inherit'}}>
                    {item.bultos_sugeridos} {item.bultos_sugeridos !== "-" && <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal'}}> (x{item.unidades_por_bulto})</span>}
                  </td>
                  <td style={{textAlign: 'center', background: 'rgba(255,255,255,0.01)'}}>
                    <span className={`badge ${item.pedido_redondeado > 0 ? 'danger' : 'safe'}`} style={{opacity: item.pedido_redondeado > 0 ? 1 : 0.4, background: item.pedido_redondeado > 0 ? 'var(--accent-glow)' : 'rgba(255,255,255,0.05)', color: 'white'}}>
                      {item.pedido_redondeado > 0 ? `+${item.pedido_redondeado} ${item.unidad_base}` : `0 ${item.unidad_base}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
