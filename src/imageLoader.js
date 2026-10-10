async function getImageUrl(imagePageUrl, signal) {
    const response = await fetch(imagePageUrl, {
        signal
    });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch image page: ${response.status}`
        );
    }

    const html = await response.text();

    // Check whether the request was cancelled.
    signal?.throwIfAborted();

    const parser = new DOMParser();

    const doc = parser.parseFromString(
        html,
        "text/html"
    );

    const imageElement = doc.querySelector("img#img");

    if (!imageElement) {
        throw new Error("Could not find image on page");
    }

    return imageElement.src;
}

