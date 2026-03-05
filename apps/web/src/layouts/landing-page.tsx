import { createLayout } from "camox/createLayout";
import { block as navbarBlock } from "../blocks/navbar";
import { block as footerBlock } from "../blocks/footer";

const landingPageLayout = createLayout({
  id: "landing-page",
  title: "Landing page",
  description:
    "Use for the home page, or other pages that are designed to be the first introduction of your site to visitors",
  blocks: { before: [navbarBlock], after: [footerBlock] },
  component: LandingPageLayout,
  buildMetaTitle: ({ pageMetaTitle, projectName }) =>
    `${projectName} | ${pageMetaTitle}`,
});

function LandingPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col">
      <landingPageLayout.blocks.Navbar />
      <div className="flex-1">{children}</div>
      <landingPageLayout.blocks.Footer />
    </main>
  );
}

export { landingPageLayout as layout };
