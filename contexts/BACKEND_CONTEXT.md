# ⚙️ Contexto del Backend (Servidor)

## 📌 Visión General
El backend de **DIMO Project** es una API RESTful construida con **FastAPI** (Python 3.10+). Está diseñado para ser robusto, rápido y escalable, manejando tanto la lógica de negocio administrativa (ERP) como el procesamiento intensivo de imágenes (IA/Computer Vision).

Sus principales responsabilidades son:
1.  **API Gateway**: Centralizar todas las peticiones del frontend.
2.  **Gestión de Datos**: Orquestar la base de datos PostgreSQL.
3.  **Procesamiento de Imágenes**: Ejecutar modelos de IA (Rembg, Super-resolution) y manipulación con OpenCV/PIL.
4.  **Seguridad**: Autenticación JWT y control de acceso basado en roles (RBAC).

---

## 🛠 Tech Stack Principal

| Tecnología | Rol | Descripción |
| :--- | :--- | :--- |
| **FastAPI** | Framework Web | Alto rendimiento, validación automática de datos (Pydantic) y documentación interactiva (Swagger UI). |
| **PostgreSQL** | Base de Datos | Motor relacional principal. |
| **SQLAlchemy** | ORM | Mapeo objeto-relacional para interactuar con la DB usando modelos de Python. |
| **Pydantic** | Validación | Definición de esquemas de entrada/salida (`schemas.py`) para garantizar la integridad de datos. |
| **Uvicorn** | Servidor ASGI | Servidor de aplicaciones asíncrono para ejecutar FastAPI. |

### 🧠 Librerías de Procesamiento (IA/Imagen)
-   **OpenCV (`cv2`)**: Manipulación clásica de píxeles (recortes, filtros, contornos).
-   **Pillow (`PIL`)**: Manejo básico de formatos de imagen y conversiones.
-   **Rembg**: Herramienta de IA para la eliminación automática de fondos (basada en U2-Net).
-   **Numpy**: Operaciones matriciales eficientes (representación de imágenes).

---

## 🧱 Arquitectura del Proyecto

El backend sigue una estructura modular donde cada archivo en `routers/` encapsula una funcionalidad específica.

### Estructura de Directorios (`backend/`)

-   **`main.py`**: Punto de entrada (`App Entry`). Configura CORS, Middlewares y registra los routers.
-   **`models.py`**: Definición de las tablas de la base de datos (SQLAlchemy Models). **Fuente de verdad del esquema de datos**.
-   **`schemas.py`**: Modelos Pydantic para Request/Response (DTOs). Define qué datos entran y salen de la API.
-   **`routers/`**: Controladores de endpoints agrupados por dominio.
    -   `auth.py`, `orders.py`, `processing.py`, etc.
-   **`core/`**: Configuraciones base (`database.py` para conexión DB, `security.py` para hashing/tokens).
-   **`services/`**: (Opcional/En crecimiento) Lógica de negocio compleja separada de los routers.
-   **`static/`**: Almacenamiento temporal o persistente de archivos generados/subidos.

---

## 🧩 Módulos Funcionales (Routers)

Los endpoints están prefijados bajo `/api/` (ej. `/api/auth/login`).

### 1. 🔐 Auth & Usuarios (`auth.py`, `users.py`)
-   Gestión de tokens JWT (Access/Refresh).
-   Registro de usuarios y aprobación por administrador.
-   Gestión de perfiles y roles (Admin, User).

### 2. ⚡ Procesamiento (`processing.py`)
El motor de IA.
-   Recibe imágenes (Files o Base64).
-   Ejecuta tareas pesadas: `remove_bg`, `upscale`, `threshold`, `contour`.
-   Devuelve la imagen procesada o una URL al recurso estático.

### 3. 📦 Gestión de Pedidos (`orders.py`)
-   CRUD completo de pedidos.
-   Manejo de estados (`CREATED`, `PROCESSING`, `SHIPPED`).
-   Generación de historial de cambios por pedido.
-   Vinculación con clientes y proyectos.

### 4. 💰 Finanzas (`finance.py`, `payments.py`)
-   Registro de costos operativos y gastos.
-   Calculo de ganancias (Ingresos - Gastos).
-   Gestión de `DeliveryZones` y `Coupons`.

### 5. 👥 Clientes (`clients.py`)
-   Gestión de la base de datos de clientes externos.
-   Validación de unicidad (Teléfono + Project ID).

### 6. 📂 Proyectos (`projects.py`)
-   Manejo de multitenancy lógico (Espacios de trabajo).
-   Los datos (pedidos, clientes) suelen filtrarse por `project_id`.

---

## 💾 Persistencia de Datos (PostgreSQL)

La base de datos utiliza un esquema relacional. Algunas entidades clave:
-   **Users**: Usuarios del sistema administrativo.
-   **Projects**: Contenedor principal de datos.
-   **Clients**: Clientes finales del negocio.
-   **Orders**: Transacciones principales, vinculan Client + User + Project.
-   **OrderHistory**: Auditoría de cambios en pedidos.

---

## 🚀 Despliegue y Ejecución

-   **Server**: Se ejecuta vía `uvicorn backend.main:app --reload`.
-   **Puerto Default**: `8000`.
-   **Docs**: Swagger disponible automáticamente en `/docs`.
