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
self.postMessage("Ready");

function handleMessage(e: MessageEvent<MessagePayload>): void {
    const { type, data } = e.data;

    switch(type) {
        case "init": {
            init(data.sab, data.canvas);
            break;
        }
        case "config-update": {
            const cfg = config ? config : data;
            strictObjectAssign(cfg, data);
            config = cfg;

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