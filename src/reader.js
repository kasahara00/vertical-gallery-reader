
const ImageState = Object.freeze({
    WAITING: "waiting",
    LOADING: "loading",
    LOADED: "loaded",
    FAILED: "failed"
});

class VerticalReader {
    constructor(imagePageUrls, settings) {
        this.imagePageUrls = imagePageUrls;
        this.settings = settings;

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

        // Index of the image currently being read.
        this.currentIndex = 0;

        // Number of images to keep ready behind the reader.
        this.pagesBehind = 2;

        // Used to avoid excessive scroll calculations.
        this.scrollUpdateScheduled = false;
    }

    open() {
        this.container = document.createElement("div");
        this.container.id = "vertical-reader-container";

        this.applySettings();

        document.body.appendChild(this.container);

        this.createPlaceholders();
        this.createSettingsButton();
        this.setupObserver();

        this.container.addEventListener(
            "scroll",
            () => this.scheduleScrollUpdate(),
            { passive: true }
        );

        // Start loading the first few images immediately.
        this.updatePreloadQueue();
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
        this.observer?.disconnect();

        // Observe the actual visible viewport.
        // Preloading ahead is handled separately by image count.
        this.observer = new IntersectionObserver(
            (entries) => {
                if (this.closed) {
                    return;
                }

                // Recalculate which image is currently visible.
                this.scheduleScrollUpdate();
            },
            {
                root: this.container,
                threshold: 0
            }
        );

        const slots = this.container.querySelectorAll(
            ".reader-image-slot"
        );

        slots.forEach((slot) => {
            this.observer.observe(slot);
        });
    }

    scheduleScrollUpdate() {
        if (this.closed || this.scrollUpdateScheduled) {
            return;
        }

        this.scrollUpdateScheduled = true;

        requestAnimationFrame(() => {
            this.scrollUpdateScheduled = false;

            if (this.closed) {
                return;
            }

            this.updateCurrentIndex();
            this.updatePreloadQueue();
        });
    }

    updateCurrentIndex() {
        if (!this.container) {
            return;
        }

        const slots = this.container.querySelectorAll(
            ".reader-image-slot"
        );

        const containerRect =
            this.container.getBoundingClientRect();

        // Use a point near the top of the reader viewport
        // to identify the current image.
        const readingPosition = containerRect.top + 100;

        let newIndex = 0;

        for (const slot of slots) {
            const rect = slot.getBoundingClientRect();

            if (rect.bottom > readingPosition) {
                newIndex = Number(slot.dataset.index);
                break;
            }

            newIndex = Number(slot.dataset.index);
        }

        this.currentIndex = newIndex;
    }

    updatePreloadQueue() {
        if (this.closed) {
            return;
        }

        const start = Math.max(
            0,
            this.currentIndex - this.pagesBehind
        );

        const end = Math.min(
            this.imagePageUrls.length - 1,
            this.currentIndex + this.settings.pagesToPreload
        );

        // Rebuild the waiting queue based on the
        // current reading position.
        const newQueue = [];

        // Prioritize the current image.
        if (
            this.imageStates[this.currentIndex] === ImageState.WAITING
        ) {
            newQueue.push(this.currentIndex);
        }

        // Then prioritize images ahead.
        for (
            let index = this.currentIndex + 1;
            index <= end;
            index++
        ) {
            if (this.imageStates[index] === ImageState.WAITING) {
                newQueue.push(index);
            }
        }

        // Finally, include nearby images behind.
        for (
            let index = this.currentIndex - 1;
            index >= start;
            index--
        ) {
            if (this.imageStates[index] === ImageState.WAITING) {
                newQueue.push(index);
            }
        }

        this.queue = newQueue;

        this.processQueue();
    }

