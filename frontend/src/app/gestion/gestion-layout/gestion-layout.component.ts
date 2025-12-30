import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GestionSidebarComponent } from '../gestion-sidebar/gestion-sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-gestion-layout',
  standalone: true,
  imports: [RouterOutlet, GestionSidebarComponent, CommonModule],
  templateUrl: './gestion-layout.component.html',
  styleUrls: ['./gestion-layout.component.scss']
})
export class GestionLayoutComponent { }

