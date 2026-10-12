// Site adapters register themselves before content.js executes.
const GalleryAdapters = [];
function registerGalleryAdapter(adapter) {
    GalleryAdapters.push(adapter);
}
function getGalleryAdapter(url = window.location.href) {
    return GalleryAdapters.find(adapter => adapter.matches(url)) ?? null;
}
