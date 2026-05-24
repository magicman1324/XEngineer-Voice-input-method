class ASRService {
    constructor(config) {
        this.wsUrl = config.api.asrWsUrl
        this.ws = null
        this._authResolve = null
        this._authReject = null
        this._authTimer = null
        this._audioBuffer = []
        this._recvBuffer = null
        this._isAuthReady = false
        this._pendingData = null
        this.onIntermediateResult = null
        this.onFinalResult = null
        this.onError = null
        this.onConnected = null
    }

    // ─── Binary Frame Protocol ─────────────────────────────
    //
    // Volcengine ASR v3/bigmodel binary frame (request & response):
    //   Header (4 bytes) + Payload Size (4 bytes, big-endian) + Payload
    //
    // Byte 0: [version:4][header_size:4] = 0x11
    // Byte 1: [msg_type:4][flags:4]
    // Byte 2: [serialization:4][compression:4]
    // Byte 3: reserved = 0x00
    // Bytes 4-7: payload size (uint32, big-endian)
    //
    // Message types:
    //   1 = FullClientRequest, 2 = AudioOnlyRequest
    //   9 = FullResponse (server), 15 = ErrorResponse
    //
    // Server may send continuation data after the first frame
    // as [4-byte-size][payload] without a new protocol header.

    _buildFrame(msgType, flags, payload) {
        const payloadBytes = payload instanceof ArrayBuffer
            ? new Uint8Array(payload)
            : new TextEncoder().encode(payload)
        const payloadSize = payloadBytes.byteLength
        const frame = new ArrayBuffer(8 + payloadSize)
        const bytes = new Uint8Array(frame)
        const dv = new DataView(frame)

        dv.setUint8(0, 0x11)
        dv.setUint8(1, (msgType << 4) | flags)
        dv.setUint8(2, (1 << 4) | 0) // serialization=JSON, compression=none
        dv.setUint8(3, 0x00)
        dv.setUint32(4, payloadSize, false)

        bytes.set(payloadBytes, 8)
        return frame
    }

    // ─── Connection ────────────────────────────────────────

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this._authResolve = resolve
                this._authReject = reject
                this._isAuthReady = false
                this._audioBuffer = []
                this._recvBuffer = null
                this._pendingData = null

                this.ws = new WebSocket(this.wsUrl)
                this.ws.binaryType = 'arraybuffer'

                this.ws.onopen = () => {
                    console.log('[ASR] WebSocket connected, sending auth...')
                    this._sendFullClientRequest()
                }

                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data)
                }

                this.ws.onerror = () => {
                    console.error('[ASR] WebSocket error')
                    this._authReject?.(new Error('WebSocket connection failed'))
                }

                this.ws.onclose = (event) => {
                    console.log('[ASR] WebSocket closed:', event.code, event.reason || '')
                    if (this._authReject) {
                        this._authReject(new Error('WebSocket connection closed'))
                    }
                }

                this._authTimer = setTimeout(() => {
                    this._authReject?.(new Error('ASR auth timeout'))
                    this.disconnect()
                }, 10000)
            } catch (err) {
                reject(err)
            }
        })
    }

    _sendFullClientRequest() {
        console.log('[ASR] Sending FullClientRequest...')
        const payload = JSON.stringify({
            user: { uid: 'voice_input_' + Date.now() },
            audio: {
                format: 'pcm',
                rate: 16000,
                bits: 16,
                channel: 1,
                codec: 'raw',
            },
            request: {
                model_name: 'bigmodel',
                language: 'zh-CN',
                enable_itn: true,
                enable_punc: true,
                result_type: 'single',
                show_utterances: false,
                vad: {
                    vad_enable: true,
                    end_window_size: 2000,
                },
            },
        })
        const frame = this._buildFrame(1, 0, payload)
        this.ws.send(frame)
    }

    // ─── Audio Data ───────────────────────────────────────

    sendAudio(chunk) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

        if (!this._isAuthReady) {
            if (this._audioBuffer.length < 500) this._audioBuffer.push(chunk)
            return
        }

        const frame = this._buildFrame(2, 0, chunk)
        this.ws.send(frame)
    }

    endSegment() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('[ASR] Sending LAST_AUDIO')
            const frame = this._buildFrame(2, 2, '')
            this.ws.send(frame)
        }
    }

    // ─── Message Handling ──────────────────────────────────

    _handleMessage(data) {
        if (data instanceof ArrayBuffer) {
            const chunk = new Uint8Array(data)
            if (!this._recvBuffer) {
                this._recvBuffer = chunk
            } else {
                const tmp = new Uint8Array(this._recvBuffer.length + chunk.length)
                tmp.set(this._recvBuffer, 0)
                tmp.set(chunk, this._recvBuffer.length)
                this._recvBuffer = tmp
            }
            // Extract JSON directly — v3 always wraps responses in JSON
            const text = new TextDecoder().decode(this._recvBuffer)
            const jsonStart = text.indexOf('{')
            if (jsonStart < 0) return
            try {
                const msg = JSON.parse(text.substring(jsonStart))
                // Only clear buffer on successful parse
                this._recvBuffer = null
                if (msg.message && msg.code !== 0 && msg.code !== 1000) {
                    this._handleError(msg)
                } else {
                    this._processResult(msg)
                }
            } catch (e) {
                // Incomplete JSON — keep buffer, wait for more data
            }
        } else if (typeof data === 'string') {
            try { this._processResult(JSON.parse(data)) }
            catch (e) { console.warn('[ASR] parse error:', e) }
        }
    }

    _processResult(msg) {
        // First successful response = auth complete
        if (this._authResolve) {
            clearTimeout(this._authTimer)
            this._authResolve()
            console.log('[ASR] Auth success, connection established')
            this._authResolve = null
            this._authReject = null
            this._isAuthReady = true
            this.onConnected?.()

            for (const chunk of this._audioBuffer) this.sendAudio(chunk)
            this._audioBuffer = []
        }

        const text = msg.result?.text || ''
        if (text) this.onFinalResult?.(text)
    }

    _handleError(msg) {
        const text = msg.message || JSON.stringify(msg)
        console.error('[ASR] Server error:', text)
        if (this._authReject) {
            clearTimeout(this._authTimer)
            this._authReject(new Error('ASR error: ' + text))
            this._authResolve = null
            this._authReject = null
        } else {
            this.onError?.(msg)
        }
    }

    disconnect() {
        clearTimeout(this._authTimer)
        this._authResolve = null
        this._authReject = null
        this._isAuthReady = false
        this._audioBuffer = []
        this._recvBuffer = null
        this._pendingData = null
        if (this.ws) {
            this.ws.onclose = null
            this.ws.close()
            this.ws = null
        }
    }
}
