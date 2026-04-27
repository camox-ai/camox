import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

const footer = createBlock({
  id: "footer",
  title: "Footer",
  layoutOnly: true,
  description:
    "At the bottom of a page to provide the user with links and miscellaneous information.",
  content: {
    logo: Type.Image({ title: "Logo" }),
    columns: Type.RepeatableItem({
      content: {
        title: Type.String({ default: "Column Title" }),
        links: Type.RepeatableItem({
          content: {
            link: Type.Link({
              default: {
                text: "Resource",
                href: "#",
                newTab: false,
              },
              title: "Link",
            }),
          },
          minItems: 1,
          maxItems: 999,
          toMarkdown: (c) => [c.link],
        }),
      },
      minItems: 2,
      maxItems: 4,
      title: "Columns",
      toMarkdown: (c) => [`### ${c.title}`, c.links],
    }),
  },
  component: FooterComponent,
  toMarkdown: (c) => [c.columns],
});

function FooterComponent() {
  return (
    <footer className="dark bg-background py-16">
      <div className="container">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between md:gap-16">
          {/* Left side: Logo + copyright */}
          <div className="shrink-0 md:w-1/4">
            <footer.Image name="logo">
              {(props) => <img {...props} className="h-8 w-auto" />}
            </footer.Image>
            <p className="text-muted-foreground mt-1 text-sm">
              &copy; {new Date().getFullYear()} all rights reserved.
            </p>
          </div>

          {/* Right side: Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:flex md:justify-end md:gap-16">
            <footer.Repeater name="columns">
              {(column) => (
                <div className="flex flex-col gap-2 md:w-[10rem]">
                  <column.Field name="title">
                    {(props) => <h3 {...props} className="text-foreground text-sm font-medium" />}
                  </column.Field>
                  <ul className="space-y-2">
                    <column.Repeater name="links">
                      {(linkItem) => (
                        <li>
                          <linkItem.Link name="link">
                            {(props) => (
                              <Link
                                {...props}
                                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                              />
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
