import {
  Component, inject, signal, computed,
  ViewChild, ChangeDetectionStrategy, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { StudioStateService } from '../services/studio-state.service';
import { StudioHistoryService } from '../services/studio-history.service';
import { ToolId, TOOLS } from '../models/tool.types';

import { TopBarComponent } from '../components/top-bar/top-bar.component';
import { ToolSidebarComponent } from '../components/tool-sidebar/tool-sidebar.component';
import { CanvasViewportComponent } from '../components/canvas-viewport/canvas-viewport.component';
import { HistoryStripComponent } from '../components/history-strip/history-strip.component';
import { DropzoneComponent } from '../components/dropzone/dropzone.component';

import { RemoveBgToolComponent } from '../tools/remove-bg-tool/remove-bg-tool.component';
import { RemoveObjectsToolComponent } from '../tools/remove-objects-tool/remove-objects-tool.component';
import { EnhanceToolComponent } from '../tools/enhance-tool/enhance-tool.component';
import { UpscaleToolComponent } from '../tools/upscale-tool/upscale-tool.component';
import { HalftoneToolComponent } from '../tools/halftone-tool/halftone-tool.component';
import { ContourClipToolComponent } from '../tools/contour-clip-tool/contour-clip-tool.component';
import { WatermarkToolComponent } from '../tools/watermark-tool/watermark-tool.component';

@Component({
  selector: 'app-studio-shell',
  standalone: true,
  imports: [
    CommonModule,
    TopBarComponent, ToolSidebarComponent, CanvasViewportComponent,
    HistoryStripComponent, DropzoneComponent,
    RemoveBgToolComponent, RemoveObjectsToolComponent,
    EnhanceToolComponent, UpscaleToolComponent,
    HalftoneToolComponent, ContourClipToolComponent, WatermarkToolComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './studio-shell.component.html',
  styleUrl: './studio-shell.component.scss',
})
export class StudioShellComponent {
  readonly state = inject(StudioStateService);
  readonly history = inject(StudioHistoryService);

  @ViewChild(RemoveBgToolComponent) removeBgTool?: RemoveBgToolComponent;
  @ViewChild(HalftoneToolComponent) halftoneTool?: HalftoneToolComponent;
  @ViewChild(ContourClipToolComponent) contourTool?: ContourClipToolComponent;
  @ViewChild(WatermarkToolComponent) wmTool?: WatermarkToolComponent;
  @ViewChild(CanvasViewportComponent) viewport?: CanvasViewportComponent;

  readonly activeTool = this.state.activeToolId;

  readonly maskActive = computed(() => {
    const t = this.activeTool();
    if (!t) return false;
    const def = TOOLS.find(d => d.id === t);
    if (!def?.hasMask) return false;
    // Only show mask overlay for paint/draw modes
    if (t === 'remove-objects') return true;
    if (t === 'remove-bg' || t === 'contour-clip') return true;
    return false;
  });

  readonly clickMode = computed(() => {
    const t = this.activeTool();
    return t === 'remove-objects' || t === 'watermark';
  });

  readonly eyedropMode = computed(() => {
    const t = this.activeTool();
    return t === 'remove-bg' || t === 'halftone' || t === 'contour-clip';
  });

  onFileSelected(file: File): void {
    this.state.loadImage(file);
  }

  onToolSelect(id: ToolId): void {
    this.state.setTool(id);
    this.viewport?.clearDot();
  }

  onImageClick(pt: { x: number; y: number }): void {
    const t = this.activeTool();

    if (t === 'remove-objects' || t === 'watermark') {
      this.state.setCanvasClick(pt);
      return;
    }

    // Eyedrop: sample pixel from image
    if (t === 'remove-bg' || t === 'halftone' || t === 'contour-clip') {
      this._sampleColor(pt.x, pt.y);
    }
  }

  private _sampleColor(imgX: number, imgY: number): void {
    const url = this.state.currentUrl();
    if (!url) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = ctx.getImageData(imgX, imgY, 1, 1).data;
      this._dispatchColor(r, g, b);
    };
    img.src = url;
  }

  private _dispatchColor(r: number, g: number, b: number): void {
    const t = this.activeTool();
    if (t === 'remove-bg') this.removeBgTool?.addColorFromClick(r, g, b);
    if (t === 'halftone') this.halftoneTool?.addColor(r, g, b);
    if (t === 'contour-clip') this.contourTool?.addColor(r, g, b);
  }

  onMaskChange(mask: Blob): void {
    this.state.setMask(mask);
  }

  onUndo(): void { this.history.undo(); }
  onRedo(): void { this.history.redo(); }
  onReset(): void { this.state.reset(); }
  onDownload(): void { this.state.download(); }
  onHistoryJump(i: number): void { this.history.jumpTo(i); }
}
