import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-detalle-pedido',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalle-pedido.component.html',
  styleUrl: './detalle-pedido.component.scss'
})
export class DetallePedidoComponent {
  constructor(private route: ActivatedRoute) {
    this.route.params.subscribe(params => {
      // Aquí puedes obtener el ID del pedido desde params['id']
    });
  }
}

