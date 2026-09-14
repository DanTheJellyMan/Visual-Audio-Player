import LinkedList from "./LinkedList";

/* To "close" or free up the memory that the buffer is using,
    ArrayBuffer.transferToFixedLength(0) is used. This does not immediately
    make it garbage collectable, so there technically can be memory leaks
    (though this is only to the detached buffer's JS object, which is
    much smaller in memory).

    When the new buffer is created with a fixed length of 0, it is much easier
    for the new buffer to be garbage collected since the GC knows the buffer
    will never be resized to a usable size, and the bytes of the previous buffer
    are basically inaccessible.
*/

type UnwrapLinkedList<T> = T extends LinkedList<infer I> ? I : never;
type QueueItemValue = UnwrapLinkedList<
    InstanceType<typeof ArrayBufferQueue>["list"]
>;

export default class ArrayBufferQueue {
    private list: LinkedList<ArrayBufferLike> = new LinkedList();

    constructor(iterable?: Iterable<UnwrapLinkedList<typeof this.list>>) {
        if (iterable === undefined) return;

        for (const it of iterable) {
            this.list.append(it);
        }
    }

    public static freeBuffer(buf: ArrayBuffer): void {
        buf.transferToFixedLength(0);
    }

    public enqueue(
        value: UnwrapLinkedList<typeof this.list>
    ): ReturnType<(typeof this.list)["append"]> {
        const { list } = this;
        const addedNode = list.append(value);
        return addedNode;
    }

    /**
     * 
     * @param freeBuffer Frees up the ArrayBuffer's memory. Default - false
     * @returns 
     */
    public dequeue(
        freeBuffer = false
    ): ReturnType<(typeof this.list)["remove"]> | undefined {
        const { list } = this;
        let value: ReturnType<typeof this.dequeue>;

        if (list.length !== 0) {
            value = list.remove(0);
        }
        if (freeBuffer && value !== undefined && value instanceof ArrayBuffer) {
            ArrayBufferQueue.freeBuffer(value);
        }

        return value;
    }

    public getFront(): QueueItemValue | undefined {
        const node = this.list.head;
        return node?.value;
    }

    public getRear(): QueueItemValue | undefined {
        const node = this.list.tail;
        return node?.value;
    }

    get size(): number {
        return this.list.length;
    }
}