# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Negocio: Dulce Hora (café/panadería, Banfield, GBA Sur)

App de gestión de stock con vencimientos (FEFO), pedidos y procesamiento diario. Cubre:
- **Stock FEFO**: control por lotes con fecha de vencimiento (First Expired, First Out)
- **Entregas**: ingesta de planillas de entrega del proveedor (formato: `Planilla de pedido Banfield - DD_MM_YYYY.xlsx`)
- **Ventas**: descuento automático de stock desde reportes (formato: `Estadisticas de Banfield - YYYY-MM-DD.xlsx`)
- **Desperdicio**: registro y descuento de mermas
- **Pedidos**: generación de pedidos base ajustados por stock actual
- **Economía / Insights**: análisis de equilibrio y rentabilidad por producto
- **Procesamiento diario**: pipeline con estado persistente que evita re-procesar archivos ya aplicados

Los datos de entrada van en `Archivos/` (montado como volumen en Docker, read-only).

## Entry points

### Levantar la app
```bash
# Solo app (sin túnel público)
docker compose up -d --build dulce-hora-app

# Con túnel Cloudflare (requiere .cloudflare/config.yml)
docker compose --profile tunnel up -d --build

# Reusar imagen sin rebuild
docker compose up -d dulce-hora-app
```
App en http://localhost:8000

### CLI — scripts de operación
```bash
# Carga inicial de stock desde planilla
python scripts/carga_inicial.py

# Procesamiento diario (entregas + ventas + descuento stock)
python scripts/procesar_diario.py

# Actualizar stock físico desde planilla de conteo
python scripts/actualizar_stock_fisico.py

# Ingestar ventas sin descontar del stock (solo registro)
python scripts/ingestar_ventas_sin_descontar.py

# Extraer maestro de productos desde historial de pedidos
python scripts/extraer_maestro_desde_pedidos.py

# Verificar lógica FEFO
python scripts/verify_fefo_logic.py

# Verificar generación de pedidos
python scripts/verify_generar_pedido.py
```

### API REST
```
GET  /api/health                              # Health check
GET  /api/productos                           # Catálogo de productos
GET  /api/stock                               # Stock actual con lotes FEFO
GET  /api/movimientos                         # Historial de movimientos
GET  /api/dashboard                           # Resumen dashboard
GET  /api/stock_comparativo                   # Stock comparativo planilla vs sistema

# Stock control (workflow con estado persistente)
GET  /api/stock_control/status                # Estado del proceso diario
GET  /api/stock_control/conteo                # Último conteo de stock
POST /api/stock_control/guardar_conteo        # Guardar conteo manual
POST /api/stock_control/procesar_conteo       # Aplicar conteo al stock
POST /api/stock_control/restaurar_ultimo_stock # Restaurar al último conteo válido
POST /api/stock_control/procesar_entradas     # Procesar planillas de entrega
POST /api/stock_control/procesar_ventas_desperdicio  # Procesar ventas + desperdicios

# Análisis económico
GET  /api/insights/equilibrio                 # Punto de equilibrio y rentabilidad

# Otros
GET  /api/generar_pedido                      # Pedido sugerido
GET  /api/config/mapeo_ventas                 # Mapeo de productos de ventas
POST /api/config/mapeo_ventas                 # Actualizar mapeo
POST /api/procesar_dia                        # Trigger procesamiento día (legacy)
```

## Estructura de archivos

