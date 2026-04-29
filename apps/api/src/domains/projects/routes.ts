import { authed, pub } from "../../orpc";
import * as service from "./service";

// Public procedures

const initializeContent = pub
  .input(service.initializeProjectContentInput)
  .handler(({ context, input }) => service.initializeProjectContent(context, input));

// Protected procedures

const list = authed
  .input(service.listProjectsInput)
  .handler(({ context, input }) => service.listProjects(context, input));

const getFirst = authed
  .input(service.getFirstProjectInput)
  .handler(({ context, input }) => service.getFirstProject(context, input));

const getBySlug = authed
  .input(service.getProjectBySlugInput)
  .handler(({ context, input }) => service.getProjectBySlug(context, input));

const get = authed
  .input(service.getProjectInput)
  .handler(({ context, input }) => service.getProject(context, input));

const checkSlugAvailability = authed
  .input(service.checkProjectSlugAvailabilityInput)
  .handler(({ context, input }) => service.checkProjectSlugAvailability(context, input));

const create = authed
  .input(service.createProjectInput)
  .handler(({ context, input }) => service.createProject(context, input));

const update = authed
  .input(service.updateProjectInput)
  .handler(({ context, input }) => service.updateProject(context, input));

const deleteFn = authed
  .input(service.deleteProjectInput)
  .handler(({ context, input }) => service.deleteProject(context, input));

export const projectProcedures = {
  list,
  getFirst,
  getBySlug,
  get,
  checkSlugAvailability,
  create,
  update,
  delete: deleteFn,
  initializeContent,
};
