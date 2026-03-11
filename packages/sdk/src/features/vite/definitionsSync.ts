import path from "node:path";
import type { ViteDevServer } from "vite";
import { ConvexClient } from "convex/browser";
import { api } from "camox/_generated/api";
import type { CamoxApp } from "@/core/createApp";
import type { Block } from "@/core/createBlock";
import type { Id } from "camox/_generated/dataModel";

const SYNC_DEBOUNCE_DELAY_MS = 100;

export interface DefinitionsSyncOptions {
  /** Path to the module that exports the camoxApp (relative to project root) */
  camoxAppPath?: string;
}

function getBlockIdFromFilePath(filePath: string): string {
  const fileName = path.basename(filePath, path.extname(filePath));
  return fileName;
}

export async function syncDefinitions(
  server: ViteDevServer,
  options: DefinitionsSyncOptions = {},
): Promise<void> {
  const camoxAppPath = options.camoxAppPath ?? "./src/camox/app.ts";
  const blocksDir = path.resolve(server.config.root, "src/camox/blocks");

  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    server.config.logger.warn(
      "[camox] VITE_CONVEX_URL not set, skipping block definitions sync",
      { timestamp: true },
    );
    return;
  }

  const client = new ConvexClient(convexUrl);

  async function getProjectId(): Promise<Id<"projects"> | null> {
    const project = await client.query(api.projects.getFirstProject, {});
    if (!project) {
      server.config.logger.warn(
        "[camox] No project found, skipping block definitions sync",
        { timestamp: true },
      );
      return null;
    }
    return project._id;
  }

  async function performInitialSync(): Promise<void> {
    const camoxModule = (await server.ssrLoadModule(camoxAppPath)) as {
      camoxApp?: CamoxApp;
    };

    if (!camoxModule.camoxApp) {
      server.config.logger.warn(
        `[camox] No camoxApp export found in ${camoxAppPath}`,
        { timestamp: true },
      );
      return;
    }

    const projectId = await getProjectId();
    if (!projectId) return;

    const blocks = camoxModule.camoxApp.getBlocks();
    const definitions = blocks.map((block: Block) => ({
      blockId: block.id,
      title: block.title,
      description: block.description,
      contentSchema: block.contentSchema,
      settingsSchema: block.settingsSchema,
      layoutOnly: block.layoutOnly || undefined,
    }));

    await client.mutation(api.blockDefinitions.syncBlockDefinitions, {
      projectId,
      definitions,
    });

    server.config.logger.info(
      `[camox] Synced ${definitions.length} block definition${definitions.length === 1 ? "" : "s"}`,
      { timestamp: true },
    );

    // Sync layouts
    const layoutDefinitions =
      camoxModule.camoxApp.getSerializableLayoutDefinitions();
    if (layoutDefinitions.length > 0) {
      await client.mutation(api.layouts.syncLayouts, {
        projectId,
        layouts: layoutDefinitions,
      });
      server.config.logger.info(
        `[camox] Synced ${layoutDefinitions.length} layout${layoutDefinitions.length === 1 ? "" : "s"}`,
        { timestamp: true },
      );
    }
  }

  async function upsertBlock(filePath: string): Promise<void> {
    const relativePath = "./" + path.relative(server.config.root, filePath);

    // Invalidate module cache for this specific file
    const moduleNode = server.moduleGraph.getModuleById(relativePath);
    if (moduleNode) {
      server.moduleGraph.invalidateModule(moduleNode);
    }

    const blockModule = (await server.ssrLoadModule(relativePath)) as {
      block?: Block;
    };

    if (!blockModule.block) {
      server.config.logger.warn(
        `[camox] No block export found in ${relativePath}`,
        { timestamp: true },
      );
      return;
    }

    const block = blockModule.block;
    const projectId = await getProjectId();
    if (!projectId) return;

    const result = await client.mutation(
      api.blockDefinitions.upsertBlockDefinition,
      {
        projectId,
        blockId: block.id,
        title: block.title,
        description: block.description,
        contentSchema: block.contentSchema,
        settingsSchema: block.settingsSchema,
        layoutOnly: block.layoutOnly || undefined,
      },
    );

    server.config.logger.info(
      `[camox] ${result.action === "created" ? "Created" : "Updated"} block "${block.id}"`,
      { timestamp: true },
    );
  }

  async function deleteBlock(filePath: string): Promise<void> {
    const blockId = getBlockIdFromFilePath(filePath);
    const projectId = await getProjectId();
    if (!projectId) return;

    const result = await client.mutation(
      api.blockDefinitions.deleteBlockDefinition,
      {
        projectId,
        blockId,
      },
    );

    if (result.deleted) {
      server.config.logger.info(`[camox] Deleted block "${blockId}"`, {
        timestamp: true,
      });
    }
  }

  // Initial sync from files to Convex
  try {
    await performInitialSync();
  } catch (error) {
    server.config.logger.error(
      `[camox] Failed to sync block definitions: ${error}`,
      { timestamp: true },
    );
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
          server.config.logger.error(
            `[camox] Failed to sync block: ${error}`,
            { timestamp: true },
          );
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
        server.config.logger.error(
          `[camox] Failed to delete block: ${error}`,
          { timestamp: true },
        );
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
        server.config.logger.error(
          `[camox] Failed to sync layouts: ${error}`,
          { timestamp: true },
        );
      }
    }, SYNC_DEBOUNCE_DELAY_MS);
  };

  server.watcher.on("change", handleBlockFileUpsert);
  server.watcher.on("change", handleLayoutFileChange);
  server.watcher.on("add", handleBlockFileUpsert);
  server.watcher.on("add", handleLayoutFileChange);
  server.watcher.on("unlink", handleBlockFileDelete);

  // Clean up on server close
  server.httpServer?.on("close", () => {
    client.close();
  });
}
