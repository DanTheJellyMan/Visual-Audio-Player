const players = {};

self.onmessage = (e) => {
    const { type, id, renderData, textData, offscreenCanvas, ctxOptions, alphaGradientBitmap } = e.data;

    switch (type) {
        case "init": {
            handleInit(id, offscreenCanvas, ctxOptions, alphaGradientBitmap);
            self.postMessage({ type, id });
            break;
        }
        case "render": {
            const renderTime = handleFinalRender(id);
            self.postMessage({ type, id, renderTime });
            break;
        }
        case "fg-render": {
            const renderTime = handleRender(
                players[id].fgCtx,
                renderData,
                textData,
                players[id].alphaGradientBitmap
            );
            self.postMessage({ type, id, renderTime });
            break;
        }
        case "bg-render": {
            const renderTime = handleRender(
                players[id].bgCtx,
                renderData,
                textData
            );
            players[id].stretchBackground = renderData.stretchBitmap;
            self.postMessage({ type, id, renderTime });
            break;
        }
        case "delete": {
            delete players[id];
            self.postMessage({ type, id });
            break;
        }

        case "fg-bitmap": {
            const bitmap = players[id].fgCtx.canvas.transferToImageBitmap();
            self.postMessage({ type, id, bitmap }, [bitmap]);
            break;
        }
        case "bg-bitmap": {
            const bitmap = players[id].bgCtx.canvas.transferToImageBitmap();
            self.postMessage({ type, id, bitmap }, [bitmap]);
            break;
        }
    }
}

function handleInit(id, offscreenCanvas, ctxOptions, alphaGradientBitmap) {
    const { width, height } = offscreenCanvas;
    const fgCanvas = new OffscreenCanvas(width, height);
    const bgCanvas = new OffscreenCanvas(width, height);
    const mainCtx = offscreenCanvas.getContext("2d", ctxOptions);
    // Alpha foreground required to see background
    const fgCtx = fgCanvas.getContext("2d", { ...ctxOptions, alpha: true });
    const bgCtx = bgCanvas.getContext("bitmaprenderer", ctxOptions);

    players[id] = {
        mainCtx,
        fgCtx,
        bgCtx,
        stretchBackground: false,
        alphaGradientBitmap
    };
}

function handleFinalRender(id) {
    const startT = performance.now();
    const { mainCtx, fgCtx, bgCtx, stretchBackground } = players[id];
    const { width, height } = mainCtx.canvas;
    const sizeParams = [];
    if (stretchBackground) sizeParams.push(width, height);
    mainCtx.clearRect(0, 0, width, height);
    mainCtx.drawImage(bgCtx.canvas, 0, 0, ...sizeParams);
    mainCtx.drawImage(fgCtx.canvas, 0, 0);
    return performance.now() - startT;
}

// For foreground & background
function handleRender(ctx, renderData, textData = [], alphaGradientBitmap = null) {
    const startT = performance.now();
    const { bitmap, stretchBitmap, array } = renderData;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    if (ctx.transferFromImageBitmap) {
        ctx.transferFromImageBitmap(bitmap);
        bitmap.close();
    } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (array) {
            for (let { fillStyle, barX, barY, barWidth, barHeight, motionBlur } of array) {
                // TODO: add motion blur to both top and bottom of bars, and
                // avoid doing any transformations on the given dimensions or coordinates.
                if (motionBlur !== 0) {
                    ctx.fillStyle = "white";
                    ctx.fillRect(barX, barY, barWidth, barHeight + motionBlur/2);
                    ctx.drawImage(
                        alphaGradientBitmap,
                        0, alphaGradientBitmap.height,
                        1, -alphaGradientBitmap.height,
                        barX, barY - Math.abs(barHeight) + motionBlur/2,
                        barWidth, -motionBlur
                    );
                    ctx.globalCompositeOperation = "source-atop";
                } else if (barHeight === 0 || barWidth === 0) {
                    continue;
                }

                fillStyle ??= "white";
                ctx.fillStyle = fillStyle;
                ctx.fillRect(barX, barY, barWidth, barHeight - motionBlur/2);
                ctx.globalCompositeOperation = "source-over";
            }
            // ctx.drawImage(alphaGradientBitmap,
            //     0, alphaGradientBitmap.height,
            //     1, -alphaGradientBitmap.height,
            //     0, 1080/2,
            //     300, -300
            // );
        }
        
        if (bitmap !== undefined && bitmap !== null) {
            let drawWidth = bitmap.width;
            let drawHeight = bitmap.height;
            if (stretchBitmap) {
                drawWidth = canvasWidth;
                drawHeight = canvasHeight;
            }
            ctx.globalCompositeOperation = "source-atop";
            ctx.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
            ctx.globalCompositeOperation = "source-over";
            bitmap.close();
        }
        ctx.closePath();
    }

    for (const { fillStyle, font, text, x, y, maxWidth } of textData) {
        ctx.fillStyle = fillStyle;
        ctx.font = font;
        ctx.fillText(text, x, y, maxWidth);
    }
    return performance.now() - startT;
}

// NOTE: Gradients are quite slow to draw with
function createSmoothGradient(ctx, width, startHueDeg, endHueDeg, steps) {
    const grad = ctx.createLinearGradient(0,0,width,0);
    for (let i=0; i<=steps; i++) {
        const hue = (i * endHueDeg / steps) + startHueDeg;
        grad.addColorStop(i / steps, `hsl(${hue}, 100%, 50%)`);
    }
    return grad;
}