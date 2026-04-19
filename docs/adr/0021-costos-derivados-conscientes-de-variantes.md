# ADR-0021: Costos Derivados Conscientes de Variantes

## Metadata
- **Status**: accepted
- **Date**: 2026-04-19
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

En el sistema de creación de pedidos, operadores pueden seleccionar un costo base (padre) con variantes — por ejemplo, camisas con tallas (S, M, L, XL, XXL, XXXL). El sistema también permite costos derivados (secundarios/add-ons) — estampados, bordados, etc.

**Problema**: Todos los costos derivados del padre se mostraban sin importar qué variante eligiera el operador. Esto es incorrecto cuando el estampado para talla S cuesta diferente y tiene tamaño diferente que para XXL.

**Requisito**: Costos derivados deben filtrarse según las variantes que el operador eligió. Admin ya etiqueta en qué variantes aplica cada derivado (ej: estampado pequeño → ["Tallas: S", "Tallas: M", "Tallas: L"]; estampado grande → ["Tallas: XL", "Tallas: XXL", "Tallas: XXXL"]).

## Decisión

**Implementar filtrado de costos derivados en el frontend con lógica híbrida AND/OR**:

1. **Nivel de datos**: Admin ya escribe `attributes.__dependent_variants` en backend (array de strings formato `"GroupName: OptionLabel"`). No cambios DB/API.

2. **Lógica cliente** (crear-pedido.component.ts):
   - Método `buildSelectedVariantStrings()`: convierte picks del operador (`{ "Tallas": { label: "S", ... } }`) → formato admin (`["Tallas: S"]`)
   - Método `isDerivedCostApplicable(cost, selected)`: **matching híbrido AND/OR**
     - Agrupar dependencias por nombre de grupo
     - **OR dentro grupo**: derivado aplica si AL MENOS una variante de su grupo de dependencias está seleccionada
     - **AND entre grupos**: si derivado declara múltiples grupos (ej: talla + color), TODOS los grupos deben tener match
     - Si `__dependent_variants` vacío → siempre aplica
   - Método `refreshFilteredDerivedCosts()`: recalcula lista visible + auto-deselecciona derivados ya no válidos

3. **Flujo integración**:
   - `onOperativeCostChange()`: al cargar padre, fetch todos derivados + llama `refreshFilteredDerivedCosts()`
   - `onVariantChange()`: cuando operador elige/cambia variante, llama `refreshFilteredDerivedCosts()` (auto-recalcula lista + deselecciona inválidos)
   - Template: usa `filteredDerivedCosts` en lugar de `availableDerivedCosts`

4. **UX**: cost-selector muestra hint sutil cuando padre tiene variantes pero lista derivada está vacía (señal "elige variante para ver opciones")

## Alternativas Consideradas

### Alternativa 1: Filtrado en backend (server-side)
- **Pros**: descarga lógica del cliente; reutilizable en APIs futuras
- **Contras**: requiere nuevo parámetro query (`?variant=S`) o nuevo endpoint; overhead HTTP; backend no tiene el contexto de qué variantes el usuario seleccionó (ya que son estado frontend)
- **Rechazado**: Cliente es la fuente de verdad de variantes seleccionadas. Filtrado local es más directo.

### Alternativa 2: Filtrado solo con OR (cualquier match basta)
- **Pros**: más simple; derivados se muestran más frecuente
- **Contras**: falla para productos multi-grupo (ej: talla S + color negro son dependencias independientes, OR mostraría "color negro" incluso si operador solo eligió talla S, sin color)
- **Rechazado**: Semántica incorrecta para casos reales multi-atributo.

### Alternativa 3: Filtrado solo con AND (todas las dependencias requeridas)
- **Pros**: más restrictivo, evita false positives
- **Contras**: si admin lista múltiples variantes del MISMO grupo (ej: ["Tallas: S", "Tallas: M"]), operador nunca vería derivado (necesitaría S AND M simultáneamente, imposible)
- **Rechazado**: No soporta el caso común de múltiples opciones en el mismo grupo.

## Consecuencias

### Positivas
- Operadores ven solo costos derivados aplicables a sus variantes seleccionadas
- Admin tiene control granular: puede etiqueta derivados por variante sin cambios backend
- No afecta API, schema DB, ni migraciones
- Auto-deselección evita selecciones inválidas acumulándose
- Lógica híbrida cubre casos simples (talla) y complejos (talla + color)

### Negativas
- Lógica en frontend duplicada con lo que admin etiqueta en el modal de costos — si admin olvida etiquetar, derivado siempre visible (degradación controlada)
- Cambios futuros a semántica de matching requieren cambio frontend (si admin quiere AND estricto para caso específico, no hay flag)

### Riesgos
- **Administrador olvida etiquetar**: derivados sin `__dependent_variants` se muestran siempre (por diseño, fallback seguro)
- **Inconsistencia en etiquetado**: admin etiqueta "Tallas: S" pero operador no ve porque typo "Talla: S". Mitigación: UI admin valida contra variantes definidas en grupo
- **Cambio en variantes futuro**: si admin edita grupo de variantes después de etiquetar derivados, etiquetas pueden quedarse obsoletas. Mitigación: UI admin advierte al editar.

## Referencias
- Feature branch: `fix/pipeline` (commit específico por definir)
- Plan document: `/Users/alvaronolasco/.claude/plans/hay-que-implementar-una-zesty-lynx.md`
- Frontend files:
  - `frontend/src/app/gestion/pedidos/crear-pedido/crear-pedido.component.ts` (métodos helper + refresh logic)
  - `frontend/src/app/shared/components/cost-selector/cost-selector.component.ts` (variantHintVisible input)
  - Templates: crear-pedido.component.html, cost-selector.component.html
- Admin (costos-operativos.component.ts línea 349): ya etiqueta con `__dependent_variants`
- Test lógica: hybrid AND/OR verificado en `/tmp/test-variant-filter.ts`
