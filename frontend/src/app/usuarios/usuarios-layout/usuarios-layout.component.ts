import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-usuarios-layout',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './usuarios-layout.component.html',
  styleUrls: ['./usuarios-layout.component.scss']
})
export class UsuariosLayoutComponent { }

