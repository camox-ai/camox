import { Button } from "@camox/ui/button";
import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@camox/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@camox/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import * as React from "react";

import { createPageTextLinkTarget, getPageIdFromTextLinkTarget } from "@/core/lib/textLinks";
import { useProjectSlug } from "@/lib/auth";
import { pageQueries, projectQueries } from "@/lib/queries";

interface TextLinkPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  text: string;
  target: string | null;
  onSave: (target: string, text: string) => void;
  onUnlink: () => void;
}

export function TextLinkPopover({
  open,
  onOpenChange,
  trigger,
  text,
  target,
  onSave,
  onUnlink,
}: TextLinkPopoverProps) {
  const [textValue, setTextValue] = React.useState(text);
  const [mode, setMode] = React.useState<"page" | "external">("page");
  const [pageValue, setPageValue] = React.useState("");
  const [urlValue, setUrlValue] = React.useState("");

  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const { data: pages } = useQuery({
    ...pageQueries.list(project?.id ?? 0),
    enabled: !!project,
  });

  const prepare = React.useCallback(() => {
    setTextValue(text);
    const pageId = target ? getPageIdFromTextLinkTarget(target) : null;
    if (pageId != null) {
      setMode("page");
      setPageValue(pageId);
      setUrlValue("");
      return;
    }

    setMode("external");
    setUrlValue(target ?? "");
    setPageValue("");
  }, [target, text]);

  React.useEffect(() => {
    if (!open) return;
    prepare();
  }, [open, prepare]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) prepare();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextText = textValue.trim();
    if (!nextText) return;

    if (mode === "page") {
      if (!pageValue) return;
      onSave(createPageTextLinkTarget(pageValue), nextText);
      return;
    }

    const nextTarget = urlValue.trim();
    if (!/^https?:\/\//i.test(nextTarget)) return;
    onSave(nextTarget, nextText);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger}>
        <Link2 />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-3">
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="text-link-text">Text</Label>
            <Input
              id="text-link-text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Destination</Label>
            <Tabs value={mode} onValueChange={(nextMode) => setMode(nextMode as typeof mode)}>
              <TabsList className="w-full">
                <TabsTrigger value="page">Page</TabsTrigger>
                <TabsTrigger value="external">URL</TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === "page" ? (
              <select
                className="border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm"
                value={pageValue}
                onChange={(event) => setPageValue(event.target.value)}
              >
                <option value="">
                  {pages && pages.length > 0 ? "Select a page" : "No pages found"}
                </option>
                {pages?.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.nickname} ({page.fullPath})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type="url"
                placeholder="https://"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
              />
            )}
          </div>
          <div className="grid gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                !textValue.trim() ||
                (mode === "page" ? !pageValue : !/^https?:\/\//i.test(urlValue.trim()))
              }
            >
              Save
            </Button>
            {target && (
              <Button type="button" variant="outline" size="sm" onClick={onUnlink}>
                Unlink
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
