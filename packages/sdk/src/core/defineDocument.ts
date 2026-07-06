import type { UseHeadInput } from "unhead/types";

export type CamoxDocument = UseHeadInput;

export function defineDocument(document: CamoxDocument): CamoxDocument {
  return document;
}
