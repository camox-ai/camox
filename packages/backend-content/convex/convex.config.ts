import fs from "convex-fs/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(fs);

export default app;
