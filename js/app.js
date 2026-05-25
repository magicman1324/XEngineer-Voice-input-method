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

        // Copy
        this.ui.copyBtn.addEventListener('click', () => {
            const text = this.ui.getTargetText()
            if (!text) return
            navigator.clipboard.writeText(text).then(
                () => this.ui.showToast('已复制到剪贴板'),
                () => this.ui.showToast('复制失败')
            )
        })

        // Clear
        this.ui.clearBtn.addEventListener('click', () => {
            if (this.active) return
            this.ui.setSourceText('点击下方麦克风开始语音输入...')
            this.ui.setTargetText('翻译结果将显示在这里')
            this.ui.setInterimText('')
        })

        // Language modal
        this.ui.initLanguageModal(this.config.languages)
        this.ui.setModalLanguages(this.sourceLang, this.targetLang)

        const openModal = () => {
            this.ui.setModalLanguages(this.sourceLang, this.targetLang)
            this.ui.showLanguageModal()
        }
        this.ui.langSwitchBtn.addEventListener('click', openModal)
        this.ui.langDisplayBtn.addEventListener('click', openModal)

        this.ui.modalSwapBtn.addEventListener('click', () => {
            const src = this.ui.modalLangSource.value
            const tgt = this.ui.modalLangTarget.value
            this.ui.modalLangSource.value = tgt
            this.ui.modalLangTarget.value = src
        })

        this.ui.modalCancelBtn.addEventListener('click', () => this.ui.hideLanguageModal())

        this.ui.modalConfirmBtn.addEventListener('click', async () => {
            const newSource = this.ui.modalLangSource.value
            const newTarget = this.ui.modalLangTarget.value
            this.ui.hideLanguageModal()

            if (newSource === this.sourceLang && newTarget === this.targetLang) return

            this.sourceLang = newSource
            this.targetLang = newTarget
            this.ui.setLanguages(newSource, newTarget)

            // Restart ASR if recording so language change takes effect
            if (this.active) {
                this.stop()
                await this.start()
            }
        })
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
            // Release any resources acquired before the failure
            this.audio.stopRecording()
            this.audio.release()
            this.asr.disconnect()
            this.vad.reset()
        }
    }

    stop() {
        this.audio.stopRecording()
        this.asr.endSegment()
        this.asr.disconnect()
        this.audio.release()
        this.vad.reset()
        this.ui.reset()
        this.active = false
    }
}
