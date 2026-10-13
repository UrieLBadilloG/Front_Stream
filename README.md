# Streamly Frontend

Aplicación React/Vite de la plataforma educativa. Es un proyecto hermano de `../back-stream` y se ejecuta normalmente en `http://localhost:5173`.

## Incluye

- Inicio, catálogo, filtros, detalle de curso y tema claro/oscuro.
- Landing pública rediseñada (`src/components/landing.jsx`): hero con mockup CSS/SVG, áreas de IA y Derecho, cursos reales desde la API, pasos, experiencia de aprendizaje, FAQ y footer; respeta `prefers-reduced-motion`.
- Registro, login y restauración de sesión mediante JWT de la API.
- Área del alumno (`student`): aprendizaje e inscripciones.
- Área de instructor (`admin`): gestión de sus propios cursos.
- Área global (`super_admin`): usuarios, roles y creación de cursos para otros propietarios.
- Pantalla de video preparada para Cloudinary.
- Límites de acceso por curso (45 días por defecto o indefinido), aplicados por `back-stream`.

## Pagos (Mercado Pago Checkout Pro)
- La moneda no está fija en el código: se obtiene de `GET /api/payments/config` (detectada por el backend desde la cuenta de Mercado Pago) y se guarda solo en memoria. `src/lib/money.js` formatea los precios (`formatPrice`; 0 decimales en CLP/COP, `Gratis` para precio 0) y el editor de cursos etiqueta el precio con el código de la moneda detectada.
- `/pago/:id`: resumen del curso y botón **Pagar con Mercado Pago** (redirige al `initPoint` que devuelve `POST /api/payments/courses/:id/checkout`, solo si es https de Mercado Pago/Mercado Libre). Si el pago en línea no está habilitado, solo se ofrece la transferencia con referencia. La interfaz nunca pide ni guarda datos de tarjeta.
- `/pago/resultado`: página de retorno protegida por sesión. Lee `external_reference` y `payment_id`, pero nunca los toma como verdad: llama a `POST /api/payments/verify` y reintenta (2 s, 4 s, 8 s) mientras el pago siga pendiente. Funciona al recargar.
- `/mis-pagos`: historial del alumno (`GET /api/payments/mine`) con botón **Verificar estado** para pagos pendientes. Útil en local, donde el webhook no llega.
- Super administrador: pestaña **Pagos** en `/administracion` (filtros por estado, totales, paginación y marca "Requiere revisión"). Docente: los ingresos aprobados por curso aparecen en la pestaña Analítica.
- Código en `src/components/payments.jsx`; el contexto compartido está en `src/lib/app-context.js`.

La visibilidad de pantallas depende del rol, pero el control de seguridad real lo ejecuta `back-stream` con JWT y verificaciones de propiedad.

## Desarrollo

```bash
cd front-stream
npm install
npm run dev
```

## Build de producción

```bash
npm run build
npm run preview
```

## Variables de entorno

Copia `.env.example` a `.env`:

```dotenv
VITE_API_URL=http://localhost:3000
```

Solo valores públicos pueden tener el prefijo `VITE_`. **Nunca** coloques la contraseña MySQL, `JWT_SECRET`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_URL` o claves administrativas en este proyecto. Cloudinary se configura exclusivamente en el backend.

## Roles y flujos

- Al registrarse desde la interfaz, una persona siempre nace como `student`.
- Un `super_admin` puede crear/promover cuentas `admin` o `super_admin` desde `/administracion`.
- Un `admin` puede crear cursos propios y no obtiene información ni permisos sobre cursos de otro dueño.
- Un `super_admin` puede crear cursos asignando un propietario, cambiar roles y, desde API, inscribir cursos a cualquier alumno.

La migración de usuarios, cursos, lecciones, inscripciones y progreso ya está aplicada en la base configurada. El catálogo visual de ejemplo permanece disponible mientras se crea contenido real desde **Área docente**.

## Cloudinary

La carga de video se realiza desde **Área docente** usando una firma temporal emitida por `POST /api/uploads/signature`. Solo los roles `admin` y `super_admin` pueden pedir esa firma. El navegador recibe una firma temporal, la API key pública y la carpeta de destino; el API secret nunca abandona `back-stream/.env`.

Flujo: selecciona un video al crear una lección → React solicita la firma autenticada → Cloudinary recibe el archivo → el backend guarda URL segura, ID público y duración en la lección.

## Estructura

```text
front-stream/
├── src/
│   ├── data/courses.js       # Contenido visual de ejemplo
│   ├── services/api.js       # Cliente HTTP con Bearer JWT
│   ├── services/cloudinary.js
│   ├── App.jsx
│   └── styles.css
├── .env.example
└── package.json
```
