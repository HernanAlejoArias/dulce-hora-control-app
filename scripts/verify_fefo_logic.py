import sys
import os
import json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import importar_productos_base, ingresar_entrega, descontar_stock_fefo
from core.execution_tracker import set_tracking_enabled

def run_verification():
    print("--- INICIANDO VERIFICACIÓN DE FEFO E INGRESOS ---")
    set_tracking_enabled(True)
    
    # 1. Configurar datos base limpios
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    # Limpiar archivos si existen
    for f in ["productos.json", "stock_lotes.json", "movimientos_stock.json"]:
        path = os.path.join(data_dir, f)
        if os.path.exists(path):
            os.remove(path)
            
    # Crear producto de prueba
    importar_productos_base([
        {"COD": "308", "ARTICULO": "Pepa Membrillo", "vida_util_dias": 5} # Dummy prop to ignore, actually the model doesnt take vida_util directly in raw but ok.
    ])
    
    # Mapear vida util a 5 dias
    from core.product_logic import mapear_vencimientos
    mapear_vencimientos([{"COD": "308", "vida_util_dias": 5}])
    
    # 2. Simular ingreso 1 (Lote viejo)
    fecha_vieja = datetime.now() - timedelta(days=2)
    entrega_1 = [{"codigo": "308", "cantidad": 10}]
    print("\nIngresando Entrega 1...")
    ingresar_entrega(entrega_1, fecha_vieja, "Planilla_1.xlsx")
    
    # 3. Simular ingreso 2 (Lote nuevo)
    fecha_nueva = datetime.now()
    entrega_2 = [{"codigo": "308", "cantidad": 5}]
    print("\nIngresando Entrega 2...")
    ingresar_entrega(entrega_2, fecha_nueva, "Planilla_2.xlsx")
    
    # Verificar stock inicial
    with open(os.path.join(data_dir, 'stock_lotes.json'), 'r') as f:
        lotes = json.load(f)
        assert len(lotes) == 2
        lote_viejo = lotes[0]
        lote_nuevo = lotes[1]
        assert lote_viejo['cantidad_actual'] == 10
        assert lote_nuevo['cantidad_actual'] == 5
        print(f"Lotes verificados: {lote_viejo['id_lote']} (10 un), {lote_nuevo['id_lote']} (5 un)")
        
    # 4. Descontar stock usando FEFO (Vender 12 unidades)
    print("\nDescontando 12 unidades usando FEFO...")
    descontar_stock_fefo("308", 12, "VENTA", "Venta de mostrador")
    
    # Verificar que el lote viejo está agotado y el nuevo tiene 3
    with open(os.path.join(data_dir, 'stock_lotes.json'), 'r') as f:
        lotes_despues = json.load(f)
        lote_viejo_d = next(l for l in lotes_despues if l['id_lote'] == lote_viejo['id_lote'])
        lote_nuevo_d = next(l for l in lotes_despues if l['id_lote'] == lote_nuevo['id_lote'])
        
        assert lote_viejo_d['cantidad_actual'] == 0
        assert lote_viejo_d['estado'] == "AGOTADO"
        assert lote_nuevo_d['cantidad_actual'] == 3
        print(f"Lotes tras venta: {lote_viejo_d['id_lote']}={lote_viejo_d['cantidad_actual']} ({lote_viejo_d['estado']}), {lote_nuevo_d['id_lote']}={lote_nuevo_d['cantidad_actual']}")
        
    print("\n--- VERIFICACIÓN FEFO EXITOSA ---")

if __name__ == "__main__":
    run_verification()
