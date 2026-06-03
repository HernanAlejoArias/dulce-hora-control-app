import functools
import time
import logging
from typing import Callable, Any

# Configuración básica de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("execution_tracker")

# Estado global para activar/desactivar el tracking
TRACKING_ENABLED = False

def set_tracking_enabled(enabled: bool):
    global TRACKING_ENABLED
    TRACKING_ENABLED = enabled

def track_execution(func: Callable) -> Callable:
    """
    Decorador para registrar la ejecución de funciones de lógica de negocio.
    Registra argumentos, tiempo de ejecución y resultados o errores.
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        if not TRACKING_ENABLED:
            return func(*args, **kwargs)
        
        start_time = time.time()
        logger.info(f"START: {func.__name__} - args: {args}, kwargs: {kwargs}")
        
        try:
            result = func(*args, **kwargs)
            end_time = time.time()
            elapsed_time = end_time - start_time
            logger.info(f"SUCCESS: {func.__name__} - elapsed: {elapsed_time:.4f}s")
            return result
        except Exception as e:
            end_time = time.time()
            elapsed_time = end_time - start_time
            logger.error(f"ERROR: {func.__name__} - elapsed: {elapsed_time:.4f}s - exception: {str(e)}")
            raise

    return wrapper
