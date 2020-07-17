import EventEmitter from 'eventemitter3';
import {Deque, debounce} from './utils';

const SERVER = 'wss://thereissuchname.com:58979';
const MAX_COUNT_MESSAGES = 15;

function getCurrentResource() {
    return `${location.hostname}${location.pathname}${location.search}`;
}

type SyncInfo = {
    event: string;
    currentTime: number;
    ts: number;
    source: {
        type: string;
        duration: number;
        src: string;
        index: number;
    };
}

function init() {
    const socket = new Socket(SERVER);
    socket.connect();

    const onSync = (info: SyncInfo) => {
        console.log('onSync', info);
        socket.send({
            resource: getCurrentResource(),
            info
        });
    }

    const onSocketMessage = (event: MessageEvent) => {
        try {
            const data: {resource: string; info: SyncInfo} = JSON.parse(event.data);

            if (data.resource !== getCurrentResource()) {
                return;
            }

            const fastFoundSynchronizer = synchronizers.find((synchronizer) => {
                return synchronizer.getSource().toJson().src === data.info.source.src;
            });

            console.log('fastFoundSynchronizer', fastFoundSynchronizer);
            if (fastFoundSynchronizer) {
                fastFoundSynchronizer.setPlayerInfo(data.info);
                return;
            }

            const fuzzySearchResults: {similarityIndex: number; synchronizer: MediaSynchronizer}[] = synchronizers.map((synchronizer) => {
                let similarityIndex = 0.0;

                const synchronizerSource = synchronizer.getSource().toJson()
                const messageSource = data.info.source;

                if (synchronizerSource.type === messageSource.type) {
                    console.log('similarityIndex type equals')
                    similarityIndex += 1.0;
                } else {
                    similarityIndex -= 10.0;
                }

                const maxDuration = Math.max(synchronizerSource.duration, messageSource.duration);
                const minDuration = Math.min(synchronizerSource.duration, messageSource.duration);

                console.log('similarityIndex minDuration / maxDuration', synchronizerSource, messageSource)
                similarityIndex += minDuration / maxDuration;

                const maxIndex = Math.max(synchronizerSource.index, messageSource.index);
                const minIndex = Math.min(synchronizerSource.index, messageSource.index);

                if (maxIndex === 0 && minIndex === 0) {
                    similarityIndex += 1.0
                } else if (maxIndex === 0) {
                    similarityIndex += (maxIndex - minIndex) / synchronizers.length;
                } else {
                    similarityIndex += minIndex / maxIndex;
                }


                return {
                    similarityIndex,
                    synchronizer
                };
            });

            fuzzySearchResults.sort((a, b) => {
                return a.similarityIndex > b.similarityIndex ? -1 : 1;
            });

            console.log('fuzzySearchResults', fuzzySearchResults);

            if (!fuzzySearchResults.length) {
                return;
            }

            if (fuzzySearchResults[0].similarityIndex < 0.0) {
                return;
            }

            const synchronizer = fuzzySearchResults[0].synchronizer;

            if (synchronizer) {
                synchronizer.setPlayerInfo(data.info);
            }

        } catch (err) {
            console.error(err);
        }
    }

    socket.on('message', onSocketMessage);

    let synchronizers: MediaSynchronizer[] = [];

    function initSynchronizers() {
        synchronizers.forEach((synchronizer) => {
            synchronizer.detach();
        });

        synchronizers = [];

        const mediaElems = document.querySelectorAll('audio,video');
        mediaElems.forEach((elem: Element, index) => {
            const mediaElem: HTMLAudioElement | HTMLVideoElement = elem as HTMLAudioElement | HTMLVideoElement;
            const synchronizerSource = new SynchronizerSource({
                elem: mediaElem,
                index
            });

            synchronizers.push(new MediaSynchronizer(synchronizerSource));
        });

        synchronizers.forEach((synchronizer) => {
            synchronizer.on('play', onSync);
            synchronizer.on('pause', onSync);
            synchronizer.on('seeking', onSync);
        });
    }

    window.addEventListener('keypress', (event) => {
        if (event.code === 'KeyF' && event.ctrlKey && event.shiftKey) {
            initSynchronizers();
        }
    });

    window.addEventListener('popstate', function(){
        initSynchronizers();
    })

    initSynchronizers();
}

class MediaSynchronizer extends EventEmitter {
    private _onPlayHandler?: (event: Event) => void;
    private _onPauseHandler?: (event: Event) => void;
    private _onSeekingHandler?: (event: Event) => void;

    constructor(private synchronizerSource: SynchronizerSource) {
        super();
        this.attach();
        console.log('init MediaSynchronizer', synchronizerSource.getElem());
    }

