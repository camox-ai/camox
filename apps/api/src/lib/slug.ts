import { eq } from "drizzle-orm";
import {
  adjectives,
  animals,
  NumberDictionary,
  uniqueNamesGenerator,
} from "unique-names-generator";

import type { Database } from "../db";
import { projects } from "../schema";

const numberDictionary = NumberDictionary.generate({ min: 10, max: 99 });

function generateSlug(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals, numberDictionary],
    separator: "-",
    style: "lowerCase",
  });
}

/**
 * Generates a unique human-readable slug (e.g. "swift-falcon-42")
 * and verifies it doesn't collide with an existing project slug.
 * Retries up to 10 times on collision.
 */
export async function generateUniqueSlug(db: Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = generateSlug();
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .get();

    if (!existing) {
      return slug;
    }
  }

  throw new Error("Failed to generate a unique slug after 10 attempts");
}
