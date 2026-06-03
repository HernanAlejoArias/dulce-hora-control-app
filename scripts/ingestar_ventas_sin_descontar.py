import sys
import os
import pandas as pd
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import load_json, save_json, _generar_id_movimiento
from core.product_config import MovimientoStock
from core.execution_tracker import set_tracking_enabled

def ingestar_ventas_historicas():
    set_tracking_enabled(True)
    base_dir = os.environ.get(
        "DULCE_HORA_ARCHIVOS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Archivos"))
    )
    archivo_ventas = os.environ.get(
        "DULCE_HORA_VENTAS_FILE",
        os.path.join(base_dir, "Ventas", "Estadisticas de Banfield - 2026-06-01.xlsx")
    )
    fechas_a_procesar = ['2026-05-30', '2026-05-31']
    
    print(f"Ingestando ventas como histórico sin descontar stock: {fechas_a_procesar}")
    
    df = pd.read_excel(archivo_ventas, sheet_name='Estadisticas de Productos', header=None)
    row_codigos = df.iloc[3].to_dict()
    mapa_columnas_codigo = {}
    for col_idx, cod in row_codigos.items():
        try:
            if pd.notna(cod):
                mapa_columnas_codigo[col_idx] = str(int(float(cod)))
        except:
            pass
            
    movimientos = load_json("movimientos_stock.json")
    total_ingestados = 0
    
    for idx, row in df.iterrows():
        if idx < 8: continue
        fecha_celda = row.iloc[0]
        if pd.isna(fecha_celda):
            continue
            
        try:
            fecha_venta = pd.to_datetime(fecha_celda)
            if fecha_venta.strftime('%Y-%m-%d') not in fechas_a_procesar:
                continue
                
            for col_idx, codigo in mapa_columnas_codigo.items():
                cantidad = row.iloc[col_idx]
                if pd.notna(cantidad) and cantidad > 0:
                    cant_int = int(float(cantidad))
                    if cant_int > 0:
                        mov_data = MovimientoStock(
                            id_movimiento=_generar_id_movimiento(),
                            fecha=fecha_venta,
                            codigo_producto=codigo,
                            id_lote=None,
                            tipo="VENTA",
                            cantidad=cant_int,
                            observacion=f"Venta Historica {fecha_venta.strftime('%Y-%m-%d')}"
                        )
                        movimientos.append(mov_data.model_dump(mode='json'))
                        total_ingestados += cant_int
        except Exception as e:
            pass
            
    save_json("movimientos_stock.json", movimientos)
    print(f"--- INGESTA COMPLETADA: {total_ingestados} unidades de venta histórica agregadas ---")

if __name__ == "__main__":
    ingestar_ventas_historicas()
