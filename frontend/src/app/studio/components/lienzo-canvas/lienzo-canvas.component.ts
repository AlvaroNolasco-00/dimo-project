import {
  Component, ElementRef, ViewChild, inject, effect,
  ChangeDetectionStrategy, OnDestroy, HostListener,
  afterNextRender,
} from '@angular/core';
import { LienzoStateService } from '../../services/lienzo-state.service';
import { LienzoImage, DragHandle } from '../../models/lienzo.types';

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 28;

interface Drag {
  handle: DragHandle;
  imageId: string;
  startMouseX: number;
  startMouseY: number;
  startImgX: number;
  startImgY: number;
  startWidth: number;
  startHeight: number;
  startRotation: number;
  aspect: number;
}

@Component({
  selector: 'app-lienzo-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #cv></canvas>`,
  styles: [`
    :host {
      display: flex;
      flex: 1;
      overflow: hidden;
      background: #1a1a2e;
      cursor: default;
      user-select: none;
      position: relative;
    }
    canvas {
      position: absolute;
      top: 0; left: 0;
    }
  `],
})
export class LienzoCanvasComponent implements OnDestroy {
  @ViewChild('cv', { static: true }) cvRef!: ElementRef<HTMLCanvasElement>;

  private state = inject(LienzoStateService);
  private el = inject(ElementRef);

  // viewport pan/zoom
  private panX = 0;
  private panY = 0;
  private zoom = 1;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private spaceDown = false;

  private drag: Drag | null = null;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private hostW = 0;
  private hostH = 0;

  constructor() {
    afterNextRender(() => {
      this._setupResize();
      this._fitToView();
      this._render();
    });

    // Re-render whenever state changes
    effect(() => {
      // Read all reactive deps
      this.state.images();
      this.state.canvasPx();
      this.state.selectedId();
      this.state.editBgColor();
      this._scheduleRender();
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
  }

  // ─── Resize Observer ─────────────────────────────────
  private _setupResize(): void {
    const host = this.el.nativeElement as HTMLElement;
    this.resizeObserver = new ResizeObserver(entries => {
      const e = entries[0];
      this.hostW = e.contentRect.width;
      this.hostH = e.contentRect.height;
      const cv = this.cvRef.nativeElement;
      const dpr = window.devicePixelRatio || 1;
      cv.width = this.hostW * dpr;
      cv.height = this.hostH * dpr;
      cv.style.width = `${this.hostW}px`;
      cv.style.height = `${this.hostH}px`;
      this._scheduleRender();
    });
    this.resizeObserver.observe(host);
  }

  // ─── Fit to View ─────────────────────────────────────
  private _fitToView(): void {
    const { w, h } = this.state.canvasPx();
    const host = this.el.nativeElement as HTMLElement;
    this.hostW = host.clientWidth || 800;
    this.hostH = host.clientHeight || 600;
    const padding = 60;
    const scaleX = (this.hostW - padding * 2) / w;
    const scaleY = (this.hostH - padding * 2) / h;
    this.zoom = Math.min(scaleX, scaleY, 2);
    this.panX = (this.hostW - w * this.zoom) / 2;
    this.panY = (this.hostH - h * this.zoom) / 2;
  }

  fitToView(): void {
    this._fitToView();
    this._scheduleRender();
  }

  // ─── Rendering ───────────────────────────────────────
  private _needsRender = false;

  private _scheduleRender(): void {
    if (this._needsRender) return;
    this._needsRender = true;
    this.rafId = requestAnimationFrame(() => {
      this._needsRender = false;
      this._render();
    });
  }

  private _render(): void {
    const cv = this.cvRef.nativeElement;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.hostW, this.hostH);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.hostW, this.hostH);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const { w, h } = this.state.canvasPx();

    // Canvas shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 24 / this.zoom;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4 / this.zoom;

    // Canvas background (edit-only, not exported)
    ctx.fillStyle = this.state.editBgColor();
    ctx.fillRect(0, 0, w, h);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Clip images to canvas bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // Draw images
    const images = this.state.images();
    for (const img of images) {
      ctx.save();
      ctx.translate(img.x, img.y);
      ctx.rotate((img.rotation * Math.PI) / 180);
      ctx.drawImage(img.img, -img.width / 2, -img.height / 2, img.width, img.height);
      ctx.restore();
    }

    ctx.restore(); // unclip

    // Selection UI
    const selId = this.state.selectedId();
    const selImg = selId ? images.find(i => i.id === selId) : null;
    if (selImg) {
      this._drawSelection(ctx, selImg);
    }

    // Canvas border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.strokeRect(0, 0, w, h);

    // Dimension labels
    this._drawDimensionLabels(ctx, w, h);

    ctx.restore(); // pan/zoom
  }