    processQueue() {
        while (
            !this.closed &&
            this.activeRequests < this.maxConcurrentRequests &&
            this.queue.length > 0
        ) {
            const index = this.queue.shift();

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

                    if (!this.closed) {
                        this.updatePreloadQueue();
                    }
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

        this.preserveScrollPosition(() => {
            slot.replaceChildren(img);
        });

        // Image dimensions may have changed the layout.
        this.scheduleScrollUpdate();
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

        this.setImageState(index, ImageState.WAITING);

        // Make the retried image the highest priority.
        this.queue.unshift(index);

        this.processQueue();
    }

    applySettings(changedSetting = null) {
        if (!this.container) {
            return;
        }

        this.container.style.setProperty(
            "--reader-image-width",
            `${this.settings.imageWidth}px`
        );

        this.container.style.setProperty(
            "--reader-image-spacing",
            `${this.settings.imageSpacing}px`
        );

        if (changedSetting === "pagesToPreload") {
            this.updatePreloadQueue();
        }
    }

    createSettingsPanel() {
        const panel = document.createElement("div");
        panel.className = "reader-settings-panel";

        const title = document.createElement("h3");
        title.textContent = "Reader Settings";

        panel.appendChild(title);

        const controls = [
            {
                key: "imageWidth",
                label: "Maximum image width",
                min: 400,
                max: 1400,
                step: 1,
                unit: "px"
            },
            {
                key: "imageSpacing",
                label: "Image spacing",
                min: 0,
                max: 60,
                step: 1,
                unit: "px"
            },
            {
                key: "pagesToPreload",
                label: "Pages to preload",
                min: 1,
                max: 10,
                step: 1,
                unit: "pages"
            }
        ];

        for (const control of controls) {
            const wrapper = document.createElement("div");
            wrapper.className = "reader-setting";

            const label = document.createElement("label");
            label.textContent = control.label;

            const inputRow = document.createElement("div");
            inputRow.className = "reader-setting-input-row";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = control.min;
            slider.max = control.max;
            slider.step = control.step;
            slider.value = this.settings[control.key];

            const numberInput = document.createElement("input");
            numberInput.type = "number";
            numberInput.min = control.min;
            numberInput.max = control.max;
            numberInput.step = 1;
            numberInput.value = this.settings[control.key];
            numberInput.className = "reader-setting-number";

            const unit = document.createElement("span");
            unit.textContent = control.unit;

            // Update the setting and both inputs together.
            const updateSetting = (newValue) => {
                this.settings[control.key] = newValue;

                slider.value = newValue;
                numberInput.value = newValue;

                this.applySettings(control.key);
            };

            // Save the setting to Chrome storage.
            const saveSetting = async () => {
                try {
                    await ReaderSettings.save(this.settings);
                } catch (error) {
                    console.error("Failed to save settings:", error);
                }
            };

            // Slider: update continuously while dragging.
            slider.addEventListener("input", () => {
                updateSetting(Number(slider.value));
            });

            slider.addEventListener("change", saveSetting);

            // Number input: validate when user finishes editing.
            const commitNumberInput = async () => {
                const rawValue = numberInput.value.trim();
                const newValue = Number(rawValue);

                const isValid =
                    rawValue !== "" &&
                    Number.isInteger(newValue) &&
                    newValue >= control.min &&
                    newValue <= control.max;

                if (!isValid) {
                    // Restore the previous valid value.
                    numberInput.value = this.settings[control.key];
                    return;
                }

                updateSetting(newValue);
                await saveSetting();
            };

            numberInput.addEventListener("change", commitNumberInput);

            // Prevent clicks on the settings controls from
            // triggering any reader-level keyboard shortcuts later.
            numberInput.addEventListener("keydown", (event) => {
                event.stopPropagation();
            });

            inputRow.append(slider, numberInput, unit);
            wrapper.append(label, inputRow);

            panel.appendChild(wrapper);
        }

        return panel;
    }

    createSettingsButton() {
        const button = document.createElement("button");

        button.className = "reader-settings-button";
        button.textContent = "⚙ Settings";

        const panel = this.createSettingsPanel();
        panel.hidden = true;

        button.addEventListener("click", () => {
            panel.hidden = !panel.hidden;
        });

        this.container.append(button, panel);
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
