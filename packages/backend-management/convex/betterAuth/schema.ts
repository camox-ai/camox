import { defineSchema } from "convex/server";

import { tables } from "./generatedSchema";

const schema = defineSchema(tables);

export default schema;
