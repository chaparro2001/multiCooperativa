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
