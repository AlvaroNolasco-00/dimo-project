# Plan de Implementación: Lienzo — Editor de Imágenes Múltiples

Implementación de un lienzo (canvas) interactivo dentro del módulo Studio que permite posicionar, redimensionar y rotar múltiples imágenes sobre un área con dimensiones físicas específicas.

## 1. Arquitectura y Modelos

### Tipos de Datos (`lienzo.types.ts`)
- `LienzoSize`: Dimensiones en centímetros (`widthCm`, `heightCm`).
- `LienzoImage`: Estado de cada imagen (id, src, img, x, y, width, height, rotation).
- `DPI`: Constantes para pantalla (96) y exportación (300).
- Convertores `cmToPx` y `pxToCm`.

## 2. Gestión de Estado (`lienzo-state.service.ts`)

Servicio centralizado basado en **Signals**:
- **Tamaño**: Por defecto 20x20 cm. Al cambiar, se eliminan imágenes que queden totalmente fuera.
- **Imágenes**: Array inmutable de objetos `LienzoImage`.
- **Z-Order**: Métodos para mover imágenes hacia adelante/atrás.
- **Exportación**: Generación de PNG a **300 DPI** para calidad de impresión.

## 3. Componentes UI

### `LienzoCanvasComponent` (Renderer Core)
- **HTML5 Canvas**: Renderizado puro mediante `Canvas2D`.
- **Viewport**: Soporte para Pan (Space+Drag / Botón central) y Zoom (Scroll).
- **Interacción**:
    - Hit-testing para selección de imágenes y handles.
    - 4 handles de esquina para redimensionar (manteniendo aspecto).
    - 1 handle superior para rotación.
- **Render Loop**: Optimizado con `requestAnimationFrame`.

### `LienzoToolbarComponent` (Barra Superior)
- Inputs de Ancho/Alto en cm.
- Botón "Agregar" (soporta múltiples archivos).
- Botón "Exportar" (PNG).
- Botón "Eliminar Selección" y "Ajustar Vista".

### `LienzoPropsComponent` (Panel de Propiedades)
- Edición numérica de posición (X, Y) y tamaño (W, H).
- Toggle para bloqueo de relación de aspecto.
- Slider de rotación (0-360°).
- Controles de orden Z.

### `LienzoShellComponent` (Layout)
- Orquestador que une Toolbar, Canvas y Panel de Propiedades.

## 4. Integración y Rutas

### Navegación
- **Ruta**: `/studio/lienzo` (Lazy loaded).
- **Acceso**: Botón "Lienzo" añadido en la `top-bar` principal de Studio.

## 5. Decisiones Técnicas Clave
- **Unidades**: Lógica interna en píxeles (96 DPI), interfaz de usuario en centímetros.
- **Poda Automática**: Al reducir el lienzo, las imágenes fuera de los nuevos límites se eliminan para mantener el proyecto limpio.
- **Z-Order**: El índice en el array define el orden visual (último elemento es el más frontal).
