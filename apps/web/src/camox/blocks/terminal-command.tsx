import { Type, createBlock } from "camox/createBlock";

import { TerminalCard } from "@/components/TerminalCard";

const terminalCommand = createBlock({
  id: "terminal-command",
  title: "Terminal Command",
  description:
    "Use this block as a primary call to action that displays a shell command users should copy and paste into their terminal. Place it prominently on landing or documentation pages (e.g. install, quickstart, getting started). Keep the command concise and on a single line. The block renders the command large with a centered label above it and a one-click copy-to-clipboard button.",
  content: {
    label: Type.String({
      default: "Get started in seconds",
      title: "Label",
    }),
    command: Type.String({
      default: "npx create-camox@latest my-site",
      title: "Command",
    }),
  },
  component: TerminalCommandComponent,
  toMarkdown: (c) => [c.label, `\`\`\`bash\n${c.command}\n\`\`\``],
});

function TerminalCommandComponent() {
  return (
    <section className="py-16 sm:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-xl">
          <terminalCommand.Field name="label">
            {(props) => (
              <p
                {...props}
                className="text-muted-foreground mb-4 text-center text-sm font-medium sm:text-base"
              />
            )}
          </terminalCommand.Field>
          <TerminalCard>
            <terminalCommand.Field name="command">
              {(props) => (
                <code
                  {...props}
                  className="text-foreground block text-sm font-medium whitespace-nowrap sm:text-lg"
                />
              )}
            </terminalCommand.Field>
          </TerminalCard>
        </div>
      </div>
    </section>
  );
}

export { terminalCommand as block };
