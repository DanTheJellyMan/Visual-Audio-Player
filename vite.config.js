import { defineConfig } from "vite";

export default defineConfig({
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
})