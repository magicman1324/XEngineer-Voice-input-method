class AudioService {
    constructor(config) {
        this.config = config
        this.stream = null
        this.mediaRecorder = null
        this.audioContext = null
        this.analyser = null
        this.source = null
        this.audioChunks = []
        this.isRecording = false
        this.onAudioData = null
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
                }
            })
            return true
        } catch (err) {
            if (err.name === 'NotAllowedError') throw new Error('麦克风权限被拒绝')
            if (err.name === 'NotFoundError') throw new Error('未检测到麦克风设备')
            throw new Error(`麦克风访问失败: ${err.message}`)
        }
    }

    initAudioPipeline() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
        this.source = this.audioContext.createMediaStreamSource(this.stream)
        this.analyser = this.audioContext.createAnalyser()
        this.analyser.fftSize = this.config.vad.frameSize
        this.analyser.smoothingTimeConstant = 0.8
        this.source.connect(this.analyser)

        const mimeType = this.getSupportedMimeType()
        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType })
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data)
                const volume = this.getCurrentVolume()
                this.onAudioData && this.onAudioData(event.data, volume)
            }
        }
    }

    getSupportedMimeType() {
        for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
            if (MediaRecorder.isTypeSupported(type)) return type
        }
        return ''
    }

    startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.audioChunks = []
            this.mediaRecorder.start(200)
            this.isRecording = true
            this.startVolumeMonitoring()
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop()
            this.isRecording = false
            this.stopVolumeMonitoring()
        }
    }

    getCurrentVolume() {
        if (!this.analyser) return -100
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount)
        this.analyser.getByteTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
            const value = (dataArray[i] - 128) / 128
            sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)
        return rms > 0 ? Math.max(-100, Math.min(0, 20 * Math.log10(rms))) : -100
    }

    startVolumeMonitoring() {
        const monitor = () => {
            if (!this.isRecording) return
            this.onVolumeChange && this.onVolumeChange(this.getCurrentVolume())
            this.animationId = requestAnimationFrame(monitor)
        }
        monitor()
    }

    stopVolumeMonitoring() {
        if (this.animationId) cancelAnimationFrame(this.animationId)
        this.animationId = null
    }

    release() {
        this.stopRecording()
        if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null }
        if (this.audioContext) { this.audioContext.close(); this.audioContext = null }
    }
}
