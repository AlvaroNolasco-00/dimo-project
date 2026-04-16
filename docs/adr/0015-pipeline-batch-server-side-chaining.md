# ADR-0015: Pipeline batch server-side chaining

## Metadata
- **Status**: accepted
- **Date**: 2026-04-16
- **Deciders**: Alvaro Nolasco
- **Scope**: fullstack

## Contexto

Currently, pipeline execution in the editor sends each operation one-by-one from frontend to backend. For **chained operations** (where step N's input is step N-1's output), the intermediate image blob round-trips unnecessarily between frontend and backend.

Example: A 4-step pipeline (remove-bg → enhance → upscale → halftone) on a 3MB image sends ~24MB of total transfer (3MB up, 3MB down, 3MB up, 3MB down, etc.) instead of ~6MB (send once, receive all results).

This bandwidth waste is significant when users build complex pipelines or operate on large images, and it increases latency for each step.

## Decisión

Implement a **server-side pipeline endpoint** that:
1. Accepts a single image upload + a list of operations (JSON) + optional masks (form files)
2. Executes all chained operations **in memory on backend**, passing intermediate results internally
3. Returns all intermediate results as base64-encoded PNG in a single JSON response
4. Preserves individual endpoint behavior for single operations and non-chained workflows

**Architecture:**
- **New backend endpoint**: `POST /api/pipeline` (FastAPI)
  - Accepts: image file, operations JSON string, masks (mask_0, mask_1, ...)
  - Returns: PipelineResponse with array of base64 results + status
  - Upscale runs **synchronously within the pipeline** (not as background task)
  - Fail-fast: stops on first error, returns partial results
  - Audit logging per step preserved

- **Frontend changes**:
  - Capture masks and magic-wand coordinates **at add-to-pipeline time** (not execution time)
  - Partition operation queue into chained groups (2+ consecutive chained ops) vs singles
  - Chained groups → single `POST /api/pipeline` call
  - Singles → existing individual endpoints (backward-compatible)
  - Convert base64 results → Blobs → Object URLs for step navigation

## Alternativas Consideradas

### Alternativa 1: Streaming response (Server-Sent Events or multipart/form-data)
- **Pros**: Reduces base64 overhead; results arrive incrementally
- **Contras**: More complex client-side parsing; adds streaming infrastructure; overkill for 2-5 step pipelines
- **Rejected**: Base64 JSON simpler for typical pipeline sizes (2-5 steps = ~10-20MB base64 vs ~10-15MB binary)

### Alternativa 2: Batch all operations (chained + independent) into single request
- **Pros**: Fewer total HTTP requests
- **Contras**: Mapping operations to multiple images adds complexity; backend has 1 worker anyway (can't parallelize); no bandwidth win for independent ops
- **Rejected**: Only chained ops benefit; independent ops fire in parallel via `Promise.all` on frontend (equivalent latency, simpler code)

### Alternativa 3: Keep existing step-by-step frontend orchestration
- **Pros**: No backend changes; minimal frontend complexity
- **Contras**: Wastes bandwidth on intermediate round-trips; slow UX for complex pipelines
- **Rejected**: User-facing problem motivates fix

## Consecuencias

### Positivas
- **Bandwidth savings**: Chained pipelines reduce data transfer by ~75% (from ~24MB to ~6MB for typical 4-step 3MB image)
- **Latency reduction**: Eliminates round-trip delays between steps (O(N) → O(1) network overhead for N chained steps)
- **Memory efficiency**: Backend chains in memory; no temp file writes
- **Backward compatible**: Individual endpoints unchanged; single operations use existing flow
- **Audit trail preserved**: Per-operation logging maintained via AuditContext per step
- **Fail-fast semantics**: Partial failures don't lose successful intermediate results (user can re-execute or branch from last successful step)

### Negativas
- **Base64 overhead**: Response includes base64-encoded images (33% size increase vs binary), but acceptable for 2-5 steps
- **Synchronous upscale**: Upscale runs inline (no background task) — can block on long upscales. Mitigated by: (a) pipeline expected to be long-running anyway; (b) frontend expects wait; (c) user warned if pipeline estimated >60s
- **Mask capture timing**: Masks must be captured when adding to pipeline (not at execution). Complicates UX if user wants to refine mask after adding op. Accepted: matches user mental model ("build pipeline, then execute")
- **Single-segment limitation**: Can't re-order cross-segment — must clear queue and rebuild if user changes first operation's input mode after adding segment 2

### Riesgos
- **Timeout on large pipelines**: 5+ step chains on 5MB+ images may exceed HTTP timeout (configurable per deployment; default 300s on Vercel, 60-90s on Koyeb). Mitigated by: user warning + documentación
- **Memory pressure on backend**: All intermediate results in memory simultaneously — worst case ~5 × 5MB = 25MB RAM per pipeline execution. Acceptable on Koyeb standard plan (512MB); monitor if users report OOM
- **Test coverage**: New endpoint must be thoroughly tested (both success and error paths). ADR assumes comprehensive test suite before merge

## Referencias
- [Plan file](../../.claude/plans/breezy-enchanting-zebra.md) — detailed design
- PR: [Add server-side pipeline batching endpoint](#) _(pending link)_
- Issue: [Pipeline bandwidth optimization](#) _(pending link)_
- Related: [ADR-0007: Pipeline no-destructivo](./0007-pipeline-no-destructivo-con-encadenamiento-de-pasos.md) — foundation for this feature
