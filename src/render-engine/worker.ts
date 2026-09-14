import AudioDataManager from "../analyser/AudioDataManager";
import strictObjectAssign from "../utils/strictObjectAssign";
import { RenderFnState, sab, ctx, init, render, getShaderTimestampLogs } from "./renderHandler";

export type InitData = {
    sab: SharedArrayBuffer,
    canvas: OffscreenCanvas
};

export type Config = {
    fftRatio: number,
    fps: number
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
};

let config: Config | null = null;
let renderState: RenderFnState | null = null;
let renderReqAniFrameId: number = 0;
let renderIntId: number = 0;
let logIntMs = 5_000;

self.onmessage = handleMessage;
self.postMessage("Ready");

function handleMessage(e: MessageEvent<MessagePayload>): void {
    const { type, data } = e.data;

    switch(type) {
        case "init": {
            renderState = init(data.sab, data.canvas);
            break;
        }
        case "config-update": {
            if (config === null) {
                // Apply all options of new config
                const strictData = data as Required<Config>;
                config = strictData;
                handleRenderLoop(config.fps);
                if (!sab) return;

                const headerKeys = Object.keys(AudioDataManager.HEADER_LAYOUT);
                let headerConfig: Pick<Config, keyof typeof AudioDataManager["HEADER_LAYOUT"]>;
                for (const [configKey] of Object.entries()) {
                    if (!Object.hasOwn(headerKeys, configKey)) {

                    }
                }
                const headerData = Object.fromEntries();
                const man = new AudioDataManager(sab);
                man.setHeader(config);
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
    cancelAnimationFrame(renderReqAniFrameId);
    clearInterval(renderIntId);
    renderReqAniFrameId = 0;
    renderIntId = 0;

    const logShaders = async (force = false) => {
        const { logs } = renderState!;
        const t = performance.now();
        if (force ||
            (renderState!.sampChanged && (t >= logs.lastLogTs + logIntMs))
        ) {
            logs.lastLogTs = t;
            const logContent = await getShaderTimestampLogs(
                renderState!.bufs.tsQuerySetReadBuf,
                logs
            );
            console.log(logContent);
        }
    }

    if (fps === Infinity || fps === -Infinity) {
        // Render continuously at refresh rate with requestAnimationFrame()
        const loopFn = async (ts: DOMHighResTimeStamp) => {
            if (renderState) {
                await render(renderState);
                await logShaders();
            }
            renderReqAniFrameId = requestAnimationFrame(loopFn);
        };
        renderReqAniFrameId = requestAnimationFrame(loopFn);
    } else if (fps < 0) {
        // Render a specific amount of frames at refresh rate
        const totalRenderCt = Math.abs(fps);
        let renderCt = 0;
        const loopFn = async (ts: DOMHighResTimeStamp) => {
            if (renderState) {
                if (renderCt >= totalRenderCt) return;
                renderCt++;
                await render(renderState);
                await logShaders();
            }
            renderReqAniFrameId = requestAnimationFrame(loopFn);
        };
        renderReqAniFrameId = requestAnimationFrame(loopFn);
    } else if (fps > 0 && fps < Infinity) {
        // Render at a specified FPS from (0, Infinity)
        // Prevents beginning another render before the last one finishes
        let doneRendering = true;
        setInterval(async () => {
            if (renderState && doneRendering) {
                doneRendering = false;
                await render(renderState);
                await logShaders();
                doneRendering = true;
            }
        }, 1000 / fps);
    }
    // fps = 0, cancels any future rendering
    // (essentially clears all rendering loops and doesn't start a new one)
}