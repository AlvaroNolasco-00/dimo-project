import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UsuariosSidebarComponent } from '../usuarios-sidebar/usuarios-sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-usuarios-layout',
  standalone: true,
  imports: [RouterOutlet, UsuariosSidebarComponent, CommonModule],
  templateUrl: './usuarios-layout.component.html',
  styleUrls: ['./usuarios-layout.component.scss']
})
export class UsuariosLayoutComponent { }

