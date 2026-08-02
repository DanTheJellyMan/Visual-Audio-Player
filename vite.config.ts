/// <reference types="vitest/config" />

import { defineConfig } from "vite";

export default defineConfig({
    build: {
        lib: {
            name: "PhonoFrame",
            entry: "src",
            formats: ["es"]
        }
    },
    test: {
        pool: "vmThreads",
        vmMemoryLimit: "10MB"
    }
});