# ADR-0016: Image input/output statistics visualization

## Metadata
- **Status**: accepted
- **Date**: 2026-04-17
- **Deciders**: Alvaro Nolasco
- **Scope**: frontend

## Contexto

Users process images in the editor but lack visibility into:
1. **File size impact**: Input image weight vs output image weight after processing
2. **Pixel dimension changes**: Especially critical for upscale operations where resolution multiplies (2x, 4x, etc.)

Example: User upscales 2MB 800×600px image → output 8MB 1600×1200px. No feedback on dimensions or size cost.

This information is valuable for:
- Understanding bandwidth/storage impact
- Validating upscale operations (visually confirming resolution increased)
- Troubleshooting (detecting unexpectedly large output files)
- User experience (confirming operation success)

## Decisión

Implement **image statistics display bar** that:
1. Shows input file size (bytes → human-readable: KB, MB)
2. Shows output file size after processing (only if output exists)
3. Shows pixel dimensions (width × height) for upscale operations
   - Input dimensions: loaded on file upload
   - Output dimensions: loaded after upscale processing completes

**Architecture:**
- **Frontend signals** (Angular):
  - `inputDimensions: { width, height } | null` — loaded async on file upload
  - `outputFileSize: number | null` — set after process() or pipeline execution
  - `outputDimensions: { width, height } | null` — loaded async for upscale outputs
  
- **UI component** (stats bar):
  - Appears between editor preview and controls
  - Shows: "Entrada: 2.5 MB · 800 × 600 px → Salida: 8.1 MB · 1600 × 1200 px"
  - Compact design, mobile-responsive
  - Pixel dims only shown when relevant (upscale mode or upscale operation in pipeline)

- **State management**:
  - Reset stats on file upload (`handleFile()`)
  - Capture output file size after `process()` and `executePipeline()`
  - Load dimensions async via `Image` element (native browser API, no dependencies)
  - Update stats on pipeline step selection (`selectPipelineStep()`)
  - Reset stats when using step as new base image (`useStepAsSource()`)

## Alternativas Consideradas

### Alternativa 1: Server-side metadata endpoint
- **Pros**: Accurate dimensions without loading image in browser
- **Contras**: Extra HTTP request per result; latency; API complexity
- **Rejected**: Native `Image` element is instant (cached), no network overhead

### Alternativa 2: Display only file size (skip dimensions)
- **Pros**: Simpler implementation; fewer signals
- **Contras**: Incomplete UX; doesn't show upscale impact; miss valuable user feedback
- **Rejected**: Dimensions critical for upscale validation

### Alternativa 3: Always show dimensions for all operations
- **Pros**: Consistent UX across modes
- **Contras**: Dimensions meaningless for non-upscale ops (same size input/output); visual clutter
- **Rejected**: Only show when relevant (upscale mode or pipeline upscale step)

## Consecuencias

### Positivas
- **Transparency**: Users see concrete impact of processing (size/resolution before/after)
- **Validation**: Upscale users confirm resolution actually increased
- **UX improvement**: Feedback on operation success/impact without opening file properties
- **Simple implementation**: Uses native `Image` API + Angular signals, no external dependencies
- **No performance cost**: Image dimension loading is async, doesn't block UI
- **Pipeline support**: Works for both single operations and multi-step pipelines

### Negativas
- **Additional state**: 3 new signals in editor component (minor code complexity)
- **Async dimension loading**: Race condition possible if user rapidly switches operations (mitigated: last promise wins, overwrite old values)
- **Mobile UX**: Stats bar wraps on narrow screens (accepted: trade for responsive design)

### Riesgos
- **Incorrect dimensions if image URL is invalid**: Mitigated by Promise-based load that silently resolves on error
- **CORS issues**: If output image URLs are cross-origin, browser blocks Image load. Mitigated: all images are same-origin Blob URLs
- **Bandwidth of image re-load**: Loading dimensions via Image element doesn't re-download (cached by browser); negligible cost

## Referencias
- Feature commit: [Implement image stats visualization](#)
- Related: [ADR-0014: Suggested filename with timestamp](./0014-nombre-sugerido-descargas-con-timestamp.md) — also tracks file metadata
- Related: [ADR-0015: Pipeline batch server-side chaining](./0015-pipeline-batch-server-side-chaining.md) — pipeline results need stats tracking
