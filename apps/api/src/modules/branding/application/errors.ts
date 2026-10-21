/** Base class for the failures of the branding use cases. */
export abstract class BrandingApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** BR-ACC-16: white text on the colour would not reach WCAG AA. */
export class InsufficientContrastError extends BrandingApplicationError {
  readonly code = 'insufficient_contrast';

  constructor(
    /** Computed ratio, rounded to two decimals. */
    readonly ratio: number,
    readonly minimum: number,
  ) {
    super(
      `White text on this colour has a contrast of ${ratio}:1; at least ${minimum}:1 is required.`,
    );
  }
}

export class InvalidBrandColorError extends BrandingApplicationError {
  readonly code = 'invalid_color';

  constructor() {
    super('The primary colour must be written as #RRGGBB.');
  }
}

export type LogoRejection =
  'svg_not_allowed' | 'unsupported_type' | 'too_large' | 'too_large_dimensions';

/** BR-ACC-17. */
export class LogoRejectedError extends BrandingApplicationError {
  readonly code = 'logo_rejected';

  constructor(readonly reason: LogoRejection) {
    super(`The logo was rejected: ${reason}.`);
  }
}
