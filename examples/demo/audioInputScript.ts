let playedFromDb: boolean = false;
let currFilename: string = "";

const dbAudioToggleEl: HTMLInputElement =
    document.querySelector("input#db-audio-toggle[type='checkbox']")!;
dbAudioToggleEl.checked = getDbStorageFlag();
const audioInput: HTMLInputElement =
    document.querySelector("input#audio-file-input[type='file']")!;
// audioInput.files = new DataTransfer().files;

const audio: HTMLAudioElement = document.querySelector("audio#music")!;

dbAudioToggleEl.addEventListener("change", handleDbStorageChange); 

audioInput.addEventListener("input", handleAudioInput);

const dbInitPromise: Promise<void> = new Promise((resolve) => {
    const dbOpenRequest = indexedDB.open("AudioSource");
    dbOpenRequest.onupgradeneeded = (e) => {
        const db = dbOpenRequest.result;
        const store = db.createObjectStore("AudioFile");
        store.transaction.commit();
        db.close();
        resolve();
    };
    dbOpenRequest.onsuccess = async (e) => {
        const db = dbOpenRequest.result;
        const file: File | null = await getAudioFileFromDb(true, db);
        const dbStorageFlag = getDbStorageFlag();
        if (!file) {
            console.log("No previous audio files detected");
        } else if (dbStorageFlag) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            audioInput.files = dataTransfer.files;
            audioInput.dispatchEvent(new Event("input"));
            console.log(`Loaded file from DB (${file.type}): ${file.name}`);
        }
        resolve();
    };
});

export function getDbStorageFlag() {
    const v = localStorage.getItem("allowDbAudioStorage");
    if (v === null) return false;
    return Boolean(Number(v));
}
export function setDbStorageFlag(enabled: boolean) {
    const value = Number(enabled).toString();
    localStorage.setItem("allowDbAudioStorage", value);
}

async function handleDbStorageChange(e: Event) {
    await dbInitPromise;
    const dbStorageFlag = dbAudioToggleEl.checked;
    setDbStorageFlag(dbStorageFlag);
    if (!dbStorageFlag
        || audio.src === ""
        || !URL.canParse(audio.src)
        || !audioInput.files?.length
    ) return;
    
    const file = audioInput.files[0];
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    audioInput.files = dataTransfer.files;
    await putAudioFileInDb(file, true);
    
    const currT = audio.currentTime;
    audioInput.dispatchEvent(new Event("input"));
    setTimeout(() => {
        audio.currentTime = currT;
        setTimeout(() => audio.play(), 0);
    }, 0);
}

async function handleAudioInput(e: Event) {
    await dbInitPromise;
    const target = e.target! as HTMLInputElement;
    if (!target.files || target.files.length !== 1) return;

    const file = target.files[0];
    setAudioSrc(audio, file);

    const volume = sessionStorage.getItem("audioVolume");
    audio.volume = parseFloat(volume === null ? "0.25" : volume);
    if (!getDbStorageFlag()) return;

    if (!audio.paused || audio.currentTime > 0) {
        sessionStorage.setItem("audioCurrentTime", "0");
    }

    if (!playedFromDb) {
        playedFromDb = true;
        const currentTime = sessionStorage.getItem("audioCurrentTime");
        audio.currentTime = parseFloat(currentTime === null ? "0" : currentTime);
        await audio.play();
        console.log("Auto play from DB load");
        return;
    }

    await putAudioFileInDb(file, true);
}

/**
 * 
 * @param file 
 * @param closeDb 
 * @param db 
 * @returns Previous file that was in DB
 */
