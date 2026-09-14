export default class LinkedList<T> {
    public static readonly IndexOOBErrMsg =
        `Index out of range of LinkedList` as const;
    public head: ListNode<T> | null = null;
    public tail: ListNode<T> | null = null;

    constructor(iterable?: Iterable<T>) {
        if (iterable === undefined) return;

        for (const it of iterable) {
            this.append(it);
        }
    }

    /**
     * Adds an item to the end of the list
     * @param value 
     * @returns 
     */
    public append(value: T): ListNode<T> {
        let node: ListNode<T>;

        if (this.length === 0) {
            node = new ListNode(value);
            this.head = node;
            this.tail = node;
        } else {
            node = this.add(this.length, value);
        }

        return node;
    }

    public remove(index: number): T {
        const len = this.length;
        if (index < 0 || index >= len) {
            throw new Error(`${LinkedList.IndexOOBErrMsg} (length: ${len})`);
        }

        let target = this.head!;
        for (let i=1; i<=index; i++) {
            target = target.next!;
        }
        const { next, prev } = target;

        if (len === 1) {
            this.head = null;
            this.tail = null;
        } else if (prev === null) {
            next!.prev = null;
            this.head = next!;
        } else if (next === null) {
            prev!.next = null;
            this.tail = prev!;
        } else {
            prev.next = next;
            next.prev = prev;
        }

        // This is done to hint that the garbage collector
        // should clean the node up (not guaranteed)
        const { value } = target;
        target.value = null as T;
        target.next = null;
        target.prev = null;

        return value;
    }

    /**
     * Adds an item to the list at the specified index
     * @param index 
     * @param value 
     */
    public add(index: number, value: T): ListNode<T> {
        const node = new ListNode(value);
        const len = this.length;
        if (index < 0 || index > len) {
            throw new Error(`${LinkedList.IndexOOBErrMsg} (length: ${len})`);
        }
        
        let oldCurr: ListNode<T> | null = this.head!;
        let oldPrev: ListNode<T> | null = null;
        for (let i=1; i<=index; i++) {
            // oldCurr should only be null upon the last iteration
            if (oldCurr === null) {
                throw new Error(
                    `Could not iterate through the list (length: ${len}) to the `+
                    `specified item index (${index}) - found an early null item`
                );
            }
            oldPrev = oldCurr;
            oldCurr = oldCurr.next;
        }

        if (oldCurr === null) {
            // Append to end of list
            oldPrev!.next = node;
            node.prev = oldPrev;
            this.tail = node;
        } else if (oldPrev === null) {
            // Insert into beginning of list
            oldCurr!.prev = node;
            node.next = oldCurr;
            this.head = node;
        } else {
            oldPrev.next = node;
            node.prev = oldPrev;
            node.next = oldCurr;
            oldCurr.prev = node;
        }

        return node;
    }

    /**
     * Sets the value of an item in the list
     * @param index 
     * @param value 
     * @returns 
     */
    public set(index: number, value: T): ListNode<T> {
        const len = this.length;
        if (index < 0 || index >= len) {
            throw new Error(`${LinkedList.IndexOOBErrMsg} (length: ${len})`);
        }

        let curr = this.head!;
        for (let i=1; i<=index; i++) {
            curr = curr.next!;
        }
        curr.value = value;

        return curr;
    }

    get length(): number {
        switch(null) {
            case this.head:
            case this.tail:
                return 0;
        }

        let len = 1;
        let curr = this.head!;
        while(curr.next !== null) {
            if (curr.next === curr) break;
            curr = curr.next;
            len++;
        }

        return len;
    }
}

class ListNode<T> {
    public value: T;
    public next: ListNode<T> | null;
    public prev: typeof this.next;

    constructor(
        value: T,
        next: typeof this.next = null,
        prev: typeof this.prev = null
    ) {
        this.value = value;
        this.next = next;
        this.prev = prev;
    }
}