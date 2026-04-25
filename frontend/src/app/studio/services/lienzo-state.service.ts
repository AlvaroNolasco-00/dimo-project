import { Injectable, signal, computed } from '@angular/core';
import {
  LienzoSize, LienzoImage, DEFAULT_LIENZO_SIZE,
  cmToPx, SCREEN_DPI, PRINT_DPI,
} from '../models/lienzo.types';

@Injectable({ providedIn: 'root' })
export class LienzoStateService {
  private _size = signal<LienzoSize>({ ...DEFAULT_LIENZO_SIZE });
  private _images = signal<LienzoImage[]>([]);
  private _selectedId = signal<string | null>(null);
  private _editBgColor = signal<string>('#ffffff');

  readonly size = this._size.asReadonly();
  readonly images = this._images.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly editBgColor = this._editBgColor.asReadonly();

  setEditBgColor(color: string): void {
    this._editBgColor.set(color);
  }

  readonly canvasPx = computed(() => {
    const s = this._size();
    return { w: cmToPx(s.widthCm), h: cmToPx(s.heightCm) };
  });

  readonly selectedImage = computed(() => {
    const id = this._selectedId();
    if (!id) return null;
    return this._images().find(i => i.id === id) ?? null;
  });

  readonly hasImages = computed(() => this._images().length > 0);

  // ─── Size ─────────────────────────────────────────────
  setSize(widthCm: number, heightCm: number): void {
    widthCm = Math.max(1, widthCm);
    heightCm = Math.max(1, heightCm);
    this._size.set({ widthCm, heightCm });
    this._pruneOutOfBounds();
  }

  // ─── Images ───────────────────────────────────────────
  async addImage(file: File): Promise<void> {
    const src = URL.createObjectURL(file);
    const img = await this._loadImg(src);
    const canvas = this.canvasPx();

    // Fit image to 60% of canvas if larger
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const maxW = canvas.w * 0.6;
    const maxH = canvas.h * 0.6;
    if (w > maxW || h > maxH) {
      const scale = Math.min(maxW / w, maxH / h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const entry: LienzoImage = {
      id: crypto.randomUUID(),
      src,
      img,
      x: canvas.w / 2,
      y: canvas.h / 2,
      width: w,
      height: h,
      rotation: 0,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };

    this._images.update(list => [...list, entry]);
    this._selectedId.set(entry.id);
  }

  selectImage(id: string | null): void {
    this._selectedId.set(id);
  }

  deselectAll(): void {
    this._selectedId.set(null);
  }

  updateImage(id: string, partial: Partial<Pick<LienzoImage, 'x' | 'y' | 'width' | 'height' | 'rotation'>>): void {
    this._images.update(list =>
      list.map(img => img.id === id ? { ...img, ...partial } : img)
    );
  }

  removeImage(id: string): void {
    const img = this._images().find(i => i.id === id);
    if (img) URL.revokeObjectURL(img.src);
    this._images.update(list => list.filter(i => i.id !== id));
    if (this._selectedId() === id) this._selectedId.set(null);
  }

  deleteSelected(): void {
    const id = this._selectedId();
    if (id) this.removeImage(id);
  }

  /** Move image forward/backward in z-order */
  reorder(id: string, direction: 'up' | 'down'): void {
    this._images.update(list => {
      const idx = list.findIndex(i => i.id === id);
      if (idx < 0) return list;
      const target = direction === 'up' ? idx + 1 : idx - 1;
      if (target < 0 || target >= list.length) return list;
      const copy = [...list];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  }

  // ─── Export ───────────────────────────────────────────
  exportPng(): void {
    const { widthCm, heightCm } = this._size();
    const w = cmToPx(widthCm, PRINT_DPI);
    const h = cmToPx(heightCm, PRINT_DPI);
    const scale = PRINT_DPI / SCREEN_DPI;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Draw all images scaled to print DPI
    for (const img of this._images()) {
      ctx.save();
      ctx.translate(img.x * scale, img.y * scale);
      ctx.rotate((img.rotation * Math.PI) / 180);
      ctx.drawImage(
        img.img,
        (-img.width / 2) * scale,
        (-img.height / 2) * scale,
        img.width * scale,
        img.height * scale,
      );
      ctx.restore();
    }

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lienzo-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  /** Reset all state */
  reset(): void {
    for (const img of this._images()) URL.revokeObjectURL(img.src);
    this._images.set([]);
    this._selectedId.set(null);
    this._size.set({ ...DEFAULT_LIENZO_SIZE });
    this._editBgColor.set('#ffffff');
  }

  // ─── Private ──────────────────────────────────────────
  private _pruneOutOfBounds(): void {
    const { w, h } = this.canvasPx();
    this._images.update(list => {
      const kept: LienzoImage[] = [];
      for (const img of list) {
        // Bounding box check: image center ± half dimensions (ignoring rotation for simplicity)
        const halfW = img.width / 2;
        const halfH = img.height / 2;
        const left = img.x - halfW;
        const top = img.y - halfH;
        const right = img.x + halfW;
        const bottom = img.y + halfH;

        // Keep if any part of bounding box intersects canvas
        if (right > 0 && left < w && bottom > 0 && top < h) {
          kept.push(img);
        } else {
          URL.revokeObjectURL(img.src);
          if (this._selectedId() === img.id) this._selectedId.set(null);
        }
      }
      return kept;
    });
  }

  private _loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
}
