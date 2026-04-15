import * as React from "react";

import { cn } from "../lib/utils";

export const Panel = ({
  children,
  className,
  render,
  ...props
}: Omit<React.ComponentProps<"section">, "children"> & {
  render?: React.ReactElement<{ className?: string }>;
  children?: React.ReactNode;
}) => {
  if (render) {
    return React.cloneElement(render, {
      ...props,
      className: cn(
        "flex flex-col bg-background border-2 border-border shadow-xl rounded-lg overflow-hidden",
        className,
        render.props.className,
      ),
      children,
    } as Record<string, unknown>);
  }

  return (
    <section
      className={cn(
        "flex flex-col bg-background border-2 border-border shadow-xl rounded-lg overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
};

export const PanelHeader = ({
  children,
  className,
  render,
  ...props
}: Omit<React.ComponentProps<"header">, "children"> & {
  render?: React.ReactElement<{ className?: string }>;
  children?: React.ReactNode;
}) => {
  if (render) {
    return React.cloneElement(render, {
      ...props,
      className: cn("p-4 border-b-2 border-border", className, render.props.className),
      children,
    } as Record<string, unknown>);
  }

  return (
    <header className={cn("p-4 border-b-2 border-border", className)} {...props}>
      {children}
    </header>
  );
};

export const PanelTitle = ({
  children,
  className,
  render,
  ...props
}: Omit<React.ComponentProps<"h3">, "children"> & {
  render?: React.ReactElement<{ className?: string }>;
  children?: React.ReactNode;
}) => {
  if (render) {
    return React.cloneElement(render, {
      ...props,
      className: cn("text-lg leading-none font-semibold", className, render.props.className),
      children,
    } as Record<string, unknown>);
  }

  return (
    <h3 className={cn("text-lg leading-none font-semibold", className)} {...props}>
      {children}
    </h3>
  );
};

export const PanelContent = ({
  children,
  className,
  render,
  ...props
}: Omit<React.ComponentProps<"main">, "children"> & {
  render?: React.ReactElement<{ className?: string }>;
  children?: React.ReactNode;
}) => {
  if (render) {
    return React.cloneElement(render, {
      ...props,
      className: cn("grow overflow-auto", className, render.props.className),
      children,
    } as Record<string, unknown>);
  }

  return (
    <main className={cn("grow overflow-auto", className)} {...props}>
      {children}
    </main>
  );
};
