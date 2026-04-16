import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';

export interface AuditEntry {
    id: number;
    user_id: number | null;
    user: { id: number; full_name: string } | null;
    operation: string;
    status: string;
    duration_ms: number | null;
    input_file_size: number | null;
    input_width: number | null;
    input_height: number | null;
    output_file_size: number | null;
    accelerator: string | null;
    parameters: Record<string, any>;
    error_message: string | null;
    task_id: string | null;
    created_at: string;
}

export interface AuditStats {
    total_operations: number;
    success_count: number;
    failure_count: number;
    avg_duration_ms: number | null;
    operations_by_type: Record<string, number>;
    operations_by_user: Array<{ user_id: number; full_name: string; count: number }>;
    operations_by_accelerator: Record<string, number>;
}

const OPERATION_LABELS: Record<string, string> = {
    REMOVE_BACKGROUND: 'Remover Fondo',
    REMOVE_OBJECTS:    'Borrar Objetos',
    ENHANCE_QUALITY:   'Mejorar Calidad',
    UPSCALE:           'Upscaling',
    HALFTONE:          'Semitonos',
    CONTOUR_CLIP:      'Recorte de Contorno',
    WATERMARK:         'Marca de Agua',
};

@Component({
    selector: 'app-bitacora',
    standalone: true,
    imports: [CommonModule, FormsModule, StatCardComponent],
    templateUrl: './bitacora.component.html',
    styleUrls: ['./bitacora.component.scss'],
    changeDetection: ChangeDetectionStrategy.Default
})
export class BitacoraComponent implements OnInit {
    private api = inject(ApiService);

    // Estado
    entries = signal<AuditEntry[]>([]);
    stats = signal<AuditStats | null>(null);
    loading = signal(false);
    loadingStats = signal(false);
    total = signal(0);
    currentPage = signal(1);
    pageSize = 20;

    // Filtros
    filterOperation = signal('');
    filterStatus = signal('');
    filterDateFrom = signal('');
    filterDateTo = signal('');
    statsDays = signal(30);

    // Opciones de filtro
    operations = Object.entries(OPERATION_LABELS).map(([value, label]) => ({ value, label }));
    statuses = [
        { value: 'SUCCESS', label: 'Exitoso' },
        { value: 'FAILED', label: 'Fallido' },
        { value: 'PENDING', label: 'Pendiente' },
    ];

    totalPages = computed(() => Math.ceil(this.total() / this.pageSize));

    ngOnInit() {
        this.loadEntries();
        this.loadStats();
    }

    loadEntries() {
        this.loading.set(true);
        const params: any = {
            page: this.currentPage(),
            page_size: this.pageSize,
        };
        if (this.filterOperation()) params['operation'] = this.filterOperation();
        if (this.filterStatus()) params['status'] = this.filterStatus();
        if (this.filterDateFrom()) params['date_from'] = this.filterDateFrom();
        if (this.filterDateTo()) params['date_to'] = this.filterDateTo();

        this.api.getProcessingAuditLog(params).subscribe({
            next: (res) => {
                this.entries.set(res.items);
                this.total.set(res.total);
                this.loading.set(false);
            },
            error: () => this.loading.set(false)
        });
    }

    loadStats() {
        this.loadingStats.set(true);
        this.api.getProcessingAuditStats(this.statsDays()).subscribe({
            next: (s) => {
                this.stats.set(s);
                this.loadingStats.set(false);
            },
            error: () => this.loadingStats.set(false)
        });
    }

    applyFilters() {
        this.currentPage.set(1);
        this.loadEntries();
    }

    clearFilters() {
        this.filterOperation.set('');
        this.filterStatus.set('');
        this.filterDateFrom.set('');
        this.filterDateTo.set('');
        this.currentPage.set(1);
        this.loadEntries();
    }

    goToPage(page: number) {
        if (page < 1 || page > this.totalPages()) return;
        this.currentPage.set(page);
        this.loadEntries();
    }

    onStatsDaysChange() {
        this.loadStats();
    }

    getOperationLabel(op: string): string {
        return OPERATION_LABELS[op] ?? op;
    }

    formatFileSize(bytes: number | null): string {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    formatDuration(ms: number | null): string {
        if (ms === null || ms === undefined) return '—';
        if (ms < 1000) return `${ms} ms`;
        return `${(ms / 1000).toFixed(1)} s`;
    }

    formatDimensions(entry: AuditEntry): string {
        if (!entry.input_width || !entry.input_height) return '—';
        return `${entry.input_width} × ${entry.input_height}`;
    }

    formatParams(params: Record<string, any>): string {
        if (!params || Object.keys(params).length === 0) return '—';
        return Object.entries(params)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
    }

    successRate(): number {
        const s = this.stats();
        if (!s || s.total_operations === 0) return 0;
        return Math.round((s.success_count / s.total_operations) * 100);
    }

    topOperations(): Array<{ label: string; count: number }> {
        const s = this.stats();
        if (!s) return [];
        return Object.entries(s.operations_by_type)
            .map(([op, count]) => ({ label: this.getOperationLabel(op), count: count as number }))
            .sort((a, b) => b.count - a.count);
    }
}
