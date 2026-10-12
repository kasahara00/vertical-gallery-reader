const DEFAULT_SETTINGS = Object.freeze({
    imageWidth: 900,
    imageSpacing: 16,
    pagesToPreload: 5
});

const ReaderSettings = {
    async load() {
        const saved = await chrome.storage.local.get(
            DEFAULT_SETTINGS
        );

        return {
            imageWidth: saved.imageWidth,
            imageSpacing: saved.imageSpacing,
            pagesToPreload: saved.pagesToPreload
        };
    },

    async save(settings) {
        await chrome.storage.local.set(settings);
    },

    async reset() {
        await chrome.storage.local.set(DEFAULT_SETTINGS);

        return { ...DEFAULT_SETTINGS };
    }
};
