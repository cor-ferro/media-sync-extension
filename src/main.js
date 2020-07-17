import EventEmitter from 'eventemitter3';
import { Deque, debounce } from './utils';
const SERVER = 'wss://thereissuchname.com:58979';
const MAX_COUNT_MESSAGES = 15;
function getCurrentResource() {
    return `${location.hostname}${location.pathname}${location.search}`;
}
function init() {
    const socket = new Socket(SERVER);
    socket.connect();
    const onSync = (event) => {
        const { detail } = event;
        console.log('onSync', detail);
        socket.send({
            resource: getCurrentResource(),
            info: detail
        });
    };
    const onSocketMessage = (event) => {
        try {
            const data = JSON.parse(event.detail);
            if (data.resource !== getCurrentResource()) {
                return;
            }
            const synchronizer = synchronizers.find((synchronizer) => {
                return synchronizer.getSource() === data.info.source;
            });
            if (synchronizer) {
                console.log('found synchronizer', synchronizer, data.info);
                // synchronizer.setPlayerInfo(data.info);
            }
        }
        catch (err) {
            console.error(err);
        }
    };
    socket.addEventListener('message', onSocketMessage);
    let synchronizers = [];
    function initSynchronizers() {
        synchronizers.forEach((synchronizer) => {
            synchronizer.detach();
        });
        synchronizers = [];
        const mediaElems = document.querySelectorAll('audio,video');
        mediaElems.forEach((mediaElem) => {
            synchronizers.push(new MediaSynchronizer(mediaElem));
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
    window.addEventListener('popstate', function () {
        initSynchronizers();
    });
    initSynchronizers();
}
class MediaSynchronizer extends EventEmitter {
    constructor(_elem) {
        super();
        this._elem = _elem;
        this.attach();
        console.log('init MediaSynchronizer', _elem);
    }
    setPlayerInfo(info) {
        switch (info.event) {
            case 'play': {
                this._elem.dataset.play = 'true';
                this._elem.dataset.seeking = 'true';
                this._elem.currentTime = info.currentTime;
                this._elem.play();
                break;
            }
            case 'pause': {
                this._elem.dataset.pause = 'true';
                this._elem.dataset.seeking = 'true';
                this._elem.currentTime = info.currentTime;
                this._elem.pause();
                break;
            }
            case 'seeking': {
                this._elem.dataset.seeking = 'true';
                this._elem.currentTime = info.currentTime;
                break;
            }
        }
    }
    getPlayerStatus() {
        return {
            event: this._elem.paused ? 'pause' : 'play',
            currentTime: this._elem.currentTime,
            ts: Date.now()
        };
    }
    getSource() {
        return this._elem.currentSrc;
    }
    createEventData(event) {
        return {
            event: event.type,
            currentTime: this._elem.currentTime,
            ts: Date.now(),
            source: this.getSource()
        };
    }
    attach() {
        this.detach();
        this._onPlayHandler = (event) => {
            if (this._elem.dataset.play === 'true') {
                delete this._elem.dataset.play;
                return;
            }
            const eventData = JSON.stringify(this.createEventData(event));
            this.emit(event.type, eventData);
        };
        this._onPauseHandler = (event) => {
            if (this._elem.dataset.pause === 'true') {
                delete this._elem.dataset.pause;
                return;
            }
            const eventData = JSON.stringify(this.createEventData(event));
            this.emit(event.type, eventData);
        };
        this._onSeekingHandler = debounce((event) => {
            if (this._elem.dataset.seeking === 'true') {
                delete this._elem.dataset.seeking;
                return;
            }
            const eventData = JSON.stringify(this.createEventData(event));
            this.emit(event.type, eventData);
        }, 250);
        this._elem.addEventListener('play', this._onPlayHandler);
        this._elem.addEventListener('pause', this._onPauseHandler);
        this._elem.addEventListener('seeking', this._onSeekingHandler);
    }
    detach() {
        if (this._onPlayHandler) {
            this._elem.removeEventListener('play', this._onPlayHandler);
            this._onPlayHandler = undefined;
        }
        if (this._onPauseHandler) {
            this._elem.removeEventListener('pause', this._onPauseHandler);
            this._onPauseHandler = undefined;
        }
        if (this._onSeekingHandler) {
            this._elem.removeEventListener('seeking', this._onSeekingHandler);
            this._onSeekingHandler = undefined;
        }
    }
}
class Socket extends EventTarget {
    constructor(_server) {
        super();
        this._server = _server;
        this._socket = null;
        this._messages = new Deque();
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
                }
                catch (err) {
                    console.log(err);
                }
            };
            socket.onmessage = (event) => {
                console.log('onmessage', event);
                this.dispatchEvent(new CustomEvent('message', { detail: event.data }));
            };
        }
        catch (err) {
            console.log(err);
        }
    }
    reconnect() {
        console.log('reconnect');
        setTimeout(() => {
            this.connect();
        }, 1000);
    }
    send(data) {
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
init();
