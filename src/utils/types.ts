export type PositiveInteger<T extends number> = number extends T
    ? never
    : `${T}` extends `-${string}` | `${string}.${string}`
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

export type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | BigInt64Array | BigUint64Array | Float32Array | Float64Array;

export type Dictionary = Record<string, unknown>;

export type List<N extends number, T extends unknown[] = []> =
    T["length"] extends N
    ? T
    : List<N, [...T, T["length"]]>
;

export type Add<A extends number, B extends number, T extends unknown[] = []> = [
    ...List<A>,
    ...List<B>
]["length"];

export type Negative<A extends number> = `-${A}` extends `${infer N extends number}`
    ? N
    : A;
export type Subtract<A extends number, B extends number, A1 extends unknown[] = List<A>, B1 extends unknown[] = List<B>> =
    B1 extends [...A1, ...infer R]
    ? Negative<R["length"]>
    : A1 extends [...B1, ...infer R]
        ? R["length"]
        : 0
;

export type Max<A extends number, B extends number, A1 extends number[] = List<A>, B1 extends number[] = List<B>> =
    A1["length"] extends 0
    ? B
    : B1["length"] extends 0
        ? A
        : Max<
            A,
            B,
            List<Subtract<A1["length"], 1>>,
            List<Subtract<B1["length"], 1>>
        >
;

export type SpliceArray<A extends readonly unknown[], From extends number, T extends number = Subtract<A["length"], 1>, Acc extends unknown[] = []> =
    From extends Max<From, A["length"]>
    ? never
    : From extends 0
        ? A
        : Add<T, 1> extends From
            ? Acc
            : SpliceArray<A, From, Subtract<T, 1>, [A[T], ...Acc]>
;