import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import (
    importar_productos_base, 
    mapear_vencimientos,
    load_json,
    save_json,
    _generar_id_movimiento,
    Lote,
    MovimientoStock
)
from core.product_config import Producto
from core.execution_tracker import set_tracking_enabled, track_execution

@track_execution
def importar_stock_inicial(stock_df: pd.DataFrame):
    """
    Importa stock desde la planilla transpuesta.
    Columna COD tiene la fecha a partir de la fila 1.
    Resto de las columnas son los códigos de producto.
    """
    productos_raw = load_json("productos.json")
    prod_dict = {p['codigo_producto']: Producto(**p) for p in productos_raw}
    
    lotes_raw = load_json("stock_lotes.json")
    lotes = [Lote(**l) for l in lotes_raw]
    
    movimientos_raw = load_json("movimientos_stock.json")
    
    # Identificar columnas de producto (todas menos COD y Unnamed)
    columnas_producto = [col for col in stock_df.columns if str(col) != 'COD' and not str(col).startswith('Unnamed')]
    
    # Filas de datos (saltamos la 0 que es ARTICULO)
    for idx, row in stock_df.iterrows():
        if idx == 0:
            continue
            
        # La fecha está en la columna COD
        fecha_raw = row['COD']
        if pd.isna(fecha_raw):
            continue
            
        try:
            if isinstance(fecha_raw, datetime):
                fecha_conteo = fecha_raw
            else:
                fecha_conteo = pd.to_datetime(fecha_raw)
        except Exception as e:
            print(f"No se pudo parsear fecha {fecha_raw}: {e}")
            continue
            
        fecha_str = fecha_conteo.strftime('%Y%m%d')
        
        for col in columnas_producto:
            codigo = str(col).strip()
            # En pandas el código float 100.0 puede ser "100.0", hay que limpiar a "100"
            if codigo.endswith('.0'):
                codigo = codigo[:-2]
                
            cantidad_raw = row[col]
            if pd.isna(cantidad_raw) or cantidad_raw == '' or cantidad_raw == 0:
                continue
                
            try:
                cantidad = int(cantidad_raw)
            except ValueError:
                continue
                
            if cantidad <= 0:
                continue
                
            if codigo not in prod_dict:
                print(f"ADVERTENCIA: Stock inicial para producto {codigo} que no existe en maestro.")
                continue
                
            producto = prod_dict[codigo]
            
            # Crear lote inicial de ajuste
            # Lote técnico porque no sabemos la fecha real de ingreso de la mercadería contada
            id_lote = f"{codigo}-AJUSTE-{fecha_str}"
            
            # Calcular vencimiento usando la fecha de conteo como base
            fecha_venc = None
            if producto.vida_util_dias:
                from datetime import timedelta
                fecha_venc = fecha_conteo + timedelta(days=producto.vida_util_dias)
                
            lote_existente = next((l for l in lotes if l.id_lote == id_lote), None)
            
            if lote_existente:
                lote_existente.cantidad_inicial += cantidad
                lote_existente.cantidad_actual += cantidad
            else:
                nuevo_lote = Lote(
                    id_lote=id_lote,
                    codigo_producto=codigo,
                    lote=f"AJUSTE-{fecha_str}",
                    descripcion_producto=producto.descripcion,
                    categoria=producto.categoria,
                    fecha_ingreso=fecha_conteo,
                    fecha_vencimiento=fecha_venc,
                    cantidad_inicial=cantidad,
                    cantidad_actual=cantidad,
                    estado="ACTIVO",
                    origen="AJUSTE_STOCK",
                    archivo_origen="Planilla de stock Carga Inicial.xlsx"
                )
                lotes.append(nuevo_lote)
                
            mov_data = MovimientoStock(
                id_movimiento=_generar_id_movimiento(),
                fecha=datetime.now(),
                codigo_producto=codigo,
                id_lote=id_lote,
                tipo="CONTEO_STOCK",
                cantidad=cantidad,
                observacion="Carga inicial manual",
                archivo_origen="Planilla de stock Carga Inicial.xlsx"
            )
            movimientos_raw.append(mov_data.model_dump(mode='json'))
            
    save_json("stock_lotes.json", [l.model_dump(mode='json') for l in lotes])
    save_json("movimientos_stock.json", movimientos_raw)
    print(f"Stock inicial importado. {len(lotes)} lotes activos generados.")

def run_carga_inicial():
    set_tracking_enabled(True)
    
    base_dir = os.environ.get(
        "DULCE_HORA_ARCHIVOS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Archivos"))
    )
    dir_origen = os.environ.get("DULCE_HORA_CARGA_INICIAL_DIR", os.path.join(base_dir, "Carga Inicial"))
    archivo_duracion = os.path.join(dir_origen, "Duracion de articulos.xlsx")
    archivo_stock = os.path.join(dir_origen, "Planilla de stock Carga Inicial.xlsx")
    
    print("1. Procesando archivo de duracion (Maestro de productos y vencimientos)")
    df_dur = pd.read_excel(archivo_duracion)
    
    # Preparar raw para productos base
    productos_raw = []
    vencimientos_raw = []
    
    for _, row in df_dur.iterrows():
        cod = str(row.get('Codigo', '')).strip()
        if cod == 'nan' or not cod:
            continue
        if cod.endswith('.0'): cod = cod[:-2]
            
        articulo = str(row.get('Articulo', '')).strip()
        categoria = str(row.get('Almacenamiento', '')).strip()
        
        # Tomar vida util, priorizamos Invierno (cadena frio normal), fallback a verano
        vida_util_str = str(row.get('Invierno/cadena de frio', '')).strip()
        if vida_util_str == 'nan' or not vida_util_str:
            vida_util_str = str(row.get('Verano/sin cadena de frio', '')).strip()
            
        vida_util_dias = None
        if vida_util_str and vida_util_str != 'nan':
            try:
                vida_util_dias = int(float(vida_util_str))
            except ValueError:
                pass
                
        productos_raw.append({
            "COD": cod,
            "ARTICULO": articulo,
            "categoria": categoria,
            "presentacion": "1 un.",
            "precio_compra": 1000 # Dummy price
        })
        
        if vida_util_dias is not None:
            vencimientos_raw.append({
                "COD": cod,
                "vida_util_dias": vida_util_dias
            })
            
    importar_productos_base(productos_raw)
    mapear_vencimientos(vencimientos_raw)
    print(f"Productos importados: {len(productos_raw)}")
    
    print("2. Procesando archivo de stock")
    df_stock = pd.read_excel(archivo_stock)
    
    # Limpiamos todos los JSON primero para arrancar de 0 esta carga inicial
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    for f in ["stock_lotes.json", "movimientos_stock.json"]:
        path = os.path.join(data_dir, f)
        if os.path.exists(path):
            os.remove(path)
            
    importar_stock_inicial(df_stock)
    print("Carga inicial finalizada.")

if __name__ == "__main__":
    run_carga_inicial()
