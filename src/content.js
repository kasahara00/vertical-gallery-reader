
console.log("Vertical Gallery Reader loaded!");

// =========================================
// 1. CREATE READER TOGGLE BUTTON
// =========================================

const button = document.createElement("button");

button.id = "vertical-reader-button";
button.type = "button";

// Book icon + button text.
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

showReadButton();

// On gallery pages, #gdc contains the category badge.
const categoryContainer = document.querySelector("#gdc");

// Position the button above the category badge.
function placeButtonInGallery() {
	if (categoryContainer) {
		categoryContainer.prepend(button);

		// Match the rendered width of the category badge.
		const categoryBadge = categoryContainer.querySelector(".cs");

		if (categoryBadge) {
			const width = categoryBadge.getBoundingClientRect().width;

			if (width > 0) {
				button.style.width = `${width}px`;
			}
		}
	} else {
		// Fallback if the gallery layout changes.
		document.body.appendChild(button);
	}
}

placeButtonInGallery();


// =========================================
// 2. READER STATE
// =========================================

let reader = null;
let previousOverflow = "";
let isOpening = false;


// =========================================
// 3. OPEN READER
// =========================================

async function openReader() {
	const imagePageUrls = await getAllImagePageUrls();

	console.log(`Found ${imagePageUrls.length} images`);

	if (imagePageUrls.length === 0) {
		throw new Error("No images found in this gallery.");
	}

	const settings = await ReaderSettings.load();

	previousOverflow = document.documentElement.style.overflow;
	document.documentElement.style.overflow = "hidden";

	reader = new VerticalReader(imagePageUrls, settings);
	reader.open();

	// Move the button outside the gallery's stacking contexts
	// so it remains visible above the full-screen reader.
	document.body.appendChild(button);

	// Remove the category badge's width before applying
	// the fixed-position Close Reader styling.
	button.style.width = "";

	button.classList.add("reader-open");
	button.textContent = "Close Reader";
}


// =========================================
// 4. CLOSE READER
// =========================================

function closeReader() {
	if (reader !== null) {
		reader.close();
		reader = null;
	}

	document.documentElement.style.overflow = previousOverflow;

	button.classList.remove("reader-open");

	// Restore the book icon and text.
	showReadButton();

	// Return the button above the category badge.
	placeButtonInGallery();
}


// =========================================
// 5. TOGGLE BUTTON EVENT
// =========================================

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
	button.textContent = "Finding images...";

	try {
		await openReader();
	} catch (error) {
		console.error("Failed to open reader:", error);

		reader?.close();
		reader = null;

		document.documentElement.style.overflow = previousOverflow;

		button.classList.remove("reader-open");
		showReadButton();
		placeButtonInGallery();
	} finally {
		isOpening = false;
		button.disabled = false;
	}
});
