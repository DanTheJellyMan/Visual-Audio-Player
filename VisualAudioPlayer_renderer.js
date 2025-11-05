const players = {};

self.onmessage = (e) => {
    const { type, id, renderData, canvasOptions } = e.data;

    switch (type) {
        case "init":
            handleInit(id, canvasOptions);
            self.postMessage({ type, id });
            break;
        case "render":
            const renderTime = handleRender(id, renderData);
            self.postMessage({ type, id, renderTime });
            break;
        case "bitmap":
            const { ctx } = players[id];
            const bitmap = ctx.canvas.transferToImageBitmap();
            self.postMessage({ type, id, bitmap });
            break;
        case "delete":
            delete players[id];
            break;
    }
}

function handleInit(id, canvasOptions) {
    const { width, height, ctxOptions } = canvasOptions;
    const offscreenCanvas = new OffscreenCanvas(width, height);
    const ctx = offscreenCanvas.getContext("2d", { ...ctxOptions });
    players[id] = { ctx };
}

function handleRender(id, renderData) {
    const startT = performance.now();
    const { ctx } = players[id];
    const canvasWidth = ctx.canvas.width;

    // Note: Gradients are quite slow to draw with
    // const fillGradient = createSmoothGradient(ctx, canvasWidth, 0, 360, 20);
    ctx.clearRect(0,0,canvasWidth,ctx.canvas.height);
    for (let { fillStyle, barX, barY, barWidth, barHeight } of renderData) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(barX, barY, barWidth, barHeight);
    }
    ctx.font = "36px open-sans";
    ctx.fillStyle = "white";
    ctx.fillText(`${performance.now()}ms`,100,100);
    return performance.now() - startT;
}

function createSmoothGradient(ctx, width, startHueDeg, endHueDeg, steps) {
    // startHueDeg = Math.min(startHueDeg, endHueDeg);
    // endHueDeg = Math.max(startHueDeg, endHueDeg);
    const grad = ctx.createLinearGradient(0,0,width,0);
    for (let i=0; i<=steps; i++) {
        const hue = (i * endHueDeg / steps) + startHueDeg;
        grad.addColorStop(i / steps, `hsl(${hue}, 100%, 50%)`);
    }
    return grad;
}