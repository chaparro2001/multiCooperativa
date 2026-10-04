# ADR-006: Embeddings con un modelo local servido por Ollama

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

Los documentos de cada cooperativa se indexan para la búsqueda por contenido (HU-DOC-07) y para el RAG del asistente (requisitos/07). Indexar exige calcular el embedding de cada fragmento, y buscar, el de cada consulta.

Restricciones:

- Contenido en español: estatutos, actas, reglamentos.
- El proveedor queda detrás de un puerto (RNF-IA-02) y sus claves, si las hay, solo en el backend (RNF-IA-03).
- Un documento de 50 páginas debe quedar indexado en menos de 60 segundos (RNF-DOC-01).
- La dimensión del vector se fija en el esquema de pgvector: cambiar de modelo obliga a migrar y reindexar.

## Opciones Consideradas

1. **Voyage AI** (`voyage-3.5`, 1024 dimensiones)
   - Socio recomendado por Anthropic para RAG; multilingüe.
   - Clave de API, coste por uso y los textos de las cooperativas salen a un tercero.

2. **OpenAI** (`text-embedding-3-small`, 1536 dimensiones)
   - Barato y muy extendido.
   - Mismos inconvenientes de clave, coste y salida de datos.

3. **Modelo local con Ollama** (`bge-m3`, 1024 dimensiones)
   - Sin claves ni coste por uso; los documentos no salen de la infraestructura propia.
   - Un servicio más que desplegar y más lento en CPU.

## Decisión

Usar un **modelo local servido por Ollama** (opción 3), con **`bge-m3`**: multilingüe, buen rendimiento en español y vectores de 1024 dimensiones.

- El módulo de documentos depende del puerto `Embedder`; el adaptador llama a la API HTTP de Ollama (`/api/embed`) por lotes.
- La columna `embedding` es `vector(1024)`. El adaptador comprueba la dimensión y falla con un mensaje claro si el modelo configurado no la cumple.
- En desarrollo, Ollama corre en Docker Compose (`ollama/ollama:0.35.1`) y el modelo se descarga con `pnpm ai:pull`.
- Los tests y la CI usan un `Embedder` determinista en memoria; el adaptador de Ollama tiene un test de integración que solo se ejecuta si Ollama responde.
- La indexación es asíncrona respecto a la subida (requisitos/03, apartado 4): una cola en proceso, que al arrancar recupera las versiones pendientes.

## Consecuencias

### Positivas

- Ni claves ni coste por uso; el texto de los documentos no sale de la infraestructura.
- Cambiar a un proveedor externo es otro adaptador del mismo puerto, más una migración si cambia la dimensión.

### Negativas

- En producción (Hito 6) hace falta un servicio de Ollama con el modelo y memoria suficiente (unos 2 GB).
- En Docker sobre macOS no hay aceleración por GPU: indexar es más lento en local que en un servidor Linux.
- La cola en proceso no sobrevive a un reinicio a mitad de trabajo; lo compensa la recuperación de pendientes al arrancar.

## Referencias

- [requisitos/03-documentos.md](../requisitos/03-documentos.md), [requisitos/07-asistente-ia.md](../requisitos/07-asistente-ia.md)
- [ADR-003](ADR-003-multi-cooperativa.md): todo fragmento lleva `cooperativaId` y la búsqueda filtra por él.
