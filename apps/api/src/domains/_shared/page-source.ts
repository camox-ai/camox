import { z } from "zod";

// `source` selects the data plane a read serves from. Phase 1 of Draft &
// Publish: 'live' follows the page's live_published_checkpoint_id and parses
// the snapshot; 'draft' joins the live rows (today's behavior); the object
// form pins to a specific checkpoint id. Default at each call site varies —
// SDK loaders default 'live', studio/CLI default 'draft'.
//
// Lives here (not in pages/service.ts) because it's referenced at module-init
// time by both blocks/service.ts and pages/service.ts; routing it through a
// leaf module avoids a circular-init that left it `undefined` when the
// bundler emitted blocks/service.ts first (triggered by ai-tools providers
// importing from both services). See git history for the cycle.
export const pageSourceSchema = z.union([
  z.literal("live"),
  z.literal("draft"),
  z.object({ checkpointId: z.number() }),
]);
export type PageSource = z.infer<typeof pageSourceSchema>;
