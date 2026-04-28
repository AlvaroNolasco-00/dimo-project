# Plan: Herramienta de Texto Overlay (`text-tool`)

**Fecha:** 2026-04-25
**Estado:** Planificado
**Tipo:** Nueva feature (frontend + backend)

---

## Resumen

Implementar una nueva herramienta en el Studio que permita superponer texto sobre una imagen con control total sobre fuente, tamaño, color, posición, rotación, opacidad, outline, sombra y alineación. El renderizado final se realiza en el backend para garantizar calidad de producción.

---

## 1. Backend — Nuevo endpoint `/api/text-overlay`

### Archivos a modificar
- `backend/routers/processing.py` — agregar endpoint `POST /text-overlay`
- `backend/services/processing.py` — agregar `apply_text_overlay(...)`

### Parámetros del endpoint

| Campo           | Tipo      | Descripción                                      | Default       |
|-----------------|-----------|--------------------------------------------------|---------------|
| `image`         | UploadFile| Imagen base                                      | —             |
| `text`          | str       | Texto a renderizar                               | —             |
| `x`             | int       | Posición X (centro del texto)                    | —             |
| `y`             | int       | Posición Y (centro del texto)                    | —             |
| `font_size`     | int       | Tamaño en px                                     | 48            |
| `font_color`    | str       | Hex color                                        | `#ffffff`     |
| `font_family`   | str       | Nombre fuente                                    | `sans-serif`  |
| `rotation`      | float     | Grados                                           | 0             |
| `opacity`       | float     | 0.0–1.0                                          | 1.0           |
| `outline_width` | int       | px de borde                                        | 0             |
| `outline_color` | str       | Hex del borde                                    | `#000000`     |
| `shadow_blur`   | int       | Desenfoque sombra                                | 0             |
| `shadow_color`  | str       | Hex de la sombra                                 | `#000000`     |
| `shadow_offset_x`| int      | Offset X de sombra                               | 0             |
| `shadow_offset_y`| int      | Offset Y de sombra                               | 0             |
| `align`         | str       | `left` / `center` / `right`                      | `center`      |
| `valign`        | str       | `top` / `middle` / `bottom`                      | `middle`      |

### Implementación `apply_text_overlay`

1. Cargar imagen base en RGBA
2. Crear capa transparente del mismo tamaño
3. Usar `PIL.ImageDraw.Draw` + `ImageFont.truetype`
   - Fallback a fuente PIL por defecto si no existe la fuente del sistema
4. Calcular bounding box del texto con `draw.textbbox()` para alinear correctamente según `align` / `valign`
5. **Outline:** si `outline_width > 0`, dibujar texto 8 veces alrededor (N, NE, E, SE, S, SW, W, NW) con `outline_color`, luego el texto principal
6. **Sombra:** si `shadow_blur > 0`, dibujar sombra en capa separada, aplicar `ImageFilter.GaussianBlur`, luego compositar
7. Rotar el texto renderizado con `Image.rotate(..., expand=True)`
8. Aplicar opacidad vía alpha channel
9. Pegar en posición (x, y) centrada según alineación
10. `Image.alpha_composite` → retornar PNG bytes

### Nota sobre fuentes

En Koyeb usaremos fuentes del sistema (`/usr/share/fonts/`) con fallback a fuente PIL por defecto si no se encuentra.

---

## 2. Frontend — Nuevo componente `text-tool`

### Archivos a crear
- `frontend/src/app/studio/tools/text-tool/text-tool.component.ts`

### Archivos a modificar
- `frontend/src/app/studio/models/tool.types.ts` — agregar `ToolId: 'text-overlay'`
- `frontend/src/app/studio/components/tool-sidebar/tool-sidebar.component.ts` — se actualiza automáticamente vía `TOOLS` array
- `frontend/src/app/studio/studio-shell/studio-shell.component.ts` — importar componente, agregar a `@ViewChild`, actualizar `clickMode()`
- `frontend/src/app/studio/studio-shell/studio-shell.component.html` — agregar `@case ('text-overlay')`
- `frontend/src/app/studio/services/studio-processing.service.ts` — agregar método `textOverlay(...)`

