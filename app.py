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
from core.stock_workflow import (
    get_conteo_planilla,
    get_stock_workflow_status,
    load_ubicaciones,
    procesar_conteo_stock,
    procesar_entradas,
    procesar_ventas_desperdicio,
)

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

def _get_orden_planilla_stock() -> List[str]:
    """Devuelve el orden de codigos definido por la planilla de stock."""
    try:
        import pandas as pd
        archivo_stock = _get_stock_file()
        if os.path.exists(archivo_stock):
            df = pd.read_excel(archivo_stock)
            return [str(c) for c in df.columns if str(c).isdigit()]
    except Exception as e:
        print(f"Error leyendo orden de planilla de stock: {e}")
    return []

def _ordenar_por_planilla(items: List[Dict[str, Any]]) -> None:
    orden_planilla = _get_orden_planilla_stock()
    if orden_planilla:
        order_map = {cod: idx for idx, cod in enumerate(orden_planilla)}
        items.sort(key=lambda x: (order_map.get(str(x.get('codigo', '')), 999999), x.get('descripcion', '')))
    else:
        items.sort(key=lambda x: (x.get('categoria', ''), x.get('descripcion', '')))

def _get_archivos_dir() -> str:
    return os.environ.get("DULCE_HORA_ARCHIVOS_DIR", os.path.join(os.path.dirname(__file__), "Archivos"))

def _get_stock_file() -> str:
    return os.environ.get(
        "DULCE_HORA_STOCK_FILE",
        os.path.join(_get_archivos_dir(), "Stock", "Planilla de stock.xlsx")
    )

def _safe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def _load_precios_planilla() -> Dict[str, Dict[str, Any]]:
    precios = {}
    archivo_precios = os.environ.get(
        "DULCE_HORA_LISTA_PRECIOS_FILE",
        os.path.join(_get_archivos_dir(), "DH - Listas de precios.xlsx")
    )
    if not os.path.exists(archivo_precios):
        return precios

    try:
        import pandas as pd
        xl = pd.ExcelFile(archivo_precios)
        for sheet in xl.sheet_names:
            df = pd.read_excel(archivo_precios, sheet_name=sheet)
            if "Codigo" not in df.columns:
                continue

            for _, row in df.iterrows():
                codigo = str(row.get("Codigo", "")).strip()
                if not codigo or codigo == "nan":
                    continue
                if codigo.endswith(".0"):
                    codigo = codigo[:-2]

                precio_compra = _safe_float(row.get("Precio Unitario", row.get("Precio")))
                precio_venta = _safe_float(row.get("Precio Venta"))
                precios[codigo] = {
                    "precio_compra": precio_compra,
                    "precio_venta": precio_venta,
                    "fuente": os.path.basename(archivo_precios),
                    "sheet": sheet
                }
    except Exception as e:
        print(f"Error leyendo lista de precios: {e}")
    return precios

