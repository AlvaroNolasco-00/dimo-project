# ADR-0011: Componentización de Interfaz de Usuario Compartida

## Metadata
- **Status**: accepted
- **Date**: 2026-04-16
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

Frontend de dimo-project reutiliza patrones UI idénticos en múltiples componentes. Ejemplos:
- Modales: 22+ instancias de boilerplate (backdrop + header + footer)
- Selectores de costo: 100+ líneas duplicadas en `crear-pedido` y `producto-form`
- Controles de cantidad: patrón ±/input/± repetido 3+ veces
- Tarjetas estadísticas: estructura replicada en `bitacora` y `coupons`
- Tablas datos: estructura repetida en 9+ componentes

**Problema**: duplicación de ~530 líneas HTML → mantenimiento costoso, inconsistencias de estilo, riesgo de bugs al cambiar un patrón.

## Decisión

Crear 5 componentes Angular 18 standalone compartidos en `src/app/shared/components/`:

1. **`app-modal`** — wrapper genérico para todos modales
   - Inputs: `isOpen`, `title`, `subtitle`, `cssClass`, `closeOnBackdrop`
   - Output: `closed` event
   - Projected content vía `ng-content` (body + `[modal-footer]` slot)

2. **`app-quantity-control`** — selector ±/input/±
   - Usa `model()` signal para two-way binding `[(value)]`
   - Input: `min`
   - Reemplaza 30+ líneas duplicadas

3. **`app-cost-selector`** — configurador costo completo
   - Dropdowns (tipo + costo) + card de configuración
   - Maneja variantes, costos derivados, cantidad, etiqueta
   - Extrae 100+ líneas de `crear-pedido` y `producto-form`

4. **`app-stat-card`** — tarjeta estadística con icono
   - Inputs: `icon`, `label`, `value`, `cardClass`, `iconClass`
   - Reemplaza 8+ tarjetas en `bitacora` y `coupons`

5. **`app-data-table`** — envoltorio table responsive
   - Proporciona `.table-responsive > .data-table > ng-content`
   - Asegura estructura consistente

## Alternativas Consideradas

### Alternativa 1: Seguir copiando-pegando
- **Pros**: Mínimo refactor inicial
- **Contras**: Deuda técnica crece; cada cambio requiere múltiples ediciones; errores propagados

### Alternativa 2: Genéricos con `@ContentChild` y TemplateRef
- **Pros**: Máxima flexibilidad de renderizado
- **Contras**: Complejidad alta; steep learning curve para team; overhead

### Alternativa 3: Componentes compartidos (elegida)
- **Pros**: Reutilización clara; mantenible; typing Angular 18; inversión bajita en diseño
- **Contras**: Requiere refactoring en 5+ componentes consumidores

## Consecuencias

### Positivas
- **−530 líneas HTML** → código más limpio, menos bugs
- **Consistencia visual** → modales, tablas, stat-cards uniformes
- **Mantenibilidad** — cambios en un lugar afectan todas instancias
- **Escalabilidad** — nuevas vistas reutilizan componentes existentes
- **DX mejorada** — interfaces tipo-seguras, props declarativas

### Negativas
- **Refactoring inicial** — 5 archivos consumidores editados + métodos wrapper agregados
- **Curva aprendizaje** — team necesita entender interfaces cada componente
- **Opciones de personalización limitadas** (mitigado con inputs flexibles)

### Riesgos
- **Regresión de comportamiento** — `crear-pedido` y `producto-form` manejan estado complejo en cost-selector
  - *Mitigación*: métodos wrapper (`onSelectorCostTypeChange`, `onSelectorCostChange`) mantienen lógica original
- **Overhead de props** — cost-selector tiene 20+ inputs/outputs
  - *Mitigación*: agrupa estado por concern lógico (selection, loading, derived)

## Implementación

### Archivos Creados
```
shared/components/
├── modal/
│   ├── modal.component.ts
│   ├── modal.component.html
│   └── modal.component.scss
├── quantity-control/
│   ├── quantity-control.component.ts
│   ├── quantity-control.component.html
│   └── quantity-control.component.scss
├── stat-card/
│   ├── stat-card.component.ts
│   ├── stat-card.component.html
│   └── stat-card.component.scss
├── cost-selector/
│   ├── cost-selector.component.ts
│   ├── cost-selector.component.html
│   └── cost-selector.component.scss
└── data-table/
    └── data-table.component.ts (inline template)
```

### Archivos Actualizados
| Componente | Cambios |
|---|---|
| `costos-operativos` | 2 modales → `<app-modal>` |
| `coupons` | 3 modales + 7 stat-cards → `<app-modal>` + `<app-stat-card>` |
| `crear-pedido` | cost-selector + qty → `<app-cost-selector>` + `<app-quantity-control>` |
| `producto-form` | cost-selector + qty → `<app-cost-selector>` + `<app-quantity-control>` |
| `bitacora` | 4 stat-cards → `<app-stat-card>` |

### Build Status
✓ Compila sin errores (Angular 18 dev build: 3.38s)

## Referencias
- Rebase branch: `fix/pipeline`
- Linea de trabajo: refactoring UI compartida
