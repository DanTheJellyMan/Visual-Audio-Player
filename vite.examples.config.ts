/// <reference types="vitest/config" />

import { defineConfig } from "vite";

export default defineConfig({
    root: "examples",
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