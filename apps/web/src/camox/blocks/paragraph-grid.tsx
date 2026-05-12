import { Type, createBlock } from "camox/createBlock";

import { BlockContainer } from "@/components/BlockContainer";
import { InlineHeading } from "@/components/InlineHeading";
import { Pill } from "@/components/Pill";

const paragraphGrid = createBlock({
  id: "paragraph-grid",
  title: "Paragraph Grid",
  description:
    "Use this block to present a large section heading, a grid of statement paragraphs (each pairing a bold lead with a muted continuation, similar to Large Paragraphs Group but with smaller text and arranged 2-up), and a primary-colored synthesis banner that closes the section. Good fit for 'why us' or 'pain points → resolution' sections where four short statements set up a problem and a final banner lands the takeaway. Works best with exactly 4 paragraphs so the grid is balanced.",
  content: {
    pill: Type.String({
      default: "Why us",
      title: "Pill label",
    }),
    title: Type.String({
      default: "Don't let your website hold you back.",
      title: "Section heading",
    }),
    description: Type.String({
      default: "A muted continuation that frames the section in one or two sentences.",
      title: "Description",
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
    bannerText: Type.String({
      default: "Camox sites don't hold you back. Agent productivity, CMS maintainability. No slop.",
      title: "Banner text",
    }),
  },
  component: ParagraphGridComponent,
  toMarkdown: (c) => [c.pill, `# ${c.title}`, c.description, c.paragraphs, `**${c.bannerText}**`],
});

function ParagraphGridComponent() {
  return (
    <BlockContainer>
      <div className="mb-16 max-w-4xl">
        <paragraphGrid.Field name="pill">
          {(props) => <Pill {...props} className="mb-6" />}
        </paragraphGrid.Field>
        <InlineHeading
          lead={
            <paragraphGrid.Field name="title">{(props) => <span {...props} />}</paragraphGrid.Field>
          }
          continuation={
            <paragraphGrid.Field name="description">
              {(props) => <span {...props} />}
            </paragraphGrid.Field>
          }
        />
      </div>

      <div className="mb-12 grid grid-cols-1 gap-x-16 gap-y-16 md:grid-cols-2">
        <paragraphGrid.Repeater name="paragraphs">
          {(item) => (
            <div className="flex flex-col gap-3">
              <div className="flex flex-row flex-wrap items-center gap-3">
                <item.MultipleAssets name="logos">
                  {(props) => <img {...props} className="size-8 object-contain" />}
                </item.MultipleAssets>
              </div>
              <p className="text-foreground text-lg leading-snug font-semibold tracking-tight sm:text-xl">
                <item.Field name="title">{(props) => <span {...props} />}</item.Field>
              </p>
              <item.Field name="description">
                {(props) => (
                  <p {...props} className="text-muted-foreground text-base leading-snug" />
                )}
              </item.Field>
            </div>
          )}
        </paragraphGrid.Repeater>
      </div>

      <div className="bg-primary text-primary-foreground rounded-2xl p-8 sm:p-12">
        <paragraphGrid.Field name="bannerText">
          {(props) => (
            <p
              {...props}
              className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl"
            />
          )}
        </paragraphGrid.Field>
      </div>
    </BlockContainer>
  );
}

export { paragraphGrid as block };
