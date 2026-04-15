# ADR-0008: Posicionamiento del drawer sidebar debajo de la navbar superior

## Metadata
- **Status**: accepted
- **Date**: 2026-04-14
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

El sidebar del editor (`editor-sidebar`) se desplegaba desde el borde superior de la ventana (`top: 0`), quedando visualmente oculto detrás de la navbar superior que tiene una altura de 70px. Esto causaba que el header del drawer quedara parcialmente cubierto, afectando la usabilidad y la estética de la interfaz.

## Decisión

Ajustar el posicionamiento del drawer sidebar para que inicie justo debajo de la navbar superior, cambiando `top: 0` a `top: 70px` en el archivo `editor-sidebar.component.scss`. El drawer ahora ocupa el espacio vertical desde los 70px hasta el borde inferior de la ventana.

## Alternativas Consideradas

### Alternativa 1: Mantener posición actual con z-index mayor
- **Pros**: No requiere cambios de posicionamiento
- **Contras**: El drawer superpondría la navbar, rompiendo la jerarquía visual y tapando controles de navegación importantes

### Alternativa 2: Reducir altura del drawer y dejar espacio arriba
- **Pros**: Similar visualmente
- **Contras**: Genera un espacio vacío innecesario entre la navbar y el drawer, desperdiciando espacio útil

## Consecuencias

### Positivas
- El drawer ahora se despliega completamente visible debajo de la navbar
- Mejor jerarquía visual entre la navegación superior y el panel lateral
- No se superpone con elementos de la barra superior

### Negativas
- Altura del drawer se reduce en 70px (de 100vh a calc(100vh - 70px))
- Posición hardcodeada a la altura de la navbar (requiere mantenimiento si cambia la altura)

### Riesgos
- Si la altura de la navbar cambia en el futuro, el drawer quedaría desalineado. Se recomienda usar CSS custom properties para sincronizar ambos valores.

## Referencias
- Archivo modificado: `frontend/src/app/editor/components/editor-sidebar/editor-sidebar.component.scss`
