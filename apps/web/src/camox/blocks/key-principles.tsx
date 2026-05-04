import { Type, createBlock } from "camox/createBlock";
import { CircleCheck } from "lucide-react";

import { CaretLink } from "@/components/CaretLink";
import { Pill } from "@/components/Pill";

const keyPrinciples = createBlock({
  id: "key-principles",
  title: "Key Principles",
  description:
    "Use this block to highlight a small set of guiding principles, pillars, or differentiators that define a product or company. The section opens with a pill label and a large headline, then lists each principle in a card with a check icon, a title, a description, and an optional learn-more link. Good fit for 'how we think', 'core values', protocols, or product principle sections. Works best with 3 items so the grid is balanced.",
  content: {
    pill: Type.String({
      default: "Principles",
      title: "Pill label",
    }),
    title: Type.String({
      default: "Built around a few key principles.",
      title: "Title",
    }),
    items: Type.RepeatableItem({
      content: {
        title: Type.String({
          default: "Context Server",
          title: "Title",
        }),
        description: Type.String({
          default:
            "Intelligent tools that replace built-in file reads, shell commands, and code search. Understands your intent and tracks context window pressure autonomously.",
          title: "Description",
        }),
        link: Type.Link({
          default: { text: "Learn more", href: "/", newTab: false },
          title: "Link",
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
      title: "Principles",
      toMarkdown: (c, s) => [`### ${c.title}`, c.description, s.showLink(c.link)],
    }),
  },
  component: KeyPrinciplesComponent,
  toMarkdown: (c) => [c.pill, `## ${c.title}`, c.items],
});

function KeyPrinciplesComponent() {
  return (
    <section className="py-12 sm:py-20">
      <div className="container">
        <div className="mb-8 max-w-4xl sm:mb-12">
          <keyPrinciples.Field name="pill">
            {(props) => <Pill {...props} className="mb-4 sm:mb-6" />}
          </keyPrinciples.Field>
          <keyPrinciples.Field name="title">
            {(props) => (
              <h2
                {...props}
                className="text-foreground text-xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl"
              />
            )}
          </keyPrinciples.Field>
        </div>
        <div className="border-border w-full overflow-hidden rounded-2xl border">
          <div className="bg-border grid grid-cols-1 gap-px md:grid-cols-3">
            <keyPrinciples.Repeater name="items">
              {(item) => {
                const showLink = item.useSetting("showLink");
                return (
                  <div className="bg-popover flex h-full flex-col gap-4 p-6 sm:p-8">
                    <CircleCheck aria-hidden className="text-muted-foreground size-5" />

                    <item.Field name="title">
                      {(props) => (
                        <h3
                          {...props}
                          className="text-foreground text-2xl font-semibold tracking-tight sm:text-3xl"
                        />
                      )}
                    </item.Field>
                    <item.Field name="description">
                      {(props) => <p {...props} className="text-muted-foreground text-base" />}
                    </item.Field>
                    {showLink && (
                      <div className="mt-auto pt-4">
                        <item.Link name="link">{(props) => <CaretLink {...props} />}</item.Link>
                      </div>
                    )}
                  </div>
                );
              }}
            </keyPrinciples.Repeater>
          </div>
        </div>
      </div>
    </section>
  );
}

export { keyPrinciples as block };
