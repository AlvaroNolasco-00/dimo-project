# 0028. Fix: Coordenadas de Watermark centradas en lugar de top-left

**Status**: accepted

**Scope**: backend

**Fecha**: 2026-04-23

## Contexto

El endpoint `POST /watermark` en `backend/routers/processing.py` y la función `apply_watermark()` en `backend/services/processing.py` interpretaban las coordenadas `x, y` como la posición **top-left** del watermark. Sin embargo, la UX esperada es que `x, y` representen el **centro** del watermark, permitiendo posicionamiento intuitivo donde el usuario hace click en el punto donde quiere que esté el centro del watermark.

Este bug afectaba la experiencia de usuario al usar `WatermarkToolComponent` en Studio Shell, ya que el watermark aparecía corrido respecto al punto clickeado.

## Decisión

Se modificó `apply_watermark()` en `backend/services/processing.py` para que `x, y` representen el centro del watermark:

```python
# Antes (top-left):
transparent_layer.paste(watermark_img, (x, y), mask=watermark_img)

# Después (center-based):
final_w, final_h = watermark_img.size
paste_x = x - final_w // 2
paste_y = y - final_h // 2
transparent_layer.paste(watermark_img, (paste_x, paste_y), mask=watermark_img)
```

### Backend
- `backend/services/processing.py`: cálculo de `paste_x, paste_y` restando mitad del ancho/alto del watermark

### Frontend
- `WatermarkToolComponent` actualizado para usar signals (`posX`, `posY` signals en lugar de propiedades plain)
- Preview canvas actualizado para mostrar el watermark centrado en las coordenadas clickeadas
- `renderPreview()` calcula `drawX = x - sw/2` y `drawY = y - sh/2` consistentemente

## Alternativas Consideradas

- **Mantener top-left y ajustar en frontend**: El frontend podría compensar restando `width/2, height/2` antes de enviar al backend. Se eligió corregir en backend para que la API sea intuitiva.
- **API break: renombrar parámetros a `center_x, center_y`**: Cambiar nombres sería breaking change; mejor simplemente corregir la interpretación.

## Consecuencias

- **Positivo**: UX mejorada — click en canvas centra watermark donde el usuario espera
- **Positivo**: API más intuitiva — coordenadas representan el centro, no una esquina
- **Negativo**: Cambio de comportamiento silencioso en API existente; clientes que dependían del comportamiento top-left recibirán resultados diferentes
- **Riesgo**: Si hay clientes externos usando la API `/watermark` con coordenadas top-left expecting, sus integraciones se romperán. Sin embargo, al ser feature interna de Studio, el impacto es limitado.

## Referencias

- `backend/services/processing.py` — `apply_watermark()` con comentario `# x, y is the center of the watermark`
- `frontend/src/app/studio/tools/watermark-tool/watermark-tool.component.ts` — `renderPreview()` con centering math