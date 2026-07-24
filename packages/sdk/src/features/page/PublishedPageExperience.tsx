import { PublishedPageContent } from "./PublishedPageContent";

export function PublishedPageExperience({ source }: { source: "live" | "draft" }) {
  return <PublishedPageContent source={source} />;
}
