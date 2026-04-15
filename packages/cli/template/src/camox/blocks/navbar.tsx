import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

import { Button } from "@/components/ui/button";

const navbar = createBlock({
  id: "navbar",
  title: "Navbar",
  layoutOnly: true,
  description:
    "A navigation bar at the top of a page with a brand name, navigation links, and a call-to-action link.",
  toMarkdown: ["{{title}}", "{{links}}", "{{cta}}"],
  content: {
    title: Type.Link({
      title: "Site name",
      default: {
        href: "/",
        text: "{{projectName}}",
        newTab: false,
      },
    }),
    links: Type.RepeatableItem(
      {
        link: Type.Link({
          default: { text: "Link", href: "#", newTab: false },
          title: "Link",
        }),
      },
      {
        minItems: 1,
        maxItems: 6,
        title: "Links",
        toMarkdown: ["{{link}}"],
      },
    ),
    cta: Type.Link({
      default: { text: "Get Started", href: "#", newTab: false },
      title: "CTA",
    }),
  },
  component: NavbarComponent,
});

function NavbarComponent() {
  return (
    <nav className="dark bg-background border-border border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <navbar.Link name="title">
            {(props) => <Link {...props} className="text-foreground text-xl font-bold" />}
          </navbar.Link>

          <div className="flex items-center gap-6">
            <navbar.Repeater name="links">
              {(linkItem) => (
                <linkItem.Link name="link">
                  {(props) => (
                    <Link
                      {...props}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    />
                  )}
                </linkItem.Link>
              )}
            </navbar.Repeater>

            <navbar.Link name="cta">
              {(props) => (
                <Button size="sm" asChild>
                  <Link {...props} />
                </Button>
              )}
            </navbar.Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

export { navbar as block };
