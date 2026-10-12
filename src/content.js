(() => {
	"use strict";

	console.log("Vertical Gallery Reader loaded!");

	// Prevent duplicate initialization.
	if (window.__verticalGalleryReaderInitialized) {
		return;
	}

	window.__verticalGalleryReaderInitialized = true;

	let adapter = null;
	let activeGalleryKey = null;

	let reader = null;
	let discoveryController = null;
	let previousOverflow = "";
	let isOpening = false;

	let navigationCheckScheduled = false;
	let lastKnownUrl = location.href;

	// --------------------------------------------------
	// Read Vertically button
	// --------------------------------------------------

	const button = document.createElement("button");

	button.id = "vertical-reader-button";
	button.type = "button";

	function showReadButton() {
		button.innerHTML = `
            <span class="reader-button-content">
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <path d="M12 7v14"/>
                    <path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1h-4a4 4 0 0 0-4 2 4 4 0 0 0-4-2H4a1 1 0 0 1-1-1z"/>
                </svg>
                <span>Read Vertically</span>
            </span>
        `;
	}

	showReadButton();

	// --------------------------------------------------
	// Button placement
	// --------------------------------------------------

	function placeButtonInGallery() {
		if (!adapter || !activeGalleryKey) {
			return false;
		}

		if (reader !== null || isOpening) {
			return false;
		}

		const container = adapter.getButtonContainer();

		// The website may still be rendering the gallery.
		if (!container || !container.isConnected) {
			return false;
		}

		button.classList.remove("reader-open");
		button.style.width = "";
		button.style.display = "";

		if (typeof adapter.placeButton === "function") {
			adapter.placeButton(button);
		} else {
			container.prepend(button);

			const width = adapter.getButtonWidth();

			if (width > 0) {
				button.style.width = `${width}px`;
			}
		}

		return button.isConnected;
	}

	function isButtonPlacementValid() {
		if (!button.isConnected) {
			return false;
		}

		if (!adapter) {
			return false;
		}

		if (typeof adapter.isButtonPlacementValid === "function") {
			return adapter.isButtonPlacementValid(button);
		}

		return true;
	}

	function ensureButtonExists() {
		if (!adapter || !activeGalleryKey) {
			return;
		}

		if (reader !== null || isOpening) {
			return;
		}

		if (!isButtonPlacementValid()) {
			placeButtonInGallery();
		}
	}

	// --------------------------------------------------
	// Gallery navigation
	// --------------------------------------------------

	function getCurrentGalleryState() {
		const currentAdapter = getGalleryAdapter(location.href);

		if (!currentAdapter) {
			return {
				adapter: null,
				galleryKey: null
			};
		}

		const galleryKey = currentAdapter.getGalleryKey();

		return {
			adapter: currentAdapter,
			galleryKey: galleryKey || null
		};
	}

	function refreshGalleryState() {
		const nextState = getCurrentGalleryState();

		const nextAdapter = nextState.adapter;
		const nextGalleryKey = nextState.galleryKey;

		const galleryChanged =
			nextGalleryKey !== activeGalleryKey ||
			nextAdapter !== adapter;

		if (galleryChanged) {
			console.log(
				"Vertical Reader: Gallery changed",
				{
					previous: activeGalleryKey,
					current: nextGalleryKey
				}
			);

			// Cancel any reader belonging to the previous gallery.
			if (reader !== null) {
				closeReader(false);
			}

			discoveryController?.abort();
			discoveryController = null;

			adapter = nextAdapter;
			activeGalleryKey = nextGalleryKey;

			// Remove the button from its previous location.
			button.remove();

			// Clear the old gallery's button styling.
			button.className = "";
			button.removeAttribute("style");

			showReadButton();

			// Never display the button outside gallery pages.
			if (!adapter || !activeGalleryKey) {
				return;
			}

			// Switch progress storage to the new gallery.
			ReaderProgress.setGalleryKey(activeGalleryKey);

			placeButtonInGallery();
		} else {
			// The URL hasn't changed, but the website may
			// have replaced its gallery controls.
			ensureButtonExists();
		}
	}

	function checkNavigation() {
		navigationCheckScheduled = false;

		if (location.href !== lastKnownUrl) {
			lastKnownUrl = location.href;
		}

		refreshGalleryState();
	}

	function scheduleNavigationCheck() {
		if (navigationCheckScheduled) {
			return;
		}

		navigationCheckScheduled = true;

		requestAnimationFrame(checkNavigation);
	}

	// Observe dynamically rendered gallery content.
	const galleryObserver = new MutationObserver(() => {
		scheduleNavigationCheck();
	});

	galleryObserver.observe(document.documentElement, {
		childList: true,
		subtree: true
	});

	// Handle browser back/forward navigation.
	window.addEventListener(
		"popstate",
		scheduleNavigationCheck
	);

	window.addEventListener(
		"pageshow",
		scheduleNavigationCheck
	);

	// Detect clicks that may trigger client-side navigation.
	document.addEventListener(
		"click",
		event => {
			const link = event.target.closest?.("a[href]");

			if (!link) {
				return;
			}

			// Check after the website handles the click.
			setTimeout(scheduleNavigationCheck, 0);
		},
		true
	);

	// Initial gallery detection.
	refreshGalleryState();

	// --------------------------------------------------
	// Reader lifecycle
	// --------------------------------------------------

	async function openReader() {
		const readerAdapter = adapter;
		const galleryKey = activeGalleryKey;

		if (!readerAdapter || !galleryKey) {
			throw new Error("No gallery adapter supports this page");
		}

		// Important: load progress for THIS gallery.
		ReaderProgress.setGalleryKey(galleryKey);

		const [settings, savedPosition] = await Promise.all([
			ReaderSettings.load(),
			ReaderProgress.load()
		]);

		// The user may have navigated away while settings
		// and reading progress were loading.
		if (
			adapter !== readerAdapter ||
			activeGalleryKey !== galleryKey
		) {
			return;
		}

		previousOverflow =
			document.documentElement.style.overflow;

		document.documentElement.style.overflow = "hidden";

		const currentReader = new VerticalReader(
			[],
			settings,
			readerAdapter
		);

		currentReader.galleryMetadata =
			readerAdapter.getMetadata();

		currentReader.onCloseRequested = closeReader;

		reader = currentReader;

		currentReader.open();

		if (savedPosition) {
			currentReader.setSavedPosition(savedPosition);
		} else {
			currentReader.hasRestoredProgress = true;
		}

		button.style.display = "none";

		currentReader.container.focus({
			preventScroll: true
		});

		const controller = new AbortController();

		discoveryController = controller;

		void (async () => {
			try {
				for await (
					const batch of readerAdapter.discoverPages(
						controller.signal
					)
				) {
					if (
						controller.signal.aborted ||
						currentReader.closed ||
						reader !== currentReader
					) {
						break;
					}

					currentReader.appendImagePageUrls(batch);
				}

				if (
					!controller.signal.aborted &&
					!currentReader.closed &&
					reader === currentReader
				) {
					currentReader.finishDiscovery();
				}
			} catch (error) {
				if (
					!controller.signal.aborted &&
					!currentReader.closed &&
					reader === currentReader
				) {
					console.error(
						"Gallery discovery failed:",
						error
					);

					currentReader.finishDiscovery(error);
				}
			} finally {
				if (discoveryController === controller) {
					discoveryController = null;
				}
			}
		})();
	}

	function closeReader(restoreButton = true) {
		discoveryController?.abort();
		discoveryController = null;

		reader?.close();
		reader = null;

		document.documentElement.style.overflow =
			previousOverflow;

		if (restoreButton) {
			showReadButton();

			button.style.display = "";

			ensureButtonExists();
		}
	}

	// --------------------------------------------------
	// Button interaction
	// --------------------------------------------------

	button.addEventListener("click", async () => {
		if (isOpening) {
			return;
		}

		if (reader !== null) {
			closeReader();
			return;
		}

		if (!adapter || !activeGalleryKey) {
			return;
		}

		isOpening = true;
		button.disabled = true;
		button.textContent = "Opening reader...";

		try {
			await openReader();
		} catch (error) {
			console.error(
				"Failed to open reader:",
				error
			);

			discoveryController?.abort();
			discoveryController = null;

			reader?.close();
			reader = null;

			document.documentElement.style.overflow =
				previousOverflow;
		} finally {
			isOpening = false;
			button.disabled = false;

			if (reader === null) {
				showReadButton();
				ensureButtonExists();
			}
		}
	});
})();
