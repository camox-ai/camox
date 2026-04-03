import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

const footer = createBlock({
  id: "footer",
  title: "Footer",
  layoutOnly: true,
  description:
    "At the bottom of a page to provide the user with links and miscellaneous information.",
  toMarkdown: ["{{title}}", "{{columns}}"],
  content: {
    title: Type.String({ default: "Acme" }),
    columns: Type.RepeatableItem(
      {
        title: Type.String({ default: "Column Title" }),
        links: Type.RepeatableItem(
          {
            link: Type.Link({
              default: {
                text: "Resource",
                href: "#",
                newTab: false,
              },
              title: "Link",
            }),
          },
          {
            minItems: 1,
            maxItems: 999,
            toMarkdown: ["{{link}}"],
          },
        ),
      },
      {
        minItems: 2,
        maxItems: 4,
        title: "Columns",
        toMarkdown: ["### {{title}}", "{{links}}"],
      },
    ),
  },
  component: FooterComponent,
});

function FooterComponent() {
  return (
    <footer className="dark bg-background py-16">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-12 md:flex-row md:gap-16">
          {/* Left side: Logo + copyright */}
          <div className="shrink-0 md:w-1/4">
            <footer.Field name="title">
              {(content) => (
                <div className="text-foreground mb-2 text-2xl font-bold">{content}</div>
              )}
            </footer.Field>
            <p className="text-muted-foreground text-sm">
              &copy; {new Date().getFullYear()} All rights reserved.
            </p>
          </div>

          {/* Right side: Link columns */}
          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
            <footer.Repeater name="columns">
              {(column) => (
                <div>
                  <column.Field name="title">
                    {(content) => <h3 className="text-foreground mb-4 font-semibold">{content}</h3>}
                  </column.Field>
                  <ul className="space-y-2">
                    <column.Repeater name="links">
                      {(linkItem) => (
                        <li>
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
                        </li>
                      )}
                    </column.Repeater>
                  </ul>
                </div>
              )}
            </footer.Repeater>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { footer as block };
