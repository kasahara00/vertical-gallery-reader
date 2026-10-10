const ImageState = Object.freeze({
    WAITING: "waiting",
    LOADING: "loading",
    LOADED: "loaded",
    FAILED: "failed"
});

class VerticalReader {
    constructor(imagePageUrls) {
        this.imagePageUrls = imagePageUrls;

        this.container = null;
        this.observer = null;

        this.controller = new AbortController();

        this.queue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 2;

        this.closed = false;

        this.imageStates = new Array(
            imagePageUrls.length
        ).fill(ImageState.WAITING);
    }

    open() {
        this.container = document.createElement("div");
        this.container.id = "vertical-reader-container";

        document.body.appendChild(this.container);

        this.createPlaceholders();
        this.setupObserver();
    }

    createPlaceholders() {
        this.imagePageUrls.forEach((url, index) => {
            const placeholder = document.createElement("div");

            placeholder.className = "reader-image-slot";
            placeholder.dataset.index = index;

            this.container.appendChild(placeholder);

            this.setImageState(index, ImageState.WAITING);
        });
    }

    setImageState(index, state, message = "") {
        if (this.closed || !this.container) {
            return;
        }

        this.imageStates[index] = state;

        const slot = this.container.querySelector(
            `[data-index="${index}"]`
        );

        if (!slot) {
            return;
        }

        // Loaded images are already displayed.
        if (state === ImageState.LOADED) {
            return;
        }

        const status = document.createElement("div");
        status.className = "reader-status";

        const text = document.createElement("p");

        if (state === ImageState.LOADING) {
            const spinner = document.createElement("div");
            spinner.className = "reader-spinner";

            status.appendChild(spinner);

            text.textContent = `Loading page ${index + 1}...`;

        } else if (state === ImageState.FAILED) {
            text.textContent =
                message || `Failed to load page ${index + 1}`;

            const retryButton = document.createElement("button");

            retryButton.className = "reader-retry-button";
            retryButton.textContent = "Retry";

            retryButton.addEventListener("click", () => {
                this.retryImage(index);
            });

            status.appendChild(text, retryButton);
            slot.replaceChildren(status);

            return;

        } else {
            text.textContent = `Page ${index + 1}`;
        }

        status.appendChild(text);
        slot.replaceChildren(status);
    }

    setupObserver() {
        this.observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) {
                        continue;
                    }

                    this.observer.unobserve(entry.target);

                    const index = Number(entry.target.dataset.index);

                    this.queue.push(index);
                }

                this.processQueue();
            },
            {
                root: this.container,
                rootMargin: "2000px 0px"
            }
        );

        const placeholders =
            this.container.querySelectorAll(".reader-image-slot");

        placeholders.forEach((placeholder) => {
            this.observer.observe(placeholder);
        });
    }

    processQueue() {
        while (
            !this.closed &&
            this.activeRequests < this.maxConcurrentRequests &&
            this.queue.length > 0
        ) {
            const index = this.queue.shift();

            // Only waiting images can start loading.
            if (this.imageStates[index] !== ImageState.WAITING) {
                continue;
            }

            this.activeRequests++;

            this.setImageState(index, ImageState.LOADING);

            this.loadImage(index)
                .then(() => {
                    if (!this.closed) {
                        this.imageStates[index] = ImageState.LOADED;
                    }
                })
                .catch((error) => {
                    if (this.closed) {
                        return;
                    }

                    console.error(`Page ${index + 1}:`, error);

                    this.setImageState(
                        index,
                        ImageState.FAILED,
                        `Failed to load page ${index + 1}`
                    );
                })
                .finally(() => {
                    this.activeRequests--;
                    this.processQueue();
                });
        }
    }

    async loadImage(index) {
        const imagePageUrl = this.imagePageUrls[index];

        const imageUrl = await getImageUrl(
            imagePageUrl,
            this.controller.signal
        );

        if (this.closed) {
            return;
        }

        const slot = this.container.querySelector(
            `[data-index="${index}"]`
        );

        if (!slot) {
            return;
        }

        // Preload image before inserting it into the DOM.
        const img = new Image();

        img.className = "reader-image";
        img.alt = `Page ${index + 1}`;

        await new Promise((resolve, reject) => {
            img.onload = resolve;

            img.onerror = () => {
                reject(
                    new Error(`Image ${index + 1} failed to load`)
                );
            };

            img.src = imageUrl;

            if (img.complete) {
                if (img.naturalWidth > 0) {
                    resolve();
                } else {
                    reject(
                        new Error(`Image ${index + 1} failed to load`)
                    );
                }
            }
        });

        if (this.closed) {
            return;
        }

        // Preserve scroll position when replacing the placeholder.
        this.preserveScrollPosition(() => {
            slot.replaceChildren(img);
        });
    }

    preserveScrollPosition(updateDOM) {
        const container = this.container;

        if (!container) {
            return;
        }

        const slots = container.querySelectorAll(
            ".reader-image-slot"
        );

        const containerTop =
            container.getBoundingClientRect().top;

        let anchor = null;

        for (const slot of slots) {
            const rect = slot.getBoundingClientRect();

            if (rect.bottom > containerTop) {
                anchor = slot;
                break;
            }
        }

        const oldTop = anchor?.getBoundingClientRect().top;

        updateDOM();

        if (!anchor) {
            return;
        }

        const newTop = anchor.getBoundingClientRect().top;

        container.scrollTop += newTop - oldTop;
    }

    retryImage(index) {
        if (this.closed) {
            return;
        }

        if (this.imageStates[index] !== ImageState.FAILED) {
            return;
        }

        // Reset to waiting so processQueue can load it again.
        this.setImageState(index, ImageState.WAITING);

        // Prioritize manually retried images.
        this.queue.unshift(index);

        this.processQueue();
    }

    close() {
        this.closed = true;

        this.observer?.disconnect();
        this.controller.abort();

        this.queue = [];

        this.container?.remove();
        this.container = null;
    }
}
