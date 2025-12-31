import { Routes } from '@angular/router';
import { EditorComponent } from './editor/editor.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { PendingApprovalComponent } from './auth/pending-approval/pending-approval.component';
import { approvedGuard, adminGuard, projectGuard } from './guards/auth.guard';
import { AuthLayoutComponent } from './layout/auth-layout/auth-layout.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { UsuariosLayoutComponent } from './usuarios/usuarios-layout/usuarios-layout.component';
import { PermisosComponent } from './usuarios/permisos/permisos.component';
import { CreacionComponent } from './usuarios/creacion/creacion.component';
import { ListadoComponent } from './usuarios/listado/listado.component';
import { GestionLayoutComponent } from './gestion/gestion-layout/gestion-layout.component';
import { PedidosComponent } from './gestion/pedidos/pedidos.component';
import { CrearPedidoComponent } from './gestion/pedidos/crear-pedido/crear-pedido.component';
import { DetallePedidoComponent } from './gestion/pedidos/detalle-pedido/detalle-pedido.component';
import { FinanzasComponent } from './gestion/finanzas/finanzas.component';
import { CostosOperativosComponent } from './gestion/finanzas/costos-operativos/costos-operativos.component';
import { RecuentoGastosComponent } from './gestion/finanzas/recuento-gastos/recuento-gastos.component';
import { RecuentoGananciasComponent } from './gestion/finanzas/recuento-ganancias/recuento-ganancias.component';
import { ProyectosComponent } from './gestion/proyectos/proyectos.component';
import { NoProjectComponent } from './auth/no-project/no-project.component';
import { ProfileComponent } from './profile/profile.component';

export const routes: Routes = [
    // Auth Routes (Clean layout, no sidebar)
    {
        path: 'auth',
        component: AuthLayoutComponent,
        children: [
            { path: 'login', component: LoginComponent },
            { path: 'register', component: RegisterComponent },
            { path: 'pending-approval', component: PendingApprovalComponent },
            { path: 'no-project', component: NoProjectComponent },
            { path: '', redirectTo: 'login', pathMatch: 'full' },
        ]
    },

    // Main App Routes (Sidebar layout)
    {
        path: 'utilidades',
        component: MainLayoutComponent,
        canActivate: [approvedGuard, projectGuard],
        children: [
            { path: '', redirectTo: 'remove-bg', pathMatch: 'full' },
            { path: 'remove-bg', component: EditorComponent },
            { path: 'remove-objects', component: EditorComponent },
            { path: 'enhance', component: EditorComponent },
            { path: 'upscale', component: EditorComponent },
            { path: 'halftone', component: EditorComponent },
            { path: 'contour-clip', component: EditorComponent },
        ]
    },

    // Profile Routes
    {
        path: 'profile',
        component: MainLayoutComponent,
        canActivate: [approvedGuard],
        children: [
            { path: '', component: ProfileComponent }
        ]
    },

    // Usuarios Routes
    {
        path: 'usuarios',
        component: MainLayoutComponent,
        canActivate: [approvedGuard],
        children: [
            {
                path: '',
                component: UsuariosLayoutComponent,
                children: [
                    { path: '', redirectTo: 'listado', pathMatch: 'full' },
                    { path: 'permisos', component: PermisosComponent },
                    {
                        path: 'creacion',
                        component: CreacionComponent,
                        canActivate: [adminGuard]
                    },
                    { path: 'listado', component: ListadoComponent },
                ]
            }
        ]
    },

    // Gestión Routes
    {
        path: 'gestion',
        component: MainLayoutComponent,
        canActivate: [approvedGuard],
        children: [
            {
                path: '',
                component: GestionLayoutComponent,
                children: [
                    { path: '', redirectTo: 'pedidos', pathMatch: 'full' },
                    { path: 'pedidos', component: PedidosComponent },
                    { path: 'pedidos/crear', component: CrearPedidoComponent },
                    { path: 'pedidos/:id', component: DetallePedidoComponent },
                    { path: 'proyectos', component: ProyectosComponent, canActivate: [adminGuard] },
                    { path: 'finanzas', component: FinanzasComponent },
                    { path: 'finanzas/costos-operativos', component: CostosOperativosComponent },
                    { path: 'finanzas/recuento-gastos', component: RecuentoGastosComponent },
                    { path: 'finanzas/recuento-ganancias', component: RecuentoGananciasComponent },
                ]
            }
        ]
    },

    // Fallback and Root
    { path: '', redirectTo: 'utilidades', pathMatch: 'full' },
    { path: '**', redirectTo: 'utilidades' }
];
