import { PulsingBorder } from "@paper-design/shaders-react";
import { Type, createBlock } from "camox/createBlock";

const hero = createBlock({
  id: "hero",
  title: "Hero",
  description:
    "Use this block as the main landing section at the top of a page. It should capture attention immediately with a clear value proposition.",
  content: {
    title: Type.String({
      default: "Welcome to Camox",
      title: "Title",
    }),
    description: Type.String({
      default: "Build something amazing with Camox.",
      maxLength: 280,
      title: "Description",
    }),
  },
  component: HeroComponent,
  toMarkdown: (c) => [`# ${c.title}`, c.description],
});

function HeroComponent() {
  return (
    <section className="bg-background dark relative flex flex-col items-center justify-center overflow-hidden py-20 sm:py-32">
      <PulsingBorder
        colors={["#047857", "#065f46", "#064e3b", "#3b0764", "#4c1d95"]}
        colorBack="#09090b"
        roundness={0}
        thickness={1}
        softness={1}
        intensity={0.1}
        bloom={0.2}
        spots={4}
        spotSize={0.25}
        pulse={0}
        smoke={0.32}
        smokeSize={0.5}
        speed={0.15}
        scale={1.1}
        marginLeft={0}
        marginRight={0}
        marginTop={0}
        marginBottom={0}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent" />
      <div className="relative container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <hero.Field name="title">
            {(props) => (
              <h1
                {...props}
                className="text-foreground mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
              />
            )}
          </hero.Field>
          <hero.Field name="description">
            {(props) => <p {...props} className="mb-10 text-lg opacity-75 sm:text-xl" />}
          </hero.Field>
        </div>
      </div>
    </section>
  );
}

export { hero as block };
