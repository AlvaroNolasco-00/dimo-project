import { Component, input, model, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-editor-controls',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './editor-controls.component.html',
    styleUrl: './editor-controls.component.scss'
})
export class EditorControlsComponent {
    mode = input.required<string>();

    // Enhance params
    contrast = model(1.2);
    brightness = model(1.1);
    sharpness = model(1.3);

    // Upscale params
    upscaleFactor = model(2);
    upscaleDetailBoost = model(1.5);

    // Background removal params
    bgRemovalMode = model<'auto' | 'manual' | 'draw'>('auto');
    smartRefine = model(true);
    selectedColors = model<Array<[number, number, number]>>([]);
    colorTolerance = model(30);

    // Object removal params
    removalMethod = model<'brush' | 'magic-wand'>('brush');
    lastClickCoords = input<{ x: number, y: number } | null>(null); // Input only, set by preview interaction
    brushSize = model(20);

    // Halftone params
    dotSize = model(10);
    halftoneScale = model(1.0);
    halftoneSpacing = model(0);

    // Crop params
    cropAspectRatio = model<number>(NaN);

    // Canvas actions
    undo = output<void>();
    clearCanvas = output<void>();
    canvasHistoryLength = input(0);

    // Computed helper for template
    protected readonly isNaN = isNaN;
    protected readonly NaN = NaN;

    setAspectRatio(ratio: number) {
        this.cropAspectRatio.set(ratio);
    }

    // Color picker helper methods
    openColorPicker(input: HTMLInputElement) {
        // Hack: Set a random value briefly so that selecting black (default #000000)
        // triggers a change event.
        input.value = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        input.click();
    }

    addColorFromPicker(hexColor: string) {
        const rgb = this.hexToRgb(hexColor);
        if (rgb) {
            this.selectedColors.update(colors => [...colors, rgb]);
        }
    }

    removeColor(index: number) {
        this.selectedColors.update(colors => colors.filter((c, i) => i !== index));
    }

    hexToRgb(hex: string): [number, number, number] | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : null;
    }
}
