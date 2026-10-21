import { z } from 'zod';

/** #RRGGBB; the server stores it upper-case. */
export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** GET /cooperatives/{id}/branding: what every member of the cooperative sees (US-ACC-14). */
export const brandingSchema = z.object({
  primaryColor: brandColorSchema.nullable(),
  updatedAt: z.string().nullable(),
});

/** PUT /cooperatives/{id}/branding/primary-color; `null` goes back to the default colour. */
export const updateBrandColorBodySchema = z.strictObject({
  primaryColor: brandColorSchema.nullable(),
});

/** Minimum contrast of white text on the primary colour (WCAG AA, BR-ACC-16). */
export const BRAND_MIN_CONTRAST = 4.5;

export type Branding = z.infer<typeof brandingSchema>;
export type UpdateBrandColorBody = z.infer<typeof updateBrandColorBodySchema>;
