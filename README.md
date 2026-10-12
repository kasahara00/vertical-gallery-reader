# Vertical Gallery Reader

A browser extension that transforms traditional image galleries into a seamless, vertically scrolling reading experience.

Built with **Chrome Manifest V3**, Vertical Gallery Reader provides a clean, distraction-free interface for reading image galleries without manually navigating between pages.

The extension uses a **modular adapter architecture**, allowing it to support multiple websites while sharing the same reader interface, image-loading system, settings, and navigation features.

## Features

- **Continuous vertical scrolling** — Read an entire gallery in one continuous view without navigating between individual image pages.
- **Progressive image loading** — Images are loaded asynchronously as needed to reduce unnecessary network requests and memory usage.
- **Automatic gallery discovery** — Gallery pages are discovered and added to the reader automatically.
- **Reading progress** — Automatically saves your position so you can resume reading later.
- **Page navigation** — Navigate between pages using keyboard shortcuts or the interactive page indicator.
- **Jump to page** — Click the page indicator to jump directly to a specific page.
- **Customizable settings** — Adjust reading preferences through the built-in settings panel.
- **Distraction-free interface** — A fullscreen reader with an automatically hiding header and navigation controls.
- **Gallery information** — Displays the gallery title and rating where supported by the website.
- **Site-specific integration** — The Read Vertically button is styled and positioned to suit each supported website.
- **Extensible architecture** — Add support for new gallery websites without modifying the core reader.

## Supported Websites

