import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionImage } from '../../../services/image-persistence.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
    selector: 'app-editor-sidebar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './editor-sidebar.component.html',
    styleUrl: './editor-sidebar.component.scss'
})
export class EditorSidebarComponent {
    galleryItems = input<SessionImage[]>([]);
    imageSelected = output<SessionImage>();
    imageDeleted = output<string>(); // emits ID

    isCollapsed = signal(false);

    constructor(private sanitizer: DomSanitizer) { }

    toggleSidebar() {
        this.isCollapsed.update(v => !v);
    }

    getSafeUrl(blob: Blob): SafeUrl {
        return this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(blob));
    }

    onDelete(id: string, event: Event) {
        event.stopPropagation();
        this.imageDeleted.emit(id);
    }
}
