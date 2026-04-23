import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;
const POLL_INTERVALS = [5000, 8000, 12000, 15000, 20000, 25000, 30000];
const MAX_POLLS = 24;

@Injectable({ providedIn: 'root' })
export class StudioProcessingService {
  constructor(private http: HttpClient) {}

  async removeBackground(
    image: Blob,
    mode: 'auto' | 'colors' | 'draw' = 'auto',
    options: { mask?: Blob; colors?: [number, number, number][]; threshold?: number; refine?: boolean } = {}
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    if (mode === 'draw' && options.mask) {
      fd.append('mask', options.mask, 'mask.png');
      fd.append('refine', String(options.refine ?? false));
    } else if (mode === 'colors' && options.colors?.length) {
      fd.append('colors', JSON.stringify(options.colors));
      fd.append('threshold', String(options.threshold ?? 30));
    }
    return firstValueFrom(this.http.post(`${BASE}/remove-background`, fd, { responseType: 'blob' }));
  }

  async removeObjects(
    image: Blob,
    mode: 'brush' | 'magic-wand',
    options: { mask?: Blob; x?: number; y?: number; tolerance?: number }
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    if (mode === 'brush' && options.mask) {
      fd.append('mask', options.mask, 'mask.png');
    } else if (mode === 'magic-wand' && options.x != null && options.y != null) {
      fd.append('x', String(options.x));
      fd.append('y', String(options.y));
      fd.append('tolerance', String(options.tolerance ?? 30));
    }
    return firstValueFrom(this.http.post(`${BASE}/remove-objects`, fd, { responseType: 'blob' }));
  }

  async enhanceQuality(image: Blob, contrast: number, brightness: number, sharpness: number): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('contrast', String(contrast));
    fd.append('brightness', String(brightness));
    fd.append('sharpness', String(sharpness));
    return firstValueFrom(this.http.post(`${BASE}/enhance-quality`, fd, { responseType: 'blob' }));
  }

  async upscale(
    image: Blob,
    factor: number,
    detailBoost: number,
    onProgress?: (p: number) => void
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('factor', String(factor));
    fd.append('detail_boost', String(detailBoost));

    onProgress?.(10);
    const { task_id } = await firstValueFrom(
      this.http.post<{ task_id: string }>(`${BASE}/upscale`, fd)
    );

    onProgress?.(20);
    const resultUrl = await this._pollTask(task_id, onProgress);

    onProgress?.(90);
    const blob = await firstValueFrom(this.http.get(resultUrl, { responseType: 'blob' }));
    onProgress?.(100);
    return blob;
  }

  async halftone(
    image: Blob,
    dotSize: number,
    scale: number,
    spacing: number,
    threshold: number,
    colors?: [number, number, number][]
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('dot_size', String(dotSize));
    fd.append('scale', String(scale));
    fd.append('spacing', String(spacing));
    fd.append('threshold', String(threshold));
    if (colors?.length) fd.append('colors', JSON.stringify(colors));
    return firstValueFrom(this.http.post(`${BASE}/halftone`, fd, { responseType: 'blob' }));
  }

  async contourClip(
    image: Blob,
    mode: 'manual' | 'auto',
    options: {
      mask?: Blob;
      refine?: boolean;
      colors?: [number, number, number][];
      threshold?: number;
    }
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('mode', mode);
    fd.append('refine', String(options.refine ?? false));
    if (options.mask) fd.append('mask', options.mask, 'mask.png');
    if (options.colors?.length) fd.append('colors', JSON.stringify(options.colors));
    if (options.threshold != null) fd.append('threshold', String(options.threshold));
    return firstValueFrom(this.http.post(`${BASE}/contour-clip`, fd, { responseType: 'blob' }));
  }

  async watermark(
    base: Blob,
    wm: Blob,
    x: number,
    y: number,
    scale: number,
    shape: string
  ): Promise<Blob> {
    const fd = new FormData();
    fd.append('base_image', base, 'base.png');
    fd.append('watermark_image', wm, 'watermark.png');
    fd.append('x', String(x));
    fd.append('y', String(y));
    fd.append('scale', String(scale));
    fd.append('shape', shape);
    return firstValueFrom(this.http.post(`${BASE}/watermark`, fd, { responseType: 'blob' }));
  }

  async applyFilter(image: Blob, filterName: string, intensity: number): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('filter_name', filterName);
    fd.append('intensity', String(intensity));
    return firstValueFrom(this.http.post(`${BASE}/apply-filter`, fd, { responseType: 'blob' }));
  }

  async colorCorrect(image: Blob, hue: number, saturation: number, lightness: number): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('hue', String(hue));
    fd.append('saturation', String(saturation));
    fd.append('lightness', String(lightness));
    return firstValueFrom(this.http.post(`${BASE}/color-correct`, fd, { responseType: 'blob' }));
  }

  async transform(image: Blob, rotation: number, flipH: boolean, flipV: boolean): Promise<Blob> {
    const fd = new FormData();
    fd.append('image', image, 'image.png');
    fd.append('rotation', String(rotation));
    fd.append('flip_h', String(flipH));
    fd.append('flip_v', String(flipV));
    return firstValueFrom(this.http.post(`${BASE}/transform`, fd, { responseType: 'blob' }));
  }

  private async _pollTask(taskId: string, onProgress?: (p: number) => void): Promise<string> {
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVALS[Math.min(i, POLL_INTERVALS.length - 1)]));

      const task = await firstValueFrom(
        this.http.get<{ id: string; status: string; result_url?: string }>(`${BASE}/processing/tasks/${taskId}`)
      );

      const progress = 20 + Math.min(60, (i / MAX_POLLS) * 60);
      onProgress?.(Math.round(progress));

      if (task.status === 'COMPLETED' && task.result_url) {
        const url = task.result_url.startsWith('http') ? task.result_url : `${environment.apiUrl.replace('/api', '')}${task.result_url}`;
        return url;
      }
      if (task.status === 'FAILED') throw new Error('Upscale task failed on server');
    }
    throw new Error('Upscale timed out');
  }
}
