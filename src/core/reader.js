const ImageState = Object.freeze({
    WAITING: "waiting",
    LOADING: "loading",
    LOADED: "loaded",
    FAILED: "failed"
});

class VerticalReader {
    constructor(imagePageUrls, settings, adapter) {
        this.adapter = adapter;
        this.imagePageUrls = [...imagePageUrls];
        this.settings = settings;

        this.container = null;
        this.observer = null;
        this.controller = new AbortController();

        this.queue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 2;

        this.closed = false;

        this.imageStates = this.imagePageUrls.map(
            () => ImageState.WAITING
        );

        this.currentIndex = 0;
        this.pagesBehind = 2;
        this.scrollUpdateScheduled = false;

        this.discoveryFinished = false;
        this.discoveryMessage = null;

        this.seenUrls = new Set(this.imagePageUrls);

        this.savedPosition = null;
        this.hasRestoredProgress = false;

        this.progressSaveTimer = null;
        this.progressSaveDelay = 500;

        this.galleryMetadata = {
            title: "Untitled Gallery",
            rating: null
        };

        this.onCloseRequested = null;
        this.readerHeader = null;
        this.readerSettingsPanel = null;

        this.uiHideTimer = null;
        this.uiHideDelay = 3000;
        this.uiVisible = true;
    }

    // ========================================
    // OPEN READER
    // ========================================

    open() {
        this.container = document.createElement("div");
        this.container.id = "vertical-reader-container";

        // Make the reader programmatically focusable.
        this.container.tabIndex = -1;

        this.applySettings();

        document.body.appendChild(this.container);

        this.createPlaceholders();
        this.createHeader();
        this.setupAutoHideUI();
        this.createDiscoveryMessage();
        this.createPageIndicator();
        this.setupObserver();
        this.setupKeyboardNavigation();

        this.container.addEventListener(
            "scroll",
            () => {
                this.scheduleScrollUpdate();
                this.scheduleProgressSave();
            },
            { passive: true }
        );

        this.updatePreloadQueue();
    }

    // ========================================
    // GALLERY DISCOVERY STATUS
    // ========================================

    createDiscoveryMessage() {
        const message = document.createElement("div");

        message.className = "reader-discovery-message";
        message.setAttribute("role", "status");

        message.style.cssText = `
      max-width: 900px;
      margin: 16px auto;
      padding: 16px;
      text-align: center;
      color: #bbb;
      font: 14px Arial, sans-serif;
    `;

        this.discoveryMessage = message;
        this.container.appendChild(message);

        this.updateDiscoveryMessage();
    }

    updateDiscoveryMessage(error = null) {
        if (!this.discoveryMessage || this.closed) {
            return;
        }

        if (error) {
            this.discoveryMessage.textContent =
                `Could not discover all gallery pages: ${error.message}. ` +
                "Already found images remain available.";

            this.discoveryMessage.style.color = "#ff9b9b";
        } else if (this.discoveryFinished) {
            this.discoveryMessage.remove();
            this.discoveryMessage = null;
        } else {
            this.discoveryMessage.textContent =
                this.imagePageUrls.length > 0
                    ? `Found ${this.imagePageUrls.length} images. Discovering the rest...`
                    : "Finding the first images...";
        }
    }

    finishDiscovery(error = null) {
        if (this.closed) {
            return;
        }

        this.discoveryFinished = true;
        this.updateDiscoveryMessage(error);
        this.updatePageIndicator();
        this.tryRestoreProgress();
    }

    // ========================================
    // ADD NEW IMAGES WHILE READING
    // ========================================

    appendImagePageUrls(newUrls) {
        if (this.closed || !this.container) {
            return;
        }

        let added = 0;

        for (const url of newUrls) {
            if (this.seenUrls.has(url)) {
                continue;
            }

            this.seenUrls.add(url);

            const index = this.imagePageUrls.length;

            this.imagePageUrls.push(url);
            this.imageStates.push(ImageState.WAITING);

            this.createPlaceholder(index);

            added++;
        }

        if (added > 0) {
            this.updateDiscoveryMessage();
            this.updatePageIndicator();
            this.tryRestoreProgress();
            this.scheduleScrollUpdate();
            this.updatePreloadQueue();
        }
    }

