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

        // Track the loading state of every image.
        this.imageStates = new Array(
            imagePageUrls.length
        ).fill("waiting");
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

            this.setImageState(index, "waiting");
        });
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

            // Ignore images already loading or loaded.
            if (this.imageStates[index] !== "waiting") {
                continue;
            }

            this.activeRequests++;

            this.setImageState(index, "loading");

            this.loadImage(index)
                .then(() => {
                    if (!this.closed) {
                        this.imageStates[index] = "loaded";
                    }
                })
                .catch((error) => {
                    if (this.closed) {
                        return;
                    }

                    console.error(`Page ${index + 1}:`, error);

                    this.setImageState(
                        index,
                        "failed",
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

        // Create an image in memory.
        const img = new Image();

        img.className = "reader-image";
        img.alt = `Page ${index + 1}`;

        // Wait until the image has downloaded.
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => {
                reject(new Error(`Image ${index + 1} failed to load`));
            };

            img.src = imageUrl;

            if (img.complete) {
                if (img.naturalWidth > 0) {
                    resolve();
                } else {
                    reject(new Error(`Image ${index + 1} failed to load`));
                }
            }
        });

        if (this.closed) {
            return;
        }

        // Insert the fully loaded image.
        this.preserveScrollPosition(() => {
            slot.replaceChildren(img);
        });
    }


    close() {
        this.closed = true;

        this.observer?.disconnect();
        this.controller.abort();

        this.queue = [];

        this.container?.remove();
        this.container = null;
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

        // Find the first slot intersecting the visible viewport.
        let anchor = null;

        for (const slot of slots) {
            const rect = slot.getBoundingClientRect();

            if (rect.bottom > containerTop) {
                anchor = slot;
                break;
            }
        }

        // Record its position before the DOM changes.
        const oldTop = anchor?.getBoundingClientRect().top;

        // Apply the DOM change.
        updateDOM();

        if (!anchor) {
            return;
        }

        // Measure the anchor again after the DOM change.
        const newTop = anchor.getBoundingClientRect().top;

        // Compensate for movement.
        container.scrollTop += newTop - oldTop;
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

        // A loaded image is already displayed.
        if (state === "loaded") {
            return;
        }

        const status = document.createElement("div");
        status.className = "reader-status";

        const text = document.createElement("p");

        if (state === "loading") {
            const spinner = document.createElement("div");
            spinner.className = "reader-spinner";

            status.appendChild(spinner);

            text.textContent = `Loading page ${index + 1}...`;
        } else if (state === "failed") {
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

    retryImage(index) {
        if (this.closed) {
            return;
        }

        if (this.imageStates[index] !== "failed") {
            return;
        }

        // Reset the image to the waiting state.
        this.setImageState(index, "waiting");

        // Add it back into the request queue.
        this.queue.unshift(index);

        this.processQueue();
    }
}
