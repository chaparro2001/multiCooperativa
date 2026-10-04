# 01 · Visión y alcance

**Fecha**: 2026-10-04 · **Estado**: Aceptado

## Producto

Aplicación móvil multi-cooperativa que conecta a cada cooperativa con sus socios (información y participación) y le da control de los albaranes y facturas con sus proveedores y clientes, con un asistente de IA que respeta los permisos de cada usuario.

Es una solución estándar, válida para cualquier tipo de cooperativa (agraria, de vivienda, de trabajo asociado, de consumo). No incluye funcionalidad sectorial.

## Problema

El socio de una cooperativa participa poco y mal informado:

- Las convocatorias llegan por carta o tablón.
- Estatutos, reglamento y actas no están a mano.
- No sabe cuánto tiene aportado al capital social.
- Los albaranes y facturas con proveedores y clientes viven en papel, y los descuadres entre ambos, los pagos y los cobros vencidos se detectan tarde o nunca.

## Usuarios

| Perfil | Quién es | Qué necesita |
|---|---|---|
| Socio | Miembro de la cooperativa | Estar informado, votar, consultar documentos y sus aportaciones |
| Consejo rector | Órgano de gobierno | Publicar comunicados, convocar asambleas, supervisar pagos y cobros |
| Gestor | Personal de administración (puede no ser socio) | Registrar y conciliar albaranes y facturas de proveedores y clientes, controlar vencimientos |
| Administrador | Responsable de la cooperativa en la app | Dar acceso a usuarios y asignar perfiles |

## Módulos del MVP

1. **Acceso y perfiles**: login, desbloqueo biométrico, membresías en varias cooperativas, cuatro perfiles predefinidos y asignación de perfil.
2. **Comunicados**: publicación por el consejo y consulta por los socios, con notificaciones push.
3. **Asambleas**: convocatoria, orden del día, documentación y votación consultiva por punto, con quórum y mayorías.
4. **Documentos**: estatutos, reglamento, actas y cuentas anuales. Alimentan el RAG del asistente.
5. **Facturas y albaranes**: proveedores y clientes, albaranes y facturas de compra y venta, conciliación automática, control de pagos y cobros con vencimientos, y captura con cámara mediante un modelo de visión.
6. **Área del socio**: datos y aportaciones al capital social, solo consulta.
7. **Asistente IA**: RAG sobre documentos y tool calling sobre los datos del usuario, filtrado por perfil y cooperativa.

## Deseable (si sobra tiempo)

- Editor de perfiles a medida.
- Delegación de voto y voto secreto.
- Resumen automático de actas.

## Fuera de alcance

- Emisión de facturas con validez fiscal. La app controla y consulta, no emite.
- Contabilidad, libros de IVA y pagos reales.
- Acceso de proveedores o clientes a la app.
- Altas y bajas de socios como proceso societario.
- Módulos sectoriales (entregas agrarias, obra, turnos).
- Panel web de administración.
- Alta de cooperativas por pantalla (se hace por script).
- Consulta sin conexión.

## Plan de trabajo

| Semana | Foco |
|---|---|
| 5–11 oct | Especificación, dominio y ADRs; monorepo; backend de acceso, perfiles, comunicados y documentos; CI; esqueleto de la app con login y navegación por permisos |
| 12–18 oct | Asambleas y votación; facturas y albaranes con conciliación; RAG sobre documentos; pantallas de la app |
| 19–25 oct | Escaneo con visión y tool calling; push; tests de la matriz de permisos; revisión de seguridad; despliegue; memoria y vídeo |

**Cierre de funcionalidad**: 22 de octubre. A partir de ahí, solo correcciones, pruebas y memoria.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Alcance ambicioso para una persona en 22 días | Orden de recorte acordado: reclamaciones, aportaciones, votación con mayorías reforzadas |
| Curva de aprendizaje de React Native | Desarrollo diario contra iOS; Android validado en emulador; apoyo en IA para el código repetitivo |
| Enunciado oficial del TFM aún no revisado | Contrastar el alcance con el enunciado en cuanto esté disponible |
| Datos de terceros (NIF, autónomos) enviados al modelo de visión | Justificarlo en la memoria y minimizar lo que se envía |

**No se recorta**: perfiles, facturas con escaneo y asistente IA. Son lo que diferencia el proyecto.

## Supuestos

- La votación en asambleas es consultiva o de apoyo: el voto telemático con plena validez legal exige garantías que no caben en el plazo.
