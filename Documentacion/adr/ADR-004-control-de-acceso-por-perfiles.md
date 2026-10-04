# ADR-004: Control de acceso por perfiles con permisos por módulo, nivel y alcance

**Fecha**: 2026-10-04

**Estado**: Aceptado

## Contexto

Cada cooperativa necesita dar acceso a los módulos de la app según el papel de cada persona: socio, consejo rector, gestor o administrador. Dos personas con acceso al mismo módulo pueden ver datos distintos: en el área del socio, cada socio ve solo sus aportaciones y el gestor las de todos.

Además, hay acciones que no dependen del papel sino de la condición societaria: un gestor contratado que no es socio puede administrar facturas, pero no votar en una asamblea.

## Opciones Consideradas

1. **Roles fijos en código**
   - Lo más rápido de implementar.
   - Cualquier cambio de permisos exige desplegar; no admite perfiles propios por cooperativa.

2. **Perfiles con permisos por módulo, nivel y alcance (RBAC)**
   - Permiso = módulo + nivel (sin acceso, consulta, gestión) + alcance (propias, todas).
   - Perfiles como datos, definidos por cooperativa.
   - Algo más de modelo y de tests.

3. **Motor de políticas por atributos (ABAC)**
   - Máxima flexibilidad.
   - Complejidad y curva desproporcionadas para el alcance.

## Decisión

Usar **perfiles con permisos por módulo, nivel y alcance** (opción 2), con cuatro perfiles predefinidos en el MVP.

## Justificación

- **Cubre el requisito**: permite dar acceso a módulos por perfil sin tocar código.
- **El alcance evita duplicar perfiles**: socio y gestor comparten el área del socio y se diferencian en qué datos ven.
- **Preparado para crecer**: el modelo soporta perfiles a medida desde el primer día, aunque el editor no entre en el MVP.

## Decisiones asociadas

1. **El backend es la autoridad.** Cada caso de uso comprueba el permiso y deniega por defecto. La app solo adapta la navegación a lo que devuelve el servidor.
2. **Los permisos no viajan en el token.** Se resuelven en cada petición a partir de la membresía, para que un cambio de perfil o una suspensión tengan efecto inmediato.
3. **Votar no es un permiso de perfil.** Depende de la condición de socio registrada en la membresía.
4. **El asistente de IA hereda los permisos.** Sus herramientas y la búsqueda del RAG aplican las mismas reglas que el resto de casos de uso.

## Consecuencias

### Positivas

- Matriz de permisos explícita y fácil de auditar.
- Una batería de tests parametrizada (perfil por módulo) demuestra la ausencia de Broken Access Control.
- Cambios de acceso con efecto inmediato.

### Negativas

- Una consulta adicional de permisos por petición (mitigable con caché de vida corta).
- Más combinaciones que probar que con roles fijos.

## Referencias

- [requisitos/01-acceso-y-perfiles.md](../requisitos/01-acceso-y-perfiles.md)
- Máster, Seguridad: Broken Access Control; Autenticación, autorización y gestión de credenciales.