```
dulce-hora/
├── app.py              # Entry point FastAPI — define todas las rutas API, sirve frontend
├── Dockerfile          # Build: instala deps Python, copia frontend buildeado
├── docker-compose.yml  # Servicio dulce-hora-app + perfil tunnel (cloudflared)
├── core/
│   ├── product_config.py       # ⚠️ SOLO DATOS: clase Producto, catálogo de productos
│   ├── product_logic.py        # Lógica FEFO: ingresar_entrega(), descontar_stock_fefo(), load/save_json()
│   ├── stock_workflow.py       # ★ Workflow de stock con estado persistente — orquesta el proceso diario
│   └── execution_tracker.py   # Decorador @track_execution
├── scripts/
│   ├── procesar_diario.py              # Pipeline diario principal
│   ├── carga_inicial.py                # Importar stock inicial desde planilla
│   ├── actualizar_stock_fisico.py      # Reconciliar stock físico contado
│   ├── ingestar_ventas_sin_descontar.py
│   ├── extraer_maestro_desde_pedidos.py
│   ├── verify_fefo_logic.py
│   ├── verify_generar_pedido.py
│   └── verify_import.py
├── frontend/           # App React (Vite) — se buildea y sirve desde FastAPI
│   └── src/
│       ├── App.jsx
│       ├── StockControl.jsx        # Vista principal de control de stock (proceso diario)
│       └── EconomiaInsights.jsx    # ★ Vista de análisis económico / punto de equilibrio
├── data/               # Estado JSON persistente (montado como volumen Docker)
│   ├── productos.json
│   ├── movimientos_stock.json
│   └── proceso_stock_state.json    # Estado del workflow diario (qué archivos ya se procesaron)
└── Archivos/           # Inputs del negocio (montado read-only en Docker)
    ├── Stock/          # Planillas de stock físico + Ubicacion Stock.xlsx
    ├── Ventas/         # Estadisticas de Banfield - YYYY-MM-DD.xlsx
    ├── Entregas/       # Planilla de pedido Banfield - DD_MM_YYYY.xlsx
    ├── Desperdicio/    # Archivos TXT de desperdicio (formato YYYYMMDD.txt)
    └── Carga Inicial/  # Planillas para carga inicial
```

## Variables de entorno

| Variable | Default en Docker | Descripción |
|---|---|---|
| `DULCE_HORA_DATA_DIR` | `/app/data` | Directorio de estado JSON |
| `DULCE_HORA_ARCHIVOS_DIR` | `/app/Archivos` | Directorio de inputs |
| `DULCE_HORA_CORS_ORIGINS` | `*` | Orígenes CORS permitidos |
| `DULCE_HORA_STOCK_FILE` | — | Override del archivo de stock |
| `DULCE_HORA_VENTAS_FILE` | — | Override del archivo de ventas |
| `DULCE_HORA_UBICACION_STOCK_FILE` | — | Override del archivo de ubicación de stock |
| `APP_PORT` | `8000` | Puerto expuesto |

## Reglas de desarrollo

1. **product_config.py es solo datos** — clase `Producto` y catálogo. La lógica FEFO y de negocio va en `product_logic.py` o `stock_workflow.py`.
2. **verify scripts** — todo cambio de lógica necesita un `scripts/verify_<feature>.py`.
3. **@track_execution** — decorar funciones de negocio no triviales.
4. **Frontend**: si se modifica `frontend/`, hace falta rebuildar la imagen Docker (`--build`).

## Decisiones de arquitectura

- **Un solo servicio**: FastAPI sirve tanto la API REST como el frontend React buildeado (estático). No hay servidor de frontend separado en producción.
- **Estado en JSON**: la persistencia es en archivos JSON en `data/`. No hay base de datos. `proceso_stock_state.json` registra qué archivos/fechas ya fueron procesados para evitar doble contabilización.
- **FEFO estricto**: los descuentos de stock siempre consumen el lote con vencimiento más próximo primero. Implementado en `product_logic.descontar_stock_fefo()`.
- **stock_workflow.py**: módulo central del proceso diario. Infiere el estado procesado desde el historial de movimientos (`_infer_processed_state()`), evitando inconsistencias si el state file se pierde o reinicia.
- **Nombres de archivo como protocolo**: el workflow detecta tipo y fecha de cada archivo por su nombre (regex en `DELIVERY_FILENAME_RE` y `SALES_FILENAME_RE`). Los archivos deben respetar el naming convention para ser procesados.
- **Tunnel opcional**: Cloudflare Tunnel se activa con `--profile tunnel`; requiere `.cloudflare/config.yml` con credenciales del tunnel.
