import sys
import os
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import load_json, save_json
from core.execution_tracker import set_tracking_enabled

def extraer_categorias_y_presentacion():
    set_tracking_enabled(True)
    
    base_dir = os.environ.get(
        "DULCE_HORA_ARCHIVOS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Archivos"))
    )
    archivo_pedido = os.environ.get(
        "DULCE_HORA_PEDIDO_BASE_FILE",
        os.path.join(base_dir, "Entregas", "Planilla de pedido Banfield - 19_5_2026.xlsx")
    )
    print(f"Extrayendo categorias y presentacion desde: {archivo_pedido}")
    
    # Header en fila 0
    df = pd.read_excel(archivo_pedido)
    
    productos_raw = load_json("productos.json")
    prod_dict = {p['codigo_producto']: p for p in productos_raw}
    
    categoria_actual = "Sin Categoria"
    actualizados = 0
    
    for idx, row in df.iterrows():
        # Saltamos hasta la fila 2
        if idx < 1: continue
        
        col_0 = str(row.iloc[0]).strip()
        col_1 = str(row.iloc[1]).strip()
        presentacion = str(row.iloc[2]).strip()
        
        if not col_0 or col_0 == 'nan':
            # Si col_0 es vacia pero col_1 (articulo) existe, podria ser una fila de datos sin codigo, pero la ignoramos.
            continue
            
        # Determinar si es un encabezado de categoria
        # Si col_0 no es numérico y col_1 es nan o vacio -> Es Categoria
        if not col_0.isdigit() and (col_1 == 'nan' or col_1 == ''):
            categoria_actual = col_0
            continue
            
        # Si col_0 es un numero, es un codigo de producto
        if col_0.isdigit():
            codigo = str(int(col_0))
            if codigo in prod_dict:
                # Actualizamos
                prod_dict[codigo]['categoria'] = categoria_actual
                if presentacion != 'nan' and presentacion != '':
                    prod_dict[codigo]['presentacion'] = presentacion
                actualizados += 1
            else:
                # El producto no existe en el maestro, lo agregamos como dummy inactivo para no perder su categoria/presentacion si luego se usa
                print(f"Producto {codigo} ({col_1}) detectado en pedido pero no en maestro base. Guardando temporalmente.")
                prod_dict[codigo] = {
                    "codigo_producto": codigo,
                    "descripcion": col_1 if col_1 != 'nan' else 'Desconocido',
                    "categoria": categoria_actual,
                    "presentacion": presentacion if presentacion != 'nan' else '1 un.',
                    "precio_compra": None,
                    "precio_venta": None,
                    "vida_util_dias": None,
                    "activo": False,
                    "requiere_control_vencimiento": False,
                    "origen": "Planilla_19_5",
                    "ultima_actualizacion": None
                }
                
    # Guardar maestro
    save_json("productos.json", list(prod_dict.values()))
    print(f"Actualización completada. {actualizados} productos actualizados con categoría '{categoria_actual}' (última leída).")
    
if __name__ == "__main__":
    extraer_categorias_y_presentacion()
