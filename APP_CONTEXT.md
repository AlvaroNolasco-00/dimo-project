# 📄 Contexto General de la Aplicación (DIMO Project)

Este archivo centraliza el contexto técnico y funcional del proyecto para facilitar el trabajo de desarrollo y corrección de errores.

---

## 🚀 Descripción General
**DIMO Project (Photo Editor Suite)** es una plataforma web integral que combina:
1.  **Edición de Imágenes Avanzada**: Utiliza IA para eliminación de fondo, borrado de objetos, upscaling y efectos artísticos.
2.  **Gestión Administrativa**: Sistema de gestión de pedidos, finanzas, usuarios y proyectos específicos.

---

## 🛠 Arquitectura y Tecnologías

### Backend (Carpeta `backend/`)
- **Framework**: FastAPI (Python)
- **Base de Datos**: PostgreSQL
- **ORM**: SQLAlchemy
- **Autenticación**: JWT (JSON Web Tokens) con Roles (Admin, Usuario).
- **Procesamiento de Imágenes**: OpenCV, PIL (Pillow), Rembg (IA para fondo), Inpainting (Telea).
- **Endpoints Principales**:
  - `/api/auth`: Registro, login y gestión de tokens.
  - `/api/processing`: Eliminación de fondo, objetos, upscaling, halftone, etc.
  - `/api/orders`: Gestión completa del ciclo de vida de pedidos.
  - `/api/finance`: Costos operativos y recuento de ganancias/gastos.
  - `/api/projects`: Gestión de espacios de trabajo (Proyectos) y asignación de usuarios.

### Frontend (Carpeta `frontend/`)
- **Framework**: Angular 18 (Standalone Components).
- **Estado**: Signals (Angular Signals) para reactividad moderna.
- **Estilos**: SCSS (Global + Component-level).
- **Módulos Clave**:
  - **Auth**: Gestión de acceso y aprobación de usuarios.
  - **Editor**: Suite de edición de fotos con Canvas interactivo.
  - **Gestion**: Panel administrativo (Pedidos, Finanzas, Proyectos).
  - **Usuarios**: Gestión de permisos y listado de personal.

---

## 📁 Estructura del Proyecto

### Backend
- `backend/main.py`: Punto de entrada y configuración de la API.
- `backend/models.py`: Definición de modelos de base de datos (SQLAlchemy).
- `backend/routers/`: Rutas divididas por funcionalidad (auth, orders, processing, finance).
- `backend/processing.py`: Lógica pesada de manipulación de imágenes.
- `backend/database.py`: Configuración de la conexión a DB.

### Frontend
- `frontend/src/app/app.routes.ts`: Definición de todas las rutas y guards.
- `frontend/src/app/editor/`: Componentes del editor (Preview, Controls, Sidebar).
- `frontend/src/app/gestion/`: Lógica de pedidos, finanzas y proyectos.
- `frontend/src/app/services/`: Servicios globales (`ApiService`, `AuthService`, `ImagePersistenceService`).

---

## ⚖️ Reglas de Negocio e Información Clave

1.  **Flujo de Usuarios**: Los usuarios se registran -> Quedan en "Pendiente de Aprobación" -> Un Admin los aprueba -> Pueden acceder a utilidades.
2.  **Sistema de Proyectos**: Casi todo (pedidos, costos, recursos) está amarrado a un `project_id`. Un usuario debe estar asignado a un proyecto para operar en él.
3.  **Gestión de Pedidos**: Los pedidos tienen estados (Creados, En Proceso, Pendiente Envío, etc.). Se guarda un histórico (`order_history`) de cada acción.
4.  **Procesamiento Local vs Cloud**: El backend está preparado para correr procesamiento de IA localmente o vía workers externos (GPU Workers).

---

## 📝 Contexto Reciente (Conversaciones Previas)

- **Módulo de Clientes**: Implementación de un nuevo segmento de "Clientes" dentro de Gestión para manejar datos demográficos y laborales.
- **Flujos Laborales**: Se han trabajado escenarios específicos como "Pensionado" e "Inversionista" en formularios de entrada de datos, ajustando la visibilidad de campos dinámicamente.
- **Optimización de UI**: Ajustes en el colapso del sidebar, animaciones de layout y mejoras en el buscador de profesiones.
- **Errores Corregidos**: Problemas con la eliminación de fondo con colores manuales (Error 500) y persistencia de estados en el editor.

---

## ⌨️ Comandos Comunes

### Ejecutar Localmente
- **Backend**: `python3 -m backend.main`
- **Frontend**: `cd frontend && ng s` / `npm start`

### Base de Datos
- **Migraciones**: El proyecto usa scripts `.sql` directos en `backend/` para actualizar el esquema.

---

*Última actualización: 2026-01-23*
