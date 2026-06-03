import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { API_URL } from './api';

export default function ConfiguradorMapeo() {
  const [mapeo, setMapeo] = useState({});
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [productos, setProductos] = useState([]);
  const [newItemCode, setNewItemCode] = useState({});

  useEffect(() => {
    fetchMapeo();
    fetchProductos();
  }, []);

  const fetchMapeo = async () => {
    try {
      const res = await axios.get(`${API_URL}/config/mapeo_ventas`);
      setMapeo(res.data);
    } catch (err) {
      console.error("Error fetching mapeo:", err);
    }
  };

  const fetchProductos = async () => {
    try {
      const res = await axios.get(`${API_URL}/productos`);
      setProductos(res.data);
    } catch (err) {
      console.error("Error fetching productos:", err);
    }
  };

  const getProductName = (code) => {
    const prod = productos.find(p => p.codigo_producto === code);
    return prod ? prod.descripcion : `Código: ${code}`;
  };

  const handleRatioChange = (origenCode, destCode, newRatio) => {
    setMapeo(prev => ({
      ...prev,
      [origenCode]: {
        ...prev[origenCode],
        distribucion: {
          ...prev[origenCode].distribucion,
          [destCode]: parseFloat(newRatio) || 0
        }
      }
    }));
  };

  const handleRemoveDest = (origenCode, destCode) => {
    setMapeo(prev => {
      const updated = { ...prev };
      const dist = { ...updated[origenCode].distribucion };
      delete dist[destCode];
      updated[origenCode] = { ...updated[origenCode], distribucion: dist };
      return updated;
    });
  };

  const handleAddDest = (origenCode) => {
    const destCode = newItemCode[origenCode];
    if (!destCode) return;
    
    setMapeo(prev => ({
      ...prev,
      [origenCode]: {
        ...prev[origenCode],
        distribucion: {
          ...prev[origenCode].distribucion,
          [destCode]: 0
        }
      }
    }));
    setNewItemCode(prev => ({ ...prev, [origenCode]: '' }));
  };

  const handleSave = async () => {
    setLoading(true);
    setSaveStatus('');
    try {
      // Validate totals (should be close to 1.0)
      for (const [key, config] of Object.entries(mapeo)) {
        const sum = Object.values(config.distribucion).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1.0) > 0.01) {
          alert(`¡Advertencia! La suma de proporciones para ${config.descripcion} (${key}) es ${sum * 100}%, debería ser 100%. Por favor corrige esto antes de guardar.`);
          setLoading(false);
          return;
        }
      }

      await axios.post(`${API_URL}/config/mapeo_ventas`, mapeo);
      setSaveStatus('Guardado exitosamente');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setSaveStatus('Error al guardar');
    }
    setLoading(false);
  };

  return (
    <div className="main-content">
      <div className="header">
        <h1>Configuración de Mapeo de Ventas</h1>
      </div>

      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Este módulo te permite definir cómo se desglosan las ventas de un código agrupador de la caja en productos individuales del sistema para el cálculo correcto de promedios diarios.
        </p>

        {Object.entries(mapeo).map(([origenCode, config]) => {
          const total = Object.values(config.distribucion).reduce((a, b) => a + b, 0);
          const hasError = Math.abs(total - 1.0) > 0.01;

          return (
            <div key={origenCode} style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem', border: hasError ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Cód. {origenCode} - {config.descripcion}
                {hasError && <AlertCircle size={16} color="#ef4444" title="La suma de porcentajes no es 100%" />}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(config.distribucion).map(([destCode, ratio]) => (
                  <div key={destCode} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 40px', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>Cód. {destCode}</div>
                    <div style={{ fontWeight: 500 }}>{getProductName(destCode)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="number" 
                        value={Math.round(ratio * 100)} 
                        onChange={(e) => handleRatioChange(origenCode, destCode, (parseFloat(e.target.value) / 100).toFixed(2))}
                        min="0"
                        max="100"
                        step="1"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'white',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          width: '70px',
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ color: 'var(--text-muted)' }}>%</span>
                    </div>
                    <button onClick={() => handleRemoveDest(origenCode, destCode)} style={{background:'transparent', border:'none', color:'#ef4444', cursor:'pointer'}} title="Quitar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <select 
                    value={newItemCode[origenCode] || ''} 
                    onChange={e => setNewItemCode(prev => ({ ...prev, [origenCode]: e.target.value }))}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'white',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      flex: 1
                    }}
                  >
                    <option value="" style={{background: '#1e293b', color: 'white'}}>Seleccionar producto para agregar...</option>
                    {productos.filter(p => p.activo && !Object.keys(config.distribucion).includes(p.codigo_producto)).map(p => (
                      <option key={p.codigo_producto} value={p.codigo_producto} style={{background: '#1e293b', color: 'white'}}>
                        {p.codigo_producto} - {p.descripcion}
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={() => handleAddDest(origenCode)} 
                    disabled={!newItemCode[origenCode]}
                    className="btn"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    <Plus size={16} /> Agregar
                  </button>
                </div>
              </div>
              
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: hasError ? '#ef4444' : 'var(--text-muted)', fontWeight: hasError ? 'bold' : 'normal' }}>
                  Total: {Math.round(total * 100)}%
                </span>
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <button className="btn" onClick={handleSave} disabled={loading} style={{ padding: '0.75rem 2rem' }}>
            <Save size={18} className={loading ? "spin" : ""} />
            {loading ? 'Guardando...' : 'Guardar Configuración'}
          </button>
          {saveStatus && (
            <span style={{ color: saveStatus.includes('Error') ? '#ef4444' : '#10b981', fontWeight: 500 }}>
              {saveStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
