# ARINC429 · Gestión de envíos

Aplicación web Node.js/Express con CRUD de envíos, alta de instrumentos, validación de rango y generación de palabras ARINC429 de 32 bits (BNR/paridad impar). Usa un archivo JSON local persistente y no necesita MySQL para funcionar. La transmisión serial es opcional y siempre manual.

## Requisitos

- Node.js 18 o superior y npm.
- Para la transmisión: adaptador/interfaz transmisora ARINC429 compatible con el protocolo serial que expone esta aplicación.

Los datos se guardan por defecto en `data/arinc429.json`. Se puede cambiar la ubicación con `DATA_FILE`.

## Puesta en marcha

1. Opcionalmente, copie `.env.example` a `.env` y ajuste `DATA_FILE` o `PORT`.
2. Instale dependencias con `npm install`.
3. Inicie con `npm start` y abra `http://localhost:3000`.

## Instrumentos y codificación

El catálogo persistente se muestra y amplía desde la sección Instrumentos de la página. El archivo `src/instruments.js` solo aporta el registro inicial cuando el catálogo está vacío: una brújula de ejemplo con rango 0–360°. **Su etiqueta ARINC 014, formato, resolución, SDI y SSM son valores ilustrativos, no validados**. Al agregar un instrumento, introduzca su rango y parámetros BNR según el ICD (Interface Control Document) real. Los datos ingresados quedan marcados como pendientes de verificación; no deben usarse en equipos operativos sin revisión.

Se acepta BNR únicamente. El codificador construye una palabra de 32 bits con etiqueta, SDI, magnitud BNR, signo, SSM y paridad impar. La página muestra la vista previa en binario y guarda en cada envío el valor junto con los límites vigentes del instrumento. La conversión de bytes y el framing pueden depender del adaptador; valide el orden de bits y el formato con el fabricante. Crear, editar y previsualizar no transmiten. El botón Enviar es una acción explícita y el puerto serial está desactivado por defecto.

## Puerto serial / seguridad operacional

Por defecto `SERIAL_ENABLED=false`. No es suficiente conectar un puerto RS-232/USB genérico: ARINC429 requiere hardware transmisor dedicado para generar sus niveles eléctricos y temporización. Configure `SERIAL_ENABLED=true`, `SERIAL_PORT`, `SERIAL_BAUD_RATE` y el framing requerido **solo después de verificar la documentación del adaptador y comprobar el cableado en banco**. El servicio escribe cuatro bytes little-endian por palabra como comportamiento de ejemplo; no es universal. No conecte una salida no validada a aviónica ni equipos operativos.

## API

- `GET /api/instruments`
- `POST /api/instruments` (alta de instrumento con `number`, `name`, `unit`, `min`, `max`, `labelOctal`, `lsb`, `sdi` y `ssm`)
- `POST /api/arinc429/preview` (`instrumentNumber`, `value`)
- `GET /api/envios`, `GET /api/envios/:id`
- `POST /api/envios` (`instrumentNumber`, `value`)
- `PUT /api/envios/:id` (`instrumentNumber`, `value`)
- `DELETE /api/envios/:id`
- `POST /api/envios/:id/transmitir`
