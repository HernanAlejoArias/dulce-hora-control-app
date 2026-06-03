import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart3, DollarSign, Percent, Target, AlertTriangle, Settings } from 'lucide-react';
import { API_URL } from './api';

const money = (value) => {
  if (value === null || value === undefined) return '-';
  return `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};

const number = (value, suffix = '') => {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 1 })}${suffix}`;
};

export default function EconomiaInsights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [costoFijoMensual, setCostoFijoMensual] = useState(0);
  const [diasPeriodo, setDiasPeriodo] = useState(30);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/insights/equilibrio`, {
        params: {
          costo_fijo_mensual: costoFijoMensual,
          dias_periodo: diasPeriodo
        }
      });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching economics insights", err);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchInsights();
  };

  if (!data) return <div className="main-content">Cargando economia...</div>;

  const { resumen, productos } = data;
  const topProductos = productos.slice(0, 80);

  return (
    <div className="main-content">
      <div className="header">
        <h1>Economia</h1>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleSubmit} style={{display: 'flex', gap: '2rem', alignItems: 'flex-end', flexWrap: 'wrap'}}>
          <div>
            <label style={{display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem'}}>
              Costo fijo mensual
            </label>
            <input
              type="number"
              value={costoFijoMensual}
              onChange={e => setCostoFijoMensual(Number(e.target.value))}
              min={0}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                width: '180px'
              }}
            />
          </div>
          <div>
            <label style={{display: 'block', color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.9rem'}}>
              Dias proyectados
            </label>
            <input
              type="number"
              value={diasPeriodo}
              onChange={e => setDiasPeriodo(Number(e.target.value))}
              min={1}
              max={365}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                width: '140px'
              }}
            />
          </div>
          <button type="submit" className="btn" disabled={loading}>
            <Settings size={18} className={loading ? "spin" : ""} />
            {loading ? 'Calculando...' : 'Recalcular'}
          </button>
        </form>
      </div>

      <div className="kpi-grid">
        <div className="glass-card warning-high-indicator">
          <div className="kpi-title">
            <DollarSign size={16} color="var(--color-warning-high)" />
            Ingreso Estimado
          </div>
          <div className="kpi-value">{money(resumen.ingreso_estimado)}</div>
        </div>
        <div className="glass-card warning-med-indicator">
          <div className="kpi-title">
            <BarChart3 size={16} color="var(--color-warning-med)" />
            Contribucion
          </div>
          <div className="kpi-value">{money(resumen.contribucion_estimada)}</div>
        </div>
        <div className="glass-card warning-low-indicator">
          <div className="kpi-title">
            <Percent size={16} color="var(--color-warning-low)" />
            Margen Bruto
          </div>
          <div className="kpi-value">{number(resumen.margen_bruto_pct, '%')}</div>
        </div>
        <div className="glass-card danger-indicator">
          <div className="kpi-title">
            <Target size={16} color="var(--color-danger)" />
            Punto de Equilibrio
          </div>
          <div className="kpi-value">{money(resumen.punto_equilibrio_ingresos)}</div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-muted)' }}>
          <AlertTriangle size={18} color="#fbbf24" />
          <span>
            Productos sin precio completo: {resumen.productos_sin_precio}. Productos con margen negativo: {resumen.productos_margen_negativo}.
          </span>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Producto</th>
              <th>Venta</th>
              <th>COGS</th>
              <th>Margen</th>
              <th>Prom. Dia</th>
              <th>Contribucion</th>
              <th>Equilibrio</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {topProductos.map((item, idx) => (
              <tr key={`${item.codigo}-${idx}`}>
                <td style={{fontFamily: 'monospace', color: 'var(--text-muted)'}}>{item.codigo}</td>
                <td style={{fontWeight: 500}}>{item.descripcion}</td>
                <td>{money(item.precio_venta)}</td>
                <td>{money(item.precio_compra)}</td>
                <td>
                  {item.margen_unitario !== null ? (
                    <span className={`badge ${item.margen_unitario > 0 ? 'safe' : 'danger'}`}>
                      {money(item.margen_unitario)} / {number(item.margen_pct, '%')}
                    </span>
                  ) : '-'}
                </td>
                <td>{number(item.promedio_diario)}</td>
                <td style={{fontWeight: 700}}>{money(item.contribucion_estimada)}</td>
                <td>{item.unidades_equilibrio ? `${number(item.unidades_equilibrio)} un.` : '-'}</td>
                <td>
                  <span className={`badge ${item.estado === 'rentable' ? 'safe' : item.estado === 'margen_negativo' ? 'danger' : 'warning-med'}`}>
                    {item.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
