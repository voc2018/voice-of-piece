# Voice of Piece — LA × Tanzania Artist Collaboration

Local prototype for the Congressional App Challenge website concept.

## Run locally with VS Code Live Server

1. Unzip this folder.
2. Open the `cac-homepage` folder in VS Code.
3. Install the **Live Server** extension if needed.
4. Right-click `index.html` and choose **Open with Live Server**.
5. The site should open at an address similar to `http://127.0.0.1:5500/`.

## What is included

- Home page with an LA × Tanzania artistic city hero image
- About the Project section
- One Line, Two Worlds collaboration section
- Artist / artwork photo gallery using supplied project images
- Join as an Artist section
- English / Kiswahili artist application with language switching, organized into 9 sections
- Local draft saving via browser `localStorage`
- Test submission + downloadable JSON response
- Link to the older Google Form
- Responsive layout for desktop, tablet, and mobile

## Important about the application form

This is a **local prototype**. The HTML form does not send submissions to a database or Google Sheet. A test submission is saved only in the current browser. Before public launch, connect the form to a backend, Google Sheets, or another submission service.

The older Google Form is linked from the application section as a live fallback/reference. The local form follows the earlier Voice of Piece application structure while adding the current LA × Tanzania research questions.

## Files

- `index.html` — page structure and content
- `styles.css` — all responsive styling
- `script.js` — navigation, language toggle, validation, local draft storage, and test response download
- `assets/` — compressed project images used by the website
