import { internalMutation } from "./functions";

export const seedProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingProjects = await ctx.db.query("projects").collect();
    for (const project of existingProjects) {
      await ctx.db.delete(project._id);
    }

    const now = Date.now();

    const projectId = await ctx.db.insert("projects", {
      slug: "camox-demo-01",
      name: "Camox Demo",
      domain: "demo.camox.dev",
      organizationId: "seed",
      createdAt: now,
      updatedAt: now,
    });

    console.log("Management projects seeded successfully!");
    return { success: true, projectId };
  },
});