  private _drawSelection(ctx: CanvasRenderingContext2D, img: LienzoImage): void {
    const hs = HANDLE_SIZE / this.zoom;

    ctx.save();
    ctx.translate(img.x, img.y);
    ctx.rotate((img.rotation * Math.PI) / 180);

    const hw = img.width / 2;
    const hh = img.height / 2;

    // Dashed bounding box
    ctx.strokeStyle = '#4d7cfe';
    ctx.lineWidth = 1.5 / this.zoom;
    ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
    ctx.strokeRect(-hw, -hh, img.width, img.height);
    ctx.setLineDash([]);

    // Corner handles
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4d7cfe';
    ctx.lineWidth = 1.5 / this.zoom;
    const corners = [
      { x: -hw, y: -hh }, // nw
      { x: hw, y: -hh },  // ne
      { x: -hw, y: hh },  // sw
      { x: hw, y: hh },   // se
    ];
    for (const c of corners) {
      ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
      ctx.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
    }

    // Rotation handle
    const rotY = -hh - ROTATE_OFFSET / this.zoom;
    // Line from top-center to rotation handle
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(0, rotY);
    ctx.strokeStyle = '#4d7cfe';
    ctx.lineWidth = 1.2 / this.zoom;
    ctx.stroke();

    // Rotation circle
    ctx.beginPath();
    ctx.arc(0, rotY, (hs * 0.8), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#4d7cfe';
    ctx.lineWidth = 1.5 / this.zoom;
    ctx.stroke();

    ctx.restore();
  }

  private _drawDimensionLabels(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const size = this.state.size();
    const fontSize = 11 / this.zoom;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';

    // Bottom label (width)
    ctx.fillText(`${size.widthCm} cm`, w / 2, h + 18 / this.zoom);

    // Right label (height)
    ctx.save();
    ctx.translate(w + 18 / this.zoom, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`${size.heightCm} cm`, 0, 0);
    ctx.restore();
  }

  // ─── Mouse → Canvas coords ──────────────────────────
  private _toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.cvRef.nativeElement.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    return {
      x: (mx - this.panX) / this.zoom,
      y: (my - this.panY) / this.zoom,
    };
  }

