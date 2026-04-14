import { Component, input, output, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionImage } from '../../../services/image-persistence.service';

@Component({
    selector: 'app-editor-sidebar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './editor-sidebar.component.html',
    styleUrl: './editor-sidebar.component.scss'
})
export class EditorSidebarComponent implements OnDestroy {
    galleryItems = input<SessionImage[]>([]);
    imageSelected = output<SessionImage>();
    imageDeleted = output<string>(); // emits ID

    isCollapsed = signal(false);

    private urlCache = new Map<string, string>();

    constructor() {
        effect(() => {
            const items = this.galleryItems();
            const currentIds = new Set(items.map(i => i.id));

            // Revoke URLs for removed items
            for (const [id, url] of this.urlCache) {
                if (!currentIds.has(id)) {
                    URL.revokeObjectURL(url);
                    this.urlCache.delete(id);
                }
            }

            // Create URLs for new items
            for (const item of items) {
                if (!this.urlCache.has(item.id)) {
                    this.urlCache.set(item.id, URL.createObjectURL(item.blob));
                }
            }
        });
    }

    getUrl(id: string): string | undefined {
        return this.urlCache.get(id);
    }

    ngOnDestroy() {
        for (const url of this.urlCache.values()) {
            URL.revokeObjectURL(url);
        }
        this.urlCache.clear();
    }

    toggleSidebar() {
        this.isCollapsed.update(v => !v);
    }

    onDelete(id: string, event: Event) {
        event.stopPropagation();
        this.imageDeleted.emit(id);
    }
}
