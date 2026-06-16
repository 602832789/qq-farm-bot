export {};
const fs = require('fs');
const path = require('path');
let memory: WebAssembly.Memory | null = null;
let encryptRaw: ((ptr: number, len: number) => void) | null = null;
let createBufRaw: ((len: number) => number) | null = null;
let destroyBufRaw: ((ptr: number) => void) | null = null;

let initPromise: Promise<void> | null = null;

function initWasm(): Promise<void> {
    if (initPromise) return initPromise;

    initPromise = new Promise<void>((resolve, reject) => {
        try {
            // Detect compiled mode: __dirname is dist/utils/, wasm is in src/utils/
            let wasmDir = __dirname;
            if (path.basename(wasmDir) === 'utils' && path.basename(path.join(wasmDir, '..')) === 'dist') {
                wasmDir = path.join(wasmDir, '..', '..', 'src', 'utils');
            }
            const wasmPath = path.join(wasmDir, 'tsdk.wasm');
            console.warn('WASM PATH:', wasmPath);
            const wasmBuffer = fs.readFileSync(wasmPath);
            const importObject = {
                a: {
                    a: () => {}, b: () => {}, c: () => {}, d: () => {}, e: () => {},
                    f: () => {}, g: () => {}, h: () => {}, i: () => {}, j: () => {},
                    k: () => {}, l: () => {}, m: () => {}, n: () => {}, o: () => {},
                    p: () => {}, q: () => {}, r: () => {}, s: () => {}, t: () => {},
                    u: () => {},
                },
            };

            WebAssembly.instantiate(wasmBuffer, importObject).then(({ instance }) => {
                const exports = instance.exports as any;
                try { exports.E(); } catch (e) {}
                memory = exports.v;
                encryptRaw = exports.J;
                createBufRaw = exports.z;
                destroyBufRaw = exports.A;
                resolve();
            }).catch(reject);
        } catch (e) {
            reject(e);
        }
    });
    return initPromise;
}

async function encryptBuffer(buffer: Buffer): Promise<Buffer> {
    if (!memory) await initWasm();

    const ptr = createBufRaw!(buffer.length);
    const memView = new Uint8Array(memory!.buffer);
    memView.set(buffer, ptr);

    encryptRaw!(ptr, buffer.length);

    const output = Buffer.from(memory!.buffer, ptr, buffer.length);
    const result = Buffer.from(output);
    destroyBufRaw!(ptr);
    return result;
}

module.exports = {
    initWasm,
    encryptBuffer,
};
