class App {
    constructor(config) {
        this.config = config
        this.sourceLang = config.languages.default.source
        this.targetLang = config.languages.default.target
        this.active = false

        this.ui = new UIManager()
        this.audio = new AudioService(config)
        this.vad = new VAD(config)
        this.asr = new ASRService(config)
        this.translator = new TranslatorService(config)

        this._wire()
    }

    _wire() {
        this.audio.onVolumeChange = (v) => {
            this.vad.process(v)
            this.ui.setVolume(v)
        }

        this.audio.onPCMData = (pcm) => this.asr.sendAudio(pcm)

        this.vad.onSpeechStart = () => {
            this.ui.setInterimText('')
        }

        this.vad.onSpeechEnd = () => {
            this.asr.endSegment()
        }

        this.asr.onConnected = () => {
            this.ui.setStatus('listening')
        }

        this.asr.onIntermediateResult = (text) => {
            this.ui.setInterimText(text)
        }

        this.asr.onFinalResult = async (text) => {
            this.ui.setSourceText(text)
            try {
                const translated = await this.translator.translate(text, this.sourceLang, this.targetLang)
                this.ui.setTargetText(translated || '')
            } catch (e) {
                console.warn('[App] Translation failed:', e.message)
                this.ui.setTargetText('')
            }
        }

        this.asr.onError = (e) => {
            console.error('[App] ASR error:', e)
            this.ui.setStatus('error')
            this.ui.showToast('识别服务出错: ' + e.message)
        }

        this.ui.micBtn.addEventListener('click', () => this._toggle())
    }

    async _toggle() {
        if (this.active) {
            this.stop()
        } else {
            await this.start()
        }
    }

    async start() {
        try {
            this.ui.setStatus('connecting')
            await this.audio.requestMicrophone()
            this.audio.initAudioPipeline()
            await this.asr.connect()
            this.audio.startRecording()
            this.active = true
            this.ui.setMicActive()
            this.ui.showVolumeBar()
            this.ui.setSourceText('')
            this.ui.setTargetText('')
            this.ui.setLanguages(this.sourceLang, this.targetLang)
        } catch (err) {
            console.error('[App] Start failed:', err)
            this.ui.setStatus('error')
            this.ui.showToast('启动失败: ' + err.message)
            this._cleanup()
        }
    }

    stop() {
        this.audio.stopRecording()
        this.asr.endSegment()
        this.asr.disconnect()
        this.audio.release()
        this.vad.reset()
        this._cleanup()
        this.ui.reset()
        this.active = false
    }

    _cleanup() {
        // Services that need explicit cleanup will handle it in their own methods
    }
}
