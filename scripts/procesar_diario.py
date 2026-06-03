import sys
import os
import re
import pandas as pd
from datetime import datetime
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.product_logic import (
    load_json,
    save_json,
    ingresar_entrega,
    descontar_stock_fefo
)
from core.product_config import Producto
from core.execution_tracker import set_tracking_enabled, track_execution

@track_execution
def procesar_entrega(archivo_entrega: str):
    """Procesa una planilla de entrega diaria."""
    print(f"Procesando entrega: {archivo_entrega}")
    # En Planilla de pedido Banfield - 27_5_2026.xlsx
    # row 0 tiene 'Fecha de Entrega', row 2 empieza datos
    # Columnas: 0=COD, 1=ARTICULO, ... 4=Cantidad Enviada
    df = pd.read_excel(archivo_entrega)
    
    # Buscar fecha de entrega
    fecha_str = df.columns[-1] if 'Fecha de Entrega' in str(df.columns[-1]) else None
    fecha_entrega = datetime.now()
    if '27_5_2026' in archivo_entrega:
        fecha_entrega = datetime(2026, 5, 27)
    elif '29_5_2026' in archivo_entrega:
        fecha_entrega = datetime(2026, 5, 29)
        
    entrega_items = []
    
    for idx, row in df.iterrows():
        if idx < 2: continue # saltar encabezados sucios
        
        cod = str(row.iloc[0]).strip()
        if not cod or cod == 'nan' or not cod.isdigit() or cod in ["1011", "999"]:
            continue
            
        # Cantidad enviada suele estar en Unnamed: 4 (indice 4) o la primera columna con numeros a la derecha
        # Extraer usando iloc
        try:
            cantidad = float(row.iloc[4])
            if pd.isna(cantidad):
                cantidad = 0
            if cantidad > 0:
                entrega_items.append({
                    "codigo": str(int(cod)),
                    "cantidad": int(cantidad)
                })
        except:
            pass
            
    if entrega_items:
        ingresar_entrega(entrega_items, fecha_entrega, os.path.basename(archivo_entrega))
        print(f"  -> Ingresados {sum(i['cantidad'] for i in entrega_items)} unidades de {len(entrega_items)} productos.")
    else:
        print("  -> No se encontraron items validos en la entrega.")

@track_execution
def procesar_ventas(archivo_ventas: str, fechas_a_procesar: list):
    """Procesa la pestaña Estadisticas de Productos"""
    print(f"Procesando ventas desde: {archivo_ventas}")
    df = pd.read_excel(archivo_ventas, sheet_name='Estadisticas de Productos', header=None)
    
    # Row 3 tiene los codigos
    row_codigos = df.iloc[3].to_dict()
    # Filtrar solo los que tienen codigo numerico
    mapa_columnas_codigo = {}
    for col_idx, cod in row_codigos.items():
        try:
            if not pd.isna(cod):
                mapa_columnas_codigo[col_idx] = str(int(float(cod)))
        except:
            pass
            
    # Iterar desde fila 8
    total_descontado = 0
    for idx, row in df.iterrows():
        if idx < 8: continue
        
        fecha_celda = row.iloc[0]
        if pd.isna(fecha_celda):
            continue
            
        try:
            if isinstance(fecha_celda, datetime):
                fecha_venta = fecha_celda
            else:
                fecha_venta = pd.to_datetime(fecha_celda)
                
            if fecha_venta.strftime('%Y-%m-%d') not in fechas_a_procesar:
                continue
                
            # Procesar esta fecha
            for col_idx, codigo in mapa_columnas_codigo.items():
                cantidad = row.iloc[col_idx]
                if not pd.isna(cantidad) and cantidad > 0:
                    try:
                        cant_int = int(float(cantidad))
                        # Si es pan (gr), quizas hay que pasarlo a Kilos o unidades. 
                        # Asumiremos la unidad que dicta la columna.
                        if cant_int > 0:
                            descontar_stock_fefo(codigo, cant_int, "VENTA", f"Venta del {fecha_venta.strftime('%Y-%m-%d')}")
                            total_descontado += cant_int
                    except:
                        pass
        except Exception as e:
            pass
            
    print(f"  -> Total descontado por ventas: {total_descontado} unidades.")

def _encontrar_codigo_por_texto(texto: str, prod_dict: dict) -> str:
    texto = texto.lower()
    for codigo, prod in prod_dict.items():
        desc = prod['descripcion'].lower()
        # Reglas simples:
        if texto in desc or desc in texto:
            return codigo
        # Regla para panes o palabras clave
        palabras = texto.split()
        if len(palabras) > 1 and palabras[0] in desc and palabras[1] in desc:
            return codigo
            
    # Mapeo manual de fallback basado en el archivo de texto
    mapeo_manual = {
        "medialunas": "100",
        "surtidas": "102",
        "pan frances": "200",
        "pizza muzzarella": "500",
        "pote chocotorta": "301",
        "bizcocho grasa": "206"
    }
    for k, v in mapeo_manual.items():
        if k in texto:
            return v
            
    return None

@track_execution
def procesar_desperdicios(directorio_desperdicio: str):
    print("Procesando desperdicios...")
    productos_raw = load_json("productos.json")
    prod_dict = {p['codigo_producto']: p for p in productos_raw}
    
    archivos = [f for f in os.listdir(directorio_desperdicio) if f.endswith('.txt')]
    total_descontado = 0
    
    for arch in archivos:
        path = os.path.join(directorio_desperdicio, arch)
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            lineas = f.readlines()
            
        fecha_str = arch.replace('.txt', '')
        
        for linea in lineas:
            linea = linea.strip()
            if not linea or linea.startswith('ID') or 'Eliminar desperdicio' in linea or linea.startswith('$'):
                continue
                
            # Linea tipo: medialunas 18 $ 4.593,00
            # Extraer cantidad (el numero antes del $)
            match = re.search(r'(.+?)\s+(\d+)\s+\$', linea)
            if match:
                articulo_str = match.group(1).strip()
                cantidad = int(match.group(2))
                
                codigo = _encontrar_codigo_por_texto(articulo_str, prod_dict)
                if codigo:
                    descontar_stock_fefo(codigo, cantidad, "DESPERDICIO", f"Desperdicio txt {fecha_str}")
                    total_descontado += cantidad
                else:
                    print(f"    ADVERTENCIA: No se pudo mapear el desperdicio: '{articulo_str}'")
                    
    print(f"  -> Total descontado por desperdicio: {total_descontado} unidades.")

def run_batch():
    set_tracking_enabled(True)
    base_dir = os.environ.get(
        "DULCE_HORA_ARCHIVOS_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Archivos"))
    )
    
    # 1. Ingresar Entregas
    procesar_entrega(os.path.join(base_dir, "Entregas", "Planilla de pedido Banfield - 27_5_2026.xlsx"))
    
    # 2. Descontar Ventas
    fechas_ventas = ['2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29']
    archivo_ventas = os.environ.get(
        "DULCE_HORA_VENTAS_FILE",
        os.path.join(base_dir, "Ventas", "Estadisticas de Banfield - 2026-06-01.xlsx")
    )
    procesar_ventas(archivo_ventas, fechas_ventas)
    
    # 3. Descontar Desperdicios
    procesar_desperdicios(os.path.join(base_dir, "Desperdicio"))
    
    print("--- PROCESAMIENTO DIARIO FINALIZADO ---")

if __name__ == "__main__":
    run_batch()
