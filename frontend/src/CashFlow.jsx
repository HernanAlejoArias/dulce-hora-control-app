import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Download, PlusCircle, RefreshCw, WalletCards } from 'lucide-react';
import { API_URL } from './api';

const money = (value) => Number(value || 0).toLocaleString('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
});

const todayCompact = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};

const currentMonth = () => todayCompact().slice(0, 6);

export default function CashFlow() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    mes_imputacion: currentMonth(),
    fecha_vencimiento: todayCompact(),
    fecha_pago: todayCompact(),
    categoria: '',
    ref1: '',
    destinatario: '',
    ref2: '',
    costo: '',
    medio_pago: 'Transferencia',
    origen: 'Dulce Hora',
    estado: 'Pago',
    facturado: '',
    notas: ''
  });

  useEffect(() => {
    fetchCashFlow();
  }, []);

  const fetchCashFlow = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.get(`${API_URL}/cashflow`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.detail || 'No se pudo leer el CashFlow.');
    }
    setLoading(false);
  };

  const categories = useMemo(() => (
    data?.categorias?.map(item => item.categoria).filter(Boolean) || []
  ), [data]);

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await axios.post(`${API_URL}/cashflow/movimientos`, form);
      setMessage(`Movimiento guardado en fila ${res.data.fila}.`);
      setForm(prev => ({
        ...prev,
        ref1: '',
        destinatario: '',
        ref2: '',
        costo: '',
        notas: ''
      }));
      await fetchCashFlow();
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.detail || 'No se pudo guardar el movimiento.');
    }
    setSaving(false);
  };

  if (loading && !data) {
    return <div className="main-content">Cargando CashFlow...</div>;
  }

  return (
    <div className="main-content">
      <div className="header">
        <h1>CashFlow</h1>
        <div className="stock-actions">
          <button className="btn" onClick={fetchCashFlow} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
            Actualizar
          </button>
          <a className="btn" href={`${API_URL}/cashflow/archivo`}>
            <Download size={18} />
            Descargar Excel
          </a>
        </div>
      </div>

      {message && (
        <div className="glass-card" style={{ marginBottom: '1rem', color: message.includes('No se pudo') ? '#fca5a5' : '#86efac' }}>
          {message}
        </div>
      )}

      <div className="kpi-grid">
        <div className="glass-card warning-low-indicator">
          <div className="kpi-title">
            <WalletCards size={16} color="var(--color-warning-low)" />
            Movimientos
          </div>
          <div className="kpi-value">{data?.total_movimientos || 0}</div>
        </div>
        <div className="glass-card warning-med-indicator">
          <div className="kpi-title">Ultimo Mes</div>
          <div className="kpi-value" style={{ fontSize: '1.8rem' }}>{data?.ultimo_mes || '-'}</div>
        </div>
        <div className="glass-card warning-high-indicator">
          <div className="kpi-title">Total Ultimo Mes</div>
          <div className="kpi-value" style={{ fontSize: '1.8rem' }}>{money(data?.total_ultimo_mes)}</div>
        </div>
        <div className="glass-card danger-indicator">
          <div className="kpi-title">Total General</div>
          <div className="kpi-value" style={{ fontSize: '1.8rem' }}>{money(data?.total_general)}</div>
        </div>
      </div>

      <form className="glass-card cashflow-form" onSubmit={saveMovement}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <PlusCircle size={20} />
          <h2>Nuevo Movimiento</h2>
        </div>
        <div className="form-grid">
          <label>
            Mes Imputacion
            <input value={form.mes_imputacion} onChange={e => updateField('mes_imputacion', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
          </label>
          <label>
            Fecha Vencimiento
            <input value={form.fecha_vencimiento} onChange={e => updateField('fecha_vencimiento', e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" />
          </label>
          <label>
            Fecha de Pago
            <input value={form.fecha_pago} onChange={e => updateField('fecha_pago', e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" />
          </label>
          <label>
            Categoria
            <input list="cashflow-categories" value={form.categoria} onChange={e => updateField('categoria', e.target.value)} required />
            <datalist id="cashflow-categories">
              {categories.map(category => <option value={category} key={category} />)}
            </datalist>
          </label>
          <label>
            Ref1
            <input value={form.ref1} onChange={e => updateField('ref1', e.target.value)} />
          </label>
          <label>
            Destinatario
            <input value={form.destinatario} onChange={e => updateField('destinatario', e.target.value)} />
          </label>
          <label>
            Ref2
            <input value={form.ref2} onChange={e => updateField('ref2', e.target.value)} />
          </label>
          <label>
            Costo
            <input value={form.costo} onChange={e => updateField('costo', e.target.value)} inputMode="decimal" required />
          </label>
          <label>
            M. Pago
            <input value={form.medio_pago} onChange={e => updateField('medio_pago', e.target.value)} />
          </label>
          <label>
            Origen
            <input value={form.origen} onChange={e => updateField('origen', e.target.value)} />
          </label>
          <label>
            Estado
            <input value={form.estado} onChange={e => updateField('estado', e.target.value)} />
          </label>
          <label>
            Facturado
            <input value={form.facturado} onChange={e => updateField('facturado', e.target.value)} />
          </label>
          <label className="form-wide">
            Notas
            <input value={form.notas} onChange={e => updateField('notas', e.target.value)} />
          </label>
        </div>
        <button className="btn" type="submit" disabled={saving}>
          <PlusCircle size={18} className={saving ? 'spin' : ''} />
          Guardar Movimiento
        </button>
      </form>

      <div className="cashflow-layout">
        <div>
          <h2>Ultimos Movimientos</h2>
          <div className="table-container" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Pago</th>
                  <th>Categoria</th>
                  <th>Destinatario</th>
                  <th>Ref1</th>
                  <th>Costo</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {data?.movimientos?.map(item => (
                  <tr key={item.fila}>
                    <td>{item.fecha_pago || '-'}</td>
                    <td>{item.categoria || '-'}</td>
                    <td>{item.destinatario || '-'}</td>
                    <td>{item.ref1 || '-'}</td>
                    <td style={{ fontWeight: 700 }}>{money(item.costo)}</td>
                    <td>{item.origen || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2>Resumen Mensual</h2>
          <div className="table-container compact-table" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data?.resumen_mensual?.slice(0, 12).map(item => (
                  <tr key={item.mes}>
                    <td>{item.mes}</td>
                    <td style={{ fontWeight: 700 }}>{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
