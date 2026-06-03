import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Clock } from 'lucide-react';
import { API_URL } from './api';

export default function StockControl() {
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stock_comparativo`);
      // Add fake contados for demo purposes
      const data = res.data.map(item => ({
        ...item,
        stock_contado: '',
        desvio: 0
      }));
      setStock(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleProcessDay = async () => {
    setProcessing(true);
    setMessage('Procesando Entregas, Ventas y Desperdicios...');
    try {
      await axios.post(`${API_URL}/procesar_dia`);
      setMessage('Procesamiento completado exitosamente.');
      setTimeout(() => setMessage(''), 5000);
      fetchStock(); // Refresh
    } catch (err) {
      setMessage('Error procesando el día. Revise los logs del servidor.');
    }
    setProcessing(false);
  };

  const handleContadoChange = (codigo, val) => {
    const num = parseInt(val, 10);
    setStock(stock.map(item => {
      if (item.codigo === codigo) {
        const stock_contado = isNaN(num) ? '' : num;
        const desvio = isNaN(num) ? 0 : stock_contado - item.stock_teorico;
        return { ...item, stock_contado, desvio };
      }
      return item;
    }));
  };

  if (loading) return <div style={{padding: '2rem'}}>Cargando Control de Stock...</div>;

  return (
    <div className="main-content">
      <div className="header">
        <h1>Auditoría de Stock (Teórico vs Real)</h1>
        <button className="btn" onClick={handleProcessDay} disabled={processing}>
          {processing ? <Clock size={18} className="spin" /> : <Play size={18} />}
          {processing ? 'Procesando...' : 'Procesar Día (Batch)'}
        </button>
      </div>

      {message && (
        <div style={{
          background: message.includes('Error') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
          color: message.includes('Error') ? '#fca5a5' : '#86efac',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          border: `1px solid ${message.includes('Error') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`
        }}>
          {message}
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Este módulo permite comparar el <strong>Stock Teórico</strong> (calculado por el sistema después de procesar entregas y ventas) 
          con el <strong>Stock Real</strong> contado en el local.
        </p>
        
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Código</th>
                <th>Producto</th>
                <th style={{textAlign: 'center'}}>Stock Teórico</th>
                <th style={{textAlign: 'center', background: 'rgba(255,255,255,0.02)'}}>Stock Contado (Local)</th>
                <th style={{textAlign: 'center'}}>Desvío</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((item, idx) => (
                <tr key={idx}>
                  <td style={{color: 'var(--text-muted)'}}>{item.categoria}</td>
                  <td>{item.codigo}</td>
                  <td style={{fontWeight: 500}}>{item.descripcion}</td>
                  <td style={{textAlign: 'center', fontSize: '1.2rem'}}>{item.stock_teorico}</td>
                  <td style={{textAlign: 'center', background: 'rgba(255,255,255,0.02)'}}>
                    <input 
                      type="number" 
                      value={item.stock_contado}
                      onChange={(e) => handleContadoChange(item.codigo, e.target.value)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        width: '80px',
                        textAlign: 'center',
                        fontFamily: 'inherit'
                      }}
                      placeholder="-"
                    />
                  </td>
                  <td style={{textAlign: 'center'}}>
                    {item.stock_contado !== '' && (
                      <span className={`badge ${item.desvio === 0 ? 'safe' : 'danger'}`}>
                        {item.desvio > 0 ? `+${item.desvio}` : item.desvio}
                      </span>
                    )}
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
