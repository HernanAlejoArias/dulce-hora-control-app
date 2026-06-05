import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ClipboardList, PackageCheck, RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  const [selectedDeliveries, setSelectedDeliveries] = useState([]);
  const [countDate, setCountDate] = useState(todayCompact());
  const [countValues, setCountValues] = useState({});

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
      setSelectedDeliveries(prev => {
        const available = statusRes.data.entradas?.pendientes?.map(item => item.archivo) || [];
        return prev.filter(file => available.includes(file));
      });
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
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stock_control/conteo`);
      setConteo(res.data);
      seedCountValues(res.data);
    } catch (err) {
      console.error(err);
      setMessage('Error leyendo la planilla de conteo.');
    }
    setLoading(false);
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
        seedCountValues(conteoRes.data);
        setActiveView('conteo');
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
  const pendingDeliveries = status?.entradas?.pendientes || [];
  const selectedDeliverySet = new Set(selectedDeliveries);

  const toggleDelivery = (archivo) => {
    setSelectedDeliveries(prev => (
      prev.includes(archivo)
        ? prev.filter(item => item !== archivo)
        : [...prev, archivo]
    ));
  };

  const seedCountValues = (conteoData) => {
    const next = {};
    conteoData.grupos?.forEach(group => {
      group.productos.forEach(item => {
        next[item.codigo] = item.stock_planilla ?? item.stock_actual ?? 0;
      });
    });
    setCountValues(next);
  };

  const handleCountValue = (codigo, value) => {
    setCountValues(prev => ({ ...prev, [codigo]: value }));
  };

  const saveCountToExcel = () => {
    runAction(
      'guardar_conteo',
      '/stock_control/guardar_conteo',
      data => `Conteo guardado en Excel (${data.fecha_formato}). Productos guardados: ${data.guardados}.`,
      { fecha: countDate, valores: countValues }
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
          <button className="btn" onClick={loadConteo} disabled={loading}>
            <ClipboardList size={18} />
            Contar Stock
          </button>
          <button
            className="btn"
            onClick={() => runAction('entradas', '/stock_control/procesar_entradas', data => {
              const count = data.procesados?.length || 0;
              return count ? `Entradas procesadas: ${count}.` : 'No se proceso ninguna entrada.';
            }, { archivos: selectedDeliveries })}
            disabled={!!processing || selectedDeliveries.length === 0}
          >
            <PackageCheck size={18} className={processing === 'entradas' ? 'spin' : ''} />
            Procesar Entrada
          </button>
          <button
            className="btn"
            onClick={() => runAction('salidas', '/stock_control/procesar_ventas_desperdicio', data => {
              const ventas = data.ventas_procesadas?.length || 0;
              const desperdicio = data.desperdicio_procesado?.length || 0;
              return ventas || desperdicio
                ? `Procesadas ventas: ${ventas}; desperdicio: ${desperdicio}.`
                : 'No habia ventas ni desperdicios nuevos para procesar.';
            })}
            disabled={!!processing}
          >
            <Trash2 size={18} className={processing === 'salidas' ? 'spin' : ''} />
            Procesar Desperdicio y Ventas
          </button>
        </div>
      </div>

      {message && (
        <div className="glass-card" style={{ marginBottom: '1rem', color: message.includes('Error') || message.includes('No se pudo') ? '#fca5a5' : '#86efac' }}>
          {message.includes('Error') || message.includes('No se pudo') ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span style={{ marginLeft: '0.5rem' }}>{message}</span>
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: pendingDeliveries.length ? '1rem' : 0 }}>
          <div>
            <h2 style={{ marginBottom: '0.35rem' }}>Pedidos disponibles</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Selecciona que entradas queres usar. Fecha de corte stock: {formatDate(status?.entradas?.fecha_corte_stock)}
            </p>
          </div>
          {pendingDeliveries.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const allSelected = pendingDeliveries.every(item => selectedDeliverySet.has(item.archivo));
                setSelectedDeliveries(allSelected ? [] : pendingDeliveries.map(item => item.archivo));
              }}
            >
              {pendingDeliveries.every(item => selectedDeliverySet.has(item.archivo)) ? 'Limpiar seleccion' : 'Seleccionar todos'}
            </button>
          )}
        </div>
        {pendingDeliveries.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No hay pedidos nuevos disponibles para procesar.</p>
        ) : (
          <div className="delivery-list">
            {pendingDeliveries.map(item => (
              <label className="delivery-option" key={item.archivo}>
                <input
                  type="checkbox"
                  checked={selectedDeliverySet.has(item.archivo)}
                  onChange={() => toggleDelivery(item.archivo)}
                />
                <span>
                  <strong>{item.archivo}</strong>
                  <small>{formatDate(item.fecha)} | {item.items?.length || 0} productos</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

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
                    Este conteo ya fue procesado. El flag evita reprocesarlo.
                  </p>
                )}
              </div>
              <div className="stock-actions">
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
                <button
                  className="btn"
                  onClick={saveCountToExcel}
                  disabled={!!processing || countDate.length !== 8}
                >
                  <PackageCheck size={18} className={processing === 'guardar_conteo' ? 'spin' : ''} />
                  Guardar Conteo en Excel
                </button>
                <button
                  className="btn"
                  onClick={() => runAction('conteo', '/stock_control/procesar_conteo', data => (
                    data.status === 'skipped'
                      ? data.message
                      : `Conteo aplicado. Ajustes +${qty(data.ajustes_positivos)} / -${qty(data.ajustes_negativos)}.`
                  ))}
                  disabled={!!processing || conteo.conteo.procesado}
                >
                  <RefreshCw size={18} className={processing === 'conteo' ? 'spin' : ''} />
                  Aplicar Conteo
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
          </div>

          {conteo.grupos.map(group => (
            <div className="stock-location-block" key={group.ubicacion}>
              <h2>{group.ubicacion}</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Codigo</th>
                      <th>Producto</th>
                      <th>Actual App</th>
                      <th>Conteo</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.productos.map(item => (
                      <tr key={`${group.ubicacion}-${item.codigo}`}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.codigo}</td>
                        <td style={{ fontWeight: 500 }}>{item.descripcion}</td>
                        <td>{qty(item.stock_actual)}</td>
                        <td>
                          <input
                            className="count-input"
                            type="number"
                            value={countValues[item.codigo] ?? ''}
                            onChange={e => handleCountValue(item.codigo, e.target.value)}
                            step="0.001"
                            inputMode="decimal"
                          />
                        </td>
                        <td>
                          <span className={`badge ${Number((countValues[item.codigo] || 0) - (item.stock_actual || 0)) === 0 ? 'safe' : Number((countValues[item.codigo] || 0) - (item.stock_actual || 0)) > 0 ? 'warning-med' : 'danger'}`}>
                            {Number((countValues[item.codigo] || 0) - (item.stock_actual || 0)) > 0 ? '+' : ''}{qty(Number(countValues[item.codigo] || 0) - Number(item.stock_actual || 0))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : (
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
      )}
    </div>
  );
}
