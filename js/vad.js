class VAD {
    constructor(config) {
        this.config = config.vad
        this.isSpeaking = false
        this.silenceTime = 0
        this.speechDuration = 0
        this.noiseFloor = -50
        this.noiseSamples = []
        this.isCalibrating = true
        this.onSpeechStart = null
        this.onSpeechEnd = null
        this.onSegmentReady = null
    }

    process(volume) {
        this.calibrateNoiseFloor(volume)
        const threshold = this.getThreshold()
        const isSpeech = volume > threshold

        if (isSpeech) {
            this.silenceTime = 0
            this.speechDuration += this.getFrameDuration()
            if (!this.isSpeaking) {
                this.isSpeaking = true
                this.onSpeechStart && this.onSpeechStart()
            }
        } else {
            if (this.isSpeaking) {
                this.silenceTime += this.getFrameDuration()
                if (this.silenceTime >= this.config.silenceTimeout / 1000) {
                    if (this.speechDuration >= this.config.minSegmentDuration / 1000) {
                        this.onSegmentReady && this.onSegmentReady()
                    }
                    this.isSpeaking = false
                    this.silenceTime = 0
                    this.speechDuration = 0
                    this.onSpeechEnd && this.onSpeechEnd()
                }
            }
        }
    }

    calibrateNoiseFloor(volume) {
        if (!this.config.dynamicThreshold) return
        if (!this.isSpeaking) {
            this.noiseSamples.push(volume)
            if (this.noiseSamples.length > 100) this.noiseSamples.shift()
            if (this.isCalibrating && this.noiseSamples.length >= 10) this.isCalibrating = false
            if (this.noiseSamples.length >= 10) {
                const sorted = [...this.noiseSamples].sort((a, b) => a - b)
                this.noiseFloor = 0.7 * this.noiseFloor + 0.3 * sorted[Math.floor(sorted.length / 2)]
            }
        }
    }

    getThreshold() {
        if (this.config.dynamicThreshold && !this.isCalibrating) {
            return Math.max(this.noiseFloor + this.config.thresholdMargin, this.config.silenceThreshold)
        }
        return this.config.silenceThreshold
    }

    getFrameDuration() { return this.config.frameSize / 16000 }

    reset() {
        this.isSpeaking = false
        this.silenceTime = 0
        this.speechDuration = 0
        this.noiseSamples = []
        this.isCalibrating = true
    }
}
