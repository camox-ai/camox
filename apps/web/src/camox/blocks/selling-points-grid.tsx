import { Type, createBlock } from "camox/createBlock";

const sellingPointsGrid = createBlock({
  id: "selling-points-grid",
  title: "Selling Points Grid",
  description:
    "Use this block to promote a list of aspects, benefits, or features of a product or service in a compact grid. Each selling point has a short title and a supporting description. Good fit for feature roundups, value propositions, or 'why choose us' sections. Works best with a multiple of 3 items so rows are complete.",
  content: {
    title: Type.String({
      default: "Why choose us",
      title: "Title",
    }),
    items: Type.RepeatableItem({
      content: {
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
  toMarkdown: (c) => [`## ${c.title}`, c.items],
});

function SellingPointsGridComponent() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container mx-auto px-4">
        <sellingPointsGrid.Field name="title">
          {(props) => (
            <h2
              {...props}
              className="text-foreground mb-6 text-left text-2xl font-semibold tracking-tight sm:mb-8 sm:text-3xl"
            />
          )}
        </sellingPointsGrid.Field>
        <div className="bg-background border-primary w-full overflow-hidden rounded-xl border">
          <div className="-mr-px -mb-px grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            <sellingPointsGrid.Repeater name="items">
              {(item) => (
                <div className="bg-background border-primary flex h-full flex-col border-r border-b p-4 sm:p-5">
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
