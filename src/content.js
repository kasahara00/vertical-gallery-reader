
console.log("Vertical Gallery Reader loaded!");

// ========================================
// READER TOGGLE BUTTON
// ========================================

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
        <path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4
                 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13
                 a1 1 0 0 1-1 1h-4a4 4 0 0 0-4 2
                 4 4 0 0 0-4-2H4a1 1 0 0 1-1-1z"/>
      </svg>
      <span>Read Vertically</span>
    </span>
  `;
}

const categoryContainer = document.querySelector("#gdc");

function placeButtonInGallery() {
	button.classList.remove("reader-open");
	button.style.width = "";

	if (categoryContainer) {
		categoryContainer.prepend(button);

		const badge = categoryContainer.querySelector(".cs");

		if (badge) {
			const width = badge.getBoundingClientRect().width;

			if (width > 0) {
				button.style.width = `${width}px`;
			}
		}
	} else {
		document.body.appendChild(button);
	}
}

showReadButton();
placeButtonInGallery();

// ========================================
// READER STATE
// ========================================

let reader = null;
let discoveryController = null;

let previousOverflow = "";
let isOpening = false;

// ========================================
// OPEN READER
// ========================================

async function openReader() {
	// Load saved settings first.
	// Do not wait for gallery URL discovery.
	const settings = await ReaderSettings.load();

	previousOverflow =
		document.documentElement.style.overflow;

	document.documentElement.style.overflow = "hidden";

	const currentReader = new VerticalReader([], settings);

	reader = currentReader;

	// Open immediately, even with zero image URLs.
	currentReader.open();

	// Move the button above the full-screen overlay.
	document.body.appendChild(button);

	button.style.width = "";
	button.classList.add("reader-open");
	button.textContent = "Close Reader";
	currentReader.container.focus({ preventScroll: true });

	const controller = new AbortController();

	discoveryController = controller;

	// Run gallery discovery in the background.
	// Deliberately do not await this operation.
	void (async () => {
		try {
			for await (
				const batch of discoverImagePageUrls(
					controller.signal
				)
			) {
				if (
					controller.signal.aborted ||
					currentReader.closed
				) {
					break;
				}

				currentReader.appendImagePageUrls(batch);
			}

			if (
				!controller.signal.aborted &&
				!currentReader.closed
			) {
				currentReader.finishDiscovery();
			}
		} catch (error) {
			if (
				!controller.signal.aborted &&
				!currentReader.closed
			) {
				console.error(
					"Gallery discovery failed:",
					error
				);

				currentReader.finishDiscovery(error);
			}
		} finally {
			// Do not clear a newer reader's controller.
			if (discoveryController === controller) {
				discoveryController = null;
			}
		}
	})();
}

// ========================================
// CLOSE READER
// ========================================

function closeReader() {
	// Cancel outstanding gallery-page requests.
	discoveryController?.abort();
	discoveryController = null;

	reader?.close();
	reader = null;

	document.documentElement.style.overflow =
		previousOverflow;

	showReadButton();
	placeButtonInGallery();
}

// ========================================
// TOGGLE BUTTON CLICK
// ========================================

button.addEventListener("click", async () => {
	if (isOpening) {
		return;
	}

	if (reader !== null) {
		closeReader();
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

		showReadButton();
		placeButtonInGallery();
	} finally {
		isOpening = false;
		button.disabled = false;
	}
});
