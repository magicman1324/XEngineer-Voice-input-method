class AudioService {
    constructor(config) {
        this.config = config
        this.stream = null
        this.audioContext = null
        this.analyser = null
        this.source = null
        this.processor = null
        this.isRecording = false
        this.onPCMData = null
        this.onVolumeChange = null
        this.onError = null
        this.animationId = null
    }

    async requestMicrophone() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: this.config.audio.sampleRate },
                    channelCount: { ideal: this.config.audio.channelCount },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })
            return true
        } catch (err) {
            if (err.name === 'NotAllowedError') throw new Error('Microphone permission denied')
            if (err.name === 'NotFoundError') throw new Error('No microphone found')
            throw new Error('Microphone access failed: ' + err.message)
        }
    }

    initAudioPipeline() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: this.config.audio.sampleRate,
        })

        this.source = this.audioContext.createMediaStreamSource(this.stream)
        this.audioContext.resume()

        if (this.audioContext.sampleRate !== this.config.audio.sampleRate) {
            console.warn('[Audio] Sample rate:', this.audioContext.sampleRate,
                '(ASR expects', this.config.audio.sampleRate, 'Hz)')
        }

        // Analyser for VAD volume
        this.analyser = this.audioContext.createAnalyser()
        this.analyser.fftSize = this.config.vad.frameSize
        this.analyser.smoothingTimeConstant = 0.8
        this.source.connect(this.analyser)

        // ScriptProcessorNode captures raw PCM (Float32 → Int16)
        this.processor = this.audioContext.createScriptProcessor(2048, 1, 1)
        this.processor.onaudioprocess = (event) => {
            if (!this.isRecording) return
            const input = event.inputBuffer.getChannelData(0)
            const pcm = new Int16Array(input.length)
            for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]))
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
            }
            this.onPCMData?.(pcm.buffer)
        }
        this.source.connect(this.processor)
        this.processor.connect(this.audioContext.destination)
    }

    startRecording() {
        this.isRecording = true
        this.startVolumeMonitoring()
    }

    stopRecording() {
        this.isRecording = false
        this.stopVolumeMonitoring()
    }

    getCurrentVolume() {
        if (!this.analyser) return -100
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
        this.analyser.getByteTimeDomainData(dataArray)
        let sumSquares = 0
        for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128
            sumSquares += v * v
        }
        const rms = Math.sqrt(sumSquares / dataArray.length)
        return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
    }

    startVolumeMonitoring() {
        const tick = () => {
            if (!this.isRecording) return
            this.onVolumeChange?.(this.getCurrentVolume())
            this.animationId = requestAnimationFrame(tick)
        }
        tick()
    }

    stopVolumeMonitoring() {
        if (this.animationId) cancelAnimationFrame(this.animationId)
        this.animationId = null
    }

    release() {
        this.stopRecording()
        if (this.processor) {
            this.processor.disconnect()
            this.processor = null
        }
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop())
            this.stream = null
        }
        if (this.audioContext) {
            this.audioContext.close()
            this.audioContext = null
        }
    }
}