    // ========================================
    // IMAGE PLACEHOLDERS
    // ========================================

    createPlaceholders() {
        this.imagePageUrls.forEach((_, index) => {
            this.createPlaceholder(index);
        });
    }

    createPlaceholder(index) {
        const slot = document.createElement("div");

        slot.className = "reader-image-slot";
        slot.dataset.index = String(index);

        // Keep image slots before the discovery message.
        this.container.insertBefore(
            slot,
            this.discoveryMessage
        );

        this.setImageState(index, ImageState.WAITING);

        // Observe slots added after the reader opened.
        this.observer?.observe(slot);
    }

    getSlot(index) {
        return this.container?.querySelector(
            `.reader-image-slot[data-index="${index}"]`
        );
    }

    // ========================================
    // IMAGE LOADING STATES
    // ========================================

    setImageState(index, state, message = "") {
        if (this.closed || !this.container) {
            return;
        }

        this.imageStates[index] = state;

        const slot = this.getSlot(index);

        if (!slot || state === ImageState.LOADED) {
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

            const retry = document.createElement("button");

            retry.className = "reader-retry-button";
            retry.textContent = "Retry";

            retry.addEventListener("click", () => {
                this.retryImage(index);
            });

            status.append(text, retry);
            slot.replaceChildren(status);

            return;

        } else {
            text.textContent = `Page ${index + 1}`;
        }

        status.appendChild(text);
        slot.replaceChildren(status);
    }

    // ========================================
    // OBSERVE VISIBLE IMAGES
    // ========================================

