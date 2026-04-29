import { Type, createBlock } from "camox/createBlock";

import { InlineHeading } from "@/components/InlineHeading";
import { Pill } from "@/components/Pill";

const sellingPointsGrid = createBlock({
  id: "selling-points-grid",
  title: "Selling Points Grid",
  description:
    "Use this block to promote a list of aspects, benefits, or features of a product or service in a compact grid. The section opens with a pill label, a large headline and supporting description, then lists selling points in a grid where each has a short title and a supporting description. Good fit for feature roundups, value propositions, or 'why choose us' sections. Works best with a multiple of 3 items so rows are complete.",
  content: {
    pill: Type.String({
      default: "Why us",
      title: "Pill label",
    }),
    title: Type.String({
      default: "Why choose us.",
      title: "Title",
    }),
    description: Type.String({
      default:
        "A focused set of benefits that make the difference, from first impression to long-term value.",
      title: "Description",
    }),
    items: Type.RepeatableItem({
      content: {
        icons: Type.Image({
          title: "Icons",
          multiple: true,
          defaultItems: 1,
        }),
        title: Type.String({
          default: "Fast by default",
          title: "Title",
        }),
        description: Type.String({
          default:
            "Built on modern primitives so every page loads instantly and stays responsive under load.",
          title: "Description",
        }),
      },
      minItems: 3,
      maxItems: Infinity,
      title: "Selling points",
      toMarkdown: (c) => [`### ${c.title}`, c.description],
    }),
  },
  component: SellingPointsGridComponent,
  toMarkdown: (c) => [c.pill, `## ${c.title}`, c.description, c.items],
});

function SellingPointsGridComponent() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container">
        <div className="mb-8 max-w-4xl sm:mb-12">
          <sellingPointsGrid.Field name="pill">
            {(props) => <Pill {...props} className="mb-4 sm:mb-6" />}
          </sellingPointsGrid.Field>
          <InlineHeading
            lead={
              <sellingPointsGrid.Field name="title">
                {(props) => <span {...props} />}
              </sellingPointsGrid.Field>
            }
            continuation={
              <sellingPointsGrid.Field name="description">
                {(props) => <span {...props} />}
              </sellingPointsGrid.Field>
            }
          />
        </div>
        <div className="border-border w-full overflow-hidden rounded-xl border">
          <div className="bg-border grid grid-cols-1 gap-px sm:grid-cols-2 md:grid-cols-3">
            <sellingPointsGrid.Repeater name="items">
              {(item) => (
                <div className="bg-background flex h-full flex-col p-4 sm:p-5">
                  <div className="mb-2 flex flex-row items-center gap-2">
                    <item.Repeater name="icons">
                      {(iconItem) => (
                        <iconItem.Image name="image">
                          {(props) => <img {...props} className="size-8 object-contain" />}
                        </iconItem.Image>
                      )}
                    </item.Repeater>
                  </div>
                  <item.Field name="title">
                    {(props) => (
                      <h3 {...props} className="text-foreground mb-1.5 text-base font-semibold" />
                    )}
                  </item.Field>
                  <item.Field name="description">
                    {(props) => <p {...props} className="text-muted-foreground text-sm" />}
                  </item.Field>
                </div>
              )}
            </sellingPointsGrid.Repeater>
          </div>
        </div>
      </div>
    </section>
  );
}

export { sellingPointsGrid as block };
