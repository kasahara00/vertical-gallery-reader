// nhentai gallery adapter.
// Uses gallery API when available, with thumbnail metadata as a fallback.
(() => {
    function getCurrentGalleryId() {
        return location.pathname.match(
            /^\/g\/(\d+)\/?$/
        )?.[1] ?? null;
    }

    if (location.hostname !== "nhentai.net") {
        return;
    }

    function getMetadata() {
        const title = document.querySelector("#info h1")?.textContent?.trim()
            || document.querySelector("h1.title")?.textContent?.trim()
            || document.title
            || "Untitled Gallery";

        // nhentai does not display an E-Hentai-style five-star rating.
        return { title, rating: null };
    }

    function findDownloadButton() {
        // Find the actual Download action, rather than assuming its parent
        // has a particular class (nhentai themes can differ).
        const candidates = document.querySelectorAll(
            '#info a, #content a, #info button, #content button'
        );
        return Array.from(candidates).find(element => {
            const label = (element.textContent || "").trim();
            const href = element.getAttribute("href") || "";
            return /\bdownload\b/i.test(label) || /\/download(?:\/|$)/i.test(href);
        }) || null;
    }

    function getButtonContainer() {
        const download = findDownloadButton();
        return download?.parentElement
            || document.querySelector("#info .buttons")
            || document.querySelector("#info")
            || document.querySelector("#content");
    }

    function placeButton(button) {
        const download = findDownloadButton();

        if (download) {
            // Use the same styling classes as the Download button.
            button.className = download.className;

            // Remove any positioning inherited from the original button.
            button.style.width = "";
            button.style.height = "";
            button.style.margin = "";

            download.insertAdjacentElement("afterend", button);
            return;
        }

        getButtonContainer()?.appendChild(button);
    }


    function isButtonPlacementValid(button) {
        const download = findDownloadButton();

        if (!download) {
            return button.isConnected;
        }

        return (
            button.isConnected &&
            download.nextElementSibling === button
        );
    }


    function fromApi(data) {
        if (!data?.media_id || !Array.isArray(data.images?.pages)) {
            throw new Error("Unexpected gallery API response");
        }

        const extensions = { j: "jpg", p: "png", g: "gif", w: "webp" };
        return data.images.pages.map((page, index) => {
            const extension = extensions[page.t];
            if (!extension) {
                throw new Error(`Unsupported image type: ${page.t}`);
            }
            return `https://i.nhentai.net/galleries/${data.media_id}/${index + 1}.${extension}`;
        });
    }

    function getGalleryPageUrls() {
        const galleryId = getCurrentGalleryId();

        if (!galleryId) {
            throw new Error("Invalid nhentai gallery URL.");
        }

        const pages = new Map();

        const links = document.querySelectorAll("a[href]");

        for (const link of links) {
            const url = new URL(link.href, location.origin);

            if (url.origin !== location.origin) {
                continue;
            }

            const match = url.pathname.match(
                /^\/g\/(\d+)\/(\d+)\/?$/
            );

            if (!match || match[1] !== galleryId) {
                continue;
            }

            const pageNumber = Number(match[2]);

            if (!Number.isInteger(pageNumber) || pageNumber < 1) {
                continue;
            }

            pages.set(pageNumber, url.href);
        }

        const expectedPages = Number(
            document.querySelector("#info")
                ?.textContent.match(/\bPages:\s*(\d+)/i)?.[1]
        );

        const sortedPages = [...pages.entries()]
            .sort((a, b) => a[0] - b[0]);

        console.log("Vertical Reader discovery:", {
            galleryId,
            expectedPages,
            discoveredPages: sortedPages.length
        });

        if (
            expectedPages > 0 &&
            sortedPages.length !== expectedPages
        ) {
            throw new Error(
                `Expected ${expectedPages} pages, ` +
                `but discovered ${sortedPages.length}.`
            );
        }

        return sortedPages.map(([, url]) => url);
    }

    async function* discoverPages(signal) {
        if (signal?.aborted) return;

        const urls = getGalleryPageUrls();

        for (let i = 0; i < urls.length; i += 40) {
            if (signal?.aborted) return;

            yield urls.slice(i, i + 40);
        }
    }

    async function resolveGalleryPage(pageUrl, signal) {
        const response = await fetch(pageUrl, {
            signal,
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch ${pageUrl}: HTTP ${response.status}`
            );
        }

        const html = await response.text();

        const doc = new DOMParser().parseFromString(
            html,
            "text/html"
        );

        const image = doc.querySelector(
            "#image-container img"
        );

        if (!image) {
            throw new Error(
                `Image not found on ${pageUrl}`
            );
        }

        const imageUrl =
            image.getAttribute("data-src") ||
            image.getAttribute("src");

        if (!imageUrl) {
            throw new Error(
                `Image URL missing on ${pageUrl}`
            );
        }

        return new URL(imageUrl, pageUrl).href;
    }

    registerGalleryAdapter({
        id: "nhentai",

        matches(url) {
            const parsed = new URL(url);

            return parsed.hostname === "nhentai.net"
                && /^\/g\/\d+\/?$/.test(parsed.pathname);
        },

        getGalleryKey() {
            const galleryId = getCurrentGalleryId();

            return galleryId
                ? `https://nhentai.net/g/${galleryId}/`
                : null;
        },

        getMetadata,
        getButtonContainer,
        placeButton,
        isButtonPlacementValid,

        getButtonWidth() {
            return 0;
        },

        discoverPages,

        async getImageUrl(pageUrl, signal) {
            signal?.throwIfAborted();
            return resolveGalleryPage(pageUrl, signal);
        }
    });
})();
