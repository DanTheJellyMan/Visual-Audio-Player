import AudioDataManager from "../analyser/AudioDataManager";
import strictObjectAssign from "../utils/strictObjectAssign";
import { sab, ctx, init } from "./renderHandler";

export type InitData = {
    sab: SharedArrayBuffer,
    canvas: OffscreenCanvas
};

export type Config = {
    fps: number,
    fftRatio: number
};

export type MessagePayload =
{
    type: "init",
    data: InitData
} |
{
    type: "config-update",
    data: Partial<Config> | Required<Config>
} |
{
    type: "get-bitmap",
    data?: ImageBitmap
}
;

let config: Config | null = null;
let renderFn: (() => Promise<void>) | null = null;
let renderRequestAnimationFrameId: number = 0;
let renderIntervalId: number = 0;

self.onmessage = handleMessage;
self.postMessage("Ready");

function handleMessage(e: MessageEvent<MessagePayload>): void {
    const { type, data } = e.data;

    switch(type) {
        case "init": {
            renderFn = init(data.sab, data.canvas);
            break;
        }
        case "config-update": {
            if (config === null) {
                // Apply all options of new config
                const strictData = data as Required<Config>;
                config = strictData;
                
                if (sab) {
                    const man = new AudioDataManager(sab);
                    if (config.fftRatio) {
                        man.setHeader({
                            fftRatio: config.fftRatio
                        });
                    }
                } else {
                    console.error(
                        "Could not set FFT ratio. Ensure to initialize first with the SharedArrayBuffer before setting the config."
                    );
                }
                
                if (config.fps) {
                    handleRenderLoop(config.fps);
                }
            } else {
                const oldConfig = structuredClone(config);
                // Apply only options that changed from oldConfig to config (updated)
                strictObjectAssign(config, data);

                if (sab) {
                    const man = new AudioDataManager(sab);
                    if (config.fftRatio && oldConfig.fftRatio !== config.fftRatio) {
                        man.setHeader({
                            fftRatio: config.fftRatio
                        });
                    }
                }

                if (config.fps && oldConfig.fps !== config.fps) {
                    handleRenderLoop(config.fps);
                }
            }
            break;
        }
        case "get-bitmap": {
            if (!ctx) {
                console.error("Cannot retrieve ImageBitmap from rendering canvas - uninitialized canvas context");
                return;
            }
            
            const bitmap = (ctx.canvas as OffscreenCanvas).transferToImageBitmap();
            const messagePayload: MessagePayload = {
                type: "get-bitmap",
                data: bitmap
            };
            self.postMessage(messagePayload, [bitmap]);
        }
    }
}

function handleRenderLoop(fps: number) {
    cancelAnimationFrame(renderRequestAnimationFrameId);
    clearInterval(renderIntervalId);
    renderRequestAnimationFrameId = 0;
    renderIntervalId = 0;

    if (fps === Infinity || fps === -Infinity) {
        // Render continuously at refresh rate with requestAnimationFrame()
        const loopFn = async (timestamp: DOMHighResTimeStamp) => {
            if (renderFn) await renderFn();
            renderRequestAnimationFrameId = requestAnimationFrame(loopFn);
        };
        renderRequestAnimationFrameId = requestAnimationFrame(loopFn);
    } else if (fps < 0) {
        // Render a specific amount of frames at refresh rate
        const totalRenderCt = Math.abs(fps);
        let renderCt = 0;
        const loopFn = async (timestamp: DOMHighResTimeStamp) => {
            if (renderFn) {
                if (renderCt >= totalRenderCt) return;
                renderCt++;
                await renderFn();
            }
            renderRequestAnimationFrameId = requestAnimationFrame(loopFn);
        };
        renderRequestAnimationFrameId = requestAnimationFrame(loopFn);
    } else if (fps > 0 && fps < Infinity) {
        // Render at a specified FPS from (0, Infinity)
        setInterval(async () => {
            if (renderFn) await renderFn();
        }, 1000 / fps);
    }
    // fps = 0, cancels any future rendering
    // (essentially clears all rendering loops and doesn't start a new one)
}