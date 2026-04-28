import { Routes } from '@angular/router';
import { approvedGuard, adminGuard, projectGuard, managerGuard, editorGuard } from './guards/auth.guard';

export const routes: Routes = [
    // Auth Routes (Clean layout, no sidebar)
    {
        path: 'auth',
        loadComponent: () => import('./layout/auth-layout/auth-layout.component').then(m => m.AuthLayoutComponent),
        children: [
            { path: 'login', loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
            { path: 'register', loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent) },
            { path: 'pending-approval', loadComponent: () => import('./auth/pending-approval/pending-approval.component').then(m => m.PendingApprovalComponent) },
            { path: 'no-project', loadComponent: () => import('./auth/no-project/no-project.component').then(m => m.NoProjectComponent) },
            { path: '', redirectTo: 'login', pathMatch: 'full' },
        ]
    },

    // Public Order Tracking (No Auth Required)
    {
        path: 'track',
        loadComponent: () => import('./layout/public-layout/public-layout').then(m => m.PublicLayout),
        children: [
            { path: ':token', loadComponent: () => import('./public/order-view/order-view').then(m => m.OrderViewComponent) }
        ]
    },

    // Public Product Shop (No Auth Required)
    {
        path: 'shop',
        loadComponent: () => import('./layout/public-layout/public-layout').then(m => m.PublicLayout),
        children: [
            { path: ':token', loadComponent: () => import('./public/product-view/product-view.component').then(m => m.ProductViewComponent) }
        ]
    },

    // Public Category Catalog (No Auth Required)
    {
        path: 'catalogo',
        loadComponent: () => import('./layout/public-layout/public-layout').then(m => m.PublicLayout),
        children: [
            { path: ':token', loadComponent: () => import('./public/category-view/category-view.component').then(m => m.CategoryViewComponent) }
        ]
    },

    // Main App Routes (Sidebar layout)
    {
        path: 'utilidades',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard, projectGuard],
        children: [
            { path: '', redirectTo: 'remove-bg', pathMatch: 'full' },
            { path: 'remove-bg', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'remove-objects', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'enhance', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'upscale', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'halftone', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'contour-clip', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'crop', loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent) },
            { path: 'watermark', loadComponent: () => import('./editor/watermark/watermark.component').then(m => m.WatermarkComponent) },
        ]
    },

    // Profile Routes
    {
        path: 'profile',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard],
        children: [
            { path: '', loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent) }
        ]
    },

    // Usuarios Routes
    {
        path: 'usuarios',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./usuarios/usuarios-layout/usuarios-layout.component').then(m => m.UsuariosLayoutComponent),
                children: [
                    { path: '', redirectTo: 'listado', pathMatch: 'full' },
                    { path: 'permisos', loadComponent: () => import('./usuarios/permisos/permisos.component').then(m => m.PermisosComponent) },
                    {
                        path: 'creacion',
                        loadComponent: () => import('./usuarios/creacion/creacion.component').then(m => m.CreacionComponent),
                        canActivate: [adminGuard]
                    },
                    { path: 'listado', loadComponent: () => import('./usuarios/listado/listado.component').then(m => m.ListadoComponent) },
                ]
            }
        ]
    },

    // Gestión Routes
    {
        path: 'gestion',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./gestion/gestion-layout/gestion-layout.component').then(m => m.GestionLayoutComponent),
                children: [
                    { path: '', redirectTo: 'pedidos', pathMatch: 'full' },
                    { path: 'pedidos', loadComponent: () => import('./gestion/pedidos/pedidos.component').then(m => m.PedidosComponent) },
                    { path: 'pedidos/crear', loadComponent: () => import('./gestion/pedidos/crear-pedido/crear-pedido.component').then(m => m.CrearPedidoComponent), canActivate: [editorGuard] },
                    { path: 'pedidos/:id', loadComponent: () => import('./gestion/pedidos/detalle-pedido/detalle-pedido.component').then(m => m.DetallePedidoComponent) },
                    { path: 'clientes', loadComponent: () => import('./gestion/clientes/clientes.component').then(m => m.ClientesComponent) },
                    { path: 'clientes/crear', loadComponent: () => import('./gestion/clientes/cliente-form/cliente-form.component').then(m => m.ClienteFormComponent), canActivate: [editorGuard] },
                    { path: 'clientes/editar/:id', loadComponent: () => import('./gestion/clientes/cliente-form/cliente-form.component').then(m => m.ClienteFormComponent), canActivate: [editorGuard] },
                    { path: 'proyectos', loadComponent: () => import('./gestion/proyectos/proyectos.component').then(m => m.ProyectosComponent), canActivate: [adminGuard] },
                    { path: 'finanzas', loadComponent: () => import('./gestion/finanzas/finanzas.component').then(m => m.FinanzasComponent), canActivate: [managerGuard] },
                    { path: 'finanzas/costos-operativos', loadComponent: () => import('./gestion/finanzas/costos-operativos/costos-operativos.component').then(m => m.CostosOperativosComponent), canActivate: [managerGuard] },
                    { path: 'finanzas/recuento-gastos', loadComponent: () => import('./gestion/finanzas/recuento-gastos/recuento-gastos.component').then(m => m.RecuentoGastosComponent), canActivate: [managerGuard] },
                    { path: 'finanzas/recuento-ganancias', loadComponent: () => import('./gestion/finanzas/recuento-ganancias/recuento-ganancias.component').then(m => m.RecuentoGananciasComponent), canActivate: [managerGuard] },
                    { path: 'finanzas/delivery-zones', loadComponent: () => import('./gestion/finanzas/delivery-zones/delivery-zones.component').then(m => m.DeliveryZonesComponent), canActivate: [managerGuard] },
                    { path: 'finanzas/coupons', loadComponent: () => import('./gestion/finanzas/coupons/coupons.component').then(m => m.CouponsComponent), canActivate: [managerGuard] },
                    { path: 'catalogo', loadComponent: () => import('./gestion/catalogo/catalogo.component').then(m => m.CatalogoComponent), canActivate: [managerGuard] },
                    { path: 'catalogo/nuevo', loadComponent: () => import('./gestion/catalogo/producto-form/producto-form.component').then(m => m.ProductoFormComponent), canActivate: [managerGuard] },
                    { path: 'catalogo/:id/editar', loadComponent: () => import('./gestion/catalogo/producto-form/producto-form.component').then(m => m.ProductoFormComponent), canActivate: [managerGuard] },
                    { path: 'catalogo/categorias', loadComponent: () => import('./gestion/catalogo/categorias/categorias.component').then(m => m.CategoriasComponent), canActivate: [managerGuard] },
                    { path: 'bitacora', loadComponent: () => import('./gestion/bitacora/bitacora.component').then(m => m.BitacoraComponent), canActivate: [adminGuard] },
                ]
            }
        ]
    },

    // Studio — image editor
    {
        path: 'studio',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard, projectGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./studio/studio-shell/studio-shell.component').then(m => m.StudioShellComponent),
            }
        ]
    },

    // Lienzo — multi-image canvas composer
    {
        path: 'lienzo',
        loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
        canActivate: [approvedGuard, projectGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./studio/components/lienzo-shell/lienzo-shell.component').then(m => m.LienzoShellComponent),
            }
        ]
    },

    // Fallback and Root
    { path: '', redirectTo: 'studio', pathMatch: 'full' },
    { path: '**', redirectTo: 'studio' }
];
