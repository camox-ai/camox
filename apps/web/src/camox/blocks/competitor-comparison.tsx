import { Type, createBlock } from "camox/createBlock";
import { Check, X } from "lucide-react";

import { Pill } from "@/components/Pill";

const competitorComparison = createBlock({
  id: "competitor-comparison",
  title: "Competitor Comparison",
  description:
    "Use this block to position the product against several competitor categories side by side. The section opens with a pill label and an inline headline (lead + muted continuation), then shows a 2-column grid where each card represents a competitor category — including small competitor logos, the category name, a short upside (what they get right) and a clearly emphasized downside (what hurts users). Below the grid sits a synthesis card with a list of capabilities the product keeps from every category, plus a closing headline and tagline. Good fit for 'Why us' or competitive landscape sections where the goal is to make the product's positioning unmissable. Works best with exactly 4 competitor categories so the grid forms a clean 2x2.",
  content: {
    pill: Type.String({
      default: "Why Camox",
      title: "Pill label",
    }),
    title: Type.String({
      default: "Every other tool forces a tradeoff.",
      title: "Title",
    }),
    competitors: Type.RepeatableItem({
      content: {
        category: Type.String({
          default: "Vibe coding platforms",
          title: "Category name",
        }),
        logos: Type.Image({
          multiple: true,
          defaultItems: 2,
          title: "Competitor logos",
        }),
        upside: Type.String({
          default: "Visual editing, fast iteration.",
          title: "What they get right",
        }),
        downside: Type.String({
          default: "Slop, expensive token bills, no reusable structure.",
          title: "What they get wrong",
        }),
      },
      minItems: 2,
      maxItems: 6,
      title: "Competitor categories",
      toMarkdown: (c) => [
        `### ${c.category}`,
        `**The good:** ${c.upside}`,
        `**The catch:** ${c.downside}`,
      ],
    }),
    camoxLabel: Type.String({
      default: "Camox",
      title: "Synthesis label",
    }),
    keptFromOthers: Type.RepeatableItem({
      content: {
        text: Type.String({
          default: "Visual & fast",
          title: "Kept feature",
        }),
      },
      minItems: 1,
      maxItems: 8,
      title: "What Camox keeps",
      toMarkdown: (c) => [c.text],
    }),
    camoxHeadline: Type.String({
      default: "The productivity of an agent with the maintainability of a CMS.",
      title: "Synthesis headline",
    }),
    camoxTagline: Type.String({
      default: "No slop.",
      title: "Synthesis tagline",
    }),
  },
  component: CompetitorComparisonComponent,
  toMarkdown: (c) => [
    c.pill,
    `## ${c.title}`,
    c.competitors,
    `### ${c.camoxLabel}`,
    c.keptFromOthers,
    `**${c.camoxHeadline}** ${c.camoxTagline}`,
  ],
});

function CompetitorComparisonComponent() {
  return (
    <section className="py-12 sm:py-16 md:py-20">
      <div className="container">
        <div className="mb-12 max-w-4xl">
          <competitorComparison.Field name="pill">
            {(props) => <Pill {...props} className="mb-6" />}
          </competitorComparison.Field>
          <competitorComparison.Field name="title">
            {(props) => (
              <h2
                {...props}
                className="text-foreground text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
              />
            )}
          </competitorComparison.Field>
        </div>

        <div className="border-border mb-4 w-full overflow-hidden rounded-2xl border">
          <div className="bg-border grid grid-cols-1 gap-px md:grid-cols-2">
            <competitorComparison.Repeater name="competitors">
              {(item) => (
                <div className="bg-background flex h-full flex-col gap-5 p-6 sm:p-8">
                  <div className="flex flex-row flex-wrap items-center gap-3">
                    <item.MultipleAssets name="logos">
                      {(props) => <img {...props} className="size-9 object-contain" />}
                    </item.MultipleAssets>
                  </div>
                  <item.Field name="category">
                    {(props) => (
                      <h3
                        {...props}
                        className="text-foreground text-xl font-semibold tracking-tight"
                      />
                    )}
                  </item.Field>
                  <div className="border-border mt-auto flex flex-col gap-3 border-t border-dashed pt-5">
                    <div className="flex flex-row items-start gap-2.5">
                      <Check
                        aria-hidden
                        className="text-primary mt-0.5 size-4 shrink-0"
                        strokeWidth={2.5}
                      />
                      <item.Field name="upside">
                        {(props) => <p {...props} className="text-muted-foreground text-base" />}
                      </item.Field>
                    </div>
                    <div className="flex flex-row items-start gap-2.5">
                      <X
                        aria-hidden
                        className="text-destructive mt-0.5 size-4 shrink-0"
                        strokeWidth={2.5}
                      />
                      <item.Field name="downside">
                        {(props) => (
                          <p {...props} className="text-foreground text-base font-semibold" />
                        )}
                      </item.Field>
                    </div>
                  </div>
                </div>
              )}
            </competitorComparison.Repeater>
          </div>
        </div>

        <div className="bg-primary text-primary-foreground rounded-2xl p-6 sm:p-10">
          <competitorComparison.Field name="camoxLabel">
            {(props) => (
              <p
                {...props}
                className="mb-6 text-sm font-semibold tracking-wider uppercase opacity-80"
              />
            )}
          </competitorComparison.Field>
          <div className="mb-8 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <competitorComparison.Repeater name="keptFromOthers">
              {(item) => (
                <div className="flex flex-row items-center gap-2.5">
                  <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
                  <item.Field name="text">
                    {(props) => <p {...props} className="text-base" />}
                  </item.Field>
                </div>
              )}
            </competitorComparison.Repeater>
          </div>
          <p className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
            <competitorComparison.Field name="camoxHeadline">
              {(props) => <span {...props} />}
            </competitorComparison.Field>{" "}
            <competitorComparison.Field name="camoxTagline">
              {(props) => <span {...props} className="opacity-75" />}
            </competitorComparison.Field>
          </p>
        </div>
      </div>
    </section>
  );
}

export { competitorComparison as block };
