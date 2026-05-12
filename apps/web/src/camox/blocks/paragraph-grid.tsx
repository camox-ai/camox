import { Type, createBlock } from "camox/createBlock";

import { BlockContainer } from "@/components/BlockContainer";

const paragraphGrid = createBlock({
  id: "paragraph-grid",
  title: "Paragraph Grid",
  description:
    "Use this block to present a large section heading, a grid of statement paragraphs (each pairing a bold lead with a muted continuation, similar to Large Paragraphs Group but with smaller text and arranged 2-up), and a primary-colored synthesis banner that closes the section. Good fit for 'why us' or 'pain points → resolution' sections where four short statements set up a problem and a final banner lands the takeaway. Works best with exactly 4 paragraphs so the grid is balanced.",
  content: {
    title: Type.String({
      default: "Don't let your website hold you back.",
      title: "Section heading",
    }),
    paragraphs: Type.RepeatableItem({
      content: {
        logos: Type.Image({
          multiple: true,
          defaultItems: 2,
          title: "Logos",
        }),
        title: Type.String({
          default: "A short, bold lead sentence.",
          title: "Lead",
        }),
        description: Type.String({
          default: "A muted continuation that explains the lead in one or two sentences.",
          title: "Continuation",
        }),
      },
      minItems: 2,
      maxItems: 8,
      title: "Paragraphs",
      toMarkdown: (c) => [`**${c.title}** ${c.description}`, c.logos],
    }),
    bannerHeadline: Type.String({
      default: "Camox sites don't hold you back.",
      title: "Banner headline",
    }),
    bannerSubtext: Type.String({
      default: "Agent productivity, CMS maintainability. No slop.",
      title: "Banner subtext",
    }),
  },
  component: ParagraphGridComponent,
  toMarkdown: (c) => [`# ${c.title}`, c.paragraphs, `**${c.bannerHeadline}** ${c.bannerSubtext}`],
});

function ParagraphGridComponent() {
  return (
    <BlockContainer>
      <paragraphGrid.Field name="title">
        {(props) => (
          <h2
            {...props}
            className="text-foreground mb-16 max-w-4xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl"
          />
        )}
      </paragraphGrid.Field>

      <div className="mb-12 grid grid-cols-1 gap-x-16 gap-y-32 md:grid-cols-2">
        <paragraphGrid.Repeater name="paragraphs">
          {(item) => (
            <div className="flex flex-col gap-3">
              <div className="flex flex-row flex-wrap items-center gap-3">
                <item.MultipleAssets name="logos">
                  {(props) => <img {...props} className="size-10 object-contain" />}
                </item.MultipleAssets>
              </div>
              <p className="text-foreground text-lg leading-snug font-semibold tracking-tight sm:text-xl">
                <item.Field name="title">{(props) => <span {...props} />}</item.Field>{" "}
                <item.Field name="description">
                  {(props) => <span {...props} className="text-muted-foreground font-normal" />}
                </item.Field>
              </p>
            </div>
          )}
        </paragraphGrid.Repeater>
      </div>

      <div className="bg-primary text-primary-foreground rounded-2xl p-8 sm:p-12">
        <p className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          <paragraphGrid.Field name="bannerHeadline">
            {(props) => <span {...props} />}
          </paragraphGrid.Field>{" "}
          <paragraphGrid.Field name="bannerSubtext">
            {(props) => <span {...props} className="opacity-75" />}
          </paragraphGrid.Field>
        </p>
      </div>
    </BlockContainer>
  );
}

export { paragraphGrid as block };