| Website | Gallery URL | Status |
|---|---|---|
| [E-Hentai](https://e-hentai.org/) | `https://e-hentai.org/g/...` | Supported |
| [nhentai](https://nhentai.net/) | `https://nhentai.net/g/...` | Supported |

Each website is implemented through a separate adapter responsible for extracting gallery information and discovering images.

The reader's interface and functionality remain consistent across supported websites.

**Note:** Website updates may change HTML structures, APIs, or image delivery mechanisms, requiring adjustments to the corresponding adapter.

## Installation

Vertical Gallery Reader is currently installed manually as an unpacked browser extension.

### Google Chrome / Microsoft Edge

1. Download or clone this repository.

   ```bash
   git clone https://github.com/kasahara00/vertical-gallery-reader.git
   ```

2. Open your browser's extension management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`

3. Enable **Developer mode**.

4. Click **Load unpacked**.

5. Select the repository folder containing `manifest.json`.

6. The extension is now installed.

No build process or additional dependencies are required.

## How to Use

1. Navigate to a gallery on a supported website.
2. Locate the **Read Vertically** button on the gallery page.
3. Click the button to launch the fullscreen vertical reader.
4. Scroll down to read the gallery continuously.
5. Use the reader's navigation controls to move between pages or jump to a specific page.
6. Click the settings icon in the header to customize your reading experience.
7. Click the close button to return to the original gallery page.

Your reading progress is saved automatically and can be restored when you return to the gallery.

### Reader Controls

| Control | Action |
|---|---|
| Mouse wheel / trackpad | Scroll through the gallery |
| Page indicator | View the current page and jump to another page |
| Settings icon | Open reader settings |
| Close icon | Exit the reader |
| Mouse movement | Reveal hidden reader controls |

The header and page indicator automatically hide after a period of mouse inactivity to provide a distraction-free reading experience.

## Project Structure

```text
vertical-gallery-reader/
├── manifest.json
├── src/
│   ├── core/
│   │   ├── reader.js
│   │   ├── settings.js
│   │   └── progress.js
│   │
│   ├── adapters/
│   │   ├── registry.js
│   │   ├── ehentai.js
│   │   └── nhentai.js
│   │
│   ├── styles/
│   │   ├── reader.css
│   │   ├── ehentai.css
│   │   └── nhentai.css
│   │
│   └── content.js
│
└── README.md
```

### Core Reader

The `src/core/` directory contains functionality shared by all supported websites.

| File | Responsibility |
|---|---|
| `reader.js` | Fullscreen reader UI, image loading, scrolling, navigation, settings panel, and progress handling |
| `settings.js` | Stores and retrieves user preferences |
| `progress.js` | Saves and restores gallery reading progress |

The core reader is designed to remain independent of individual website structures.

### Website Adapters

The `src/adapters/` directory contains website-specific integrations.

| File | Responsibility |
|---|---|
| `registry.js` | Registers adapters and selects the appropriate adapter for the current website |
| `ehentai.js` | Handles E-Hentai gallery metadata, page discovery, and image URL extraction |
| `nhentai.js` | Handles nhentai gallery metadata and direct image URL discovery |

Each adapter implements a common interface, allowing the core reader to interact with different websites in the same way.

### Content Script

`src/content.js` coordinates the extension lifecycle, including:

- Detecting the appropriate website adapter.
- Creating and inserting the Read Vertically button.
- Launching and closing the reader.
- Coordinating asynchronous gallery discovery.
- Connecting the adapter to the shared reader.

### Stylesheets

| File | Responsibility |
|---|---|
| `reader.css` | Shared fullscreen reader styling |
| `ehentai.css` | E-Hentai-specific launch button styling |
| `nhentai.css` | nhentai-specific launch button styling |

Site-specific stylesheets allow each website's launch button to match its design without affecting the reader's shared appearance.

---

## Adding Support for Another Website

Vertical Gallery Reader is designed to make supporting additional websites straightforward.

**You generally only need to create a new adapter, add its stylesheet, and register both in `manifest.json`.**

The shared reader should not require modification.

### Step 1: Create a Website Adapter

Create a new JavaScript file in:

```text
src/adapters/example.js
```

Every adapter must implement the interface expected by the reader.

| Method / Property | Purpose |
|---|---|
| `id` | Unique identifier for the website |
| `matches(url)` | Determines whether the adapter supports the current URL |
| `getGalleryKey()` | Returns a unique identifier for saving gallery reading progress |
| `getMetadata()` | Extracts the gallery title and optional rating |
| `getButtonContainer()` | Returns the element where the launch button should be inserted |
| `getButtonWidth()` | Provides a site-specific button width |
| `discoverPages(signal)` | Asynchronously discovers gallery pages in batches |
| `getImageUrl(pageIdentifier, signal)` | Resolves a page identifier to its full-resolution image URL |

### Step 2: Implement the Adapter

Below is a simplified example for a hypothetical website where gallery images are directly available in the page's HTML.

```javascript
registerGalleryAdapter({
    id: "example",

    matches(url) {
        const parsed = new URL(url);

        return (
            parsed.hostname === "example.com" &&
            parsed.pathname.startsWith("/gallery/")
        );
    },

    getGalleryKey() {
        return `example:${window.location.pathname}`;
    },

    getMetadata() {
        return {
            title:
                document.querySelector("h1.gallery-title")
                    ?.textContent?.trim() ||
                document.title,

            rating: null
        };
    },

    getButtonContainer() {
        return document.querySelector(".gallery-info");
    },

    getButtonWidth() {
        return 180;
    },

    async *discoverPages(signal) {
        if (signal.aborted) return;

        const imageUrls = Array.from(
            document.querySelectorAll(".gallery-page img")
        ).map(img => img.dataset.src || img.src);

        yield imageUrls;
    },

    async getImageUrl(pageIdentifier, signal) {
        return pageIdentifier;
    }
});
```

This example assumes the website exposes full-resolution image URLs directly in its HTML.

For websites that use individual image pages, `getImageUrl()` can instead fetch the image page and extract the full-resolution image URL.

### Step 3: Understand Progressive Discovery

The `discoverPages()` method is an **async generator** that yields arrays of page identifiers.

This allows the reader to begin displaying images before the entire gallery has been discovered.

For example:

```javascript
async *discoverPages(signal) {
    for (let page = 0; page < totalPages; page++) {
        if (signal.aborted) return;

        const imageUrls = await fetchGalleryPage(page, signal);

        yield imageUrls;
    }
}
```

Each batch is passed to the shared reader, which handles image loading and rendering.

An adapter can yield the entire gallery at once or progressively discover pages, depending on the website's structure.

### Step 4: Add Site-Specific Button Styling

Create a stylesheet:

```text
src/styles/example.css
```

Example:

```css
#vertical-reader-button {
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
}

#vertical-reader-button:hover {
    background: #1d4ed8;
}
```

Keep styling specific to the website's launch button here.

The fullscreen reader's appearance is controlled by the shared `reader.css`.

### Step 5: Register the Adapter in the Manifest

Add a new entry to the `content_scripts` section of `manifest.json`.

```json
{
  "matches": ["https://example.com/gallery/*"],
  "js": [
    "src/adapters/registry.js",
    "src/core/settings.js",
    "src/core/progress.js",
    "src/core/reader.js",
    "src/adapters/example.js",
    "src/content.js"
  ],
  "css": [
    "src/styles/reader.css",
    "src/styles/example.css"
  ]
}
```

**Script loading order matters.** The adapter registry and shared dependencies must load before the adapter, and the adapter must load before `content.js`.

### Step 6: Test the Integration

After registering the adapter:

1. Reload the extension from the browser's extension management page.
2. Open a gallery on the new website.
3. Verify that the Read Vertically button appears in the correct location.
4. Launch the reader and confirm that images load in the correct order.
5. Test navigation, page jumping, settings, and progress restoration.
6. Check the browser's developer console for errors.
7. Verify that existing supported websites continue to function correctly.

### Adapter Design Guidelines

When developing new adapters:

- **Keep website-specific logic isolated.** Avoid adding site-specific selectors or URL patterns to `reader.js`.
- **Use unique gallery keys.** Include the website identity to prevent reading-progress collisions between websites.
- **Respect cancellation signals.** Stop discovery and network requests when the reader closes.
- **Support progressive discovery when practical.** Large galleries should not require all pages to be discovered before reading begins.
- **Prefer reliable image sources.** Use the site's gallery metadata or full-resolution image URLs rather than low-resolution thumbnails.
- **Handle missing metadata gracefully.** Titles, ratings, and other information may not exist on every website.
- **Keep styling separate.** Website-specific button appearance belongs in its own CSS file.

---

## How Image Discovery Works

Different websites expose their gallery images in different ways.

Vertical Gallery Reader handles these differences through adapters.

**E-Hentai:** The adapter discovers individual image-page URLs and resolves them to full-resolution images as needed.

**nhentai:** The adapter first attempts to retrieve gallery metadata through the site's JSON API. If unavailable, it attempts to derive full-resolution image URLs from thumbnail metadata on the gallery page.

Once the image URLs are resolved, the shared reader handles loading, displaying, and navigating between them.

This separation allows new websites to use entirely different image-discovery mechanisms without requiring changes to the reader itself.

## Compatibility and Limitations

- Built for Chromium-based browsers supporting Manifest V3.
- Supports the gallery URL patterns registered in `manifest.json`.
- Existing E-Hentai reading-progress storage keys are retained for backward compatibility.
- Gallery metadata and image discovery depend on each website's current HTML structure or API.
- Some websites may restrict automated requests, image hosting, or cross-origin access.
- Lazy-loaded thumbnails or incomplete gallery metadata may affect fallback discovery.
- Changes to a supported website may require updating its adapter.

## Contributing

Contributions, bug reports, and support for additional websites are welcome.

If you would like to add support for another website, follow the adapter guide above and keep website-specific logic separate from the shared reader.

When submitting changes, please include the website's gallery URL pattern and describe how gallery images are discovered.

## Disclaimer

This project is an independent browser extension and is not affiliated with or endorsed by any supported website.

Users are responsible for complying with the terms and conditions of the websites they access.

## License

No license has been specified yet. Refer to the repository for any future licensing information.