def _calcular_promedio_ventas(movimientos: List[Dict[str, Any]]) -> Dict[str, float]:
    mapeo_ventas = load_json("mapeo_ventas.json")
    ventas_totales = {}
    dias_abierto = set()

    for mov in movimientos:
        if mov.get("tipo") != "VENTA":
            continue

        cantidad = _safe_float(mov.get("cantidad")) or 0
        if cantidad == 0:
            continue

        codigo = str(mov.get("codigo_producto", "")).strip()
        fecha = str(mov.get("fecha", "")).split("T")[0]
        if fecha:
            dias_abierto.add(fecha)

        cantidad_abs = abs(cantidad)
        if codigo in mapeo_ventas:
            distribucion = mapeo_ventas[codigo].get("distribucion", {})
            for dest_codigo, ratio in distribucion.items():
                ventas_totales[dest_codigo] = ventas_totales.get(dest_codigo, 0) + (cantidad_abs * ratio)
        else:
            ventas_totales[codigo] = ventas_totales.get(codigo, 0) + cantidad_abs

    cant_dias = len(dias_abierto) if dias_abierto else 1
    return {codigo: total / cant_dias for codigo, total in ventas_totales.items()}

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
                    "categoria": prod.get('categoria', lote.get('categoria', '')),
                    "cantidad": lote['cantidad_actual'],
                    "dias_restantes": dias_restantes,
                    "id_lote": lote['id_lote']
                })
        except ValueError:
            pass

    _ordenar_por_planilla(stats["productos_riesgo"])
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
    """Compatibilidad: ejecuta entradas y ventas/desperdicio con flags anti-reproceso."""
    try:
        entradas = procesar_entradas()
        salidas = procesar_ventas_desperdicio()
        return {"status": "ok", "entradas": entradas, "ventas_desperdicio": salidas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock_control/status")
def stock_control_status():
    return get_stock_workflow_status()

@app.get("/api/stock_control/conteo")
def stock_control_conteo():
    return get_conteo_planilla()

@app.post("/api/stock_control/procesar_conteo")
def stock_control_procesar_conteo():
    result = procesar_conteo_stock()
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@app.post("/api/stock_control/procesar_entradas")
def stock_control_procesar_entradas(payload: Dict[str, Any] | None = None):
    archivos = payload.get("archivos") if payload else None
    return procesar_entradas(archivos)

@app.post("/api/stock_control/procesar_ventas_desperdicio")
def stock_control_procesar_ventas_desperdicio():
    return procesar_ventas_desperdicio()

@app.get("/api/stock_comparativo")
def get_stock_comparativo():
    """Devuelve el stock agrupado por producto para auditoría"""
    productos = load_json("productos.json")
    lotes = load_json("stock_lotes.json")
    ubicaciones = load_ubicaciones()
    
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
                "ubicacion": ubicaciones.get(cod, {}).get("ubicacion", "Sin ubicacion"),
                "stock_teorico": teorico
            })
            
    # Ordenar por categoria y luego descripcion
    resultado.sort(key=lambda x: (x['categoria'], x['descripcion']))
    return resultado

