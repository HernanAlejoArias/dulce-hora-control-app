import sys
import os
import json

# Agregar el directorio raíz al path para poder importar 'core'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import importar_productos_base, mapear_vencimientos
from core.execution_tracker import set_tracking_enabled

def run_verification():
    print("--- INICIANDO VERIFICACIÓN DE IMPORTACIÓN ---")
    
    # Habilitar tracking para ver los logs
    set_tracking_enabled(True)
    
    # 1. Mock data para productos
    mock_productos_raw = [
        {"COD": "308", "ARTICULO": "Pepa Membrillo", "categoria": "Cuartos", "presentacion": "1 un.", "precio_compra": 2282},
        {"COD": "352", "ARTICULO": "Lemon Pie", "categoria": "Porcion", "presentacion": "1 un.", "precio_compra": 1500}
    ]
    
    # Ejecutar importación
    print("\nImportando productos base...")
    productos = importar_productos_base(mock_productos_raw)
    print(f"Productos importados: {len(productos)}")
    
    # Verificar que el JSON fue creado
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    productos_json_path = os.path.join(data_dir, 'productos.json')
    assert os.path.exists(productos_json_path), "No se creó productos.json"
    
    # 2. Mock data para vencimientos
    mock_vencimientos_raw = [
        {"COD": "308", "vida_util_dias": 5},
        {"COD": "999", "vida_util_dias": 10} # Producto inexistente
    ]
    
    print("\nMapeando vencimientos...")
    mapear_vencimientos(mock_vencimientos_raw)
    
    # Leer el json para validar
    with open(productos_json_path, 'r', encoding='utf-8') as f:
        prod_data = json.load(f)
        
    pepa = next((p for p in prod_data if p['codigo_producto'] == '308'), None)
    assert pepa is not None
    assert pepa['vida_util_dias'] == 5, "No se mapeó correctamente la vida útil"
    
    # Verificar archivo de pendientes
    pendientes_path = os.path.join(data_dir, 'productos_pendientes_vencimiento.json')
    assert os.path.exists(pendientes_path), "No se creó archivo de pendientes"
    with open(pendientes_path, 'r', encoding='utf-8') as f:
        pendientes = json.load(f)
    assert len(pendientes) == 1
    assert pendientes[0]['COD'] == "999"
    
    print("\n--- VERIFICACIÓN EXITOSA ---")

if __name__ == "__main__":
    run_verification()
