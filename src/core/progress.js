const ReaderProgress = {
    PREFIX: "verticalReaderProgress:",

    galleryKey: null,

    setGalleryKey(key) {
        this.galleryKey = key;
    },

    getGalleryKey() {
        return this.PREFIX + (this.galleryKey ??
            window.location.origin + window.location.pathname);
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
