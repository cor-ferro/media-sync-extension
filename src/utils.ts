export function debounce(func: (_: any) => any, wait: number, immediate?: number) {
    let timeout: number | null;
    return function(...args: any) {
        // @ts-ignore
        const context: any = this as unknown as any;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout as number);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

export class Stack {
    private _items: unknown[] = [];

    push(element: unknown) {
        this._items.push(element);
    }

    pop() {
        if (this._items.length === 0) {
            return null;
        }

        return this._items.pop();
    }

    peek() {
        return this._items[this._items.length - 1];
    }

    isEmpty() {
        return this._items.length == 0;
    }
}

export class Deque {
    private _items: {[key: string]: any} = {};
    private _count = 0;
    private _lowestCount = 0;


    constructor() {
    }

    addBack(element: any) {
        this._items[this._count] = element;
        this._count++;
    }

    addFront(element: unknown) {
        if (this.isEmpty()) {             //1
            this.addBack(element);
        } else if (this._lowestCount  > 0) {    //2
            this._lowestCount --;
            this._items[this._lowestCount] = element;
        } else {                                //3
            for (let index = this._count; index > 0; index--) {
                this._items[index] =  this._items[index -1];
            }
            this._count ++;
            this._items[0] = element;
        }
        return true;
    }

    removeFront() {
        if (this.isEmpty()) {
            return undefined;
        }

        let result = this._items[this._lowestCount];
        delete this._items[this._lowestCount];
        this._lowestCount++;
        return result;
    }

    removeBack() {
        if (this.isEmpty()) {
            return undefined;
        }
        let result = this._items[this._count - 1];
        delete this._items[this._count - 1];
        this._count--;
        return result;
    }

    size() {
        return this._count - this._lowestCount;
    }

    isEmpty() {
        return this.size() === 0;
    }

    clear() {
        this._items = {}
        this._count = 0;
        this._lowestCount = 0;
        return this._items;
    }
}