    setPlayerInfo(info: SyncInfo) {
        switch (info.event) {
            case 'play': {
                this.synchronizerSource.getElem().dataset.play = 'true';
                this.synchronizerSource.getElem().dataset.seeking = 'true';
                this.synchronizerSource.getElem().currentTime = info.currentTime;
                this.synchronizerSource.getElem().play();
                break;
            }

            case 'pause': {
                this.synchronizerSource.getElem().dataset.pause = 'true';
                this.synchronizerSource.getElem().dataset.seeking = 'true';
                this.synchronizerSource.getElem().currentTime = info.currentTime;
                this.synchronizerSource.getElem().pause();
                break;
            }

            case 'seeking': {
                this.synchronizerSource.getElem().dataset.seeking = 'true';
                this.synchronizerSource.getElem().currentTime = info.currentTime;
                break;
            }
        }
    }

    getSource(): SynchronizerSource {
        return this.synchronizerSource;
    }

    createEventData(event: Event) {
        return {
            event: event.type,
            currentTime: this.synchronizerSource.getElem().currentTime,
            ts: Date.now(),
            source: this.getSource().toJson()
        };
    }

    attach() {
        this.detach();

        this._onPlayHandler = (event) => {
            if (this.synchronizerSource.getElem().dataset.play === 'true') {
                delete this.synchronizerSource.getElem().dataset.play;
                return;
            }

            const eventData = this.createEventData(event);
            this.emit(event.type, eventData);
        };

        this._onPauseHandler = (event) => {
            if (this.synchronizerSource.getElem().dataset.pause === 'true') {
                delete this.synchronizerSource.getElem().dataset.pause;
                return;
            }

            const eventData = this.createEventData(event);
            this.emit(event.type, eventData);
        };

        this._onSeekingHandler = debounce((event: Event) => {
            if (this.synchronizerSource.getElem().dataset.seeking === 'true') {
                delete this.synchronizerSource.getElem().dataset.seeking;
                return;
            }

            const eventData = this.createEventData(event);
            this.emit(event.type, eventData);
        }, 250);

        this.synchronizerSource.getElem().addEventListener('play', this._onPlayHandler);
        this.synchronizerSource.getElem().addEventListener('pause', this._onPauseHandler);
        this.synchronizerSource.getElem().addEventListener('seeking', this._onSeekingHandler);
    }

    detach() {
        if (this._onPlayHandler) {
            this.synchronizerSource.getElem().removeEventListener('play', this._onPlayHandler)
            this._onPlayHandler = undefined;
        }

        if (this._onPauseHandler) {
            this.synchronizerSource.getElem().removeEventListener('pause', this._onPauseHandler)
            this._onPauseHandler = undefined;
        }

        if (this._onSeekingHandler) {
            this.synchronizerSource.getElem().removeEventListener('seeking', this._onSeekingHandler);
            this._onSeekingHandler = undefined;
        }
    }
}

class Socket extends EventEmitter {
    private _socket: WebSocket | null = null;
    private _messages: Deque = new Deque();

    constructor(private _server: string) {
        super();
    }

    connect() {
        try {
            console.log(`connect to ${this._server}`);
            const socket = new WebSocket(this._server);

            socket.onopen = (event) => {
                console.log('socket open', event);
                this._socket = socket;
                this._trySend();
            };

            socket.onclose = (event) => {
                console.log('socket close', event);

                try {
                    this._socket = null;
                    this.reconnect();
                } catch (err) {
                    console.log(err);
                }
            };

            socket.onmessage = (event) => {
                console.log('onmessage', event);
                this.emit('message', event);
            };
        } catch (err) {
            console.log(err)
        }
    }

    reconnect() {
        console.log('reconnect');
        setTimeout(() => {
            this.connect();
        }, 1000);
    }

    send(data: unknown) {
        this._messages.addBack(data);
        while (this._messages.size() > MAX_COUNT_MESSAGES) {
            this._messages.removeFront();
        }
        this._trySend();
    }

    _trySend() {
        if (!this._socket) {
            console.warn('socket is empty');
            return false;
        }

        while (!this._messages.isEmpty()) {
            const data = this._messages.removeBack();
            this._socket.send(JSON.stringify(data));
        }
    }
}

class SynchronizerSource {
    constructor(
        private _info: {
            elem: HTMLAudioElement | HTMLVideoElement;
            index: number;
        }
    ) {}

    getElem() {
        return this._info.elem;
    }

    toJson() {
        return {
            type: this._info.elem.tagName.toLowerCase(),
            duration: this._info.elem.duration,
            src: this._info.elem.currentSrc,
            index: this._info.index
        }
    }
}

init();
