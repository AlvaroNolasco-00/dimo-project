import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../services/api.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-coupons',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './coupons.component.html',
  styleUrl: './coupons.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CouponsComponent implements OnInit {
  coupons = signal<any[]>([]);
  projectId = signal<number>(1);
  loading = signal<boolean>(true);
  showModal = signal<boolean>(false);
  showHistoryModal = signal<boolean>(false);
  editingCoupon = signal<any | null>(null);
  couponHistory = signal<any[]>([]);
  loadingHistory = signal<boolean>(false);
  showStatsModal = signal<boolean>(false);
  statistics = signal<any>(null);
  loadingStats = signal<boolean>(false);


  newCouponState = {
    code: '',
    discount_type: 'FIXED',
    discount_value: null as number | null,
    min_purchase_amount: null as number | null,
    single_use: false,
    change_reason: ''
  };

  constructor(private api: ApiService) { }

  ngOnInit() {
    const stored = localStorage.getItem('currentProjectId');
    if (stored) this.projectId.set(parseInt(stored, 10));
    this.loadCoupons();
  }

  loadCoupons() {
    this.loading.set(true);
    this.api.getCoupons(this.projectId()).subscribe({
      next: (data) => {
        this.coupons.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  openModal(coupon?: any) {
    if (coupon) {
      this.editingCoupon.set(coupon);
      this.newCouponState = {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_purchase_amount: coupon.min_purchase_amount,
        single_use: coupon.single_use,
        change_reason: ''
      };
    } else {
      this.editingCoupon.set(null);
      this.newCouponState = {
        code: '',
        discount_type: 'FIXED',
        discount_value: null,
        min_purchase_amount: null,
        single_use: false,
        change_reason: ''
      };
    }
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingCoupon.set(null);
  }

  saveCoupon() {
    if (!this.newCouponState.code || !this.newCouponState.discount_value) return;

    const couponData: any = {
      code: this.newCouponState.code.toUpperCase(),
      discount_type: this.newCouponState.discount_type,
      discount_value: this.newCouponState.discount_value,
      min_purchase_amount: this.newCouponState.min_purchase_amount || 0,
      single_use: this.newCouponState.single_use,
      project_id: this.projectId(),
      is_active: true
    };

    if (this.editingCoupon()) {
      couponData.change_reason = this.newCouponState.change_reason;
      this.api.updateCoupon(this.projectId(), this.editingCoupon().id, couponData).subscribe({
        next: () => {
          Swal.fire({
            title: 'Actualizado',
            text: 'Cupón actualizado correctamente',
            icon: 'success',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
          });
          this.closeModal();
          this.loadCoupons();
        }
      });
    } else {
      this.api.createCoupon(this.projectId(), couponData).subscribe({
        next: () => {
          Swal.fire({
            title: 'Creado',
            text: 'Cupón creado correctamente',
            icon: 'success',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
          });
          this.closeModal();
          this.loadCoupons();
        }
      });
    }
  }

  openHistory(coupon: any) {
    this.editingCoupon.set(coupon);
    this.loadingHistory.set(true);
    this.showHistoryModal.set(true);
    this.api.getCouponHistory(this.projectId(), coupon.id).subscribe({
      next: (data) => {
        this.couponHistory.set(data);
        this.loadingHistory.set(false);
      },
      error: () => this.loadingHistory.set(false)
    });
  }

  closeHistoryModal() {
    this.showHistoryModal.set(false);
    this.editingCoupon.set(null);
  }

  revertTo(historyItem: any) {
    Swal.fire({
      title: '¿Revertir cambios?',
      text: `Se restaurará el cupón al estado anterior.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, revertir',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--primary-color)',
      cancelButtonColor: 'var(--danger-color)'
    }).then((result) => {
      if (result.isConfirmed) {
        this.api.revertCoupon(this.projectId(), historyItem.coupon_id, historyItem.id).subscribe({
          next: () => {
            Swal.fire('Restaurado', 'Cupón restaurado con éxito', 'success');
            this.showHistoryModal.set(false);
            this.loadCoupons();
          }
        });
      }
    });
  }

  toggleCouponStatus(coupon: any) {
    const newStatus = !coupon.is_active;
    this.api.updateCoupon(this.projectId(), coupon.id, { is_active: newStatus, change_reason: newStatus ? 'Activación manual' : 'Desactivación manual' }).subscribe({
      next: (updated) => {
        this.coupons.update(list => list.map(c => c.id === updated.id ? updated : c));
        Swal.fire({
          title: newStatus ? 'Activado' : 'Desactivado',
          text: `Cupón ${coupon.code} ${newStatus ? 'activado' : 'desactivado'} correctamente`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      },
      error: () => {
        Swal.fire('Error', 'No se pudo actualizar el estado del cupón', 'error');
      }
    });
  }

  openStats() {
    this.loadingStats.set(true);
    this.showStatsModal.set(true);
    this.api.getCouponStatistics(this.projectId()).subscribe({
      next: (data) => {
        this.statistics.set(data);
        this.loadingStats.set(false);
      },
      error: () => this.loadingStats.set(false)
    });
  }

  closeStatsModal() {
    this.showStatsModal.set(false);
    this.statistics.set(null);
  }

  checkDetection() {

    console.log('Change detection triggered in CouponsComponent');
    return true;
  }
}
