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
    links: Type.RepeatableObject(
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
            {(link) => (
              <Link className="text-foreground text-xl font-bold" to={link.href}>
                {link.text}
              </Link>
            )}
          </navbar.Link>

          <div className="flex items-center gap-6">
            <navbar.Repeater name="links">
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
            </navbar.Repeater>

            <navbar.Link name="cta">
              {({ text, href, newTab }) => (
                <Button size="sm" asChild>
                  <Link
                    to={href}
                    target={newTab ? "_blank" : undefined}
                    rel={newTab ? "noreferrer" : undefined}
                  >
                    {text}
                  </Link>
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
