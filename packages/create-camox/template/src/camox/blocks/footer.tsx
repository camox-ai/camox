import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

const footer = createBlock({
  id: "footer",
  title: "Footer",
  layoutOnly: true,
  description: "A footer at the bottom of a page with a site name and navigation links.",
  toMarkdown: ["{{title}}", "{{links}}"],
  content: {
    title: Type.String({ default: "{{projectName}}" }),
    links: Type.RepeatableObject(
      {
        link: Type.Link({
          default: { text: "Link", href: "#", newTab: false },
          title: "Link",
        }),
      },
      {
        minItems: 1,
        maxItems: 12,
        title: "Links",
        toMarkdown: ["{{link}}"],
      },
    ),
  },
  component: FooterComponent,
});

function FooterComponent() {
  return (
    <footer className="dark bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <footer.Field name="title">
            {(content) => <div className="text-foreground text-lg font-bold">{content}</div>}
          </footer.Field>

          <div className="flex flex-wrap items-center gap-4">
            <footer.Repeater name="links">
              {(linkItem) => (
                <linkItem.Link name="link">
                  {({ text, href, newTab }) => (
                    <Link
                      to={href}
                      target={newTab ? "_blank" : undefined}
                      rel={newTab ? "noreferrer" : undefined}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {text}
                    </Link>
                  )}
                </linkItem.Link>
              )}
            </footer.Repeater>
          </div>
        </div>

        <div className="text-muted-foreground mt-8 text-center text-sm">
          &copy; {new Date().getFullYear()} All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export { footer as block };
