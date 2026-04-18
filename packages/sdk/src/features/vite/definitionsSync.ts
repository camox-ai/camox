import path from "node:path";

import { type Logger, type ViteDevServer, createServer, isRunnableDevEnvironment } from "vite";

import type { CamoxApp } from "@/core/createApp";
import type { Block } from "@/core/createBlock";

import { createServerApiClient } from "../../lib/api-client-server";

const SYNC_DEBOUNCE_DELAY_MS = 100;

interface SyncDefinitionsOptions {
  projectSlug: string;
  syncSecret: string;
  apiUrl: string;
  environmentName: string;
}

/**
 * Sync block and layout definitions to the API.
 * This is the core sync logic, independent of ViteDevServer.
 */
function throwIfSyncAuthError(error: unknown): void {
  if (
    error instanceof Error &&
    error.name === "ORPCError" &&
    error.message.toLowerCase().includes("unauthorized")
  ) {
    throw new Error("[camox] Definition sync failed: invalid syncSecret.");
  }
}

export async function syncDefinitionsToApi(options: {
  camoxApp: CamoxApp;
  projectSlug: string;
  apiUrl: string;
  syncSecret: string;
  environmentName?: string;
  logger: Logger;
}): Promise<void> {
  const { camoxApp, projectSlug, apiUrl, syncSecret, environmentName, logger } = options;
  const client = createServerApiClient(apiUrl, environmentName);

  const blocks = camoxApp.getBlocks();
  const definitions = blocks.map((block: Block) => ({
    blockId: block.id,
    title: block.title,
    description: block.description,
    contentSchema: block.contentSchema,
    settingsSchema: block.settingsSchema,
    defaultContent: block.getInitialContent(),
    defaultSettings: block.getInitialSettings(),
    layoutOnly: block.layoutOnly || undefined,
  }));

  let environmentCreated = false;
  try {
    const result = await client.blockDefinitions.sync({
      projectSlug,
      syncSecret,
      definitions,
    });
    environmentCreated = result.environmentCreated;
  } catch (error) {
    throwIfSyncAuthError(error);
    throw error;
  }

  if (environmentCreated && environmentName) {
    logger.info(`[camox] Created environment "${environmentName}" (forked from production)`, {
      timestamp: true,
    });
  }

  logger.info(
    `[camox] Synced ${definitions.length} block definition${definitions.length === 1 ? "" : "s"}`,
    { timestamp: true },
  );

  // Sync layouts
  const layoutDefinitions = camoxApp.getSerializableLayoutDefinitions();
  if (layoutDefinitions.length > 0) {
    let layoutSyncResults;
    try {
      layoutSyncResults = await client.layouts.sync({
        projectSlug,
        syncSecret,
        layouts: layoutDefinitions,
      });
    } catch (error) {
      throwIfSyncAuthError(error);
      throw error;
    }
    logger.info(
      `[camox] Synced ${layoutDefinitions.length} layout${layoutDefinitions.length === 1 ? "" : "s"} to Camox API`,
      { timestamp: true },
    );
    for (const result of layoutSyncResults) {
      if (result.wasExisting && result.createdBlockTypes.length > 0) {
        const blockList = result.createdBlockTypes.map((t) => `"${t}"`).join(", ");
        logger.info(
          `[camox] Added ${result.createdBlockTypes.length} block${result.createdBlockTypes.length === 1 ? "" : "s"} to existing layout "${result.layout.layoutId}": ${blockList}`,
          { timestamp: true },
        );
      }
    }
  }

  // Initialize content for fresh environments (no-ops if pages already exist)
  const initialPage = camoxApp.getInitialPageBundles();
  if (initialPage) {
    try {
      const result = await client.projects.initializeContent({
        projectSlug,
        syncSecret,
        layoutId: initialPage.layoutId,
        blocks: initialPage.blocks,
      });
      if (result.created) {
        if (initialPage.hasInitialBlocks) {
          logger.info(
            `[camox] Initialized content: homepage with ${result.blockCount} block${result.blockCount === 1 ? "" : "s"}`,
            { timestamp: true },
          );
        } else {
          logger.info("[camox] Created empty homepage (using first layout)", { timestamp: true });
          logger.info(
            "[camox] Tip: add initialBlocks to your layout to pre-populate pages with content",
            { timestamp: true },
          );
        }
      }
    } catch (error) {
      throwIfSyncAuthError(error);
      throw error;
    }
  }
}

function getBlockIdFromFilePath(filePath: string): string {
  const fileName = path.basename(filePath, path.extname(filePath));
  return fileName;
}

const CAMOX_APP_PATH = "./src/camox/app.ts";

/**
 * Load a module using SSR. Uses the server's SSR environment runner if available,
 * otherwise falls back to a temporary Vite server (needed when Nitro or other
 * frameworks configure the SSR environment as non-runnable).
 */
async function ssrLoadModule(
  server: ViteDevServer,
  modulePath: string,
): Promise<Record<string, unknown>> {
  const ssrEnv = server.environments.ssr;
  if (ssrEnv && isRunnableDevEnvironment(ssrEnv)) {
    return ssrEnv.runner.import(modulePath);
  }

  const tempServer = await createServer({
    configFile: false,
    root: server.config.root,
    resolve: server.config.resolve,
    server: { middlewareMode: true },
    logLevel: "silent",
  });

  try {
    return await tempServer.ssrLoadModule(modulePath);
  } finally {
    await tempServer.close();
  }
}

