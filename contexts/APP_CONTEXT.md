# 📄 Contexto General de la Plataforma (DIMO Project)

## 💡 Idea de Negocio
**DIMO Project** es una plataforma integral de gestión empresarial y procesamiento digital. Su objetivo es centralizar la operación del negocio permitiendo:
1.  **Gestión Administrativa Completa**: Control total sobre clientes, pedidos, finanzas y proyectos administrativos.
2.  **Utilidades de Imagen (IA)**: Suite de edición y procesamiento de imágenes para optimizar flujos de trabajo creativos y operativos.

---

## 🧩 Módulos Funcionales Actuales

### 1. Utilidades (Image Suite)
Acceso directo a herramientas de procesamiento de imágenes, principalmente potenciadas por IA.
-   **Procesamiento IA**: Eliminación de fondo (`remove-bg`), borrado de objetos (`remove-objects`), mejora de calidad (`upscale`, `enhance`).
-   **Efectos y Edición**: Halftone, Contour Clip, Recorte (`crop`) y Marcas de agua (`watermark`).
-   **Core**: Componentes reutilizables de Canvas para la interacción visual.

### 2. Gestión (Business Core)
El núcleo administrativo para la operación diaria.
-   **Pedidos**: Flujo completo de creación, seguimiento y detalle de órdenes.
-   **Clientes**: Gestión de base de datos de clientes, incluyendo formularios detallados (datos demográficos, situación laboral, evaluación).
-   **Finanzas**:
    -   *Contabilidad*: Recuento de gastos, ganancias y costos operativos.
    -   *Configuración*: Gestión de zonas de entrega (`delivery-zones`) y cupones (`coupons`).
-   **Proyectos**: Administración de espacios de trabajo y asignación de recursos.

### 3. Usuarios
Módulo dedicado a la administración del personal y seguridad interna.
-   **Administración**: Listado y creación de usuarios internos.
-   **Seguridad**: Gestión de permisos y roles (Admin/User).

### 4. Auth (Autenticación)
Sistema de ingreso y seguridad.
-   Login, Registro y recuperación.
-   **Flujos de Estado**: Pantallas para usuarios "Pendientes de Aprobación" o "Sin Proyecto Asignado".

### 5. Acceso Público
-   **Order Tracking**: Vista pública accesible vía token (`/track/:token`) para que los clientes externos consulten el estado de sus pedidos sin necesidad de login.

---

## � Stack Tecnológico

### Frontend
-   **Framework**: Angular 18 (Standalone Components).
-   **Estado y Reactividad**: Signals.
-   **Estilos**: SCSS.
-   **Diseño**: Layouts modulares (`MainLayout`, `GestionLayout`, `UsuariosLayout`).

### Backend
-   **API**: FastAPI (Python).
-   **Base de Datos**: PostgreSQL + SQLAlchemy.
-   **Procesamiento**: OpenCV, PIL, Modelos de IA.
-   **Comunicación**: Socket.IO (Actualizaciones en tiempo real).

---

## 🚀 Comandos Rápidos

| Componente | Comando | Ruta Base |
| :--- | :--- | :--- |
| **Backend** | `python3 -m backend.main` | `/` |
| **Frontend** | `ng serve` | `/frontend` |
