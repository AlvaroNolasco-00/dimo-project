import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface Pedido {
  id: string;
  cliente: string;
  fechaEntrega: Date;
  fechaCreacion: Date;
  etapa: 'Producción' | 'Diseño' | 'Empaquetado' | 'Enviado';
  notas: string;
}

@Component({
  selector: 'app-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pedidos.component.html',
  styleUrl: './pedidos.component.scss'
})
export class PedidosComponent implements OnInit {
  pedidos: Pedido[] = [
    {
      id: 'PED-001',
      cliente: 'Empresas Polar',
      fechaEntrega: new Date('2024-06-15'),
      fechaCreacion: new Date('2024-06-01'),
      etapa: 'Producción',
      notas: 'Entrega urgente antes del mediodía'
    },
    {
      id: 'PED-002',
      cliente: 'Farmatodo',
      fechaEntrega: new Date('2024-06-12'),
      fechaCreacion: new Date('2024-05-28'),
      etapa: 'Empaquetado',
      notas: 'Incluir etiqueta promocional'
    },
    {
      id: 'PED-003',
      cliente: 'Locatel',
      fechaEntrega: new Date('2024-06-20'),
      fechaCreacion: new Date('2024-06-05'),
      etapa: 'Diseño',
      notas: 'Pendiente aprobación de boceto'
    },
    {
      id: 'PED-004',
      cliente: 'Cines Unidos',
      fechaEntrega: new Date('2024-06-18'),
      fechaCreacion: new Date('2024-06-02'),
      etapa: 'Producción',
      notas: 'Sin notas adicionales'
    },
    {
      id: 'PED-005',
      cliente: 'Banco Mercantil',
      fechaEntrega: new Date('2024-06-10'),
      fechaCreacion: new Date('2024-05-30'),
      etapa: 'Enviado',
      notas: 'Confirmar recepción con el gerente'
    }
  ];

  top3Entregas: Pedido[] = [];
  pedidosActivos: Pedido[] = [];

  ngOnInit() {
    this.processPedidos();
  }

  processPedidos() {
    // Top 3 closest deliveries
    this.top3Entregas = [...this.pedidos]
      .sort((a, b) => a.fechaEntrega.getTime() - b.fechaEntrega.getTime())
      .slice(0, 3);

    // Active orders (mock logic: all are active for now)
    this.pedidosActivos = this.pedidos;
  }
}

