import { Link } from "@tanstack/react-router";
import { Type, createBlock } from "camox/createBlock";

import { Button } from "@/components/ui/button";

const hero = createBlock({
  id: "hero",
  title: "Hero",
  description:
    "Use this block as the main landing section at the top of a page. It should capture attention immediately with a clear value proposition.",
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
  toMarkdown: (c) => [`# ${c.title}`, c.description, c.cta],
});

function HeroComponent() {
  return (
    <section className="flex flex-col items-center justify-center py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <hero.Field name="title">
            {(props) => (
              <h1
                {...props}
                className="text-foreground mb-6 text-5xl font-bold tracking-tight sm:text-6xl"
              />
            )}
          </hero.Field>
          <hero.Field name="description">
            {(props) => <p {...props} className="text-muted-foreground mb-10 text-xl" />}
          </hero.Field>
          <hero.Link name="cta">
            {(props) => <Button size="lg" nativeButton={false} render={<Link {...props} />} />}
          </hero.Link>
        </div>
      </div>
    </section>
  );
}

export { hero as block };
