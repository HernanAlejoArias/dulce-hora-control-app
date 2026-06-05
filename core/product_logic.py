import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from .product_config import Producto, Lote, MovimientoStock
from .execution_tracker import track_execution

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.environ.get("DULCE_HORA_DATA_DIR", os.path.join(PROJECT_ROOT, "data"))

def get_data_path(filename: str) -> str:
    return os.path.join(DATA_DIR, filename)

def load_json(filename: str, default_val: Any = list) -> Any:
    path = get_data_path(filename)
    if not os.path.exists(path):
        return default_val()
    with open(path, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return default_val()

def save_json(filename: str, data: Any):
    path = get_data_path(filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

@track_execution
def importar_productos_base(productos_raw: List[Dict[str, Any]]) -> List[Producto]:
    """
    Importa la lista base de productos, los normaliza a modelos Producto
    y guarda en productos.json.
    """
    productos_existentes_dict = {
        p['codigo_producto']: Producto(**p) 
        for p in load_json("productos.json")
    }
    
    nuevos_productos = []
    
    for raw in productos_raw:
        codigo = str(raw.get('COD', '')).strip()
        if not codigo:
            continue
            
        producto_data = {
            "codigo_producto": codigo,
            "descripcion": raw.get('ARTICULO', raw.get('descripcion', '')),
            "categoria": raw.get('categoria', 'Sin Categoría'),
            "presentacion": raw.get('presentacion', '1 un.'),
            "precio_compra": float(raw.get('precio_compra', 0)) if raw.get('precio_compra') else None,
            "origen": "lista_sistema_pedidos",
            "ultima_actualizacion": datetime.now()
        }
        
        # Si ya existe, actualizamos solo campos base para no pisar vida_util_dias si ya se había cargado
        if codigo in productos_existentes_dict:
            prod_existente = productos_existentes_dict[codigo]
            # Actualizar campos descriptivos
            prod_existente.descripcion = producto_data['descripcion']
            prod_existente.categoria = producto_data['categoria']
            prod_existente.presentacion = producto_data['presentacion']
            if producto_data['precio_compra']:
                prod_existente.precio_compra = producto_data['precio_compra']
            prod_existente.ultima_actualizacion = producto_data['ultima_actualizacion']
        else:
            productos_existentes_dict[codigo] = Producto(**producto_data)
            
    lista_final = list(productos_existentes_dict.values())
    # Serializamos para guardar (usando model_dump de pydantic V2)
    save_json("productos.json", [p.model_dump(mode='json') for p in lista_final])
    
    return lista_final

@track_execution
def mapear_vencimientos(vencimientos_raw: List[Dict[str, Any]]) -> None:
    """
    Recibe la planilla de vencimientos y mapea la vida útil a productos.json.
    """
    productos = load_json("productos.json")
    prod_dict = {p['codigo_producto']: p for p in productos}
    
    pendientes = []
    
    for row in vencimientos_raw:
        codigo = str(row.get('COD', '')).strip()
        vida_util = row.get('vida_util_dias')
        
        if codigo in prod_dict:
            if vida_util is not None:
                prod_dict[codigo]['vida_util_dias'] = int(vida_util)
                prod_dict[codigo]['requiere_control_vencimiento'] = True
        else:
            pendientes.append(row)
            
    # Guardar productos actualizados
    save_json("productos.json", list(prod_dict.values()))
    
    if pendientes:
        save_json("productos_pendientes_vencimiento.json", pendientes)

def _generar_id_movimiento() -> str:
    # MOV-YYYYMMDD-HHMMSS-XXXX
    return f"MOV-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{os.urandom(2).hex().upper()}"

@track_execution
def descontar_stock_fefo(codigo_producto: str, cantidad: float, tipo: str, observacion: str = "", archivo_origen: str | None = None) -> None:
    """
    Descuenta stock usando FEFO (First Expired, First Out).
    Actualiza lotes y registra movimientos.
    """
    lotes_raw = load_json("stock_lotes.json")
    lotes = [Lote(**l) for l in lotes_raw]
    
    # Filtrar lotes activos del producto, con cantidad > 0, ordenados por fecha de vencimiento (los que vencen antes primero)
    lotes_activos = [l for l in lotes if l.codigo_producto == codigo_producto and l.estado == "ACTIVO" and l.cantidad_actual > 0]
    
    # Los que no tienen vencimiento (None) van al final.
    lotes_activos.sort(key=lambda x: x.fecha_vencimiento if x.fecha_vencimiento else datetime.max)
    
    movimientos_raw = load_json("movimientos_stock.json")
    
    cantidad_restante = float(cantidad)
    
    for lote in lotes_activos:
        if cantidad_restante <= 0:
            break
            
        descuento = min(lote.cantidad_actual, cantidad_restante)
        lote.cantidad_actual -= descuento
        cantidad_restante -= descuento
        
        if lote.cantidad_actual == 0:
            lote.estado = "AGOTADO"
            
        mov_data = MovimientoStock(
            id_movimiento=_generar_id_movimiento(),
            fecha=datetime.now(),
            codigo_producto=codigo_producto,
            id_lote=lote.id_lote,
            tipo=tipo,
            cantidad=-descuento,
            observacion=observacion,
            archivo_origen=archivo_origen
        )
        movimientos_raw.append(mov_data.model_dump(mode='json'))
        
    if cantidad_restante > 0:
        # TODO: Manejar stock negativo o registrar un error.
        print(f"ADVERTENCIA: Stock insuficiente para descontar {cantidad}. Faltaron {cantidad_restante}.")
        
    save_json("stock_lotes.json", [l.model_dump(mode='json') for l in lotes])
    save_json("movimientos_stock.json", movimientos_raw)

@track_execution
def ingresar_entrega(entrega_items: List[Dict[str, Any]], fecha_entrega: datetime, archivo_origen: str) -> None:
    """
    Crea lotes a partir de una entrega y registra movimientos de RECEPCION.
    entrega_items = [{"codigo": "308", "cantidad": 10}, ...]
    """
    productos_raw = load_json("productos.json")
    prod_dict = {p['codigo_producto']: Producto(**p) for p in productos_raw}
    
    lotes_raw = load_json("stock_lotes.json")
    lotes = [Lote(**l) for l in lotes_raw]
    
    movimientos_raw = load_json("movimientos_stock.json")
    
    fecha_str = fecha_entrega.strftime('%Y%m%d')
    
    for item in entrega_items:
        codigo = str(item.get("codigo", "")).strip()
        cantidad = float(item.get("cantidad", 0))
        
        if not codigo or cantidad <= 0:
            continue
            
        if codigo not in prod_dict:
            print(f"ADVERTENCIA: Producto {codigo} no existe en catálogo. Ignorando ingreso.")
            continue
            
        producto = prod_dict[codigo]
        
        # Calcular vencimiento
        fecha_venc = None
        if producto.vida_util_dias:
            # Simple timedelta
            from datetime import timedelta
            fecha_venc = fecha_entrega + timedelta(days=producto.vida_util_dias)
            
        id_lote = f"{codigo}-{fecha_str}"
        # Manejo básico si ya existe un lote con ese ID el mismo día
        lote_existente = next((l for l in lotes if l.id_lote == id_lote), None)
        
        if lote_existente:
            lote_existente.cantidad_inicial += cantidad
            lote_existente.cantidad_actual += cantidad
            if lote_existente.estado == "AGOTADO":
                lote_existente.estado = "ACTIVO"
        else:
            nuevo_lote = Lote(
                id_lote=id_lote,
                codigo_producto=codigo,
                lote=fecha_str,
                descripcion_producto=producto.descripcion,
                categoria=producto.categoria,
                fecha_ingreso=fecha_entrega,
                fecha_vencimiento=fecha_venc,
                cantidad_inicial=cantidad,
                cantidad_actual=cantidad,
                estado="ACTIVO",
                origen="ENTREGA",
                archivo_origen=archivo_origen
            )
            lotes.append(nuevo_lote)
            
        mov_data = MovimientoStock(
            id_movimiento=_generar_id_movimiento(),
            fecha=datetime.now(),
            codigo_producto=codigo,
            id_lote=id_lote,
            tipo="RECEPCION",
            cantidad=cantidad,
            observacion="Ingreso por entrega",
            archivo_origen=archivo_origen
        )
        movimientos_raw.append(mov_data.model_dump(mode='json'))
        
    save_json("stock_lotes.json", [l.model_dump(mode='json') for l in lotes])
    save_json("movimientos_stock.json", movimientos_raw)