function putAudioFileInDb(file: File, closeDb = true, db?: IDBDatabase) {
    return new Promise(async (resolve, reject) => {
        const dbReady: Promise<IDBDatabase> = new Promise((res, rej) => {
            if (!db) {
                const dbOpenReq = indexedDB.open("AudioSource");
                dbOpenReq.onsuccess = (e) => {
                    res(dbOpenReq.result);
                };
            } else {
                res(db);
            }
        });
        db = await dbReady;
        file = await copyFile(file);

        const oldFile = await getAudioFileFromDb(false, db);
        const transaction = db.transaction("AudioFile", "readwrite", {
            durability: "strict"
        });
        const objectStore = transaction.objectStore("AudioFile");

        console.log(`Putting file into DB: ${file.type}`);
        objectStore.put(file, "file")
        .onsuccess = async (e) => {
            if (closeDb) {
                (db as IDBDatabase).close();
            }
            resolve(oldFile);
        };
    }) as Promise<File | null>;
}

/**
 * 
 * @param closeDb 
 * @param db 
 * @returns Previous file that was in DB
 */
function clearAudioFileFromDb(closeDb = true, db?: IDBDatabase) {
    return new Promise(async (resolve, reject) => {
        const dbReady: Promise<IDBDatabase> = new Promise((res, rej) => {
            if (!db) {
                const dbOpenReq = indexedDB.open("AudioSource");
                dbOpenReq.onsuccess = (e) => {
                    res(dbOpenReq.result);
                };
            } else {
                res(db);
            }
        });
        db = await dbReady;

        const oldFile = await getAudioFileFromDb(false, db);
        const transaction = db.transaction("AudioFile", "readwrite", {
            durability: "strict"
        });
        const store = transaction.objectStore("AudioFile");
        const clearFileReq = store.put(null, "file");
        clearFileReq.onsuccess = (e) => {
            if (closeDb) {
                transaction.commit();
                (db as IDBDatabase).close();
            }
            resolve(oldFile);
        };
    }) as Promise<File | null>;
}

/**
 * 
 * @param closeDb 
 * @param db 
 * @returns 
 */
function getAudioFileFromDb(closeDb = true, db?: IDBDatabase) {
    return new Promise(async (resolve, reject) => {
        const dbReady: Promise<IDBDatabase> = new Promise((res, rej) => {
            if (!db) {
                const dbOpenReq = indexedDB.open("AudioSource");
                dbOpenReq.onsuccess = (e) => {
                    res(dbOpenReq.result);
                };
            } else {
                res(db);
            }
        });
        db = await dbReady;

        const transaction = db.transaction("AudioFile", "readonly", {
            durability: "strict"
        });
        const store = transaction.objectStore("AudioFile");

        const getFileReq = store.get("file");
        getFileReq.onsuccess = async (e) => {
            let file: File | null | undefined = getFileReq.result;
            if (file === undefined) {
                file = null;
            }
            if (closeDb) {
                transaction.commit();
                (db as IDBDatabase).close();
            }
            
            if (file && file.constructor === File) {
                file = await copyFile(file);
            }
            
            resolve(file);
        };
    }) as Promise<File | null>;
}

function setAudioSrc(audio: HTMLAudioElement, file: File): void {
    const oldSrc = audio.src;

    // console.log("creating object url from file...");
    // console.log(file);
    const url = URL.createObjectURL(file);

    // for testing:
    // window.open(url, "_blank");
    // const a = document.createElement("a");
    // a.download = "audio_test";
    // a.href = url;
    // a.click();

    // console.log("url created: " + url);
    // audio.src = "";
    // audio.load();
    audio.src = url;
    currFilename = file.name;
    console.log(`audio source: ${url}`);

    if (oldSrc !== "" && oldSrc.startsWith("blob:") && URL.canParse(oldSrc)) {
        audio.addEventListener("loadedmetadata", () => {
            URL.revokeObjectURL(oldSrc);
        }, { once: true });
    }
}

function copyFile(file: File) {
    /* Initially made because there were issues when removing files from db
        when trying to put File in db after untoggling and
        retoggling file db storage (only on Firefox)
    */
    return new Promise(async (resolve, reject) => {
        const { name, type, lastModified } = file;
        // NOTE: for larger files, this may be problematic for memory usage
        // consider Origin private file system
        const bytes = (await file.arrayBuffer()).slice(0, file.size);
        const fileCpy = new File([bytes], name, { type, lastModified });
        resolve(fileCpy);
    }) as Promise<File>;
}