@app.get("/api/insights/equilibrio")
def get_equilibrio_insights(costo_fijo_mensual: float = 0.0, dias_periodo: int = 30):
    productos = load_json("productos.json")
    movimientos = load_json("movimientos_stock.json")
    precios_planilla = _load_precios_planilla()
    promedio_diario = _calcular_promedio_ventas(movimientos)

    dias_periodo = max(1, min(dias_periodo, 365))
    costo_fijo_mensual = max(0.0, costo_fijo_mensual)

    resultado = []
    resumen = {
        "costo_fijo_mensual": costo_fijo_mensual,
        "dias_periodo": dias_periodo,
        "productos_con_precio_venta": 0,
        "productos_con_costo": 0,
        "productos_con_margen": 0,
        "productos_sin_precio": 0,
        "productos_margen_negativo": 0,
        "ingreso_estimado": 0.0,
        "cogs_estimado": 0.0,
        "contribucion_estimada": 0.0,
        "margen_bruto_pct": None,
        "punto_equilibrio_ingresos": None,
        "cobertura_costo_fijo_pct": None
    }

    for prod in productos:
        if not prod.get("activo", True):
            continue

        codigo = str(prod.get("codigo_producto", "")).strip()
        precios = precios_planilla.get(codigo, {})
        costo_planilla = _safe_float(precios.get("precio_compra"))
        venta_planilla = _safe_float(precios.get("precio_venta"))
        costo_catalogo = _safe_float(prod.get("precio_compra"))
        venta_catalogo = _safe_float(prod.get("precio_venta"))
        costo = costo_planilla if costo_planilla is not None else costo_catalogo
        precio_venta = venta_planilla if venta_planilla is not None else venta_catalogo
        fuente_precios = precios.get("fuente") if (costo_planilla is not None or venta_planilla is not None) else "productos.json"

        prom_dia = promedio_diario.get(codigo, 0.0)
        ventas_periodo = prom_dia * dias_periodo
        margen_unitario = None
        margen_pct = None
        ingreso_estimado = None
        cogs_estimado = None
        contribucion_estimada = None
        unidades_equilibrio = None
        cobertura_equilibrio_pct = None
        estado = "sin_precio"

        if costo is not None:
            resumen["productos_con_costo"] += 1
        if precio_venta is not None:
            resumen["productos_con_precio_venta"] += 1

        if costo is not None and precio_venta is not None and precio_venta > 0:
            margen_unitario = precio_venta - costo
            margen_pct = (margen_unitario / precio_venta) * 100
            ingreso_estimado = ventas_periodo * precio_venta
            cogs_estimado = ventas_periodo * costo
            contribucion_estimada = ventas_periodo * margen_unitario
            resumen["ingreso_estimado"] += ingreso_estimado
            resumen["cogs_estimado"] += cogs_estimado
            resumen["contribucion_estimada"] += contribucion_estimada

            if margen_unitario > 0:
                resumen["productos_con_margen"] += 1
                unidades_equilibrio = costo_fijo_mensual / margen_unitario if costo_fijo_mensual else None
                cobertura_equilibrio_pct = (ventas_periodo / unidades_equilibrio) * 100 if unidades_equilibrio else None
                estado = "rentable" if prom_dia > 0 else "sin_ventas"
            else:
                resumen["productos_margen_negativo"] += 1
                estado = "margen_negativo"
        else:
            resumen["productos_sin_precio"] += 1

        resultado.append({
            "codigo": codigo,
            "descripcion": prod.get("descripcion", ""),
            "categoria": prod.get("categoria", ""),
            "precio_compra": round(costo, 2) if costo is not None else None,
            "precio_venta": round(precio_venta, 2) if precio_venta is not None else None,
            "margen_unitario": round(margen_unitario, 2) if margen_unitario is not None else None,
            "margen_pct": round(margen_pct, 1) if margen_pct is not None else None,
            "promedio_diario": round(prom_dia, 2),
            "ventas_periodo": round(ventas_periodo, 1),
            "ingreso_estimado": round(ingreso_estimado, 2) if ingreso_estimado is not None else None,
            "cogs_estimado": round(cogs_estimado, 2) if cogs_estimado is not None else None,
            "contribucion_estimada": round(contribucion_estimada, 2) if contribucion_estimada is not None else None,
            "unidades_equilibrio": round(unidades_equilibrio, 1) if unidades_equilibrio is not None else None,
            "cobertura_equilibrio_pct": round(cobertura_equilibrio_pct, 1) if cobertura_equilibrio_pct is not None else None,
            "fuente_precios": fuente_precios if (costo is not None or precio_venta is not None) else None,
            "estado": estado
        })

    if resumen["ingreso_estimado"] > 0:
        margen_bruto_pct = (resumen["contribucion_estimada"] / resumen["ingreso_estimado"]) * 100
        resumen["margen_bruto_pct"] = round(margen_bruto_pct, 1)
        if margen_bruto_pct > 0 and costo_fijo_mensual:
            resumen["punto_equilibrio_ingresos"] = round(costo_fijo_mensual / (margen_bruto_pct / 100), 2)
            resumen["cobertura_costo_fijo_pct"] = round((resumen["contribucion_estimada"] / costo_fijo_mensual) * 100, 1)

    for key in ["ingreso_estimado", "cogs_estimado", "contribucion_estimada"]:
        resumen[key] = round(resumen[key], 2)

    resultado.sort(key=lambda x: (
        x["contribucion_estimada"] is None,
        -(x["contribucion_estimada"] or 0),
        x["descripcion"]
    ))

    return {
        "resumen": resumen,
        "productos": resultado
    }

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
            
    _ordenar_por_planilla(resultado)
        
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
