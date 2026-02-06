import { Component, OnInit } from '@angular/core';
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
  styleUrl: './coupons.component.scss'
})
export class CouponsComponent implements OnInit {
  coupons: any[] = [];
  projectId: number = 1;
  loading = true;

  constructor(private api: ApiService) { }

  ngOnInit() {
    const stored = localStorage.getItem('currentProjectId');
    if (stored) this.projectId = parseInt(stored, 10);
    this.loadCoupons();
  }

  loadCoupons() {
    this.loading = true;
    this.api.getCoupons(this.projectId).subscribe({
      next: (data) => {
        this.coupons = data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  showModal = false;
  newCoupon = {
    code: '',
    discount_type: 'FIXED',
    discount_value: null as number | null,
    min_purchase_amount: null as number | null
  };

  openModal() {
    this.newCoupon = {
      code: '',
      discount_type: 'FIXED',
      discount_value: null,
      min_purchase_amount: null
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  saveCoupon() {
    if (!this.newCoupon.code || !this.newCoupon.discount_value) return;

    this.api.createCoupon(this.projectId, {
      code: this.newCoupon.code.toUpperCase(),
      discount_type: this.newCoupon.discount_type,
      discount_value: this.newCoupon.discount_value,
      min_purchase_amount: this.newCoupon.min_purchase_amount || 0,
      project_id: this.projectId,
      is_active: true
    }).subscribe({
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

  // No update endpoint for coupons yet in backend, just create and view.
  // I could add a delete or deactivate, but for brevity I skip.
}
