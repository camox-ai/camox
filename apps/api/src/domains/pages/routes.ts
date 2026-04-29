import { pub, authed } from "../../orpc";
import {
  createPage,
  createPageInput,
  deletePage,
  deletePageInput,
  generatePageSeo,
  generatePageSeoInput,
  getPage,
  getPageByPath,
  getPageByPathInput,
  getPageInput,
  getPageStructure,
  getPageStructureInput,
  listPages,
  listPagesBySlug,
  listPagesBySlugInput,
  listPagesInput,
  setPageAiSeo,
  setPageAiSeoInput,
  setPageLayout,
  setPageLayoutInput,
  setPageMetaDescription,
  setPageMetaDescriptionInput,
  setPageMetaTitle,
  setPageMetaTitleInput,
  updatePage,
  updatePageInput,
} from "./service";

// Public procedures

const getByPath = pub
  .input(getPageByPathInput)
  .handler(({ context, input }) => getPageByPath(context, input));

const getStructure = pub
  .input(getPageStructureInput)
  .handler(({ context, input }) => getPageStructure(context, input));

const list = pub.input(listPagesInput).handler(({ context, input }) => listPages(context, input));

const listBySlug = pub
  .input(listPagesBySlugInput)
  .handler(({ context, input }) => listPagesBySlug(context, input));

const get = pub.input(getPageInput).handler(({ context, input }) => getPage(context, input));

// Protected procedures

const create = authed
  .input(createPageInput)
  .handler(({ context, input }) => createPage(context, input));

const update = authed
  .input(updatePageInput)
  .handler(({ context, input }) => updatePage(context, input));

const deleteFn = authed
  .input(deletePageInput)
  .handler(({ context, input }) => deletePage(context, input));

const setAiSeo = authed
  .input(setPageAiSeoInput)
  .handler(({ context, input }) => setPageAiSeo(context, input));

const setMetaTitle = authed
  .input(setPageMetaTitleInput)
  .handler(({ context, input }) => setPageMetaTitle(context, input));

const setMetaDescription = authed
  .input(setPageMetaDescriptionInput)
  .handler(({ context, input }) => setPageMetaDescription(context, input));

const setLayout = authed
  .input(setPageLayoutInput)
  .handler(({ context, input }) => setPageLayout(context, input));

const generateSeo = authed
  .input(generatePageSeoInput)
  .handler(({ context, input }) => generatePageSeo(context, input));

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
