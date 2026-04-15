# ADR-0006: Sistema ADR para bitácora de decisiones

## Metadata
- **Status**: accepted
- **Date**: 2026-04-14
- **Deciders**: Equipo completo
- **Scope**: fullstack

## Contexto

El proyecto ha tomado muchas decisiones arquitectónicas importantes (migraciones SQL manuales, multi-tenancy por Project, Signals, GPU fallback, etc.), pero no existía una forma estructurada de documentarlas. Las decisiones estaban en:

- Commits de git (difícil de extraer y entender contexto)
- Documentos narrativos dispersos (CLAUDE.md, contextos/)
- Conversaciones informales (sin registro permanente)

Esto dificultaba:
- Onboarding de nuevos desarrolladores (por qué se hizo cada cosa)
- Revisión de decisiones pasadas cuando cambian contextos
- Consistencia en el razonamiento arquitectónico

## Decisión

Se implementó un **sistema formal de Architecture Decision Records (ADRs)** basado en el formato de Michael Nygard:

- **Ubicación**: `docs/adr/` con plantilla standardizada
- **Numeración**: 4 dígitos zero-padded (0001, 0002, ...) con slug descriptivo
- **Formato**: Secciones obligatorias — Metadata, Contexto, Decisión, Alternativas, Consecuencias, Referencias
- **Automatización**: Script `new-adr.sh` para crear nuevos ADRs con boilerplate
- **Índice**: `INDEX.md` con tabla navegable de todos los ADRs
- **Integración**: Referenciado en CLAUDE.md para Claude Code

## Alternativas Consideradas

### Alternativa 1: Mantener decisiones en CLAUDE.md
- **Pros**: Un archivo único, integrado con documentación existente
- **Contras**: Archivo se vuelve caótico, difícil de navegar, no es el formato para decisiones (es guía arquitectónica general)

### Alternativa 2: Wiki/Confluence/Notion
- **Pros**: Interfaz amigable, búsqueda incorporada, control de acceso
- **Contras**: Herramienta externa a mantener, requiere acceso a plataforma, no versionado con código

### Alternativa 3: Repositorio separado de decisiones
- **Pros**: Claridad conceptual
- **Contras**: Desincronizado con cambios de código, fricción para cambiar

## Consecuencias

### Positivas
- Decisiones documentadas y versionadas en git
- Facilita onboarding — nuevos devs leen contexto y alternativas
- Auditable — cada decisión tiene autor, fecha, y justificación
- Escalable — proceso claro para nuevas decisiones
- Bajo overhead — template simple, script automatiza boilerplate

### Negativas
- Requiere disciplina — no es enforcement automático
- Deuda técnica documental — ADRs pueden quedar desactualizados
- Overhead inicial — documentar 5 decisiones retroactivas toma tiempo

### Riesgos
- Resistencia a documentar ("otro documento más")
- Desincronización si ADR no se actualiza cuando situación cambia
- Acumulación de ADRs "superseded" puede volverse confuso

## Referencias
- `docs/adr/TEMPLATE.md` — plantilla para nuevos ADRs
- `docs/adr/new-adr.sh` — script para crear ADRs
- `docs/adr/INDEX.md` — índice con todos los ADRs
- `CLAUDE.md` — sección "Architecture Decision Records"
- Michael Nygard ADR format: https://adr.github.io/
