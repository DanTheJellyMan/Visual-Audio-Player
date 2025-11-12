export default class VisualAudioPlayer {
    static #worker = new Worker("./VisualAudioPlayer_renderer.js");
    static #players = {};
    static {
        this.#worker.onmessage = (e) => {
            const { data } = e;
            const player = this.#players[data.id];
            const resolvers = player.#resolvers;

            switch (data.type) {
                case "init":
                    if (resolvers.init) {
                        resolvers.init();
                    }
                    break;
                case "render":
                    if (resolvers.render) {
                       resolvers.render(data.renderTime);
                    }
                    break;
                case "fg-render":
                    if (resolvers.fgRender) {
                        resolvers.fgRender(data.renderTime);
                    }
                    break;
                case "bg-render":
                    if (resolvers.bgRender) {
                        resolvers.bgRender(data.renderTime);
                    }
                    break;
                case "delete":
                    if (resolvers.delete) {
                        resolvers.delete();
                    }
                    break;
                case "fg-bitmap":
                    if (resolvers.fgBitmap) {
                        resolvers.fgBitmap(data.bitmap);
                    }
                    break;
                case "bg-bitmap":
                    if (resolvers.bgBitmap) {
                        resolvers.bgBitmap(data.bitmap);
                    }
                    break;
            }
        }
    }
    #id;

    static #defaultOptions = Object.freeze({
        analyserNode: {
            minDecibels: -100,
            maxDecibels: -10,
            fftSize: 1024
        },
        canvas: {
            width: 800,
            height: 600,
            alpha: false,
            desynchronized: true,
            subpixelRendering: true,
            gapPercent: 0.25,
            interp: {
                type: "cosine",
                t: 0.2,
                adjacentPointRatio: 1/3
            }
        }
    });
    #options = {};

    #audioContext = new AudioContext();
    #sourceNode;
    #nodes = [];
    #analyserNode;
    #oldDataArray;
    #newDataArray;

    #resolvers = {
        init: null,
        render: null,
        fgRender: null,
        bgRender: null,
        fgBitmap: null,
        bgBitmap: null
    }

    constructor(mediaElement, options = null) {
        Object.assign(this.#options, structuredClone(VisualAudioPlayer.#defaultOptions));
        VisualAudioPlayer.strictObjectAssign(this.#options, options);

        do {
            this.#id = crypto.randomUUID();
        } while (this.#id in VisualAudioPlayer.#players);
        VisualAudioPlayer.#players[this.#id] = this;

        this.#sourceNode = this.#audioContext.createMediaElementSource(mediaElement);
        this.#analyserNode = this.#audioContext.createAnalyser();
        Object.assign(this.#analyserNode, this.#options.analyserNode);
        this.#sourceNode
        .connect(this.#analyserNode)
        .connect(this.#audioContext.destination);

        // Set to the max AnalyserNode.frequencyBinCount value
        // to allow for resizing of AnalyserNode.fftSize.
        const bufLen = 2**15;
        this.#oldDataArray = new Uint8Array(bufLen);
        this.#newDataArray = new Uint8Array(bufLen);
        this.#handleOptionsChange();

        const res = () => {
            this.#audioContext.resume();
        }
        const sus = () => {
            this.#audioContext.suspend();
        }
        mediaElement.addEventListener("play", res);
        mediaElement.addEventListener("abort", sus);
        mediaElement.addEventListener("emptied", sus);
        mediaElement.addEventListener("ended", sus);
        mediaElement.addEventListener("error", sus);
        mediaElement.addEventListener("pause", sus);
        mediaElement.addEventListener("stalled", sus);
        mediaElement.addEventListener("suspend", sus);
    }

    static set defaultOptions(obj) {
        this.strictObjectAssign(this.#defaultOptions, obj);
    }
    static get defaultOptions() {
        return this.#defaultOptions;
    }

    set options(obj) {
        VisualAudioPlayer.strictObjectAssign(this.#options, obj);
        this.#handleOptionsChange();
    }
    get options() {
        return structuredClone(this.#options);
    }
    #handleOptionsChange() {
        const options = this.#options;
        const anal = this.#analyserNode; // I'm a comedian!
        const analOptions = options.analyserNode;
        anal.minDecibels = analOptions.minDecibels;
        anal.maxDecibels = analOptions.maxDecibels;

        // Limit fftSizes that result in filled bar widths of < 1
        const MIN_FFTSIZE = 2**5;
        const MAX_FFTSIZE = 2**15;
        const { width, gapPercent } = options.canvas;
        anal.fftSize = Math.min(
            Math.max(MIN_FFTSIZE, analOptions.fftSize),
            MAX_FFTSIZE
        );
        if (!options.canvas.subpixelRendering) {
            while (width / anal.frequencyBinCount * (1-gapPercent) < 1 &&
                anal.fftSize > MIN_FFTSIZE
            ) {
                anal.fftSize /= 2;
            }
        }
        this.#oldDataArray.fill(0);
        this.#newDataArray.fill(0);
    }

    get resolvers() {
        return Object.keys(this.#resolvers);
    }

    get audioContext() {
        return this.#audioContext;
    }
    setAudioNodes(...nodes) {
        this.#sourceNode.disconnect();
        for (const node of this.#nodes) {
            node.disconnect();
        }
        this.#nodes = [];
        this.#analyserNode.disconnect();

        let lastNode = this.#sourceNode;
        for (const node of nodes) {
            lastNode.connect(node);
            lastNode = node;
        }
        lastNode
        .connect(this.#analyserNode)
        .connect(this.#audioContext.destination);
    }

    async init(offscreenCanvas, alwaysRender = false) {
        this.postEmptyWorkerMessage("delete");
        const deletePlayerPromise = this.createResolverPromise("delete");
        const { width, height } = offscreenCanvas;
        Object.assign(this.#options.canvas, { width, height });
        const { alpha, desynchronized } = this.#options.canvas;
        const initMsg = {
            type: "init",
            id: this.#id,
            offscreenCanvas,
            ctxOptions: { alpha, desynchronized },
            alwaysRender
        };
        await deletePlayerPromise;
        VisualAudioPlayer.#worker.postMessage(initMsg, [offscreenCanvas]);
    }

    fgRender(bitmap = null, stretchBitmap = false, fill = "rgb") {
        const { fgData, calcTime } = this.#calcFgData(fill);
        const renderMsg = {
            type: "fg-render",
            id: this.#id,
            renderData: { bitmap, stretchBitmap, array: fgData }
        }
        const transferableObjects = [];
        if (bitmap) transferableObjects.push(bitmap);
        VisualAudioPlayer.#worker.postMessage(renderMsg, transferableObjects);
        return calcTime;
    }
    bgRender(bitmap, stretchBitmap = false) {
        const renderMsg = {
            type: "bg-render",
            id: this.#id,
            renderData: { bitmap, stretchBitmap }
        }
        VisualAudioPlayer.#worker.postMessage(renderMsg, [bitmap]);
    }

    createResolverPromise(resolverName) {
        return new Promise((resolve, reject) => {
            this.#resolvers[resolverName] = (resolveData) => {
                this.#resolvers[resolverName] = null;
                resolve(resolveData);
            }
        });
    }
    postEmptyWorkerMessage(resolverName) {
        const HIGHEST_UPPER_LETTER_CODE = "Z".charCodeAt(0);
        const charArr = resolverName.split("");
        // Add hyphens
        for (let i=0; i<charArr.length; i++) {
            const letter = charArr[i];
            if (letter.charCodeAt(0) > HIGHEST_UPPER_LETTER_CODE) continue;
            charArr[i] = "-";
            charArr.splice(i+1, 0, letter.toLowerCase());
            
            // Find resume index
            let j = i+2;
            for (; j<charArr.length; j++) {
                if (charArr[j].charCodeAt(0) > HIGHEST_UPPER_LETTER_CODE) {
                    break;
                }
            }
            i += j - 1;
        }
        const type = charArr.join("").toLowerCase();
        const id = this.#id;

        const msg = { type, id };
        VisualAudioPlayer.#worker.postMessage(msg);
    }

    // NOTE: Maybe calculate some motion blur on top of the bars?
    // Might want to calc a number, and then let the renderer handle the rest.
    #calcFgData(fill = null) {
        const startT = performance.now();
        const { width, height, subpixelRendering, gapPercent, interp } = this.#options.canvas;
        const interpMethod = VisualAudioPlayer.#interpMethods[interp.type];
        this.#analyserNode.getByteFrequencyData(this.#newDataArray);
        const dataArray = VisualAudioPlayer.interpArrays(
            this.#oldDataArray,
            this.#newDataArray,
            interpMethod,
            interp.t,
            interp.adjacentPointRatio
        );
        this.#oldDataArray.set(dataArray);

        const DEFAULT_FILL = "rgb";
        const bufferLength = this.#analyserNode.frequencyBinCount;
        const totalBarWidth = width / bufferLength;
        const filledWidth = totalBarWidth * (1 - gapPercent);
        const gapSize = totalBarWidth * gapPercent;

        const fgData = new Array(bufferLength);
        const barWidth = subpixelRendering ? filledWidth : Math.floor(filledWidth);
        for (let i=0; i<bufferLength; i++) {
            let fillStyle = "";
            if ((fill === null || fill === undefined) ||
                (!CSS.supports("color", fill) && fill !== "")
            ) {
                fill = DEFAULT_FILL;
            }
            switch (fill) {
                case "":
                    fillStyle = "";
                    break;
                case "rgb": {
                    const hue = i * 360 / bufferLength;
                    fillStyle = `hsl(${hue},100%,50%)`
                    break;
                }
                default:
                    fillStyle = fill;
                    break;
            }
            const totalHeight = dataArray[i];
            const rawBarX = i * (barWidth + gapSize);
            const barX = subpixelRendering ? rawBarX : Math.floor(rawBarX);
            const barY = height;
            const rawBarHeight = totalHeight * height / -255;
            const barHeight = subpixelRendering ? rawBarHeight : Math.floor(rawBarHeight);
            fgData[i] = { fillStyle, barX, barY, barWidth, barHeight };
        }
        const calcTime = performance.now() - startT;
        return { calcTime, fgData };
    }

    static interpArrays(arr1, arr2, interpMethod, t, adjacentPointRatio = 1/1) {
        if (arr1.length !== arr2.length) {
            throw new Error(
                `${arr1.toString()} and ${arr2.toString()} have`+
                `unequal lengths (${arr1.length}, ${arr2.length})`
            );
        }
        const interpArr = new (arr1.constructor)(arr1.length);
        if (arr1.constructor !== arr2.constructor) {
            const arr1N = arr1.toString();
            const arr2N = arr2.toString();
            console.warn(
                `${arr1N} and ${arr2N} have different`+
                `constructors. Will use ${arr1N}'s (${arr1.constructor.name})`
            );
        }
        const lerp = VisualAudioPlayer.#interpMethods.linear;

        for (let i=0; i<arr1.length; i++) {
            const y1 = arr1[i];
            const y0 = Math.min(
                Math.max(
                    y1 * adjacentPointRatio,
                    lerp({
                        y1: arr1[Math.max(0, i-1)],
                        y2: arr2[Math.max(0, i-1)],
                        mu: 0.75
                    })
                ),
                y1 / adjacentPointRatio
            );
            const y2 = arr2[i];
            const y3 = Math.min(
                Math.max(
                    y2 * adjacentPointRatio,
                    lerp({
                        y1: arr1[Math.min(i+1, arr1.length-1)],
                        y2: arr2[Math.min(i+1, arr2.length-1)],
                        mu: 0.25
                    })
                ),
                y2 / adjacentPointRatio
            );
            interpArr[i] = interpMethod({ y0, y1, y2, y3, mu: t });
        }
        return interpArr;
    }

    /**
     * Similar to Object.assign, but only assigns props from src if they are also found in target
     * 
     * Example:
     * 
     * const obj = { name: "Joe", age: -1 }; const otherObj = { lastName: "Alex", age: 69 };
     * 
     * strictObjectAssign(obj, otherObj);
     * 
     * console.log(obj); // { name: "Joe", age: 69 }
     * @param {Object} target 
     * @param {Object} src 
     * @returns {void}
     */
    static strictObjectAssign(target, src) {
        for (const [key, value] of Object.entries(src)) {
            if (!(key in target) || typeof target[key] !== typeof value) continue;
            if (target[key].constructor === Object && value.constructor === Object) {
                this.strictObjectAssign(target[key], value);
            } else {
                target[key] = value;
            }
        }
    }

    static #interpMethods = Object.freeze({
        linear: ({ y1, y2, mu }) => {
            return y1 + (y2-y1) * mu;
        },
        cosine: ({ y1, y2, mu }) => {
            const mu2 = (1 - Math.cos(mu*Math.PI)) / 2;
            return y1 * (1 - mu2) + y2 * mu2;
        },
        cubic: ({ y0, y1, y2, y3, mu }) => {
            const mu2 = mu*mu;
            const a0 = y3 - y2 - y0 + y1;
            const a1 = y0 - y1 - a0;
            const a2 = y2 - y0;
            const a3 = y1;
            return(a0*mu*mu2+a1*mu2+a2*mu+a3);
        }
    });
    static get interpMethods() {
        return this.#interpMethods;
    }
}