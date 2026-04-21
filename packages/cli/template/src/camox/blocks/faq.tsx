import { Type, createBlock } from "camox/createBlock";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faq = createBlock({
  id: "faq",
  title: "FAQ",
  description:
    "Use this block to answer common questions about the product, pricing, or company. Place it near the bottom of a page to address objections before a conversion section.",
  content: {
    items: Type.RepeatableItem({
      content: {
        question: Type.String({
          default: "What is your refund policy?",
          title: "Question",
        }),
        answer: Type.String({
          default:
            "We offer a 30-day money-back guarantee. If you're not satisfied, contact support and we'll process your refund right away.",
          title: "Answer",
        }),
      },
      minItems: 3,
      maxItems: Infinity,
      title: "Questions",
      toMarkdown: (c) => [`Q: ${c.question}`, `A: ${c.answer}`],
    }),
  },
  component: FaqComponent,
  toMarkdown: (c) => [c.items],
});

function FaqComponent() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-2xl px-4">
        <Accordion>
          <faq.Repeater name="items">
            {(item, index) => (
              <AccordionItem value={index}>
                <AccordionTrigger className="items-center text-lg">
                  <item.Field name="question">{(props) => <span {...props} />}</item.Field>
                </AccordionTrigger>
                <AccordionContent>
                  <item.Field name="answer">
                    {(props) => <p {...props} className="text-muted-foreground text-base" />}
                  </item.Field>
                </AccordionContent>
              </AccordionItem>
            )}
          </faq.Repeater>
        </Accordion>
      </div>
    </section>
  );
}

export { faq as block };
