import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, ClipboardList, PackageCheck, RefreshCw, Trash2, AlertTriangle, CheckCircle2, Route } from 'lucide-react';
import { API_URL } from './api';

const qty = (value) => {
  if (value === null || value === undefined) return '-';
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });
};

const formatDate = (value) => {
  if (!value) return '-';
  return String(value).replaceAll('-', '');
};

const todayCompact = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export default function StockControl() {
  const [stock, setStock] = useState([]);
  const [status, setStatus] = useState(null);
  const [conteo, setConteo] = useState(null);
  const [activeView, setActiveView] = useState('actual');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState('');
  const [message, setMessage] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [selectedCountDate, setSelectedCountDate] = useState('');
  const [countDate, setCountDate] = useState(todayCompact());
  const [countValues, setCountValues] = useState({});
  const [countGroupIndex, setCountGroupIndex] = useState(0);

  useEffect(() => {
    refreshAll();
  }, []);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [stockRes, statusRes] = await Promise.all([
        axios.get(`${API_URL}/stock_comparativo`),
        axios.get(`${API_URL}/stock_control/status`)
      ]);
      setStock(stockRes.data);
      setStatus(statusRes.data);
    } catch (err) {
      console.error(err);
      setMessage('Error cargando Control Stock.');
    }
    setLoading(false);
  };

  const loadConteo = async () => {
    setActiveView('conteo');
    if (conteo) {
      if (!Object.keys(countValues).length) seedCountValues(conteo);
      if (countGroupIndex >= (conteo.grupos?.length || 0)) setCountGroupIndex(0);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stock_control/conteo`);
      setConteo(res.data);
      if (res.data.conteo?.fecha) setCountDate(formatDate(res.data.conteo.fecha));
      seedCountValues(res.data);
    } catch (err) {
      console.error(err);
      setMessage('Error leyendo la planilla de conteo.');
    }
    setLoading(false);
  };

  const showActual = () => {
    setActiveView('actual');
  };

  const loadTimeline = async (fecha = selectedCountDate) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stock_control/timeline`, { params: fecha ? { fecha } : {} });
      setTimeline(res.data);
      setSelectedCountDate(res.data.fecha_conteo || '');
      setActiveView('normalizar');
    } catch (err) {
      console.error(err);
      setMessage('Error armando timeline de stock.');
    }
    setLoading(false);
  };

  const showNormalizar = () => {
    loadTimeline();
  };

  const runAction = async (key, url, successText, payload = undefined) => {
    setProcessing(key);
    setMessage('');
    try {
      const res = await axios.post(`${API_URL}${url}`, payload);
      setMessage(successText(res.data));
      setConteo(null);
      await refreshAll();
      if (key === 'conteo' || key === 'guardar_conteo' || key === 'restaurar') {
        const conteoRes = await axios.get(`${API_URL}/stock_control/conteo`);
        setConteo(conteoRes.data);
        if (conteoRes.data.conteo?.fecha) setCountDate(formatDate(conteoRes.data.conteo.fecha));
        seedCountValues(conteoRes.data);
        setActiveView('conteo');
      }
      if (key === 'normalizar') {
        const timelineRes = await axios.get(`${API_URL}/stock_control/timeline`, {
          params: selectedCountDate ? { fecha: selectedCountDate } : {}
        });
        setTimeline(timelineRes.data);
        setActiveView('normalizar');
      }
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.detail || 'No se pudo completar el proceso.');
    }
    setProcessing('');
  };

  const stockPorUbicacion = useMemo(() => {
    const groups = {};
    stock.forEach(item => {
      const key = item.ubicacion || 'Sin ubicacion';
      groups[key] = groups[key] || [];
      groups[key].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [stock]);

  const totalStock = status?.stock_actual?.unidades_totales ?? stock.reduce((acc, item) => acc + Number(item.stock_teorico || 0), 0);
  const timelineEvents = timeline?.timeline || [];
  const timelineChart = timeline?.chart || [];
  const countGroups = conteo?.grupos || [];
  const currentCountGroup = countGroups[countGroupIndex];
  const nextCountGroup = countGroups[countGroupIndex + 1];
  const previousCountGroup = countGroups[countGroupIndex - 1];

  const seedCountValues = (conteoData) => {
    const next = {};
    conteoData.grupos?.forEach(group => {
      group.productos.forEach(item => {
        next[item.codigo] = item.stock_planilla ?? item.stock_actual ?? 0;
      });
    });
    setCountValues(next);
    setCountGroupIndex(0);
  };

  const handleCountValue = (codigo, value) => {
    setCountValues(prev => ({ ...prev, [codigo]: value }));
  };

  const adjustCountValue = (codigo, delta) => {
    setCountValues(prev => {
      const current = Number(prev[codigo] || 0);
      const next = Math.max(0, Math.round((current + delta) * 1000) / 1000);
      return { ...prev, [codigo]: String(next) };
    });
  };

  const saveCountToExcel = () => {
    runAction(
      'guardar_conteo',
      '/stock_control/guardar_conteo',
      data => `Conteo guardado en Excel (${data.fecha_formato}). Productos guardados: ${data.guardados}.`,
      { fecha: countDate, valores: countValues }
    );
  };

  const normalizeStock = () => {
    runAction(
      'normalizar',
      '/stock_control/normalizar',
      data => {
        const entradas = (data.entradas || []).reduce((acc, item) => acc + (item.procesados?.length || 0), 0);
        const ventas = (data.ventas_desperdicio || []).reduce((acc, item) => acc + (item.ventas_procesadas?.length || 0), 0);
        const desperdicio = (data.ventas_desperdicio || []).reduce((acc, item) => acc + (item.desperdicio_procesado?.length || 0), 0);
        return `Stock normalizado. Entradas: ${entradas}; ventas: ${ventas}; desperdicio: ${desperdicio}.`;
      },
      { fecha_conteo: selectedCountDate || timeline?.fecha_conteo }
    );
  };

  if (loading && !status) return <div className="main-content">Cargando Control Stock...</div>;

  return (
    <div className="main-content">
      <div className="header">
        <h1>Control Stock</h1>
      </div>

      <div className="kpi-grid">
        <div className="glass-card warning-low-indicator">
          <div className="kpi-title">
            <PackageCheck size={16} color="var(--color-warning-low)" />
            Stock Actual
          </div>
          <div className="kpi-value">{qty(totalStock)} un.</div>
        </div>
        <div className="glass-card warning-med-indicator">
          <div className="kpi-title">
            <ClipboardList size={16} color="var(--color-warning-med)" />
            Ultimo Conteo
          </div>
          <div className="kpi-value" style={{ fontSize: '1.8rem' }}>{formatDate(status?.conteo?.fecha)}</div>
        </div>
        <div className="glass-card warning-high-indicator">
          <div className="kpi-title">
            <RefreshCw size={16} color="var(--color-warning-high)" />
            Entradas Pendientes
          </div>
          <div className="kpi-value">{status?.entradas?.pendientes?.length ?? 0}</div>
        </div>
        <div className="glass-card danger-indicator">
          <div className="kpi-title">
            <Trash2 size={16} color="var(--color-danger)" />
            Ventas/Desperdicio Pend.
          </div>
          <div className="kpi-value">
            {(status?.ventas_desperdicio?.ventas_pendientes?.length ?? 0) + (status?.ventas_desperdicio?.desperdicio_pendiente?.length ?? 0)}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div className="stock-actions">
          <button className="btn" onClick={showActual} disabled={loading}>
            <PackageCheck size={18} />
            Stock Actual
          </button>
          <button className="btn" onClick={loadConteo} disabled={loading}>
            <ClipboardList size={18} />
            Contar Stock
          </button>
          <button
            className="btn"
            onClick={showNormalizar}
            disabled={!!processing || loading}
          >
            <Route size={18} />
            Normalizar Stock
          </button>
        </div>
      </div>

      {activeView === 'normalizar' && (
        <div className="glass-card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ marginBottom: '0.35rem' }}>Normalizar Stock</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Selecciona el conteo real desde donde iniciar el ciclo. El orden aplicado es conteo, entradas, ventas y desperdicio.
              </p>
            </div>
            <div className="stock-actions">
              <label className="count-date-field">
                <span>Conteo</span>
                <select
                  value={selectedCountDate}
                  onChange={e => loadTimeline(e.target.value)}
                  disabled={loading || !!processing}
                >
                  {timeline?.conteos?.map(item => (
                    <option key={item.fecha} value={item.fecha}>
                      {item.fecha_formato} {item.procesado ? '(aplicado)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn"
                onClick={normalizeStock}
                disabled={!!processing || !timeline?.fecha_conteo}
              >
                <RefreshCw size={18} className={processing === 'normalizar' ? 'spin' : ''} />
                Normalizar Stock
              </button>
            </div>
          </div>

          <div className="timeline-list">
            {timelineEvents.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No hay informacion pendiente para este ciclo.</p>
            ) : timelineEvents.map((event, index) => (
              <div className={`timeline-item ${event.procesado ? 'processed' : ''}`} key={`${event.tipo}-${event.fecha}-${event.titulo}-${index}`}>
                <div className="timeline-dot">{index + 1}</div>
                <div>
                  <strong>{event.titulo}</strong>
                  <small>{formatDate(event.fecha)} | {event.tipo} | {event.items} items | {qty(event.cantidad_total)} un.</small>
                </div>
              </div>
            ))}
          </div>

          {timelineChart.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>Stock teorico vs real</h2>
              <div className="stock-chart-list">
                {timelineChart.map(item => {
                  const max = Math.max(Number(item.real || 0), Number(item.teorico || 0), 1);
                  return (
                    <div className="stock-chart-row" key={item.codigo}>
                      <div className="stock-chart-label">
                        <strong>{item.codigo}</strong>
                        <span>{item.descripcion}</span>
                      </div>
                      <div className="stock-chart-bars">
                        <div className="stock-chart-bar theoretical" style={{ width: `${Math.max(8, (Number(item.teorico || 0) / max) * 100)}%` }}>
                          Teorico {qty(item.teorico)}
                        </div>
                        <div className="stock-chart-bar real" style={{ width: `${Math.max(8, (Number(item.real || 0) / max) * 100)}%` }}>
                          Real {qty(item.real)}
                        </div>
                      </div>
                      <span className={`badge ${Number(item.diferencia) >= 0 ? 'safe' : 'danger'}`}>
                        {Number(item.diferencia) > 0 ? '+' : ''}{qty(item.diferencia)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="glass-card" style={{ marginBottom: '1rem', color: message.includes('Error') || message.includes('No se pudo') ? '#fca5a5' : '#86efac' }}>
          {message.includes('Error') || message.includes('No se pudo') ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span style={{ marginLeft: '0.5rem' }}>{message}</span>
        </div>
      )}

      {activeView === 'conteo' && conteo ? (
        <>
          <div className="glass-card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <h2 style={{ marginBottom: '0.35rem' }}>Planilla de Conteo</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                  Archivo: {conteo.conteo.archivo || '-'} | Fecha detectada: {formatDate(conteo.conteo.fecha)} | Productos: {conteo.conteo.cantidad_productos}
                </p>
                {conteo.conteo.es_futura && (
                  <p style={{ color: '#fbbf24', marginTop: '0.5rem' }}>
                    Atencion: esta fecha esta en el futuro para el sistema. Revisar la planilla antes de aplicar.
                  </p>
                )}
                {conteo.conteo.procesado && (
                  <p style={{ color: '#86efac', marginTop: '0.5rem' }}>
                    Este conteo ya fue aplicado. Para volver el stock al Excel, usa Restaurar Ultimo Stock.
                  </p>
                )}
              </div>
            </div>
          </div>

          {currentCountGroup && (
            <div className="stock-location-block count-location-panel" key={currentCountGroup.ubicacion}>
              <div className="count-location-header">
                <div>
                  <span className="count-location-progress">
                    {countGroupIndex + 1} de {countGroups.length}
                  </span>
                  <h2>{currentCountGroup.ubicacion}</h2>
                  {nextCountGroup ? (
                    <p>Siguiente: {nextCountGroup.ubicacion}</p>
                  ) : (
                    <p>Ultima ubicacion. Al terminar, guarda el conteo.</p>
                  )}
                </div>
                <label className="count-date-field">
                  <span>Ir a ubicacion</span>
                  <select
                    value={countGroupIndex}
                    onChange={e => setCountGroupIndex(Number(e.target.value))}
                  >
                    {countGroups.map((group, index) => (
                      <option key={group.ubicacion} value={index}>{group.ubicacion}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-container count-table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Conteo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCountGroup.productos.map(item => (
                      <tr key={`${currentCountGroup.ubicacion}-${item.codigo}`}>
                        <td className="count-product-cell">
                          <span>{item.descripcion}</span>
                        </td>
                        <td>
                          <input
                            className="count-input"
                            type="number"
                            value={countValues[item.codigo] ?? ''}
                            onChange={e => handleCountValue(item.codigo, e.target.value)}
                            step="0.5"
                            inputMode="decimal"
                          />
                        </td>
                        <td>
                          <div className="count-stepper">
                            <button type="button" onClick={() => adjustCountValue(item.codigo, -0.5)}>-</button>
                            <button type="button" onClick={() => adjustCountValue(item.codigo, 0.5)}>+</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="count-location-nav">
                <button
                  className="btn"
                  onClick={() => setCountGroupIndex(index => Math.max(0, index - 1))}
                  disabled={!previousCountGroup}
                >
                  <ChevronLeft size={18} />
                  {previousCountGroup ? previousCountGroup.ubicacion : 'Anterior'}
                </button>
                <button
                  className="btn"
                  onClick={() => setCountGroupIndex(index => Math.min(countGroups.length - 1, index + 1))}
                  disabled={!nextCountGroup}
                >
                  {nextCountGroup ? `Siguiente: ${nextCountGroup.ubicacion}` : 'Fin del conteo'}
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
          <div className="glass-card count-save-panel">
            <label className="count-date-field">
              <span>Fecha conteo</span>
              <input
                type="text"
                value={countDate}
                onChange={e => setCountDate(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                maxLength={8}
              />
            </label>
            <div className="stock-actions">
              <button
                className="btn"
                onClick={saveCountToExcel}
                disabled={!!processing || countDate.length !== 8}
              >
                <PackageCheck size={18} className={processing === 'guardar_conteo' ? 'spin' : ''} />
                Guardar
              </button>
              <button
                className="btn"
                onClick={() => runAction('restaurar', '/stock_control/restaurar_ultimo_stock', data => (
                  `Stock restaurado desde el ultimo conteo. Ajustes +${qty(data.ajustes_positivos)} / -${qty(data.ajustes_negativos)}.`
                ))}
                disabled={!!processing}
              >
                <PackageCheck size={18} className={processing === 'restaurar' ? 'spin' : ''} />
                Restaurar Ultimo Stock
              </button>
            </div>
          </div>
        </>
      ) : activeView === 'actual' ? (
        <>
          <h2>Stock Actual</h2>
          {stockPorUbicacion.map(([ubicacion, items]) => (
            <div className="stock-location-block" key={ubicacion}>
              <h2>{ubicacion}</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Codigo</th>
                      <th>Producto</th>
                      <th>Categoria</th>
                      <th>Stock Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={`${ubicacion}-${item.codigo}`}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.codigo}</td>
                        <td style={{ fontWeight: 500 }}>{item.descripcion}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{item.categoria}</td>
                        <td style={{ fontWeight: 700 }}>{qty(item.stock_teorico)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
