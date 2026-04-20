import { Type, createBlock } from "camox/createBlock";

const statistics = createBlock({
  id: "statistics",
  title: "Statistics",
  description:
    "Showcase key metrics, achievements, or performance indicators. Ideal for displaying platform statistics or company milestones.",
  content: {
    title: Type.String({
      default: "By the numbers",
      maxLength: 30,
      title: "Title",
    }),
    subtitle: Type.String({
      default: "Trusted by teams worldwide",
      title: "Subtitle",
    }),
    description: Type.String({
      default:
        "Our platform empowers teams to build and ship faster. Here are some numbers we're proud of.",
      title: "Description",
    }),
    statistics: Type.RepeatableItem(
      {
        number: Type.String({
          default: "100+",
          maxLength: 7,
          title: "Number",
        }),
        label: Type.String({
          default: "projects launched",
          title: "Label",
        }),
      },
      {
        minItems: 3,
        maxItems: 8,
        title: "Statistics",
        toMarkdown: (c) => [`**${c.number}** — ${c.label}`],
      },
    ),
  },
  component: StatisticsComponent,
  toMarkdown: (c) => [`## ${c.subtitle}`, c.description, c.statistics],
});

function StatisticsComponent() {
  return (
    <section className="dark bg-background py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16">
            <statistics.Field name="title">
              {(props) => (
                <div
                  {...props}
                  className="text-primary mb-4 text-sm font-semibold tracking-wider uppercase"
                />
              )}
            </statistics.Field>
            <statistics.Field name="subtitle">
              {(props) => (
                <h2 {...props} className="text-foreground mb-6 text-4xl font-bold sm:text-5xl" />
              )}
            </statistics.Field>
            <statistics.Field name="description">
              {(props) => (
                <p {...props} className="text-muted-foreground max-w-3xl text-lg leading-relaxed" />
              )}
            </statistics.Field>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <statistics.Repeater name="statistics">
              {(stat) => (
                <div className="flex gap-3">
                  <div className="w-0.5 bg-linear-to-b from-teal-400 to-blue-500" />
                  <div className="flex flex-col">
                    <stat.Field name="number">
                      {(props) => (
                        <div {...props} className="text-foreground mb-2 text-4xl font-bold" />
                      )}
                    </stat.Field>
                    <stat.Field name="label">
                      {(props) => (
                        <p {...props} className="text-muted-foreground text-sm leading-relaxed" />
                      )}
                    </stat.Field>
                  </div>
                </div>
              )}
            </statistics.Repeater>
          </div>
        </div>
      </div>
    </section>
  );
}

export { statistics as block };