### Diseño del panel

Template con secciones:

- **Texto:** `<textarea>` multilinea
- **Fuente:** `<select>` con fuentes del sistema + `<input type="number">` para tamaño
- **Color:** `<input type="color">` para texto + otro para outline
- **Posición:** Inputs X/Y + hint "Click en canvas para posicionar"
- **Outline:** Toggle + width + color
- **Sombra:** Toggle + blur + offset X/Y + color
- **Alineación:** Botones grupo para horizontal (`left`/`center`/`right`) y vertical (`top`/`middle`/`bottom`)
- **Opacidad:** Slider 0–1
- **Rotación:** Slider 0–360 + input numérico
- **Preview:** Mini canvas mostrando texto sobre imagen base (client-side render con Canvas2D)
- **Aplicar:** Botón que envía al backend

### Preview client-side

- Canvas visible en el panel
- Renderiza texto con `ctx.fillText()`, `ctx.strokeText()` para outline, `ctx.shadowBlur/OffsetX/OffsetY` para sombra
- Actualiza en tiempo real vía `effect()` cuando cambian propiedades
- Si el usuario hace click en el canvas principal (`canvas-viewport`), se captura la posición y se usa como x/y

### Servicio `StudioProcessingService`

- Nuevo método `async textOverlay(image: Blob, ...all params): Promise<Blob>`
- Envía `FormData` con todos los parámetros al endpoint `/text-overlay`

---

## 3. Integración en Studio Shell

### `studio-shell.component.ts`
- Importar `TextToolComponent`
- Agregar `@ViewChild(TextToolComponent) textTool?: TextToolComponent;`
- Actualizar `clickMode()` para incluir `'text-overlay'`

### `studio-shell.component.html`
- Agregar `@case ('text-overlay') { <app-text-tool /> }`

### `tool.types.ts`
- Agregar `'text-overlay'` a `ToolId`
- Agregar entrada a `TOOLS` array:
  ```ts
  { id: 'text-overlay', label: 'Texto', icon: 'ph-text-t', description: 'Agregar texto sobre imagen', hasMask: false, hasClick: true }
  ```

---

## 4. Flujo de usuario

1. Usuario selecciona herramienta **Texto** del sidebar
2. Panel muestra campo de texto vacío y controles por defecto
3. Usuario escribe texto, ajusta propiedades
4. Preview se actualiza en tiempo real en el panel
5. Usuario hace click en el canvas principal → posición X/Y se setea automáticamente
6. Usuario ajusta rotación/opacidad si quiere
7. Click en **Aplicar** → envía imagen base + todos los parámetros al backend
8. Backend renderiza texto sobre imagen y retorna PNG
9. Studio muestra resultado en history stack

---

## 5. Consideraciones de testing

- Verificar que fuentes del sistema existan en Koyeb (de lo contrario, usar fuente PIL por defecto)
- Validar que `opacity` no rompa el alpha compositing
- Probar multilinea con `\n` — tanto en preview (Canvas2D) como en backend (PIL)
- Asegurar que `canvasClick` se limpie después de aplicar (ya lo hace `applyResult`)
- Verificar consistencia de fuentes entre preview frontend y render backend

---

## Dependencias

- `Pillow` (ya instalado en backend)
- `PIL.ImageFont`, `PIL.ImageDraw`, `PIL.ImageFilter`
- Fuente de sistema disponible en el entorno de despliegue (Koyeb)

---

## Notas abiertas

- **Fuentes:** ¿Usar fuentes de Google Fonts (descargar Roboto/Inter en el backend) o solo fuentes del sistema? Esto afecta la consistencia entre preview (frontend) y render final (backend).
