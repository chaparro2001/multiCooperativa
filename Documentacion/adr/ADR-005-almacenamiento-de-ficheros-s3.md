# ADR-005: Almacenamiento de ficheros compatible con S3 detrás de un puerto

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

Comunicados, documentos y facturas guardan ficheros (PDF y fotos de albaranes). Los requisitos fijan:

- Fuera de la base de datos y con claves no adivinables (RNF-DOC-04).
- Servidos con URL firmadas que caducan a los 5 minutos (RNF-COM-03, RNF-DOC-02).
- Aislamiento por cooperativa, como el resto de datos (ADR-003).

El backend se despliega en Railway y se desarrolla en local con Docker Compose. Los tests de integración corren también en GitHub Actions.

## Opciones Consideradas

1. **Disco local del servidor**
   - Sin dependencias externas.
   - Railway no garantiza un disco persistente entre despliegues, y habría que implementar a mano la firma y caducidad de URL.

2. **Columnas binarias en PostgreSQL**
   - Un solo almacén.
   - Contradice RNF-DOC-04, infla las copias de seguridad y obliga a servir los ficheros desde el API.

3. **Almacenamiento de objetos con API S3**
   - URL firmadas con caducidad de serie (firma SigV4).
   - Lo ofrecen AWS, Cloudflare R2 y los buckets de Railway, entre otros; en local, un servidor compatible en Docker.

## Decisión

Usar **almacenamiento de objetos con API S3** (opción 3) a través de un puerto `FileStorage` en `apps/api/src/shared/files/`. Los módulos solo conocen el puerto: guardar, firmar una URL de descarga, leer (para la indexación) y borrar.

- Clave de cada fichero: `cooperativas/<cooperativaId>/<area>/<uuid aleatorio>`. El UUID la hace no adivinable; el prefijo permite borrar o auditar por cooperativa.
- Las URL firmadas caducan a los 5 minutos y fijan el `Content-Type` y el nombre de descarga.
- Las subidas pasan por el API, que valida tipo y tamaño antes de guardar. La app no sube directamente al almacenamiento.
- En desarrollo y en CI se usa **RustFS** (`rustfs/rustfs:1.0.1`), servidor compatible con S3 que valida firmas y caducidad como uno real. MinIO, la opción habitual, dejó de publicar imágenes de su edición comunitaria.
- El proveedor de producción se elige al desplegar (Hito 6) solo con variables de entorno, sin tocar código.

## Consecuencias

### Positivas

- La firma y la caducidad de las URL las resuelve el proveedor.
- Cambiar de proveedor es configuración.
- Los tests de integración ejercitan el mismo protocolo que producción.

### Negativas

- Un servicio más en Docker Compose y en CI.
- Las subidas consumen ancho de banda y memoria del API. Con los límites de 10–20 MB por fichero es asumible.
- La URL firmada apunta al almacenamiento: en un dispositivo físico, el endpoint configurado tiene que ser alcanzable desde la red del móvil.

## Referencias

- [requisitos/02-comunicados.md](../requisitos/02-comunicados.md), [requisitos/03-documentos.md](../requisitos/03-documentos.md)
- [ADR-003](ADR-003-multi-cooperativa.md)
