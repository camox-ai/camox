import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

import { Button } from "@/components/ui/button";

const hero = createBlock({
  id: "hero",
  title: "Hero",
  description:
    "Use this block as the main landing section at the top of a page. It should capture attention immediately with a clear value proposition.",
  toMarkdown: ["# {{title}}", "{{description}}", "{{cta}}"],
  content: {
    title: Type.String({
      default: "Welcome to {{projectName}}",
      title: "Title",
    }),
    description: Type.String({
      default: "Build something amazing with Camox.",
      maxLength: 280,
      title: "Description",
    }),
    cta: Type.Link({
      default: { text: "Get Started", href: "/", newTab: false },
      title: "CTA",
    }),
  },
  component: HeroComponent,
});

function HeroComponent() {
  return (
    <section className="flex flex-col items-center justify-center py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <hero.Field name="title">
            {(content) => (
              <h1 className="text-foreground mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
                {content}
              </h1>
            )}
          </hero.Field>
          <hero.Field name="description">
            {(content) => <p className="text-muted-foreground mb-10 text-xl">{content}</p>}
          </hero.Field>
          <hero.Link name="cta">
            {({ text, href, newTab }) => (
              <Button size="lg" asChild>
                <Link
                  to={href}
                  target={newTab ? "_blank" : undefined}
                  rel={newTab ? "noreferrer" : undefined}
                >
                  {text}
                </Link>
              </Button>
            )}
          </hero.Link>
        </div>
      </div>
    </section>
  );
}

export { hero as block };
