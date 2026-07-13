import strictObjectAssign from "../utils/strictObjectAssign";
import { Config } from "../analyser/AdvancedAnalyserNode";
import { sab, ctx, init } from "./renderHandler";

export type InitData = {
    sab: SharedArrayBuffer,
    canvas: OffscreenCanvas
};

export type MessagePayload =
{
    type: "init",
    data: InitData
} |
{
    type: "config-update",
    data: Config
} |
{
    type: "get-bitmap",
    data?: ImageBitmap
}
;

let config: Config | null = null;

self.onmessage = handleMessage;

function handleMessage(e: MessageEvent<MessagePayload>): void {
    const { type, data } = e.data;

    switch(type) {
        case "init": {
            init(data.sab, data.canvas);
            break;
        }
        case "config-update": {
            const cfg = config ? config : data;
            const fps = cfg.fps;
            strictObjectAssign(cfg, data);

            // if (cfg.fps !== fps) {
            //     // TODO: implement the function or class to handle the render loop and use the loop-stopping/starting behavior here
            //     if (intervalId !== undefined) {
            //         clearInterval(intervalId);
            //     }
            //     setInterval(handler, 1000/fps);
            // }
            config = cfg;
            break;
        }
        case "get-bitmap": {
            if (!ctx) {
                console.error("Cannot retrieve ImageBitmap from rendering canvas - uninitialized canvas context");
                return;
            }
            const bitmap = (ctx.canvas as OffscreenCanvas).transferToImageBitmap();
            self.postMessage(bitmap, [bitmap]);
        }
    }
}