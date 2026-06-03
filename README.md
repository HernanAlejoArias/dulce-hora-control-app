# Dulce Hora Control App

Backend FastAPI for Dulce Hora stock, vencimientos, pedidos and daily batch processing. The Docker image also serves the built React frontend, so the app runs as one local service.

## Local Docker Run

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Keep local JSON state in `data/`.
3. Keep spreadsheets and text inputs in `Archivos/` using these folders:
   - `Archivos/Entregas`
   - `Archivos/Ventas`
   - `Archivos/Desperdicio`
   - `Archivos/Stock`
   - `Archivos/Carga Inicial`

```powershell
docker compose up -d --build dulce-hora-app
```

Open `http://localhost:8000`.

Health endpoints:

- `http://localhost:8000/_stcore/health`
- `http://localhost:8000/api/health`

## Cloudflare Tunnel

Set `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, then run:

```powershell
docker compose --profile tunnel up -d --build
```

The tunnel should point to `http://dulce-hora-app:8000`.

## Runtime Configuration

- `DULCE_HORA_DATA_DIR`: JSON state directory. Defaults to `/app/data` in Docker.
- `DULCE_HORA_ARCHIVOS_DIR`: spreadsheet/text input directory. Defaults to `/app/Archivos` in Docker.
- `DULCE_HORA_CORS_ORIGINS`: comma-separated CORS origins. Defaults to `*`.
- `DULCE_HORA_STOCK_FILE`: optional override for the stock spreadsheet.
- `DULCE_HORA_VENTAS_FILE`: optional override for the ventas spreadsheet.
- `DULCE_HORA_PEDIDO_BASE_FILE`: optional override for the base pedido spreadsheet.
- `DULCE_HORA_CARGA_INICIAL_DIR`: optional override for carga inicial spreadsheets.
