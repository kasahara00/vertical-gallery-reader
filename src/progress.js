const ReaderProgress = {
    PREFIX: "verticalReaderProgress:",

    getGalleryKey() {
        return this.PREFIX +
            window.location.origin +
            window.location.pathname;
    },

    async load() {
        const key = this.getGalleryKey();
        const result = await chrome.storage.local.get(key);

        return result[key] ?? null;
    },

    async save(position) {
        if (!position) return;

        const key = this.getGalleryKey();

        await chrome.storage.local.set({
            [key]: {
                index: position.index,
                progress: position.progress,
                updatedAt: Date.now()
            }
        });
    },

    async clear() {
        await chrome.storage.local.remove(
            this.getGalleryKey()
        );
    }
};
