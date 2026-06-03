import sys
import os
import pandas as pd
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import load_json, save_json, descontar_stock_fefo
from core.execution_tracker import set_tracking_enabled

def actualizar_stock_fisico():
    set_tracking_enabled(True)
    base_dir = os.environ.get(
        "DULCE_HORA_ARCHIVOS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Archivos"))
    )
    archivo = os.environ.get(
        "DULCE_HORA_STOCK_FILE",
        os.path.join(base_dir, "Stock", "Planilla de stock.xlsx")
    )
    print(f"Leyendo planilla de stock: {archivo}")
    
    df = pd.read_excel(archivo)
    # Identificar la fila con la fecha mas reciente (columna 0)
    fechas = []
    for idx, val in df.iloc[:, 0].items():
        if isinstance(val, datetime):
            fechas.append((idx, val))
        elif isinstance(val, str):
            try:
                fechas.append((idx, pd.to_datetime(val)))
            except:
                pass
                
    if not fechas:
        print("No se encontraron fechas de stock.")
        return
        
    fechas.sort(key=lambda x: x[1], reverse=True)
    ultima_fila_idx, fecha_stock = fechas[0]
    
    print(f"-> Último conteo detectado: {fecha_stock.strftime('%Y-%m-%d')} (Fila {ultima_fila_idx+2})")
    
    # Extraer codigos
    # df.columns tiene los codigos si es la fila 0, pero aqui los codigos estarian en df.columns
    # segun mi analisis previo, df.columns era ['COD', '100', '101'...] 
    # pero quizas es df.iloc[0] (ARTICULO, MEDIALUNAS...).
    # Vamos a obtener los codigos de df.columns (ignorando 'COD', 'ARTICULO', etc)
    
    codigos_cols = {}
    for col_idx, col_name in enumerate(df.columns):
        cod_str = str(col_name)
        if cod_str.isdigit():
            codigos_cols[col_idx] = cod_str
            
    # Cantidades contadas
    row_cantidades = df.iloc[ultima_fila_idx]
    
    # Stock actual teorico
    lotes = load_json("stock_lotes.json")
    productos = load_json("productos.json")
    prod_dict = {p['codigo_producto']: p for p in productos}
    
    stock_teorico = {}
    for lote in lotes:
        if lote['estado'] == 'ACTIVO' and lote['cantidad_actual'] > 0:
            c = lote['codigo_producto']
            stock_teorico[c] = stock_teorico.get(c, 0) + lote['cantidad_actual']
            
    total_ajustes_pos = 0
    total_ajustes_neg = 0
    
    # Comparar y ajustar
    for col_idx, codigo in codigos_cols.items():
        try:
            val = row_cantidades.iloc[col_idx]
            if pd.isna(val):
                continue
            contado = int(float(val))
        except:
            continue
            
        teorico = stock_teorico.get(codigo, 0)
        diferencia = contado - teorico
        
        if diferencia == 0:
            continue
            
        if diferencia < 0:
            # Faltan en el local -> Descontar por FEFO
            desc_val = abs(diferencia)
            print(f"Ajuste Negativo: {codigo} -> Faltan {desc_val}")
            descontar_stock_fefo(codigo, desc_val, "AJUSTE_NEGATIVO", f"Ajuste x Conteo {fecha_stock.strftime('%Y-%m-%d')}")
            total_ajustes_neg += desc_val
        else:
            # Sobran en el local -> Crear un lote nuevo
            print(f"Ajuste Positivo: {codigo} -> Sobran {diferencia}")
            
            # Calcular vto (usaremos la fecha de stock como base de inicio, ya que no sabemos de que ingreso fue)
            prod = prod_dict.get(codigo)
            vencimiento_str = "2099-12-31"
            if prod and prod.get("vida_util_dias") and prod["vida_util_dias"] > 0:
                import datetime as dt
                fv = fecha_stock + dt.timedelta(days=prod["vida_util_dias"])
                vencimiento_str = fv.strftime('%Y-%m-%d')
                
            nuevo_lote = {
                "id_lote": f"{codigo}-{fecha_stock.strftime('%Y%m%d')}",
                "codigo_producto": codigo,
                "lote": fecha_stock.strftime('%Y%m%d'),
                "descripcion_producto": prod['descripcion'] if prod else "Desconocido",
                "categoria": prod['categoria'] if prod and 'categoria' in prod else "Sin Categoria",
                "cantidad_inicial": diferencia,
                "cantidad_actual": diferencia,
                "fecha_ingreso": fecha_stock.strftime('%Y-%m-%d'),
                "fecha_vencimiento": vencimiento_str,
                "estado": "ACTIVO",
                "origen": f"Ajuste Positivo Conteo {fecha_stock.strftime('%Y-%m-%d')}"
            }
            # Evitar mutar `lotes` que estaria en disco. Mejor recargar y guardar.
            current_lotes = load_json("stock_lotes.json")
            current_lotes.append(nuevo_lote)
            save_json("stock_lotes.json", current_lotes)
            
            # Registrar movimiento
            from core.product_logic import _generar_id_movimiento
            from core.product_config import MovimientoStock
            movimientos = load_json("movimientos_stock.json")
            mov_data = MovimientoStock(
                id_movimiento=_generar_id_movimiento(),
                fecha=datetime.now(),
                codigo_producto=codigo,
                id_lote=nuevo_lote["id_lote"],
                tipo="AJUSTE_POSITIVO",
                cantidad=diferencia,
                observacion=f"Ajuste Conteo {fecha_stock.strftime('%Y-%m-%d')}"
            )
            movimientos.append(mov_data.model_dump(mode='json'))
            save_json("movimientos_stock.json", movimientos)
            
            total_ajustes_pos += diferencia

    print(f"--- AJUSTE COMPLETADO ---")
    print(f"Total ajustes negativos (descuentos): {total_ajustes_neg}")
    print(f"Total ajustes positivos (creaciones): {total_ajustes_pos}")
    
if __name__ == "__main__":
    actualizar_stock_fisico()
