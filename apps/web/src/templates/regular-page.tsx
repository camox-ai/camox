import { createTemplate } from "camox/createTemplate";
import { block as navbarBlock } from "../blocks/navbar";
import { block as footerBlock } from "../blocks/footer";

const regularPageTemplate = createTemplate({
  id: "regular-page",
  title: "Regular page",
  description:
    "Use for standard content pages like About, Contact, or any non-landing page",
  blocks: { before: [navbarBlock], after: [footerBlock] },
  component: RegularPageTemplate,
  buildMetaTitle: ({ pageMetaTitle, projectName }) => `${pageMetaTitle} | ${projectName}`,
});

function RegularPageTemplate({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col">
      <regularPageTemplate.blocks.Navbar />
      <div className="flex-1">{children}</div>
      <regularPageTemplate.blocks.Footer />
    </main>
  );
}

export { regularPageTemplate as template };
