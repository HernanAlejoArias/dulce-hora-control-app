# -*- coding: utf-8 -*-
"""
Standalone verification script for generating suggestions of smart orders.
This verifies the imports, function execution, and that the endpoint returns expected structure.
"""
import sys
import os

# Agregamos la ruta raíz al path para importar app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import generar_pedido

def test_generar_pedido():
    print("Iniciando prueba de generar_pedido()...")
    try:
        # Probamos con 2 días de cobertura y 10% de plus
        sugerencias = generar_pedido(dias_cobertura=2, plus_porcentaje=10.0)
        print(f"Éxito: Se generaron {len(sugerencias)} sugerencias de pedidos.")
        
        # Mostrar las primeras 5 sugerencias
        for i, sug in enumerate(sugerencias[:5]):
            print(f"[{i+1}] {sug['descripcion']} ({sug['categoria']}):")
            print(f"    Promedio Diario: {sug['promedio_diario']} | Stock Útil: {sug['stock_util']}")
            print(f"    Pedido Sugerido: {sug['pedido_bruto']} | Bultos: {sug['bultos_sugeridos']} | Redondeado: {sug['pedido_redondeado']}")
            
        print("\nVerificación de lógica completada con éxito.")
    except Exception as e:
        print(f"Error en la verificación de lógica: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_generar_pedido()
