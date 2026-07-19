export const AdvancedAnalyserNode = await import("./analyser/AdvancedAnalyserNode");

export const AudioDataManager = await import("./analyser/AudioDataManager");

export const RenderEngineHandler = await import("./render-engine/renderHandler");

export const RenderEngineWorker = await import("./render-engine/worker");

export const Utils = await importUtils();

/**
 * @param pathname 
 * @returns 
 */
async function importUtils() {
    const files = Object.entries(import.meta.glob("./utils/*.ts"));
    const imports: Record<typeof files[number][0], Awaited<ReturnType<typeof files[number][1]>>> = {};

    for (const [filePath, fileImportPromiseCb] of files) {
        const fileNEI = filePath.lastIndexOf(".");
        const moduleName = filePath.substring(
            filePath.lastIndexOf("/", fileNEI) + 1,
            fileNEI
        );
        const fileImport = await fileImportPromiseCb();
        imports[moduleName] = fileImport;
    }

    return imports;
}