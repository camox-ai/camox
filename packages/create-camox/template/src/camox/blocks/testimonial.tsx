import { Type, createBlock } from "camox/createBlock";

const testimonial = createBlock({
  id: "testimonial",
  title: "Testimonial",
  description:
    "Display a customer testimonial or user review. Ideal for building trust and social proof.",
  toMarkdown: ["> {{quote}}", "— {{author}}, {{title}}, {{company}}"],
  content: {
    quote: Type.String({
      default:
        "This platform has transformed how we build and manage our website. The developer experience is exceptional.",
      title: "Quote",
    }),
    author: Type.String({ default: "Sarah Chen", title: "Author" }),
    title: Type.String({ default: "Senior Developer", title: "Title" }),
    company: Type.String({ default: "TechCorp", title: "Company" }),
  },
  component: TestimonialComponent,
});

function TestimonialComponent() {
  return (
    <section className="bg-background py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <testimonial.Field name="quote">
            {(content) => (
              <blockquote className="text-foreground mb-8 text-2xl leading-relaxed font-medium sm:text-3xl">
                "{content}"
              </blockquote>
            )}
          </testimonial.Field>
          <div className="flex flex-col items-center">
            <testimonial.Field name="author">
              {(content) => (
                <cite className="text-foreground text-lg font-semibold not-italic">{content}</cite>
              )}
            </testimonial.Field>
            <div className="text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <testimonial.Field name="title">
                {(content) => <span>{content}</span>}
              </testimonial.Field>
              <span className="hidden sm:inline">&bull;</span>
              <testimonial.Field name="company">
                {(content) => <span>{content}</span>}
              </testimonial.Field>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export { testimonial as block };
