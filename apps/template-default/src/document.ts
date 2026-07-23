import { defineDocument } from "camox/document";

export default defineDocument({
  htmlAttrs: { lang: "en" },
  title: "{{projectName}}",
  meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
});