    setupObserver() {
        this.observer?.disconnect();

        this.observer = new IntersectionObserver(
            () => this.scheduleScrollUpdate(),
            {
                root: this.container,
                threshold: 0
            }
        );

        this.container
            .querySelectorAll(".reader-image-slot")
            .forEach(slot => {
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
        if (!this.container || !this.imagePageUrls.length) {
            return;
        }

        const readingPosition =
            this.container.getBoundingClientRect().top + 100;

        const slots = this.container.querySelectorAll(
            ".reader-image-slot"
        );

        let newIndex = 0;

        for (const slot of slots) {
            newIndex = Number(slot.dataset.index);

            if (
                slot.getBoundingClientRect().bottom >
                readingPosition
            ) {
                break;
            }
        }

        this.updateCurrentPage(newIndex);
    }

    // ========================================
    // PRELOAD QUEUE
    // ========================================

    updatePreloadQueue() {
        if (this.closed || !this.imagePageUrls.length) {
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

        const newQueue = [];

        const add = index => {
            if (this.imageStates[index] === ImageState.WAITING) {
                newQueue.push(index);
            }
        };

        // Prioritize current page.
        add(this.currentIndex);

        // Then pages ahead.
        for (
            let i = this.currentIndex + 1;
            i <= end;
            i++
        ) {
            add(i);
        }

        // Then nearby pages behind.
        for (
            let i = this.currentIndex - 1;
            i >= start;
            i--
        ) {
            add(i);
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

            if (
                this.imageStates[index] !== ImageState.WAITING
            ) {
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
                .catch(error => {
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

    // ========================================
    // DOWNLOAD AND INSERT IMAGE
    // ========================================

    async loadImage(index) {
        const imageUrl = await this.adapter.getImageUrl(
            this.imagePageUrls[index],
            this.controller.signal
        );

        if (this.closed) {
            return;
        }

        const slot = this.getSlot(index);

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

        // Once the saved image has loaded, restore its
        // fractional reading position accurately.
        if (
            this.savedPosition &&
            this.hasRestoredProgress &&
            index === this.savedPosition.index
        ) {
            this.restoreReadingPosition(this.savedPosition);
            this.savedPosition = null;
        }

        this.scheduleScrollUpdate();
    }

    // ========================================
    // PRESERVE READING POSITION
    // ========================================

    preserveScrollPosition(updateDOM) {
        const position = this.captureReadingPosition();

        updateDOM();

        this.restoreReadingPosition(position);
    }

    captureReadingPosition() {
        if (!this.container) {
            return null;
        }

        const top =
            this.container.getBoundingClientRect().top;

        for (
            const slot of this.container.querySelectorAll(
                ".reader-image-slot"
            )
        ) {
            const rect = slot.getBoundingClientRect();

            if (rect.bottom > top) {
                const offset = top - rect.top;

                return {
                    index: Number(slot.dataset.index),

                    progress: Math.max(
                        0,
                        Math.min(
                            1,
                            offset / Math.max(1, rect.height)
                        )
                    )
                };
            }
        }

        return null;
    }

    restoreReadingPosition(position) {
        if (!position || !this.container) {
            return;
        }

        const slot = this.getSlot(position.index);

        if (!slot) {
            return;
        }

        const containerTop =
            this.container.getBoundingClientRect().top;

        const rect = slot.getBoundingClientRect();

        this.container.scrollTop +=
            rect.top -
            containerTop +
            position.progress * rect.height;
    }

    // ========================================
    // RETRY FAILED IMAGES
    // ========================================

    retryImage(index) {
        if (
            this.closed ||
            this.imageStates[index] !== ImageState.FAILED
        ) {
            return;
        }

        this.setImageState(index, ImageState.WAITING);

        this.queue.unshift(index);

        this.processQueue();
    }

    // ========================================
    // SETTINGS
    // ========================================

    applySettings(changedSetting = null) {
        if (!this.container) {
            return;
        }

        const affectsLayout =
            changedSetting === "imageWidth" ||
            changedSetting === "imageSpacing";

        const position = affectsLayout
            ? this.captureReadingPosition()
            : null;

        this.container.style.setProperty(
            "--reader-image-width",
            `${this.settings.imageWidth}px`
        );

        this.container.style.setProperty(
            "--reader-image-spacing",
            `${this.settings.imageSpacing}px`
        );

        if (position) {
            this.restoreReadingPosition(position);
            this.scheduleScrollUpdate();
        }

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

            const row = document.createElement("div");
            row.className = "reader-setting-input-row";

            const slider = document.createElement("input");

            slider.type = "range";
            slider.min = control.min;
            slider.max = control.max;
            slider.step = control.step;
            slider.value = this.settings[control.key];

            const number = document.createElement("input");

            number.type = "number";
            number.min = control.min;
            number.max = control.max;
            number.step = 1;
            number.value = this.settings[control.key];
            number.className = "reader-setting-number";

            const unit = document.createElement("span");
            unit.textContent = control.unit;

            const update = value => {
                this.settings[control.key] = value;

                slider.value = value;
                number.value = value;

                this.applySettings(control.key);
            };

            const save = async () => {
                try {
                    await ReaderSettings.save(this.settings);
                } catch (error) {
                    console.error(
                        "Failed to save settings:",
                        error
                    );
                }
            };

            slider.addEventListener("input", () => {
                update(Number(slider.value));
            });

            slider.addEventListener("change", save);

            number.addEventListener("change", async () => {
                const raw = number.value.trim();
                const value = Number(raw);

                const valid =
                    raw !== "" &&
                    Number.isInteger(value) &&
                    value >= control.min &&
                    value <= control.max;

                if (!valid) {
                    number.value = this.settings[control.key];
                    return;
                }

                update(value);
                await save();
            });

            number.addEventListener("keydown", event => {
                event.stopPropagation();
            });

            row.append(slider, number, unit);
            wrapper.append(label, row);

            panel.appendChild(wrapper);
        }

        return panel;
    }

    createHeader() {
        const header = document.createElement("header");
        header.className = "reader-header";

        const info = document.createElement("div");
        info.className = "reader-header-info";

        const title = document.createElement("div");
        title.className = "reader-header-title";
        title.textContent = this.galleryMetadata.title;
        title.title = this.galleryMetadata.title;

        info.appendChild(title);

        if (this.galleryMetadata.rating !== null) {
            const rating = document.createElement("div");
            rating.className = "reader-header-rating";

            const star = document.createElement("span");
            star.className = "reader-rating-star";
            star.textContent = "★";
            star.setAttribute("aria-hidden", "true");

            const value = document.createElement("span");
            value.textContent = this.galleryMetadata.rating;

            rating.append(star, value);
            info.appendChild(rating);
        }

        const actions = document.createElement("div");
        actions.className = "reader-header-actions";

        const settingsButton = this.createHeaderIconButton(
            "Settings",
            '<circle cx="12" cy="12" r="3"/>' +
            '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l-1.82 1.82A1.65 1.65 0 0 0 16.09 18 1.65 1.65 0 0 0 15 19.51V20H9v-.49A1.65 1.65 0 0 0 7.91 18a1.65 1.65 0 0 0-1.82.33l-1.82-1.82A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1.09H3v-3h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l1.82-1.82A1.65 1.65 0 0 0 7.91 6 1.65 1.65 0 0 0 9 4.49V4h6v.49A1.65 1.65 0 0 0 16.09 6a1.65 1.65 0 0 0 1.82-.33l1.82 1.82A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1.09H21v3h-.09A1.65 1.65 0 0 0 19.4 15z"/>'
        );

        const closeButton = this.createHeaderIconButton(
            "Close reader",
            '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
        );

        closeButton.classList.add("reader-header-close");

        const panel = this.createSettingsPanel();
        panel.hidden = true;
        panel.classList.add("reader-header-settings-panel");

        this.readerSettingsPanel = panel;

        settingsButton.addEventListener("click", () => {
            panel.hidden = !panel.hidden;

            if (!panel.hidden) {
                this.showUI();
            } else {
                this.scheduleUIHide();
            }
        });

        closeButton.addEventListener("click", () => {
            this.onCloseRequested?.();
        });

        actions.append(settingsButton, closeButton);
        header.append(info, actions);

        this.container.append(header, panel);
        this.readerHeader = header;
    }

    createHeaderIconButton(label, paths) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "reader-header-icon";
        button.title = label;
        button.setAttribute("aria-label", label);

        button.innerHTML = `
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
            ${paths}
        </svg>
    `;

        return button;
    }

    showUI() {
        if (this.closed || !this.container) return;

        this.uiVisible = true;
        this.container.classList.remove("reader-ui-hidden");
        this.scheduleUIHide();
    }

    hideUI() {
        if (
            this.closed ||
            !this.container ||
            this.pageIndicatorEditing ||
            (this.readerSettingsPanel &&
                !this.readerSettingsPanel.hidden)
        ) {
            return;
        }

        this.uiVisible = false;
        this.container.classList.add("reader-ui-hidden");
        clearTimeout(this.uiHideTimer);
    }

    scheduleUIHide() {
        clearTimeout(this.uiHideTimer);

        if (
            this.closed ||
            this.pageIndicatorEditing ||
            (this.readerSettingsPanel &&
                !this.readerSettingsPanel.hidden)
        ) {
            return;
        }

        this.uiHideTimer = setTimeout(() => {
            this.hideUI();
        }, this.uiHideDelay);
    }

    setupAutoHideUI() {
        this.container.addEventListener("pointermove", event => {
            if (event.pointerType === "mouse") {
                this.showUI();
            }
        }, { passive: true });

        this.container.addEventListener("click", event => {
            if (event.target.closest(
                ".reader-header, " +
                ".reader-header-settings-panel, " +
                ".reader-page-indicator, " +
                ".reader-retry-button"
            )) {
                return;
            }

            this.hideUI();
        });

        this.container.addEventListener("focusin", event => {
            if (event.target.closest(
                ".reader-header, .reader-header-settings-panel"
            )) {
                this.showUI();
            }
        });

        this.scheduleUIHide();
    }


    // ========================================
    // KEYBOARD NAVIGATION
    // ========================================

    scrollToImage(index) {
        if (this.closed || !this.container) {
            return;
        }

        // Keep the index within discovered images.
        const targetIndex = Math.max(
            0,
            Math.min(index, this.imagePageUrls.length - 1)
        );

        const slot = this.getSlot(targetIndex);

        if (!slot) {
            return;
        }

        // Calculate the slot position relative
        // to the reader's scroll container.
        const containerRect =
            this.container.getBoundingClientRect();

        const slotRect = slot.getBoundingClientRect();

        const targetScrollTop =
            this.container.scrollTop +
            slotRect.top -
            containerRect.top;

        this.container.scrollTo({
            top: targetScrollTop,
            behavior: "instant"
        });

        this.updateCurrentPage(targetIndex);
        this.updatePreloadQueue();
    }

    setupKeyboardNavigation() {
        this.handleKeyDown = event => {
            if (this.closed) {
                return;
            }

            // Don't interfere with typing in settings.
            const target = event.target;

            if (
                target instanceof HTMLElement &&
                (
                    target.matches("input, textarea, select") ||
                    target.isContentEditable
                )
            ) {
                return;
            }

            // Preserve browser shortcuts.
            if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }

            switch (event.key) {
                case "ArrowRight":
                    event.preventDefault();
                    this.scrollToImage(this.currentIndex + 1);
                    break;

                case "ArrowLeft":
                    event.preventDefault();
                    this.scrollToImage(this.currentIndex - 1);
                    break;

                case "Home":
                    event.preventDefault();
                    this.scrollToImage(0);
                    break;

                case "End":
                    event.preventDefault();
                    this.scrollToImage(
                        this.imagePageUrls.length - 1
                    );
                    break;

                case "Escape":
                    // We'll connect this to closeReader()
                    // in content.js.
                    break;
            }
        };

        document.addEventListener(
            "keydown",
            this.handleKeyDown
        );
    }

    // ========================================
    // PAGE INDICATOR
    // ========================================

    createPageIndicator() {
        const indicator = document.createElement("div");

        indicator.className = "reader-page-indicator";
        indicator.setAttribute("role", "button");
        indicator.setAttribute("tabindex", "0");
        indicator.setAttribute("aria-label", "Jump to page");
        indicator.title = "Click to jump to a page";

        this.pageIndicator = indicator;
        this.pageIndicatorEditing = false;

        indicator.addEventListener("click", () => {
            if (!this.pageIndicatorEditing) {
                this.startEditingPageIndicator();
            }
        });

        indicator.addEventListener("keydown", event => {
            if (
                !this.pageIndicatorEditing &&
                (event.key === "Enter" || event.key === " ")
            ) {
                event.preventDefault();
                this.startEditingPageIndicator();
            }
        });

        this.container.appendChild(indicator);
        this.updatePageIndicator();
    }

    updatePageIndicator() {
        if (
            !this.pageIndicator ||
            this.closed ||
            this.pageIndicatorEditing
        ) {
            return;
        }

        const total = this.imagePageUrls.length;

        if (total === 0) {
            this.pageIndicator.textContent = "Finding pages...";
            return;
        }

        const current = Math.min(
            this.currentIndex + 1,
            total
        );

        const suffix = this.discoveryFinished ? "" : "+";

        this.pageIndicator.textContent =
            `Page ${current} / ${total}${suffix}`;
    }

    startEditingPageIndicator() {
        if (
            this.closed ||
            this.pageIndicatorEditing ||
            this.imagePageUrls.length === 0
        ) {
            return;
        }
        this.showUI();
        this.pageIndicatorEditing = true;

        // Prevent the UI from hiding while editing.
        clearTimeout(this.uiHideTimer);

        const currentPage = this.currentIndex + 1;
        const total = this.imagePageUrls.length;

        const input = document.createElement("input");

        input.type = "number";
        input.className = "reader-page-input";

        input.min = "1";
        input.max = String(total);
        input.step = "1";
        input.value = String(currentPage);

        input.setAttribute("aria-label", "Page number");

        // Always fit the largest possible page number.
        // For example, 462 pages needs room for 3 digits.
        const digits = String(total).length;
        input.style.width = `${digits + 0.5}ch`;

        const prefix = document.createElement("span");
        prefix.textContent = "Page ";

        const totalLabel = document.createElement("span");

        const suffix = this.discoveryFinished ? "" : "+";
        totalLabel.textContent = ` / ${total}${suffix}`;

        const finishEditing = shouldJump => {
            if (!this.pageIndicatorEditing) {
                return;
            }

            this.pageIndicatorEditing = false;

            // Resume automatic hiding after editing.
            this.scheduleUIHide();

            const rawValue = input.value.trim();
            const page = Number(rawValue);

            const valid =
                rawValue !== "" &&
                Number.isInteger(page) &&
                page >= 1 &&
                page <= this.imagePageUrls.length;

            if (shouldJump && valid) {
                this.scrollToImage(page - 1);
            }

            this.updatePageIndicator();

            // Restore keyboard focus to the reader
            // so Up/Down scrolling works immediately.
            if (!this.closed && this.container) {
                this.container.focus({ preventScroll: true });
            }
        };

        input.addEventListener("keydown", event => {
            // Prevent keyboard navigation shortcuts from
            // interfering while editing the page number.
            event.stopPropagation();

            if (event.key === "Enter") {
                event.preventDefault();
                finishEditing(true);
            } else if (event.key === "Escape") {
                event.preventDefault();
                finishEditing(false);
            }
        });

        // Clicking elsewhere cancels the edit.
        input.addEventListener("blur", () => {
            finishEditing(false);
        });

        this.pageIndicator.replaceChildren(
            prefix,
            input,
            totalLabel
        );

        // Select the current page number automatically.
        input.focus();
        input.select();
    }

    updateCurrentPage(index) {
        if (!this.imagePageUrls.length) {
            return;
        }

        this.currentIndex = Math.max(
            0,
            Math.min(index, this.imagePageUrls.length - 1)
        );

        this.updatePageIndicator();
    }

    // ========================================
    // READING PROGRESS
    // ========================================

    // Called after saved progress has been loaded.
    setSavedPosition(position) {
        if (
            !position ||
            !Number.isInteger(position.index) ||
            position.index < 0
        ) {
            return;
        }

        this.savedPosition = {
            index: position.index,
            progress: Math.max(
                0,
                Math.min(1, Number(position.progress) || 0)
            )
        };

        this.tryRestoreProgress();
    }

    // Wait until the target image has been discovered.
    tryRestoreProgress() {
        if (
            this.closed ||
            this.hasRestoredProgress ||
            !this.savedPosition ||
            !this.container
        ) {
            return;
        }

        const targetIndex = this.savedPosition.index;

        if (targetIndex >= this.imagePageUrls.length) {
            // More gallery pages may still be discovered.
            if (!this.discoveryFinished) return;

            // Saved page no longer exists.
            this.hasRestoredProgress = true;
            return;
        }

        this.hasRestoredProgress = true;

        this.scrollToImage(targetIndex);

        this.restoreReadingPosition(
            this.savedPosition
        );

        this.scheduleScrollUpdate();
    }

    // Debounce saves to avoid excessive storage writes.
    scheduleProgressSave() {
        if (
            this.closed ||
            !this.hasRestoredProgress
        ) {
            return;
        }

        clearTimeout(this.progressSaveTimer);

        this.progressSaveTimer = setTimeout(() => {
            this.saveProgress();
        }, this.progressSaveDelay);
    }

    async saveProgress() {
        if (
            this.closed ||
            !this.hasRestoredProgress
        ) {
            return;
        }

        const position = this.captureReadingPosition();

        if (!position) return;

        try {
            await ReaderProgress.save(position);
        } catch (error) {
            console.error(
                "Failed to save reading progress:",
                error
            );
        }
    }

    // ========================================
    // CLOSE READER
    // ========================================

    close() {
        clearTimeout(this.progressSaveTimer);

        if (this.hasRestoredProgress) {
            const position = this.captureReadingPosition();

            if (position) {
                ReaderProgress.save(position).catch(error => {
                    console.error(
                        "Failed to save reading progress:",
                        error
                    );
                });
            }
        }

        this.closed = true;

        this.observer?.disconnect();
        this.controller.abort();

        this.queue = [];

        document.removeEventListener(
            "keydown",
            this.handleKeyDown
        );

        this.container?.remove();
        this.container = null;

        clearTimeout(this.uiHideTimer);
    }
}
