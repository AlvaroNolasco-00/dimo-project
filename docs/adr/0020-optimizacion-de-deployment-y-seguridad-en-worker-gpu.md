# ADR-0020: Optimización de Deployment y Seguridad en Worker GPU

## Metadata
- **Status**: accepted
- **Date**: 2026-04-19
- **Deciders**: Antigravity (AI), Usuario
- **Scope**: devops, infrastructure

## Contexto

El Worker GPU ejecutado en Modal presentaba dos problemas operativos identificados durante las pruebas de carga y seguridad:

1.  **Latencia de "Cold Start"**: La primera ejecución de cada worker nuevo tomaba ~10-20 segundos adicionales porque descargaba los modelos de IA (`u2net`) de internet bajo demanda.
2.  **Seguridad Débil**: El secreto de autenticación (`GPU_SERVICE_SECRET`) era opcional o tenía un valor por defecto en el código, lo que permitía que el worker fuera utilizado por terceros si encontraban el endpoint expuesto de Modal.

## Decisión

Se implementaron mejoras críticas en el flujo de deployment (CI/CD) y seguridad en tiempo de ejecución:

1.  **Pre-descarga de Modelos**: Se actualizó el archivo de configuración de deployment (`koyeb.yaml`) para incluir un paso de build que inicializa las sesiones de `rembg` y descarga el modelo `u2net` durante la fase de construcción de la imagen.
2.  **Enforcement de Secretos**: Se modificó `gpu-worker/modal_app.py` para levantar un `RuntimeError` inmediatamente si la variable de entorno `GPU_SERVICE_SECRET` no está presente, eliminando el riesgo de despliegue con configuraciones inseguras de desarrollo.
3.  **Modernización de API**: Se cambió el punto de entrada de `bytes` directos a `UploadFile` de FastAPI, permitiendo una validación de metadatos más eficiente y mejor manejo de streams de memoria para archivos grandes.

## Alternativas Consideradas

### Alternativa 1: Guardar modelos en S3/Storage
- **Pros**: Control total de versiones de modelos.
- **Contras**: Incrementa la complejidad de la infraestructura y el tiempo de red interna en cada despliegue.

### Alternativa 2: Usar autenticación JWT
- **Pros**: Más estándar y granular.
- **Contras**: Sobrecargado para una comunicación server-to-server interna donde un secreto compartido (Shared Secret) rotado periódicamente es suficiente y más eficiente.

## Consecuencias

### Positivas
- **Performance**: Reducción drástica del tiempo de respuesta en la primera petición (pasa de 15s a <2s).
- **Seguridad**: El servicio es "Secure by Default". No arrancará si no está configurado correctamente.
- **Eficiencia**: La imagen de contenedor ya tiene todo lo necesario para procesar peticiones inmediatamente después del pull.

### Negativas
- **Build Time**: El tiempo de build inicial se incrementa (~15-20 segundos más) al tener que descargar el modelo durante el CI/CD.
- **Storage**: La imagen del contenedor es ligeramente más pesada (~170MB extra del modelo u2net).

## Referencias
- `koyeb.yaml`
- `gpu-worker/modal_app.py`
- `backend/routers/processing.py`
