import { Type, createBlock } from "camox/createBlock";

import { InlineHeading } from "@/components/InlineHeading";
import { Pill } from "@/components/Pill";

const largeParagraphsGroup = createBlock({
  id: "large-paragraphs-group",
  title: "Large Paragraphs Group",
  description:
    "Use this block to present a short section label followed by one or more statement paragraphs. Each paragraph pairs a bold lead sentence with a muted continuation displayed inline on the same line. Good fit for marketing narratives, value propositions, or manifesto-style sections where copy should feel editorial and text-forward.",
  content: {
    title: Type.String({
      default: "Why choose us",
      title: "Title",
    }),
    items: Type.RepeatableItem({
      content: {
        title: Type.String({
          default: "A new kind of tool.",
          title: "Lead sentence",
        }),
        description: Type.String({
          default:
            "Our tool really isn't like the others. In fact it's quite different. Try it and you'll see for yourself. We think you'll love it.",
          title: "Continuation",
        }),
      },
      minItems: 1,
      maxItems: Infinity,
      title: "Paragraphs",
      toMarkdown: (c) => [`**${c.title}** ${c.description}`],
    }),
  },
  component: LargeParagraphsGroupComponent,
  toMarkdown: (c) => [`## ${c.title}`, c.items],
});

function LargeParagraphsGroupComponent() {
  return (
    <section className="container py-12 sm:py-16">
      <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
        <div className="sm:w-3/12 sm:flex-shrink-0 sm:mt-3">
          <largeParagraphsGroup.Field name="title">
            {(props) => <Pill {...props} />}
          </largeParagraphsGroup.Field>
        </div>
        <div className="flex flex-1 flex-col gap-8 sm:gap-12">
          <largeParagraphsGroup.Repeater name="items">
            {(item) => (
              <InlineHeading
                lead={<item.Field name="title">{(props) => <span {...props} />}</item.Field>}
                continuation={
                  <item.Field name="description">{(props) => <span {...props} />}</item.Field>
                }
              />
            )}
          </largeParagraphsGroup.Repeater>
        </div>
      </div>
    </section>
  );
}

export { largeParagraphsGroup as block };
