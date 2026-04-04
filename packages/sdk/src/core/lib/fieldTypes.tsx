import {
  Type as TypeIcon,
  List as ListIcon,
  ChevronDown as ChevronDownIcon,
  ToggleLeft as ToggleLeftIcon,
  type LucideProps,
  FrameIcon,
  Link2 as Link2Icon,
  ImageIcon,
  FileIcon,
  Images as ImagesIcon,
} from "lucide-react";

import { previewStore } from "@/features/preview/previewStore";

type FieldLabelMeta = {
  schemaTitle?: string;
  fieldName: string;
  fetchedTitle?: string | null;
};

type TreeDoubleClickParams = {
  blockId: string;
  fieldName: string;
};

type SchemaFieldMeta = {
  arrayItemType?: string;
};

const fieldTypesDictionary = {
  String: {
    label: "String",
    isScalar: true,
    isContentEditable: true,
    hasOwnView: false,
    getIcon: () => (props: LucideProps) => <TypeIcon {...props} />,
    getLabel: (value: unknown) => {
      if (typeof value !== "string") return "";
      // Strip markdown bold/italic markers for display
      return value.replace(/\*{1,3}(.+?)\*{1,3}/g, "$1");
    },
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "String" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  RepeatableItem: {
    label: "Repeatable item",
    isScalar: false,
    isContentEditable: false,
    hasOwnView: false,
    getIcon: ({ arrayItemType }: SchemaFieldMeta) => {
      if (arrayItemType === "Image") return (props: LucideProps) => <ImagesIcon {...props} />;
      if (arrayItemType === "File") return (props: LucideProps) => <FileIcon {...props} />;
      return (props: LucideProps) => <ListIcon {...props} />;
    },
    getLabel: (_value: unknown, { schemaTitle, fieldName }: FieldLabelMeta) =>
      schemaTitle ?? fieldName,
    onTreeDoubleClick: ({ blockId }: TreeDoubleClickParams) => {
      previewStore.send({ type: "setFocusedBlock", blockId });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  Enum: {
    label: "Enum",
    isScalar: true,
    isContentEditable: false,
    hasOwnView: false,
    getIcon: () => (props: LucideProps) => <ChevronDownIcon {...props} />,
    getLabel: (value: unknown) => value as string,
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "Enum" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  Boolean: {
    label: "Boolean",
    isScalar: true,
    isContentEditable: false,
    hasOwnView: false,
    getIcon: () => (props: LucideProps) => <ToggleLeftIcon {...props} />,
    getLabel: (value: unknown) => JSON.stringify(value),
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "Boolean" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  Embed: {
    label: "Embed",
    isScalar: true,
    isContentEditable: false,
    hasOwnView: false,
    getIcon: () => (props: LucideProps) => <FrameIcon {...props} />,
    getLabel: (value: unknown, { schemaTitle, fieldName, fetchedTitle }: FieldLabelMeta) => {
      let domain: string | null = null;
      try {
        domain = new URL(value as string).hostname.replace(/^www\./, "");
      } catch {}
      return fetchedTitle ?? schemaTitle ?? domain ?? fieldName;
    },
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "Embed" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  Link: {
    label: "Link",
    isScalar: false,
    isContentEditable: false,
    hasOwnView: true,
    getIcon: () => (props: LucideProps) => <Link2Icon {...props} />,
    getLabel: (value: unknown) => (value as { text: string } | undefined)?.text ?? "",
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "Link" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  Image: {
    label: "Image",
    isScalar: false,
    isContentEditable: false,
    hasOwnView: true,
    getIcon: () => (props: LucideProps) => <ImageIcon {...props} />,
    getLabel: (value: unknown, { schemaTitle, fieldName }: FieldLabelMeta) => {
      const filename = (value as { filename?: string } | null | undefined)?.filename;
      if (!filename) return `Missing ${schemaTitle ?? fieldName}`;
      return filename;
    },
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "Image" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
  File: {
    label: "File",
    isScalar: false,
    isContentEditable: false,
    hasOwnView: true,
    getIcon: () => (props: LucideProps) => <FileIcon {...props} />,
    getLabel: (value: unknown, { schemaTitle, fieldName }: FieldLabelMeta) => {
      const filename = (value as { filename?: string } | null | undefined)?.filename;
      if (!filename) return `Missing ${schemaTitle ?? fieldName}`;
      return filename;
    },
    onTreeDoubleClick: ({ blockId, fieldName }: TreeDoubleClickParams) => {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType: "File" });
      previewStore.send({ type: "openBlockContentSheet", blockId });
    },
  },
} satisfies Record<
  string,
  {
    label: string;
    isScalar: boolean;
    isContentEditable: boolean;
    hasOwnView: boolean;
    getIcon: (meta: SchemaFieldMeta) => (props: LucideProps) => React.ReactNode;
    getLabel: (value: unknown, meta: FieldLabelMeta) => string;
    onTreeDoubleClick: (params: TreeDoubleClickParams) => void;
  }
>;

type FieldTypesDictionary = typeof fieldTypesDictionary;
type FieldType = keyof FieldTypesDictionary;

export type { FieldType, FieldLabelMeta, SchemaFieldMeta };
export { fieldTypesDictionary };
