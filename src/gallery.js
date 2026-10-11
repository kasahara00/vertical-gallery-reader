function getImagePageUrls(doc = document) {
    const links = doc.querySelectorAll('a[href*="/s/"]');

    return [...new Set(Array.from(links, link => link.href))];
}

function getLastGalleryPage(doc = document) {
    const links = doc.querySelectorAll('a[href*="p="]');

    let lastPage = 0;

    for (const link of links) {
        const url = new URL(link.href);

        if (url.pathname !== window.location.pathname) {
            continue;
        }

        const page = Number(url.searchParams.get("p"));

        if (Number.isInteger(page) && page >= 0) {
            lastPage = Math.max(lastPage, page);
        }
    }

    return lastPage;
}

async function fetchGalleryPage(pageNumber, signal) {
    const url = new URL(window.location.href);

    url.searchParams.set("p", String(pageNumber));

    const response = await fetch(url, { signal });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch gallery page ${pageNumber}: ${response.status}`
        );
    }

    const html = await response.text();

    return new DOMParser().parseFromString(html, "text/html");
}

// Discover image-page URLs incrementally.
async function* discoverImagePageUrls(signal) {
    const lastPage = getLastGalleryPage();

    const currentPage = Number(
        new URL(window.location.href).searchParams.get("p") || 0
    );

    const seen = new Set();

    console.log(`Found ${lastPage + 1} gallery pages`);

    // Process gallery pages in order so images remain
    // in the correct reading sequence.
    for (let page = 0; page <= lastPage; page++) {
        if (signal?.aborted) {
            return;
        }

        const doc =
            page === currentPage
                ? document
                : await fetchGalleryPage(page, signal);

        if (signal?.aborted) {
            return;
        }

        const batch = getImagePageUrls(doc).filter(url => {
            if (seen.has(url)) {
                return false;
            }

            seen.add(url);
            return true;
        });

        if (batch.length > 0) {
            yield batch;
        }
    }
}

// Keep the old API available for compatibility.
async function getAllImagePageUrls(signal) {
    const urls = [];

    for await (const batch of discoverImagePageUrls(signal)) {
        urls.push(...batch);
    }

    return urls;
}

function getGalleryMetadata(doc = document) {
    // E-Hentai gallery title.
    const title =
        doc.querySelector("#gn")?.textContent?.trim() ||
        doc.title ||
        "Untitled Gallery";

    // E-Hentai normally displays its numerical rating
    // inside #rating_label, e.g. "Average: 4.72".
    const ratingText =
        doc.querySelector("#rating_label")?.textContent?.trim() || "";

    const match = ratingText.match(
        /Average\s*:\s*(\d+(?:\.\d+)?)/i
    );

    const rating = match ? Number(match[1]) : null;

    return {
        title,

        rating:
            rating !== null &&
                Number.isFinite(rating) &&
                rating >= 0 &&
                rating <= 5
                ? rating.toFixed(2)
                : null
    };
}
