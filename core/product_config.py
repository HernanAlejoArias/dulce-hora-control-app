from datetime import datetime
from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field

# 🛑 REGLA DEL SISTEMA: ESTE ARCHIVO ES SOLO PARA ESTRUCTURAS DE DATOS.
# NO AGREGAR LÓGICA DE NEGOCIO AQUÍ.

class Producto(BaseModel):
    codigo_producto: str
    descripcion: str
    categoria: str
    presentacion: str
    precio_compra: Optional[float] = None
    precio_venta: Optional[float] = None
    vida_util_dias: Optional[int] = None
    activo: bool = True
    requiere_control_vencimiento: bool = True
    stock_objetivo: Optional[int] = None
    venta_promedio_diaria: Optional[float] = None
    margen_estimado: Optional[float] = None
    origen: str = "lista_sistema_pedidos"
    ultima_actualizacion: Optional[datetime] = None

LoteEstado = Literal["ACTIVO", "AGOTADO", "VENCIDO", "ARCHIVADO"]

class Lote(BaseModel):
    id_lote: str
    codigo_producto: str
    lote: str
    descripcion_producto: str
    categoria: str
    fecha_ingreso: datetime
    fecha_vencimiento: Optional[datetime] = None
    cantidad_inicial: float
    cantidad_actual: float
    estado: LoteEstado = "ACTIVO"
    origen: str
    archivo_origen: Optional[str] = None

MovimientoTipo = Literal[
    "RECEPCION", 
    "VENTA", 
    "DESPERDICIO", 
    "AJUSTE_POSITIVO", 
    "AJUSTE_NEGATIVO", 
    "CONTEO_STOCK", 
    "VENCIMIENTO", 
    "ARCHIVO"
]

class MovimientoStock(BaseModel):
    id_movimiento: str
    fecha: datetime
    codigo_producto: str
    id_lote: Optional[str] = None
    tipo: MovimientoTipo
    cantidad: float
    observacion: Optional[str] = None
    archivo_origen: Optional[str] = None
    usuario_origen: Optional[str] = None

class Configuracion(BaseModel):
    dias_entrega: List[str] = ["LUNES", "MIERCOLES", "VIERNES"]
    hora_entrega_estimada: str = "10:00"
    dias_alerta_vencimiento: List[int] = [0, 1, 2, 3]
    dias_archivado: int = 60
    metodo_salida_stock: str = "FEFO"
    timezone: str = "America/Argentina/Buenos_Aires"
