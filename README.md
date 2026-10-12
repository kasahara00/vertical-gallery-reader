# Vertical Gallery Reader

Manifest V3 extension with a reusable vertical reader and site-specific adapters.

## Install

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this folder.

## Architecture

- `src/core/reader.js`: reader UI, progressive image loading, navigation, settings UI, and progress saving.
- `src/core/settings.js`, `progress.js`: shared persistence.
- `src/adapters/registry.js`: adapter registration and selection.
- `src/adapters/ehentai.js`: E-Hentai gallery discovery, image resolution, metadata, button placement.
- `src/content.js`: generic launch/close lifecycle and discovery coordination.
- `src/styles/reader.css`: shared reader styling.
- `src/styles/ehentai.css`: E-Hentai launch button styling.

## Add another site

Create an adapter implementing `matches`, `getGalleryKey`, `getMetadata`, `getButtonContainer`, `getButtonWidth`, `discoverPages` (async generator yielding arrays of page identifiers), and `getImageUrl`. Register it using `registerGalleryAdapter`. Add the adapter and its site CSS to the manifest and add the appropriate URL match. For a site with direct image URLs, `getImageUrl` can return the identifier unchanged.

## Compatibility

Existing E-Hentai reading-progress storage keys are retained. Site-specific image-page scraping has moved into the E-Hentai adapter. The shared reader and settings behavior are otherwise preserved.
