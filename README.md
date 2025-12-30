# Photo Editor Suite 📸

Una potente herramienta web de edición de imágenes que utiliza IA y procesamiento avanzado de imágenes para realizar tareas complejas como eliminación de objetos, cambio de fondo y aumento de resolución. Ahora incluye un sistema completo de gestión administrativa y de usuarios.

---

## 🛠 Arquitectura General
El proyecto sigue una arquitectura de cliente-servidor desacoplada:
- **Backend**: Servidor API robusto construido con **FastAPI** (Python), integrando **PostgreSQL** con **SQLAlchemy** para persistencia de datos y **JWT** para autenticación.
- **Frontend**: Interfaz de usuario dinámica construida con **Angular 18** utilizando componentes Standalone, Signals, y una estructura modular para gestión administrativa.

---

## 🐍 Documentación del Backend

El backend se encarga de todo el procesamiento pesado de imágenes y la lógica de negocio administrativa.

### Tecnologías Principales
- **FastAPI**: Framework web asíncrono.
- **PostgreSQL**: Base de datos relacional robusta.
- **SQLAlchemy**: ORM para gestión de base de datos.
- **JWT (JSON Web Tokens)**: Sistema de autenticación seguro.
- **OpenCV (cv2) & Pillow (PIL)**: Procesamiento de imágenes.
- **Rembg**: Eliminación de fondo basada en IA.

### Funcionalidades Implementadas

#### 1. Autenticación y Usuarios (`auth.py`, `models.py`)
- **Registro y Login**: Endpoints seguros con validación de credenciales.
- **Roles**: Sistema de roles (Usuario, Admin). El primer usuario registrado es Admin automáticamente.
- **Aprobación**: Los nuevos usuarios requieren aprobación de un administrador para operar.

#### 2. Procesamiento de Imágenes (`processing.py`)
- **Borrado de Objetos**: Inpainting de Telea con máscaras manuales o varita mágica.
- **Varita Mágica**: Selección inteligente por inundación de color (Flood Fill).
- **Eliminación de Fondo**: Automática (IA) o Manual (selección de color).
- **Upscaling**: Aumento de resolución con Lanczos y Unsharp Masking.
- **Halftone**: Efecto artístico de semitonos con control de puntos y espaciado.
- **Contour Clip**: Recorte de imágenes basado en contornos.

### Endpoints (API)

| Endpoint | Método | Descripción |
| :--- | :--- | :--- |
| `/api/auth/register` | POST | Registro de nuevos usuarios. |
| `/api/auth/login` | POST | Inicio de sesión y obtención de Token JWT. |
| `/api/admin/users` | GET | Listado de usuarios (Solo Admin). |
| `/api/remove-objects` | POST | Borrado de objetos (Manual/Varita mágica). |
| `/api/remove-background` | POST | Eliminación de fondo (Auto/Manual). |
| `/api/enhance-quality` | POST | Ajustes de brillo, contraste y nitidez. |
| `/api/upscale` | POST | Aumento de resolución (2x-10x). |
| `/api/halftone` | POST | Generación de efecto de semitonos. |
| `/api/contour-clip` | POST | Recorte por contornos. |

---

## 🎨 Documentación del Frontend

La interfaz ha sido reorganizada en módulos funcionales para separar la edición de imágenes de la gestión administrativa.

### Estructura Modular
- **Auth**: Módulo de autenticación (Login, Registro, Pendiente de Aprobación).
- **Editor**: Suite de edición de imágenes con Canvas interactivo y Signals.
- **Usuarios**: Gestión de usuarios para administradores (Listado, Permisos).
- **Gestion**: Módulo financiero y de pedidos (Finanzas, Pedidos).

### Características Clave
- **Guards**: Protección de rutas basada en autenticación y roles.
- **Interceptores**: Inyección automática de tokens JWT en peticiones.
- **Diseño Responsivo**: Layouts adaptables para dashboard y editor.

---

## 💾 Base de Datos y Scripts SQL

El proyecto utiliza **PostgreSQL**. A continuación se detallan los scripts para la creación de las tablas principales.

### Configuración
La conexión se define en `backend/database.py`. Asegúrese de tener una base de datos creada y las credenciales correctas.

### Scripts de Creación (DDL)

#### Tabla de Usuarios (`users`)
Almacena la información de autenticación y estado de los usuarios.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR,
    email VARCHAR UNIQUE NOT NULL,
    hashed_password VARCHAR NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE
);

CREATE INDEX ix_users_id ON users (id);
CREATE INDEX ix_users_email ON users (email);
```

#### Tabla de Pedidos (`orders`)
Gestión de órdenes de producción (Estructura inferida del módulo de gestión).

```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR UNIQUE NOT NULL,
    customer_name VARCHAR NOT NULL,
    delivery_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR,
    notes TEXT
);
```

---

## 🚀 Cómo Ejecutar el Proyecto

### Requisitos
- Python 3.10+
- Node.js 18+
- PostgreSQL

### Instrucciones

1. **Configurar Base de Datos**:
   Asegúrese de que PostgreSQL esté corriendo y actualice la URL en `backend/database.py`.

2. **Instalar Dependencias**:
   ```bash
   # Backend
   pip install -r requirements.txt
   
   # Frontend
   cd frontend
   npm install
   ```

3. **Iniciar Backend**:
   ```bash
   python3 -m backend.main
   # El servidor correrá en http://localhost:8000
   ```

4. **Iniciar Frontend**:
   ```bash
   cd frontend
   npm start
   # La app estará disponible en http://localhost:4200
   ```

---

## ☁️ Despliegue en Koyeb

El proyecto está pre-configurado para desplegarse fácilmente en Koyeb.

### Opción 1: Configuración Automática (Recomendada)
El repositorio incluye un archivo `koyeb.yaml` que Koyeb detectará automáticamente.
1.  Conecta tu repositorio de GitHub a Koyeb.
2.  Koyeb leerá la configuración y desplegará el servicio.

### Opción 2: Configuración Manual
Si necesitas configurar el servicio manualmente en el dashboard:

1.  **Buildpack**: Selecciona `Python`.
2.  **Configuración de Build y Run** (Configure Buildpack):
    - **Build command**: `pip install -r requirements.txt`
    - **Run command**: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.main:app`
    - **Privileged**: Dejar **desmarcado**.
    - **Work directory**: `backend` (o dejar en blanco si Koyeb detecta la raíz correctamente, pero asegúrate de que el comando de run apunte a `backend.main:app`). NOTA: Si usas el repo tal cual, el `koyeb.yaml` setea `PYTHONPATH=.` para que funcione desde la raíz.

### Variables de Entorno (Environment Variables)
Para que la aplicación funcione, debes configurar la siguiente variable en Koyeb:

| Variable | Descripción |
| :--- | :--- |
| `DATABASE_URL` | String de conexión a tu base de datos PostgreSQL (ej. Neon.tech). |

