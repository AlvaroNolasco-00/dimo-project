import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './finanzas.component.html',
  styleUrl: './finanzas.component.scss'
})
export class FinanzasComponent { }

