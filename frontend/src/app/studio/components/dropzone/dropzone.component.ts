import { Component, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-studio-dropzone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="dropzone"
      [class.drag-over]="dragging"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging = false"
      (drop)="onDrop($event)"
      (click)="fileInput.click()"
    >
      <i class="ph-fill ph-image-square"></i>
      <p class="title">Drop image here</p>
      <p class="sub">or click to browse · PNG, JPG, WEBP</p>
      <input #fileInput type="file" accept="image/*" (change)="onFile($event)" />
    </div>
  `,
  styles: [`
    :host { display: flex; align-items: center; justify-content: center; height: 100%; }

    .dropzone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: min(480px, 90%);
      aspect-ratio: 4/3;
      border: 2px dashed var(--border-color);
      border-radius: var(--radius);
      background: var(--card-bg);
      cursor: pointer;
      transition: border-color var(--transition), background var(--transition);

      &:hover, &.drag-over {
        border-color: var(--accent-color);
        background: rgba(var(--accent-rgb), 0.04);
      }

      i { font-size: 48px; color: var(--text-secondary); }

      .title { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-primary); }
      .sub   { margin: 0; font-size: 13px; color: var(--text-secondary); }

      input { display: none; }
    }
  `]
})
export class DropzoneComponent {
  readonly fileSelected = output<File>();
  dragging = false;

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragging = true;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) this.fileSelected.emit(file);
  }

  onFile(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.fileSelected.emit(file);
  }
}
