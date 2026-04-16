declare module "virtual:camox-studio-css" {
  const url: string;
  export default url;
}

declare module "virtual:camox-overlay-css" {
  const css: string;
  export default css;
}

// Temporal API types (Stage 3, available in modern browsers)
declare namespace Temporal {
  class Instant {
    static fromEpochMilliseconds(epochMs: number): Instant;
    since(other: Instant): Duration;
  }
  class Duration {
    total(unit: string): number;
  }
  namespace Now {
    function instant(): Instant;
  }
}
