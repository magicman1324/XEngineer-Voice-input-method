class TranslatorService {
    constructor(config) {
        this.apiUrl = config.api.translateApiUrl
        this.apiKey = config.api.translateApiKey
        this.model = config.api.translateModel
        this.languages = config.languages
    }

    async translate(text, sourceLang, targetLang) {
        if (!text || !text.trim()) return ''
        if (!this.apiKey) throw new Error('Translation API key not configured')

        const langNames = {}
        for (const lang of [...this.languages.source, ...this.languages.target]) {
            langNames[lang.code] = lang.name
        }
        const srcName = langNames[sourceLang] || sourceLang
        const tgtName = langNames[targetLang] || targetLang

        const body = JSON.stringify({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: `You are a professional translator. Translate the following text from ${srcName} to ${tgtName}. Only output the translated text, no explanations, no quotes, no additional text.`
                },
                { role: 'user', content: text }
            ],
            temperature: 0.3,
            max_tokens: 1024,
        })

        const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
            body,
        })

        if (!res.ok) {
            const errText = await res.text().catch(() => '')
            throw new Error(`Translation API error ${res.status}: ${errText}`)
        }

        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || ''
    }
}
