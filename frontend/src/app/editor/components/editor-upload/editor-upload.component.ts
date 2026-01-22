import { Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-editor-upload',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './editor-upload.component.html',
    styleUrl: './editor-upload.component.scss'
})
export class EditorUploadComponent {
    fileSelected = output<File>();
    isDragging = signal(false);

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.fileSelected.emit(input.files[0]);
            input.value = '';
        }
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        this.isDragging.set(false);
        if (event.dataTransfer?.files.length) {
            this.fileSelected.emit(event.dataTransfer.files[0]);
        }
    }
}
