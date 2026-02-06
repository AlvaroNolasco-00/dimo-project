# 🎨 Contexto del Frontend (Cliente)

## 📌 Visión General
El frontend de **DIMO Project** es una *Single Page Application (SPA)* construida con **Angular 21**, enfocada en la velocidad, la reactividad moderna (Signals) y una experiencia de usuario "Premium" con estéticas cuidadas.

Esta capa se encarga de:
1.  La interacción con el usuario final (Edición de fotos, Gestión de pedidos).
2.  La comunicación con el Backend (FastAPI) vía HTTP y WebSockets.
3.  La visualización de datos en tiempo real.

---

## 🛠 Tech Stack Principal

| Tecnología | Versión / Uso | Descripción |
| :--- | :--- | :--- |
| **Angular** | v21.x | Framework Core. Uso exclusivo de **Standalone Components** (Sin NgModules). |
| **TypeScript** | v5.9 | Tipado estricto para lógica de negocio y componentes. |
| **RxJS** | ~7.8 | Manejo de flujos asíncronos complejos (HTTP, Eventos). |
| **Signals** | Core | Gestión de estado reactivo local y global (reemplazando `BehaviorSubject` donde es posible). |
| **SCSS** | - | Preprocesador de estilos. Diseño modular y responsivo. |

### 📚 Librerías Clave
-   **UI & Iconos**: `@phosphor-icons/web` (Iconografía moderna).
-   **Notificaciones**: `sweetalert2` (Modales y alertas interactivas).
-   **Mapas**: `leaflet` (Visualización de zonas de entrega).
-   **Edición de Imágenes**: `cropperjs` (Recorte y manipulación en canvas).

---

## 🧱 Arquitectura del Proyecto

El proyecto sigue una arquitectura **por características (Feature-based)**, donde cada carpeta principal dentro de `app/` representa un dominio de negocio.

### Estructura de Directorios (`src/app/`)

-   **`core/`** (o raíz de `app/`): Configuración global (`app.config.ts`, `app.routes.ts`).
-   **`layout/`**: Componentes estructura base que envuelven las vistas.
    -   `main-layout`: Sidebar + Navbar + Content (Para usuarios logueados).
    -   `auth-layout`: Centrado, limpio (Login/Register).
    -   `public-layout`: Minimalista (Para vistas externas como Tracking).
-   **`services/`**: Capa de comunicación de datos. Singleton services (`providedIn: 'root'`).
-   **`guards/`**: Protección de rutas (`auth.guard`, `project.guard`).
-   **`shared/`**: Componentes reutilizables (Botones, Loaders, Inputs genéricos).

---

## 🧩 Módulos Funcionales (Features)

### 1. 🔐 Auth (`/auth`)
Maneja el ciclo de vida de la sesión del usuario.
-   Login y Registro.
-   Pantallas de estado: "Pendiente de Aprobación", "Sin Proyecto".
-   Interceptors para manejo de Token JWT.

### 2. 📸 Editor / Utilidades (`/editor`)
El corazón creativo de la app.
-   **Canvas Interactivo**: Permite manipular imágenes en el navegador.
-   **Herramientas**: Implementaciones de UI para los endpoints de IA del backend (Remove BG, Upscale).
-   **Gestión de Estado**: Mantiene la imagen actual, historial de cambios y configuraciones de pincel/zoom.

### 3. 💼 Gestión (`/gestion`)
El panel administrativo (ERP-like).
-   **Pedidos**: Listados con filtros, detalle de orden, creación de pedidos (Wizard/Stepper).
-   **Finanzas**: Gráficos de ingresos vs gastos, configuración de zonas de entrega y cupones.
-   **Clientes**: CRM ligero para gestión de perfiles de clientes.
-   **Proyectos**: Selector y creador de espacios de trabajo.

### 4. 👥 Usuarios (`/usuarios`)
Gestión interna de RRHH.
-   Listado de empleados.
-   Asignación de roles y permisos.

---

## 🔄 Flujo de Datos y Reactividad

1.  **Backend -> Frontend**: `ApiService` realiza peticiones HTTP.
2.  **Estado Global**: Servicios como `AuthService` o `OrderService` almacenan datos compartidos usando **Signals** (`computed`, `signal`).
3.  **Componentes**: Consumen estas Signals para actualizar la UI automáticamente sin necesidad de `Subscription` manual en muchos casos (Zone-less friendly).

---

## 🎨 Principios de Diseño (UI/UX)
-   **Dark/Light Mode**: (Si aplica) Estilos preparados para temas.
-   **Glassmorphism**: Uso de transparencias y blurs en tarjetas y modales.
-   **Feedback Inmediato**: Cada acción del usuario (guardar, borrar) debe tener una respuesta visual (Toast o Alert).
