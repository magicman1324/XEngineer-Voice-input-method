class UIManager {
    constructor() {
        this.statusDot = document.getElementById('status-indicator')
        this.statusText = document.getElementById('status-text')
        this.sourceText = document.getElementById('source-text')
        this.targetText = document.getElementById('target-text')
        this.interimText = document.getElementById('interim-text')
        this.volumeBar = document.getElementById('volume-bar')
        this.volumeFill = this.volumeBar?.querySelector('div')
        this.micBtn = document.getElementById('mic-btn')
        this.recordingDot = document.getElementById('recording-dot')
        this.langSource = document.getElementById('lang-source')
        this.langTarget = document.getElementById('lang-target')
        this.langDisplaySource = document.getElementById('lang-display-source')
        this.langDisplayTarget = document.getElementById('lang-display-target')
        this.toast = document.getElementById('toast')
        this.copyBtn = document.getElementById('copy-btn')
        this.ttsBtn = document.getElementById('tts-btn')
        this.clearBtn = document.getElementById('clear-btn')
        this.langSwitchBtn = document.getElementById('lang-switch-btn')
        this.langDisplayBtn = document.getElementById('lang-display-btn')
        this.langModal = document.getElementById('lang-modal')
        this.modalLangSource = document.getElementById('modal-lang-source')
        this.modalLangTarget = document.getElementById('modal-lang-target')
        this.modalSwapBtn = document.getElementById('modal-swap-btn')
        this.modalCancelBtn = document.getElementById('modal-cancel')
        this.modalConfirmBtn = document.getElementById('modal-confirm')

        this._toastTimer = null
    }

    initLanguageModal(languages) {
        const render = (select, list) => {
            select.innerHTML = ''
            for (const lang of list) {
                const opt = document.createElement('option')
                opt.value = lang.code
                opt.textContent = lang.name
                select.appendChild(opt)
            }
        }
        render(this.modalLangSource, languages.source)
        render(this.modalLangTarget, languages.target)
    }

    setModalLanguages(sourceCode, targetCode) {
        this.modalLangSource.value = sourceCode
        this.modalLangTarget.value = targetCode
    }

    showLanguageModal() { this.langModal.classList.remove('hidden') }
    hideLanguageModal() { this.langModal.classList.add('hidden') }

    getSourceText() { return this.sourceText?.innerText || '' }
    getTargetText() { return this.targetText?.innerText || '' }

    setStatus(state) {
        const states = {
            idle:       ['bg-gray-300', '就绪'],
            connecting: ['bg-yellow-400', '连接中...'],
            listening:  ['bg-green-500', '监听中'],
            error:      ['bg-red-500', '错误'],
        }
        const [color, text] = states[state] || states.idle
        this.statusDot.className = 'inline-block w-2 h-2 rounded-full ' + color
        this.statusText.textContent = text
    }

    setSourceText(text) { this.sourceText.innerText = text }

    setTargetText(text) { this.targetText.innerText = text }

    setInterimText(text) { this.interimText.innerText = text }

    setVolume(level) {
        if (this.volumeFill) this.volumeFill.style.width = Math.min(100, level * 100) + '%'
    }

    showVolumeBar() { if (this.volumeBar) this.volumeBar.classList.remove('hidden') }
    hideVolumeBar() { if (this.volumeBar) this.volumeBar.classList.add('hidden') }

    setMicActive() {
        this.micBtn.classList.remove('mic-idle')
        this.micBtn.classList.add('mic-active', 'mic-recording')
        this.recordingDot.classList.remove('hidden')
    }

    setMicIdle() {
        this.micBtn.classList.remove('mic-active', 'mic-recording')
        this.micBtn.classList.add('mic-idle')
        this.recordingDot.classList.add('hidden')
    }

    setLanguages(source, target) {
        const s = source.toUpperCase(), t = target.toUpperCase()
        if (this.langSource) this.langSource.innerText = s
        if (this.langTarget) this.langTarget.innerText = t
        if (this.langDisplaySource) this.langDisplaySource.innerText = s
        if (this.langDisplayTarget) this.langDisplayTarget.innerText = t
    }

    showToast(msg, duration = 2000) {
        if (!this.toast) return
        clearTimeout(this._toastTimer)
        this.toast.textContent = msg
        this.toast.classList.add('opacity-100')
        this.toast.classList.remove('opacity-0')
        this._toastTimer = setTimeout(() => {
            this.toast.classList.remove('opacity-100')
            this.toast.classList.add('opacity-0')
        }, duration)
    }

    reset() {
        this.setMicIdle()
        this.hideVolumeBar()
        this.setStatus('idle')
        this.setSourceText('点击下方麦克风开始语音输入...')
        this.setTargetText('翻译结果将显示在这里')
        this.setInterimText('')
    }
}
