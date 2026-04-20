import { Button } from "@camox/ui/button";
import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";
import { ArrowRight } from "lucide-react";

const navbar = createBlock({
  id: "navbar",
  title: "Navbar",
  layoutOnly: true,
  description:
    "A navigation bar at the top of the page with a logo image on the left, navigation links in the middle, and a dashboard button on the right.",
  content: {
    logo: Type.Image({
      title: "Logo",
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
        toMarkdown: (c) => [c.link],
      },
    ),
  },
  component: NavbarComponent,
  toMarkdown: (c) => [c.logo, c.links],
});

function NavbarComponent() {
  return (
    <nav className="border-border border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center">
            <navbar.Image name="logo">
              {(props) => <img {...props} className="h-8 w-auto" />}
            </navbar.Image>
          </Link>

          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-6 md:flex">
              <navbar.Repeater name="links">
                {(linkItem) => (
                  <linkItem.Link name="link">
                    {(props) => (
                      <Link
                        {...props}
                        className="text-muted-foreground hover:text-foreground px-2 py-1 text-sm transition-colors"
                      />
                    )}
                  </linkItem.Link>
                )}
              </navbar.Repeater>
            </div>

            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link to="/dashboard">
                  Dashboard <ArrowRight className="text-muted-foreground" />
                </Link>
              }
            />
          </div>
        </div>
      </div>
    </nav>
  );
}

export { navbar as block };
