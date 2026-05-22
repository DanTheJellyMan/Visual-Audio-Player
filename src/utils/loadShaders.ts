/// <reference types="vite/client" />

/**
 * Import all .wgsl module files within a specified "shader-modules" folder, and concatenate the text content.
 * @param url Folder/directory must end with "shader-modules"
 * @param exclude Either exclude or include listed modules by name
 * 
 * true (default): Exclude loading listed modules
 * 
 * false: Only include listed modules
 * @param modules 
 * @returns 
 */
export default async function loadShaders(url: URL, exclude: boolean = true, modules: string[] = []): Promise<string> {
    const validStatus = validatePath(url);
    if (Object.getPrototypeOf(validStatus).constructor === Error) {
        throw validStatus;
    }

    const prefix = (exclude ? "!" : "") + url.pathname + "/";
    const globPatterns = modules
    .filter((modName) => modName.endsWith(".wgsl"))
    .map((modName) => prefix + modName);

    if (globPatterns.length === 0) {
        globPatterns.push(prefix + "*.wgsl");
    }

    const shaderContent = await appendImportContent(globPatterns);
    return shaderContent;
}

async function appendImportContent(glob: string | string[]): Promise<string> {
    const moduleRecordsAsync = import.meta.glob(glob) as Record<string, () => Promise<string>>;
    const promises = Object.values(moduleRecordsAsync);

    let output: string = "";
    for (let i=0; i<promises.length; i++) {
        const module = await promises[i]();
        output += `${module}\r\n\n`;
    }

    return output
}

/**
 * 
 * @param url 
 * @returns {Error|string} If valid, returns dirname
 */
function validatePath(url: URL): Error | string {
    const invalidPathError = new Error("Invalid path");

    const { pathname } = url;
    if (pathname === "/") {
        return new Error(pathname, { cause: invalidPathError });
    }

    let i = pathname.length-1;
    while (i >= 0 && pathname[i] !== "/") {
        i--;
    }
    if (i < 0) {
        return new Error(`No "shader-modules" folder found at URL path: ${pathname}`, { cause: invalidPathError });
    }

    const dirname = pathname.substring(i+1, pathname.length);
    if (!dirname.endsWith("shader-modules")) {
        return new Error(`Incorrect directory name: ${dirname}`, { cause: invalidPathError });
    }

    return dirname;
}