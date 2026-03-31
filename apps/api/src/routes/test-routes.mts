import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

type AppEnv = { Variables: { user: null } };

const myMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  await next();
});

const sub = new Hono<AppEnv>()
  .get("/list", (c) => c.json("get list"))
  .post("/create", myMiddleware, async (c) => c.json("post create"));

const app = new Hono<AppEnv>().route("/pages", sub);

async function main() {
  for (const [method, path] of [
    ["GET", "/pages/list"],
    ["POST", "/pages/create"],
  ]) {
    const req = new Request("http://localhost" + path, { method });
    const res = await app.fetch(req);
    console.log(method + " " + path + " => " + res.status);
  }
}
main();
