/// <reference types="vitest/config" />
import { resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const examplesDir = fileURLToPath(new URL("./examples", import.meta.url));

export default defineConfig({
    base: "/",
    root: examplesDir,
    publicDir: resolve(examplesDir, "../public"),
    build: {
        outDir: "../examples-dist",
        emptyOutDir: true,
        rolldownOptions: {
            input: {
                main: resolve(examplesDir, "index.html"),
                demo: resolve(examplesDir, "demo/index.html")
            }
        }
    },
    server: {
        cors: {
            origin: false,
            methods: ["GET"],
            allowedHeaders: ["Cross-Origin-Opener-Policy", "Cross-Origin-Embedder-Policy"]
        },
        headers: {
            "cross-origin-opener-policy": "same-origin",
            "cross-origin-embedder-policy": "credentialless"
        }
    }
});