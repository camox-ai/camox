import { createLayout } from "camox/createLayout";
import { block as navbarBlock } from "../blocks/navbar";
import { block as footerBlock } from "../blocks/footer";

const regularPageLayout = createLayout({
  id: "regular-page",
  title: "Regular page",
  description:
    "Use for standard content pages like About, Contact, or any non-landing page",
  blocks: { before: [navbarBlock], after: [footerBlock] },
  component: RegularPageLayout,
  buildMetaTitle: ({ pageMetaTitle, projectName }) => `${pageMetaTitle} | ${projectName}`,
});

function RegularPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col">
      <regularPageLayout.blocks.Navbar />
      <div className="flex-1">{children}</div>
      <regularPageLayout.blocks.Footer />
    </main>
  );
}

export { regularPageLayout as layout };
