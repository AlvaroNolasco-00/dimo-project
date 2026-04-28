export type ToolId =
  | 'remove-bg'
  | 'remove-objects'
  | 'enhance'
  | 'upscale'
  | 'halftone'
  | 'contour-clip'
  | 'watermark'
  | 'crop'
  | 'filters'
  | 'color'
  | 'transform';

export interface ToolDef {
  id: ToolId;
  label: string;
  icon: string;
  description: string;
  hasMask: boolean;
  hasClick: boolean;
  alwaysEnabled?: boolean;
}

export const TOOLS: ToolDef[] = [
  { id: 'remove-bg',       label: 'Remove BG',      icon: 'ph-eraser',        description: 'Remove background',      hasMask: true,  hasClick: false },
  { id: 'remove-objects',  label: 'Remove Objects', icon: 'ph-magic-wand',    description: 'Erase objects',          hasMask: true,  hasClick: true  },
  { id: 'enhance',         label: 'Enhance',        icon: 'ph-sparkle',       description: 'Improve quality',        hasMask: false, hasClick: false },
  { id: 'upscale',         label: 'Upscale',        icon: 'ph-arrows-out',    description: 'Increase resolution',    hasMask: false, hasClick: false },
  { id: 'halftone',        label: 'Halftone',       icon: 'ph-circles-three', description: 'Halftone dot effect',    hasMask: false, hasClick: false },
  { id: 'contour-clip',    label: 'Contour Clip',   icon: 'ph-path',          description: 'Clip to contour shape',  hasMask: true,  hasClick: false },
  { id: 'watermark',       label: 'Watermark',      icon: 'ph-stamp',         description: 'Add watermark overlay',  hasMask: false, hasClick: true  },
  { id: 'crop',            label: 'Recorte',        icon: 'ph-crop',          description: 'Recortar imagen',        hasMask: false, hasClick: false },
  { id: 'filters',         label: 'Filtros',        icon: 'ph-palette',       description: 'Filtros y presets',      hasMask: false, hasClick: false },
  { id: 'color',           label: 'Color',          icon: 'ph-paint-brush',   description: 'Ajuste HSL',             hasMask: false, hasClick: false },
  { id: 'transform',       label: 'Transformar',    icon: 'ph-arrows-clockwise', description: 'Rotar y voltear',     hasMask: false, hasClick: false },
];

export interface HistoryEntry {
  id: string;
  blob: Blob;
  objectUrl: string;
  toolId: ToolId | 'original';
  label: string;
  timestamp: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}
