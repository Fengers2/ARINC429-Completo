# ARINC429 · Gestión de envíos

Aplicación web Node.js/Express con CRUD de envíos en MySQL, validación de rango por instrumento, generación de palabras ARINC429 de 32 bits (BNR/paridad impar) e integración serial opcional.

## Requisitos

- Node.js 20 o superior y npm.
- MySQL con la base `Arinc_Engers` y una tabla `envios` que contenga estas columnas exactamente: `numero del instrumento`, `nombre del instrumento` y `valor`.
- Para la transmisión: adaptador/interfaz transmisora ARINC429 compatible con el protocolo serial que expone esta aplicación.

La aplicación crea `envios` si no existe; si existe, añade `id`, `arinc429`, `serial_status`, `created_at` y `updated_at` cuando faltan. El usuario MySQL necesita permisos para crear/alterar la tabla. Antes de usar una tabla real, haga una copia de seguridad.

## Puesta en marcha

1. Copie `.env.example` a `.env` y ajuste la conexión MySQL. No comparta ni registre credenciales.
2. Instale dependencias con `npm install`.
3. Inicie con `npm start` y abra `http://localhost:3000`.

## Instrumentos y codificación

El catálogo está en `src/instruments.js`. El único registro inicial es una brújula de ejemplo con rango 0–360°. **Su etiqueta ARINC 014, formato, resolución, SDI y SSM son valores ilustrativos, no validados**: confirme y configure la definición en el ICD (Interface Control Document) del equipo antes de usarla en un sistema real. Los instrumentos no especificados no se deben inventar.

Se acepta BNR únicamente. El codificador construye una palabra de 32 bits con etiqueta, SDI, magnitud BNR, signo, SSM y paridad impar. La conversión de bytes y el framing pueden depender del adaptador; valide el orden de bits y el formato con el fabricante. No se transmite automáticamente al editar: crear genera el registro y trata de transmitir; el botón de envío reintenta explícitamente. Desactivado por defecto.

## Puerto serial / seguridad operacional

Por defecto `SERIAL_ENABLED=false`. No es suficiente conectar un puerto RS-232/USB genérico: ARINC429 requiere hardware transmisor dedicado para generar sus niveles eléctricos y temporización. Configure `SERIAL_ENABLED=true`, `SERIAL_PORT`, `SERIAL_BAUD_RATE` y el framing requerido **solo después de verificar la documentación del adaptador y comprobar el cableado en banco**. El servicio escribe cuatro bytes little-endian por palabra como comportamiento de ejemplo; no es universal. No conecte una salida no validada a aviónica ni equipos operativos.

## API

- `GET /api/instruments`
- `GET /api/envios`, `GET /api/envios/:id`
- `POST /api/envios` (`instrumentNumber`, `value`)
- `PUT /api/envios/:id` (`instrumentNumber`, `value`)
- `DELETE /api/envios/:id`
- `POST /api/envios/:id/transmitir`
