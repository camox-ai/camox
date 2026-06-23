const fieldTypesDictionary = {
  String: { hasOwnView: false },
  Repeater: { hasOwnView: false },
  Enum: { hasOwnView: false },
  Boolean: { hasOwnView: false },
  Embed: { hasOwnView: false },
  Link: { hasOwnView: true },
  Image: { hasOwnView: true },
  File: { hasOwnView: true },
  ImageList: { hasOwnView: true },
  FileList: { hasOwnView: true },
} satisfies Record<string, { hasOwnView: boolean }>;

type FieldTypesDictionary = typeof fieldTypesDictionary;
type FieldType = keyof FieldTypesDictionary;

export type { FieldType };
export { fieldTypesDictionary };
