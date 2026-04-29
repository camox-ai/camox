import { authed, pub } from "../../orpc";
import * as service from "./service";

// Public procedures

const getByPath = pub
  .input(service.getPageByPathInput)
  .handler(({ context, input }) => service.getPageByPath(context, input));

const getStructure = pub
  .input(service.getPageStructureInput)
  .handler(({ context, input }) => service.getPageStructure(context, input));

const list = pub
  .input(service.listPagesInput)
  .handler(({ context, input }) => service.listPages(context, input));

const listBySlug = pub
  .input(service.listPagesBySlugInput)
  .handler(({ context, input }) => service.listPagesBySlug(context, input));

const get = pub
  .input(service.getPageInput)
  .handler(({ context, input }) => service.getPage(context, input));

// Protected procedures

const create = authed
  .input(service.createPageInput)
  .handler(({ context, input }) => service.createPage(context, input));

const update = authed
  .input(service.updatePageInput)
  .handler(({ context, input }) => service.updatePage(context, input));

const deleteFn = authed
  .input(service.deletePageInput)
  .handler(({ context, input }) => service.deletePage(context, input));

const setAiSeo = authed
  .input(service.setPageAiSeoInput)
  .handler(({ context, input }) => service.setPageAiSeo(context, input));

const setMetaTitle = authed
  .input(service.setPageMetaTitleInput)
  .handler(({ context, input }) => service.setPageMetaTitle(context, input));

const setMetaDescription = authed
  .input(service.setPageMetaDescriptionInput)
  .handler(({ context, input }) => service.setPageMetaDescription(context, input));

const setLayout = authed
  .input(service.setPageLayoutInput)
  .handler(({ context, input }) => service.setPageLayout(context, input));

const generateSeo = authed
  .input(service.generatePageSeoInput)
  .handler(({ context, input }) => service.generatePageSeo(context, input));

export const pageProcedures = {
  getByPath,
  getStructure,
  list,
  listBySlug,
  get,
  create,
  update,
  delete: deleteFn,
  setAiSeo,
  setMetaTitle,
  setMetaDescription,
  setLayout,
  generateSeo,
};
