console.log("Vertical Gallery Reader loaded!");

const button = document.createElement("button");

button.id = "vertical-reader-button";
button.textContent = "Read Vertically";

document.body.appendChild(button);

let reader = null;
let previousOverflow = "";
let isOpening = false;

async function openReader() {
	const imagePageUrls = await getAllImagePageUrls();

	console.log(`Found ${imagePageUrls.length} images`);

	previousOverflow = document.documentElement.style.overflow;
	document.documentElement.style.overflow = "hidden";

	const settings = await ReaderSettings.load();
	reader = new VerticalReader(
		imagePageUrls,
		settings
	);
	reader.open();

	button.textContent = "Close Reader";
}

function closeReader() {
	reader.close();
	reader = null;

	document.documentElement.style.overflow = previousOverflow;

	button.textContent = "Read Vertically";
}

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

		button.textContent = "Read Vertically";
	} finally {
		isOpening = false;
		button.disabled = false;
	}
});
