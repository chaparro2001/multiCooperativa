# ADR-001: App híbrida con Expo que genera las apps nativas

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

El producto tiene que ser exclusivamente móvil y estar disponible en iOS y Android. Necesita capacidades nativas: cámara para escanear albaranes y facturas, notificaciones push, biometría y almacenamiento seguro.

Restricciones:

- Una sola persona y 22 días hasta la entrega.
- El backend es TypeScript.
- El resultado debe poder distribuirse como una app nativa de iOS y otra de Android.

## Opciones Consideradas

1. **SwiftUI nativo**
   - Máxima velocidad de desarrollo por experiencia previa.
   - Solo cubre iOS; Android exigiría una segunda app.

2. **Expo + React Native, generando las apps nativas**
   - Una base de código para iOS y Android.
   - Mismo lenguaje que el backend; contratos compartidos.
   - Módulos oficiales para cámara, push, biometría y almacenamiento seguro.
   - Curva de aprendizaje de React Native.

3. **Expo embebido en contenedores nativos (Swift y Kotlin)**
   - El código React Native se empaqueta como XCFramework y AAR, y lo aloja una app nativa por plataforma.
   - Dos proyectos nativos más y un pipeline de construcción en dos pasos.
   - El flujo aislado de Expo es reciente.

4. **Ionic + Capacitor**
   - Híbrida en sentido estricto: aplicación web dentro de un contenedor nativo.
   - Reutiliza herramientas web y regala versión de navegador.
   - Experiencia menos nativa.

5. **Flutter**
   - Buen rendimiento y una sola base de código.
   - Obliga a Dart y rompe el lenguaje único con el backend.

## Decisión

Usar **Expo + React Native + TypeScript**, dejando que Expo genere los proyectos nativos de iOS y Android y sus binarios (opción 2).

## Justificación

- **Cobertura**: iOS y Android con un solo desarrollo.
- **Lenguaje único**: los esquemas del paquete de contratos validan en el servidor y tipan en la app, lo que reduce errores de integración.
- **Encaje con el máster**: React, Testing Library y Sentry se trasladan casi directamente.
- **Simplicidad frente a la opción 3**: evita dos proyectos contenedores y unos dos días de trabajo extra, sin cerrar esa puerta.

## Consecuencias

### Positivas

- Monorepo sencillo: `apps/mobile`, `apps/api`, `packages/contracts`.
- Binarios de ambas plataformas desde CI con EAS Build.
- Toda la funcionalidad nativa mediante módulos de Expo, sin escribir Swift ni Kotlin.

### Negativas

- Se renuncia a la velocidad que daría SwiftUI.
- Curva de aprendizaje de React Native con el plazo en marcha.
- Android se valida solo en emulador durante el TFM.

### Salvaguarda

La configuración (URL del API, cooperativa, tema) se inyecta en lugar de incrustarse. Si en el futuro hay que embeber la app en otra aplicación nativa (opción 3), se empaqueta sin reescribirla.

## Referencias

- Expo SDK 56: https://expo.dev/changelog/sdk-56.md
- Expo brownfield, enfoque aislado: https://docs.expo.dev/brownfield/isolated-approach/
- React Native Brownfield (Callstack): https://oss.callstack.com/react-native-brownfield
