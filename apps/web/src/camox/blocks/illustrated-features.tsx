import { Type, createBlock } from "camox/createBlock";

import { InlineHeading } from "@/components/InlineHeading";
import { Pill } from "@/components/Pill";

const illustratedFeatures = createBlock({
  id: "illustrated-features",
  title: "Illustrated Features",
  description:
    "Use this block to showcase a list of product features in depth. The section opens with a pill label, a large headline and supporting description, then presents features in a 2-column grid with rounded borders. Each cell shows the title, description, and an illustration anchored to the bottom. Good fit for marketing pages that need to explain several capabilities with visual support.",
  content: {
    pill: Type.String({
      default: "Features",
      title: "Pill label",
    }),
    title: Type.String({
      default: "Everything you need to ship faster.",
      title: "Title",
    }),
    description: Type.String({
      default:
        "A focused toolkit that gets out of your way, so you can move from idea to launch without the usual friction.",
      title: "Description",
    }),
    items: Type.RepeatableItem({
      content: {
        title: Type.String({
          default: "Built for speed.",
          title: "Feature title",
        }),
        description: Type.String({
          default:
            "Skip the boilerplate and get straight to building. Our primitives are designed to be fast by default, so your product stays snappy at any scale.",
          title: "Feature description",
        }),
        illustration: Type.Image({
          title: "Illustration",
        }),
      },
      minItems: 1,
      maxItems: Infinity,
      title: "Features",
      toMarkdown: (c) => [`**${c.title}** ${c.description}`, c.illustration],
    }),
  },
  settings: {},
  component: IllustratedFeaturesComponent,
  toMarkdown: (c) => [c.pill, `# ${c.title}`, c.description, c.items],
});

function IllustratedFeaturesComponent() {
  return (
    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 max-w-4xl sm:mb-16">
          <illustratedFeatures.Field name="pill">
            {(props) => <Pill {...props} className="mb-4 sm:mb-6" />}
          </illustratedFeatures.Field>
          <InlineHeading
            lead={
              <illustratedFeatures.Field name="title">
                {(props) => <span {...props} />}
              </illustratedFeatures.Field>
            }
            continuation={
              <illustratedFeatures.Field name="description">
                {(props) => <span {...props} />}
              </illustratedFeatures.Field>
            }
          />
        </div>
        <div className="border-border overflow-hidden rounded-2xl border">
          <div className="bg-border grid grid-cols-1 gap-px md:grid-cols-2">
            <illustratedFeatures.Repeater name="items">
              {(item) => (
                <div className="bg-background flex h-full flex-col">
                  <div className="flex flex-col gap-2 px-6 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-5">
                    <item.Field name="title">
                      {(props) => (
                        <h3
                          {...props}
                          className="text-foreground text-lg font-semibold tracking-tight sm:text-xl"
                        />
                      )}
                    </item.Field>
                    <item.Field name="description">
                      {(props) => (
                        <p {...props} className="text-muted-foreground text-base sm:text-lg" />
                      )}
                    </item.Field>
                  </div>
                  <div className="mx-auto mt-auto w-full max-w-[480px] overflow-hidden">
                    <item.Image name="illustration">
                      {(props) => (
                        <img
                          {...props}
                          className="-mb-2 w-full rounded-t-lg object-cover object-top sm:-mb-4"
                        />
                      )}
                    </item.Image>
                  </div>
                </div>
              )}
            </illustratedFeatures.Repeater>
          </div>
        </div>
      </div>
    </section>
  );
}

export { illustratedFeatures as block };
