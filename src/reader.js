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

            const label = document.createElement("p");
            label.textContent = `Loading page ${index + 1}...`;

            placeholder.appendChild(label);

            this.container.appendChild(placeholder);
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

            this.activeRequests++;

            this.loadImage(index)
                .catch((error) => {
                    console.error(`Page ${index + 1}:`, error);
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

        const img = document.createElement("img");

        img.src = imageUrl;
        img.className = "reader-image";
        img.alt = `Page ${index + 1}`;
        img.loading = "lazy";

        slot.replaceChildren(img);
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