export async function syncDefinitions(
  server: ViteDevServer,
  options: SyncDefinitionsOptions,
): Promise<void> {
  const { projectSlug, syncSecret, apiUrl, environmentName } = options;
  const blocksDir = path.resolve(server.config.root, "src/camox/blocks");
  const client = createServerApiClient(apiUrl, environmentName);

  async function performInitialSync(): Promise<void> {
    const camoxModule = (await ssrLoadModule(server, CAMOX_APP_PATH)) as {
      camoxApp?: CamoxApp;
    };

    if (!camoxModule.camoxApp) {
      server.config.logger.warn(`[camox] No camoxApp export found in ${CAMOX_APP_PATH}`, {
        timestamp: true,
      });
      return;
    }

    await syncDefinitionsToApi({
      camoxApp: camoxModule.camoxApp,
      projectSlug,
      apiUrl,
      syncSecret,
      environmentName,
      logger: server.config.logger,
    });
  }

  async function upsertBlock(filePath: string): Promise<void> {
    const relativePath = "./" + path.relative(server.config.root, filePath);

    // Invalidate module cache for this specific file
    const moduleNode = server.moduleGraph.getModuleById(relativePath);
    if (moduleNode) {
      server.moduleGraph.invalidateModule(moduleNode);
    }

    const blockModule = (await ssrLoadModule(server, relativePath)) as {
      block?: Block;
    };

    if (!blockModule.block) {
      server.config.logger.warn(`[camox] No block export found in ${relativePath}`, {
        timestamp: true,
      });
      return;
    }

    const block = blockModule.block;

    let result;
    try {
      result = await client.blockDefinitions.upsert({
        projectSlug,
        syncSecret,
        blockId: block.id,
        title: block.title,
        description: block.description,
        contentSchema: block.contentSchema,
        settingsSchema: block.settingsSchema,
        defaultContent: block.getInitialContent(),
        defaultSettings: block.getInitialSettings(),
        layoutOnly: block.layoutOnly || undefined,
      });
    } catch (error) {
      throwIfSyncAuthError(error);
      throw error;
    }

    server.config.logger.info(
      `[camox] ${result.action === "created" ? "Created" : "Updated"} block "${block.id}"`,
      { timestamp: true },
    );
  }

  async function deleteBlock(filePath: string): Promise<void> {
    const blockId = getBlockIdFromFilePath(filePath);

    let result;
    try {
      result = await client.blockDefinitions.delete({
        projectSlug,
        syncSecret,
        blockId,
      });
    } catch (error) {
      throwIfSyncAuthError(error);
      throw error;
    }

    if (result.deleted) {
      server.config.logger.info(`[camox] Deleted block "${blockId}"`, {
        timestamp: true,
      });
    }
  }

  // Initial sync from files to API
  try {
    await performInitialSync();
  } catch (error) {
    server.config.logger.error(`[camox] Failed to sync block definitions: ${error}`, {
      timestamp: true,
    });
  }

  // Watch for changes in block files
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const layoutsDir = path.resolve(server.config.root, "src/camox/layouts");

  function isBlockFile(filePath: string): boolean {
    return filePath.startsWith(blocksDir) && /\.tsx?$/.test(filePath);
  }

  function isLayoutFile(filePath: string): boolean {
    return filePath.startsWith(layoutsDir) && /\.tsx?$/.test(filePath);
  }

  const handleBlockFileUpsert = (filePath: string) => {
    if (!isBlockFile(filePath)) return;

    const existingTimer = debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    debounceTimers.set(
      filePath,
      setTimeout(async () => {
        debounceTimers.delete(filePath);
        try {
          await upsertBlock(filePath);
        } catch (error) {
          server.config.logger.error(`[camox] Failed to sync block: ${error}`, { timestamp: true });
        }
      }, SYNC_DEBOUNCE_DELAY_MS),
    );
  };

  const handleBlockFileDelete = (filePath: string) => {
    if (!isBlockFile(filePath)) return;

    // Clear any pending upsert for this file
    const existingTimer = debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debounceTimers.delete(filePath);
    }

    setTimeout(async () => {
      try {
        await deleteBlock(filePath);
      } catch (error) {
        server.config.logger.error(`[camox] Failed to delete block: ${error}`, { timestamp: true });
      }
    }, SYNC_DEBOUNCE_DELAY_MS);
  };

  let layoutSyncTimer: ReturnType<typeof setTimeout> | null = null;
  const handleLayoutFileChange = (filePath: string) => {
    if (!isLayoutFile(filePath)) return;

    if (layoutSyncTimer) clearTimeout(layoutSyncTimer);
    layoutSyncTimer = setTimeout(async () => {
      layoutSyncTimer = null;
      try {
        await performInitialSync();
      } catch (error) {
        server.config.logger.error(`[camox] Failed to sync layouts: ${error}`, { timestamp: true });
      }
    }, SYNC_DEBOUNCE_DELAY_MS);
  };

  server.watcher.on("change", handleBlockFileUpsert);
  server.watcher.on("change", handleLayoutFileChange);
  server.watcher.on("add", handleBlockFileUpsert);
  server.watcher.on("add", handleLayoutFileChange);
  server.watcher.on("unlink", handleBlockFileDelete);
}
