export type PositiveInteger<T extends number> = number extends T
    ? never :
    `${T}` extends `-${string}` | `${string}.${string}`
        ? never
        : T;

type _FixedArray<T extends unknown, N extends number, R extends T[]> = R["length"] extends N
    ? R
    : _FixedArray<T, N, [T, ...R]>;
export type FixedArray<T extends unknown, N extends number> = N extends N
    ? N extends PositiveInteger<N>
        ? number extends N
            ? ArrayLike<T>
            : _FixedArray<T, N, []>
        : never
    : never;

export type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | BigInt64Array | BigUint64Array | Float16Array | Float32Array | Float64Array;