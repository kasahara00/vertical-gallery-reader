function getImagePageUrls(doc = document) {
    const links = doc.querySelectorAll('a[href*="/s/"]');

    const urls = Array.from(links).map(link => link.href);

    return [...new Set(urls)];
}


function getLastGalleryPage(doc = document) {
    const links = doc.querySelectorAll('a[href*="p="]');

    let lastPage = 0;

    for (const link of links) {
        const url = new URL(link.href);

        // Only consider links to this gallery.
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

async function fetchGalleryPage(pageNumber) {
    const url = new URL(window.location.href);

    url.searchParams.set("p", pageNumber);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch gallery page ${pageNumber}: ${response.status}`
        );
    }

    const html = await response.text();

    const parser = new DOMParser();

    return parser.parseFromString(html, "text/html");
}


async function getAllImagePageUrls() {
    const lastPage = getLastGalleryPage();

    console.log(`Found ${lastPage + 1} gallery pages`);

    const allUrls = new Set();

    for (let page = 0; page <= lastPage; page++) {
        console.log(`Processing gallery page ${page + 1}`);

        let doc;

        // Reuse the currently loaded document when possible.
        const currentPage = Number(
            new URL(window.location.href).searchParams.get("p") || 0
        );

        if (page === currentPage) {
            doc = document;
        } else {
            doc = await fetchGalleryPage(page);
        }

        const urls = getImagePageUrls(doc);

        for (const url of urls) {
            allUrls.add(url);
        }
    }

    return [...allUrls];
}



