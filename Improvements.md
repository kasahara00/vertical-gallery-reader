- Some sort of indication of current page number out of total pages.
- Read Vertically button is accessable on individual image page as well. Clicking will open the reader from that page, lazy loading some pages above and below. So as the user scrolls up or down it will load the pages.
- Allow user to jump to a specific image in the reader.
Step 2: Added nhentai adapter and site-specific CSS, plus separate manifest
content-script entries. The shared reader remains unchanged. nhentai
discovery uses API-first with thumbnail fallback.
