export default class VisualAudioPlayer {
    static #worker = new Worker("./VisualAudioPlayer_renderer.js");
    static #players = {};
    static {
        this.#worker.onmessage = (e) => {
            const { data } = e;
            const player = this.#players[data.id];

            switch (e.data.type) {
                case "render":
                    player.#sendRenderTime(data.renderTime);
                    break;
                case "bitmap":
                    if (player.#bitmapResolver) {
                        player.#bitmapResolver(data.bitmap);
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
            gapPercent: 0.25,
            interp: {
                type: "linear",
                t: 0.2
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

    #lastRenderTime = 0;
    #bitmapResolver = null;

    constructor(mediaElement, options = null) {
        Object.assign(this.#options, structuredClone(VisualAudioPlayer.#defaultOptions));
        VisualAudioPlayer.strictObjectAssign(this.#options, options);

        do {
            this.#id = crypto.randomUUID();
        } while (this.#id in VisualAudioPlayer.#players);
        VisualAudioPlayer.#players[this.#id] = this;
        const { width, height, alpha, desynchronized } = this.#options.canvas;
        const initMsg = {
            type: "init",
            id: this.#id,
            canvasOptions: { width, height, ctxOptions: { alpha, desynchronized } }
        };
        VisualAudioPlayer.#worker.postMessage(initMsg);

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
            // console.log("play", !mediaElement.paused);
            this.#audioContext.resume();
        }
        const sus = () => {
            // console.log("pause", !mediaElement.paused);
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
        const { width, gapPercent } = options.canvas;
        anal.fftSize = Math.min(Math.max(2**5, analOptions.fftSize), 2**15);
        while (width / anal.frequencyBinCount * (1-gapPercent) < 1 && anal.fftSize > 2**5) {
            anal.fftSize /= 2;
        }
        console.log(anal.fftSize, this.#analyserNode.fftSize);
        this.#oldDataArray.fill(0);
        this.#newDataArray.fill(0);
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

    draw() {
        // const startT = performance.now();
        const renderMsg = {
            type: "render",
            id: this.#id,
            renderData: this.#calcRenderData()
        }
        VisualAudioPlayer.#worker.postMessage(renderMsg);
        // console.log(performance.now() - startT);
    }
    #calcRenderData() {
        const { width, height, gapPercent, interp } = this.#options.canvas;
        const bufferLength = this.#analyserNode.frequencyBinCount;
        const totalBarWidth = width / bufferLength;
        const filledWidth = totalBarWidth * (1 - gapPercent);
        const gapSize = totalBarWidth * gapPercent;

        const interpMethod = VisualAudioPlayer.#interpMethods[interp.type];
        this.#analyserNode.getByteFrequencyData(this.#newDataArray);
        const allDataArrayParams = []; // for testing
        const dataArray = this.#oldDataArray.map((y1, i) => {
            let y0 = Math.min(
                Math.max(
                    y1*0.33,
                    VisualAudioPlayer.#interpMethods.linear(
                        this.#oldDataArray[Math.max(0, i-1)],
                        this.#newDataArray[Math.max(0, i-1)],
                        0.75
                    )
                ),
                y1*1.66
            );
            const y2 = this.#newDataArray[i];
            const y3 = Math.min(
                Math.max(
                    y2*0.33,
                    VisualAudioPlayer.#interpMethods.linear(
                        this.#oldDataArray[Math.min(i+1, this.#oldDataArray.length-1)],
                        this.#newDataArray[Math.min(i+1, this.#newDataArray.length-1)],
                        0.25
                    )
                ),
                y2*1.66
            );

            let interpParams = null;
            switch (interp.type) {
                case "linear":
                case "cosine":
                    interpParams = [y1, y2, interp.t];
                    break;
                default:
                    const t = y1 === y2 || y1 === 0 || y2 === 0 ? 1 : interp.t;
                    interpParams = [y0, y1, y2, y3, t];
                    break;
            }

            allDataArrayParams.push([
                [
                    [this.#oldDataArray[i-1], this.#oldDataArray[i], this.#oldDataArray[i+1]],
                    [this.#newDataArray[i-1], this.#newDataArray[i], this.#newDataArray[i+1]]
                ]
            , [y0, y1, y2, y3]]);
            return interpMethod(...interpParams);
        });
        // if (highestValue > 130) console.log(`highest value (${performance.now()}ms): ${highestValue}`);
        this.#oldDataArray.set(dataArray);

        const renderData = new Array(bufferLength);
        // console.log(totalBarWidth, this.#analyserNode.frequencyBinCount);
        const barWidth = Math.floor(filledWidth);
        for (let i=0; i<bufferLength; i++) {
            const totalHeight = dataArray[i];
            const hue = i * 360 / bufferLength;
            const fillStyle = `hsl(${hue},100%,50%)`;
            const barX = Math.floor((i) * (barWidth + gapSize));
            const barY = height;
            const barHeight = Math.floor(-(totalHeight*height/255));
            if (i-1>=0 && i+1<bufferLength && dataArray[i] > dataArray[i-1]*2 && dataArray[i] > dataArray[i+1]*2) {
                console.log(`${performance.now()}ms - ${hue}`, `${barHeight}px`, allDataArrayParams[i]);
            }
            renderData[i] = { fillStyle, barX, barY, barWidth, barHeight };
            // x = (i+1) * (barWidth + gapSize);

            if (i === Math.floor(bufferLength*1)-1) {
                // console.log("color: "+hue, "dB: "+totalHeight);
                // console.log(`width: ${barWidth}, X: ${barX}`);
            }
        }
        return renderData;
    }

    #sendRenderTime(ms) {
        this.#lastRenderTime = ms;
    }
    get lastRenderTime() {
        return this.#lastRenderTime;
    }

    getImageBitmap() {
        return new Promise((resolve, reject) => {
            this.#bitmapResolver = (resolveData) => {
                resolve(resolveData);
                this.#bitmapResolver = null;
            }
            const bitmapMsg = {
                type: "bitmap",
                id: this.#id
            }
            VisualAudioPlayer.#worker.postMessage(bitmapMsg);
        });
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
        linear: (y1, y2, mu) => {
            return y1 + (y2-y1) * mu;
        },
        cosine: (y1, y2, mu) => {
            const mu2 = (1 - Math.cos(mu*Math.PI)) / 2;
            return y1 * (1 - mu2) + y2 * mu2;
        },
        cubic: (y0, y1, y2, y3, mu) => {
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