  // ─── Hit Testing ─────────────────────────────────────
  private _hitTestHandles(cx: number, cy: number, img: LienzoImage): DragHandle | null {
    // Transform point into image-local coords
    const dx = cx - img.x;
    const dy = cy - img.y;
    const rad = -(img.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

    const hw = img.width / 2;
    const hh = img.height / 2;
    const hs = (HANDLE_SIZE + 4) / this.zoom;

    // Rotation handle
    const rotY = -hh - ROTATE_OFFSET / this.zoom;
    if (Math.abs(lx) < hs && Math.abs(ly - rotY) < hs) return 'rotate';

    // Corner handles
    if (Math.abs(lx + hw) < hs && Math.abs(ly + hh) < hs) return 'nw';
    if (Math.abs(lx - hw) < hs && Math.abs(ly + hh) < hs) return 'ne';
    if (Math.abs(lx + hw) < hs && Math.abs(ly - hh) < hs) return 'sw';
    if (Math.abs(lx - hw) < hs && Math.abs(ly - hh) < hs) return 'se';

    // Body
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return 'move';

    return null;
  }

  private _hitTestImages(cx: number, cy: number): { id: string; handle: DragHandle } | null {
    // Check selected image handles first
    const selImg = this.state.selectedImage();
    if (selImg) {
      const h = this._hitTestHandles(cx, cy, selImg);
      if (h) return { id: selImg.id, handle: h };
    }

    // Then check all images in reverse z-order
    const images = this.state.images();
    for (let i = images.length - 1; i >= 0; i--) {
      const img = images[i];
      const h = this._hitTestHandles(cx, cy, img);
      if (h === 'move') return { id: img.id, handle: 'move' };
    }

    return null;
  }

  // ─── Pointer Events ──────────────────────────────────
  @HostListener('pointerdown', ['$event'])
  onPointerDown(e: PointerEvent): void {
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      // Pan
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartPanX = this.panX;
      this.panStartPanY = this.panY;
      (this.el.nativeElement as HTMLElement).style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const { x, y } = this._toCanvas(e.clientX, e.clientY);
    const hit = this._hitTestImages(x, y);

    if (hit) {
      this.state.selectImage(hit.id);
      const img = this.state.images().find(i => i.id === hit.id)!;
      this.drag = {
        handle: hit.handle,
        imageId: hit.id,
        startMouseX: x,
        startMouseY: y,
        startImgX: img.x,
        startImgY: img.y,
        startWidth: img.width,
        startHeight: img.height,
        startRotation: img.rotation,
        aspect: img.naturalWidth / img.naturalHeight,
      };
      this._updateCursor(hit.handle);
    } else {
      this.state.deselectAll();
    }

    this._scheduleRender();
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(e: PointerEvent): void {
    if (this.isPanning) {
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this._scheduleRender();
      return;
    }

    if (!this.drag) {
      // Update cursor on hover
      const { x, y } = this._toCanvas(e.clientX, e.clientY);
      const hit = this._hitTestImages(x, y);
      this._updateCursor(hit?.handle ?? null);
      return;
    }

    const { x, y } = this._toCanvas(e.clientX, e.clientY);
    const d = this.drag;

    switch (d.handle) {
      case 'move': {
        const dx = x - d.startMouseX;
        const dy = y - d.startMouseY;
        this.state.updateImage(d.imageId, {
          x: d.startImgX + dx,
          y: d.startImgY + dy,
        });
        break;
      }
      case 'nw':
      case 'ne':
      case 'sw':
      case 'se': {
        this._handleResize(d, x, y);
        break;
      }
      case 'rotate': {
        const img = this.state.images().find(i => i.id === d.imageId);
        if (!img) break;
        const angle = Math.atan2(y - img.y, x - img.x) * (180 / Math.PI) + 90;
        this.state.updateImage(d.imageId, { rotation: angle });
        break;
      }
    }

    this._scheduleRender();
  }

  @HostListener('pointerup')
  onPointerUp(): void {
    this.drag = null;
    if (this.isPanning) {
      this.isPanning = false;
      (this.el.nativeElement as HTMLElement).style.cursor = '';
    }
  }

  // ─── Resize Logic ────────────────────────────────────
  private _handleResize(d: Drag, mx: number, my: number): void {
    const img = this.state.images().find(i => i.id === d.imageId);
    if (!img) return;

    // Get mouse position in image-local space
    const dx = mx - d.startImgX;
    const dy = my - d.startImgY;
    const rad = -(d.startRotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);

    let newW = d.startWidth;
    let newH = d.startHeight;

    // Distance from center to corner in local coords
    newW = Math.max(20, Math.abs(lx) * 2);
    newH = newW / d.aspect;

    // Enforce minimum
    if (newH < 20) {
      newH = 20;
      newW = newH * d.aspect;
    }

    this.state.updateImage(d.imageId, { width: newW, height: newH });
  }

  // ─── Wheel zoom ──────────────────────────────────────
  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.cvRef.nativeElement.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newZoom = Math.min(Math.max(this.zoom * factor, 0.1), 10);

    // Zoom towards mouse position
    this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
    this.panY = my - (my - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this._scheduleRender();
  }

  // ─── Keyboard ────────────────────────────────────────
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spaceDown = true;
      (this.el.nativeElement as HTMLElement).style.cursor = 'grab';
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedId()) {
      // Don't delete if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      this.state.deleteSelected();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.spaceDown = false;
      (this.el.nativeElement as HTMLElement).style.cursor = '';
    }
  }

  // ─── Cursor ──────────────────────────────────────────
  private _updateCursor(handle: DragHandle | null): void {
    const host = this.el.nativeElement as HTMLElement;
    switch (handle) {
      case 'move': host.style.cursor = 'move'; break;
      case 'nw': case 'se': host.style.cursor = 'nwse-resize'; break;
      case 'ne': case 'sw': host.style.cursor = 'nesw-resize'; break;
      case 'rotate': host.style.cursor = 'grab'; break;
      default: host.style.cursor = this.spaceDown ? 'grab' : ''; break;
    }
  }
}
