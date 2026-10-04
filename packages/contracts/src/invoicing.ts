import { z } from 'zod';

/** Importes en euros como cadena con 2 decimales como máximo: nunca number (RN-FAC-13). */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Importe con hasta 2 decimales');
/** Cantidades con hasta 3 decimales, como cadena. */
export const quantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Cantidad con hasta 3 decimales');
export const vatRateSchema = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tipo de IVA');
const day = z.iso.date();

export const operationSchema = z.enum(['compra', 'venta']);

// ── Terceros (HU-FAC-01) ──

export const thirdPartySchema = z.object({
  id: z.uuid(),
  nif: z.string(),
  name: z.string(),
  isSupplier: z.boolean(),
  isCustomer: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
});

export const thirdPartyInputSchema = z.object({
  nif: z.string().trim().min(1).max(20),
  name: z.string().max(200),
  isSupplier: z.boolean(),
  isCustomer: z.boolean(),
  email: z.string().trim().max(200).nullable().default(null),
  phone: z.string().trim().max(30).nullable().default(null),
});

/** PATCH /terceros/{id}: el NIF no se edita; `active: false` lo desactiva (RN-FAC-14). */
export const thirdPartyUpdateSchema = thirdPartyInputSchema.omit({ nif: true }).extend({
  active: z.boolean(),
});

/** GET /terceros?tipo=proveedor|cliente&q=…&inactivos=true */
export const listThirdPartiesQuerySchema = z.object({
  tipo: z.enum(['proveedor', 'cliente']).optional(),
  q: z.string().max(100).optional(),
  inactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const listThirdPartiesResponseSchema = z.object({ items: z.array(thirdPartySchema) });

export type Operation = z.infer<typeof operationSchema>;
export type ThirdParty = z.infer<typeof thirdPartySchema>;
export type ThirdPartyInput = z.infer<typeof thirdPartyInputSchema>;
export type ThirdPartyUpdate = z.infer<typeof thirdPartyUpdateSchema>;
export type ListThirdPartiesResponse = z.infer<typeof listThirdPartiesResponseSchema>;
export { day as daySchema };
