import { PulsingBorder } from "@paper-design/shaders-react";
import { Type, createBlock } from "camox/createBlock";

import { TerminalCard } from "@/components/TerminalCard";

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
    command: Type.String({
      default: "npx create-camox@latest my-site",
      title: "Command",
    }),
  },
  component: HeroComponent,
  toMarkdown: (c) => [`# ${c.title}`, c.description, `\`\`\`bash\n${c.command}\n\`\`\``],
});

function HeroComponent() {
  return (
    <>
      <section className="bg-background dark relative flex flex-col items-center justify-center overflow-hidden pt-36 pb-20 sm:pt-48 sm:pb-32">
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
        <div className="relative container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <hero.Field name="title">
              {(props) => (
                <h1
                  {...props}
                  className="text-foreground mb-6 text-4xl leading-tight font-medium tracking-tight sm:text-5xl md:text-6xl"
                />
              )}
            </hero.Field>
            <hero.Field name="description">
              {(props) => <p {...props} className="mb-10 text-lg opacity-75 sm:text-xl" />}
            </hero.Field>
          </div>
        </div>
      </section>
      <div className="bg-background pb-8 sm:pb-4">
        <div className="container mx-auto px-4">
          <div className="relative z-10 mx-auto max-w-xl -translate-y-1/2">
            <TerminalCard>
              <hero.Field name="command">
                {(props) => (
                  <code
                    {...props}
                    className="text-foreground block text-sm font-medium whitespace-nowrap sm:text-lg"
                  />
                )}
              </hero.Field>
            </TerminalCard>
          </div>
        </div>
      </div>
    </>
  );
}

export { hero as block };
