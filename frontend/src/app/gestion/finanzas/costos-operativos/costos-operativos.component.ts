import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CamisaCost {
  talla: string;
  material: string;
  tipo: string;
  infoAdicional: string;
  costo: number;
}

export interface EstampadoCost {
  posicion: string;
  tamano: string;
  costo: number;
}

@Component({
  selector: 'app-costos-operativos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './costos-operativos.component.html',
  styleUrl: './costos-operativos.component.scss'
})

export class CostosOperativosComponent {
  camisas: CamisaCost[] = [
    { talla: 'S', material: 'Algodón', tipo: 'Cuello Redondo', infoAdicional: 'Tela nacional', costo: 15000 },
    { talla: 'M', material: 'Algodón', tipo: 'Cuello Redondo', infoAdicional: 'Tela nacional', costo: 16000 },
    { talla: 'L', material: 'Algodón', tipo: 'Cuello V', infoAdicional: 'Tela importada', costo: 18000 },
    { talla: 'XL', material: 'Poliéster', tipo: 'Deportiva', infoAdicional: 'Secado rápido', costo: 20000 },
    { talla: 'S', material: 'Lino', tipo: 'Guayabera', infoAdicional: 'Bordada', costo: 45000 },
  ];

  estampados: EstampadoCost[] = [
    { posicion: 'Pecho Izquierdo', tamano: '10x10 cm', costo: 5000 },
    { posicion: 'Centro Pecho', tamano: '30x30 cm', costo: 12000 },
    { posicion: 'Espalda', tamano: '30x40 cm', costo: 15000 },
    { posicion: 'Manga', tamano: '8x8 cm', costo: 4000 },
    { posicion: 'Etiqueta', tamano: '5x5 cm', costo: 2000 },
  ];
}

