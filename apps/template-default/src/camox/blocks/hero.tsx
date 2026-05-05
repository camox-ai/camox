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
      default: "Let's get going on {{projectName}}",
      title: "Title",
    }),
    description: Type.String({
      default: "Build something amazing with Camox. Press ⌘+Enter to start editing content.",
      maxLength: 280,
      title: "Description",
    }),
    cta: Type.Link({
      default: { text: "Get Started", href: "/", newTab: false },
      title: "CTA",
    }),
    illustration: Type.Image({
      title: "Illustration",
    }),
  },
  settings: {
    withIllustration: Type.Boolean({
      default: true,
      title: "With illustration",
    }),
  },
  component: HeroComponent,
  toMarkdown: (c, s) => [`# ${c.title}`, c.description, s.withIllustration(c.illustration), c.cta],
});

function HeroComponent() {
  const withIllustration = hero.useSetting("withIllustration");

  if (withIllustration) {
    return (
      <section className="py-32">
        <div className="container mx-auto px-4">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
            <div className="text-left">
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
            <hero.Image name="illustration">
              {(props) => (
                <img {...props} className="h-auto w-full max-w-sm rounded-lg lg:max-w-md" />
              )}
            </hero.Image>
          </div>
        </div>
      </section>
    );
  }

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
