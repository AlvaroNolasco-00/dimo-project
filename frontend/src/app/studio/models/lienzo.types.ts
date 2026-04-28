/** Screen display DPI */
export const SCREEN_DPI = 96;

/** Print export DPI — 600 for DTF shirt printing */
export const PRINT_DPI = 600;

/** Convert centimeters to pixels at given DPI */
export function cmToPx(cm: number, dpi: number = SCREEN_DPI): number {
  return Math.round(cm * dpi / 2.54);
}

/** Convert pixels to centimeters at given DPI */
export function pxToCm(px: number, dpi: number = SCREEN_DPI): number {
  return +(px * 2.54 / dpi).toFixed(2);
}

export interface LienzoSize {
  widthCm: number;
  heightCm: number;
}

export interface LienzoImage {
  id: string;
  src: string;           // objectURL
  img: HTMLImageElement;  // loaded image element for Canvas2D
  x: number;             // px position (center of image)
  y: number;
  width: number;         // rendered px
  height: number;
  rotation: number;      // degrees
  naturalWidth: number;
  naturalHeight: number;
}

export type DragHandle =
  | 'move'
  | 'nw' | 'ne' | 'sw' | 'se'
  | 'rotate';

export const DEFAULT_LIENZO_SIZE: LienzoSize = {
  widthCm: 20,
  heightCm: 20,
};
