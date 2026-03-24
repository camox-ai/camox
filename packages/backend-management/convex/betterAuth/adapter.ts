import { createApi } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { oneTimeToken, organization } from "better-auth/plugins";

import authConfig from "../auth.config";
import schema from "./schema";

export const { create, findOne, findMany, updateOne, updateMany, deleteOne, deleteMany } =
  createApi(schema, () => ({
    plugins: [convex({ authConfig }), organization(), oneTimeToken()],
  }));
