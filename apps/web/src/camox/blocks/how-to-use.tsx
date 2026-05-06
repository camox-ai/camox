import { Type, createBlock } from "camox/createBlock";

import { CaretLink } from "@/components/CaretLink";
import { Pill } from "@/components/Pill";

const howToUse = createBlock({
  id: "how-to-use",
  title: "How to use",
  description:
    "Use this block to walk visitors through a step-by-step process — onboarding flows, getting-started guides, or 'how it works' sections. The section opens with a pill label, then lists each step in a 2-column layout: text content on the left (large monospace step number, title, description, optional link) and a looping autoplay video on the right. Good fit for product walkthroughs, setup instructions, or any sequential explanation. Works well with 3 to 5 steps.",
  content: {
    pill: Type.String({
      default: "How it works",
      title: "Pill label",
    }),
    steps: Type.RepeatableItem({
      content: {
        title: Type.String({
          default: "Initialize your project",
          title: "Step title",
        }),
        description: Type.String({
          default:
            "Run the terminal command on your computer to get a project running locally. Open the localhost in your browser to see it.",
          title: "Step description",
        }),
        link: Type.Link({
          default: { text: "Learn more", href: "/", newTab: false },
          title: "Link",
        }),
        video: Type.File({
          accept: ["video/mp4", "video/webm", "video/quicktime"],
          title: "Video",
        }),
      },
      settings: {
        showLink: Type.Boolean({
          default: false,
          title: "Show link",
        }),
      },
      minItems: 1,
      maxItems: Infinity,
      title: "Steps",
      toMarkdown: (c, s) => [`### ${c.title}`, c.description, s.showLink(c.link), c.video],
    }),
  },
  component: HowToUseComponent,
  toMarkdown: (c) => [c.pill, c.steps],
});

function HowToUseComponent() {
  return (
    <section className="py-12 sm:py-16 md:py-20">
      <div className="container">
        <div className="mb-12 max-w-4xl">
          <howToUse.Field name="pill">{(props) => <Pill {...props} />}</howToUse.Field>
        </div>
        <div className="flex flex-col gap-20">
          <howToUse.Repeater name="steps">
            {(item, index) => {
              const showLink = item.useSetting("showLink");
              return (
                <div className="grid grid-cols-1 items-start gap-16 md:grid-cols-2">
                  <div className="flex items-baseline gap-8">
                    <div className="text-muted-foreground font-mono text-2xl font-semibold tracking-tight tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="flex flex-col gap-4">
                      <item.Field name="title">
                        {(props) => (
                          <h3
                            {...props}
                            className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl"
                          />
                        )}
                      </item.Field>
                      <item.Field name="description">
                        {(props) => <p {...props} className="text-muted-foreground text-lg" />}
                      </item.Field>
                      {showLink && (
                        <div>
                          <item.Link name="link">{(props) => <CaretLink {...props} />}</item.Link>
                        </div>
                      )}
                    </div>
                  </div>
                  <item.File name="video">
                    {(_props, { url }) => (
                      <video
                        src={url}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="bg-muted w-full rounded-xs object-cover"
                      />
                    )}
                  </item.File>
                </div>
              );
            }}
          </howToUse.Repeater>
        </div>
      </div>
    </section>
  );
}

export { howToUse as block };
