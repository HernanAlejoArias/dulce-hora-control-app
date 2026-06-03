from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Dict, Any
import os
from datetime import datetime, timedelta

# Importamos logica local
from core.product_logic import (
    load_json, 
    save_json
)
from core.execution_tracker import set_tracking_enabled

# Habilitar tracking en la API
set_tracking_enabled(True)

app = FastAPI(title="Dulce Hora - Stock API")

cors_origins = [
    origin.strip()
    for origin in os.environ.get("DULCE_HORA_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/_stcore/health")
def healthcheck():
    return {"status": "ok", "service": "dulce-hora-control"}

@app.get("/api/health")
def api_healthcheck():
    return healthcheck()

@app.get("/api/productos")
def get_productos():
    return load_json("productos.json")

@app.get("/api/stock")
def get_stock():
    return load_json("stock_lotes.json")

@app.get("/api/movimientos")
def get_movimientos():
    return load_json("movimientos_stock.json")

@app.get("/api/dashboard")
def get_dashboard_data():
    """
    Agrega datos para el dashboard visual:
    - stock_operativo
    - vencen_hoy, vencen_1d, vencen_2d, vencen_3d
    - valor en riesgo
    """
    productos = load_json("productos.json")
    lotes = load_json("stock_lotes.json")
    
    prod_dict = {p['codigo_producto']: p for p in productos}
    
    from datetime import datetime, timedelta
    ahora = datetime.now()
    hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    
    stats = {
        "unidades_vencidas": 0,
        "unidades_vencen_hoy": 0,
        "unidades_vencen_1d": 0,
        "unidades_vencen_2d": 0,
        "unidades_vencen_3d": 0,
        "valor_en_riesgo": 0.0,
        "productos_riesgo": []
    }
    
    for lote in lotes:
        if lote['estado'] != 'ACTIVO' or lote['cantidad_actual'] <= 0:
            continue
            
        if not lote['fecha_vencimiento']:
            continue
            
        try:
            fv_dt = datetime.fromisoformat(lote['fecha_vencimiento'])
            fv_date = fv_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            dias_restantes = (fv_date - hoy).days
            
            prod = prod_dict.get(lote['codigo_producto'], {})
            precio = prod.get('precio_compra', 0) or 0
            
            if dias_restantes < 0:
                stats["unidades_vencidas"] += lote['cantidad_actual']
                # Actualizar estado a VENCIDO (Debería hacerse en una tarea de cron, lo hacemos lazy here for MVP)
                # lote['estado'] = 'VENCIDO'
            elif dias_restantes == 0:
                stats["unidades_vencen_hoy"] += lote['cantidad_actual']
                stats["valor_en_riesgo"] += lote['cantidad_actual'] * precio
            elif dias_restantes == 1:
                stats["unidades_vencen_1d"] += lote['cantidad_actual']
                stats["valor_en_riesgo"] += lote['cantidad_actual'] * precio
            elif dias_restantes == 2:
                stats["unidades_vencen_2d"] += lote['cantidad_actual']
                stats["valor_en_riesgo"] += lote['cantidad_actual'] * precio
            elif dias_restantes == 3:
                stats["unidades_vencen_3d"] += lote['cantidad_actual']
                stats["valor_en_riesgo"] += lote['cantidad_actual'] * precio
                
            if dias_restantes <= 3:
                stats["productos_riesgo"].append({
                    "codigo": lote['codigo_producto'],
                    "descripcion": lote['descripcion_producto'],
                    "cantidad": lote['cantidad_actual'],
                    "dias_restantes": dias_restantes,
                    "id_lote": lote['id_lote']
                })
        except ValueError:
            pass
            
    return stats

@app.get("/api/config/mapeo_ventas")
def get_mapeo_ventas():
    return load_json("mapeo_ventas.json")

@app.post("/api/config/mapeo_ventas")
def update_mapeo_ventas(data: Dict[str, Any]):
    save_json("mapeo_ventas.json", data)
    return {"status": "ok"}

@app.post("/api/procesar_dia")
def procesar_dia():
    """Ejecuta el script de procesamiento diario de forma manual"""
    import subprocess
    script_path = os.path.join(os.path.dirname(__file__), "scripts", "procesar_diario.py")
    try:
        subprocess.run(["python", script_path], check=True)
        return {"status": "ok", "message": "Procesamiento batch ejecutado exitosamente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock_comparativo")
def get_stock_comparativo():
    """Devuelve el stock agrupado por producto para auditoría"""
    productos = load_json("productos.json")
    lotes = load_json("stock_lotes.json")
    
    prod_dict = {p['codigo_producto']: p for p in productos}
    
    # Agrupar stock operativo real
    stock_actual = {}
    for lote in lotes:
        if lote['estado'] == 'ACTIVO' and lote['cantidad_actual'] > 0:
            cod = lote['codigo_producto']
            stock_actual[cod] = stock_actual.get(cod, 0) + lote['cantidad_actual']
            
    # Formatear salida
    resultado = []
    for cod, prod in prod_dict.items():
        if prod.get('activo', True):
            teorico = stock_actual.get(cod, 0)
            resultado.append({
                "codigo": cod,
                "descripcion": prod['descripcion'],
                "categoria": prod['categoria'],
                "stock_teorico": teorico
            })
            
    # Ordenar por categoria y luego descripcion
    resultado.sort(key=lambda x: (x['categoria'], x['descripcion']))
    return resultado

@app.get("/api/generar_pedido")
def generar_pedido(dias_cobertura: int = 2, plus_porcentaje: float = 0.0):
    productos = load_json("productos.json")
    lotes = load_json("stock_lotes.json")
    movimientos = load_json("movimientos_stock.json")
    
    prod_dict = {p['codigo_producto']: p for p in productos}
    
    mapeo_ventas = load_json("mapeo_ventas.json")
    
    # Calcular promedio de ventas por día abierto
    # (Solo contamos los días en los que se registró al menos una venta mayor a 0)
    ventas_totales = {}
    dias_abierto = set()
    
    for mov in movimientos:
        if mov['tipo'] == "VENTA" and mov['cantidad'] > 0:
            c = mov['codigo_producto']
            fecha_str = mov['fecha'].split('T')[0]
            dias_abierto.add(fecha_str)
            
            # Aplicar mapeo dinamico si existe
            if c in mapeo_ventas:
                distribucion = mapeo_ventas[c].get("distribucion", {})
                for dest_c, ratio in distribucion.items():
                    ventas_totales[dest_c] = ventas_totales.get(dest_c, 0) + (mov['cantidad'] * ratio)
            else:
                ventas_totales[c] = ventas_totales.get(c, 0) + mov['cantidad']
            
    cant_dias = len(dias_abierto) if dias_abierto else 1
    promedio_diario = {c: v / cant_dias for c, v in ventas_totales.items()}
    
    # Calcular stock actual util (descartando lo que se vence en dias_cobertura)
    hoy = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    stock_util = {}
    stock_vencido = {}
    
    for lote in lotes:
        if lote['estado'] == 'ACTIVO' and lote['cantidad_actual'] > 0:
            c = lote['codigo_producto']
            fv_str = lote.get('fecha_vencimiento')
            es_util = True
            if fv_str and fv_str != "2099-12-31":
                try:
                    # Usamos fromisoformat para aguantar formatos con y sin 'T'
                    fv = datetime.fromisoformat(fv_str)
                    fv = fv.replace(hour=0, minute=0, second=0, microsecond=0)
                    if (fv - hoy).days <= dias_cobertura:
                        es_util = False # Se vence antes de poder venderlo en el periodo de cobertura
                except ValueError:
                    pass
            if es_util:
                stock_util[c] = stock_util.get(c, 0) + lote['cantidad_actual']
            else:
                stock_vencido[c] = stock_vencido.get(c, 0) + lote['cantidad_actual']
                
    # Generar sugerencias
    resultado = []
    import math
    import re
    
    for cod, prod in prod_dict.items():
        if not prod.get('activo', True):
            continue
            
        prom_dia = promedio_diario.get(cod, 0)
        demanda_estimada = (prom_dia * dias_cobertura) * (1 + (plus_porcentaje / 100.0))
        s_util = stock_util.get(cod, 0)
        s_vencido = stock_vencido.get(cod, 0)
        
        # Calcular presentacion (unidades por bulto)
        presentacion_str = prod.get('presentacion', '1 un.')
        match = re.search(r'(\d+)', presentacion_str)
        unidades_por_bulto = int(match.group(1)) if match else 1
        
        # Chequear si es un producto problemático (latas vs gramos)
        es_gramos = "gr" in presentacion_str.lower()
        
        # El stock (s_util) está SIEMPRE guardado en bultos (latas, cajas, etc.)
        # La demanda estimada (ventas) está SIEMPRE en unidades (o gramos).
        stock_util_unidades = s_util * unidades_por_bulto
        stock_vencido_unidades = s_vencido * unidades_por_bulto
        
        pedido_bruto = demanda_estimada - stock_util_unidades
        
        # Redondeo por bulto
        bultos_sugeridos = 0
        pedido_redondeado = 0
        if pedido_bruto > 0:
            bultos_sugeridos = math.ceil(pedido_bruto / unidades_por_bulto)
            pedido_redondeado = bultos_sugeridos * unidades_por_bulto
        else:
            pedido_bruto = 0
            bultos_sugeridos = 0
        
        resultado.append({
            "codigo": cod,
            "descripcion": prod['descripcion'],
            "categoria": prod.get('categoria', ''),
            "promedio_diario": round(prom_dia, 1),
            "stock_util": stock_util_unidades,
            "stock_vencido": stock_vencido_unidades,
            "pedido_bruto": round(pedido_bruto, 1) if pedido_bruto > 0 else 0,
            "unidades_por_bulto": unidades_por_bulto,
            "bultos_sugeridos": bultos_sugeridos,
            "pedido_redondeado": pedido_redondeado,
            "requiere_revision": es_gramos,
            "unidad_base": "grs." if es_gramos else "un.",
            "unidad_bulto": "bultos"
        })
            
    # Obtener el orden de la planilla de stock para mostrar los productos
    orden_planilla = []
    try:
        import pandas as pd
        archivos_dir = os.environ.get("DULCE_HORA_ARCHIVOS_DIR", os.path.join(os.path.dirname(__file__), "Archivos"))
        archivo_stock = os.environ.get(
            "DULCE_HORA_STOCK_FILE",
            os.path.join(archivos_dir, "Stock", "Planilla de stock.xlsx")
        )
        if os.path.exists(archivo_stock):
            df = pd.read_excel(archivo_stock)
            orden_planilla = [str(c) for c in df.columns if str(c).isdigit()]
    except Exception as e:
        print(f"Error leyendo orden de planilla de stock: {e}")
        
    if orden_planilla:
        # Ya no reemplazamos 101 por 1011
        order_map = {cod: idx for idx, cod in enumerate(orden_planilla)}
        resultado.sort(key=lambda x: order_map.get(x['codigo'], 999999))
    else:
        resultado.sort(key=lambda x: (x['categoria'], x['descripcion']))
        
    return resultado

frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        candidate = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    import uvicorn
    # uvicorn.run(app, host="0.0.0.0", port=8000)
    print("API configurada. Ejecutar con: uvicorn app:app --reload")
