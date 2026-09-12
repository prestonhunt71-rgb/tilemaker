# TileMaker 0.1.0

A GM tool for tracing part of the scene background, naming the cutout, saving a transparent PNG, and placing it as a movable tile.

## Installation

Extract the tilemaker folder into your Foundry User Data modules folder, restart Foundry, and enable TileMaker in Manage Modules. On Forge, import the supplied module ZIP through the Import Wizard, then enable the module in your world.

Direct Foundry installation: paste this Manifest URL into Install Module:

https://github.com/prestonhunt71-rgb/tilemaker/releases/latest/download/module.json

## Use

1. Open a scene with a background image.
2. Open the Tile controls and click the scissors button, **Snip Background**.
3. Click around the desired object. Points are freely positioned without grid snapping.
4. Click the first point or press Enter to close the selection. Backspace removes the last point; Escape cancels. Right-drag pans and the mouse wheel zooms.
5. Review the checkerboard transparency preview and enter a useful tile name.
6. Click **Save & Place Tile**. The tile is placed over the original selection at its original scene size, selected for moving.

The source background is unchanged. The cutout contains only the background image, excluding tokens, walls, grid, lighting, drawings and existing tiles. Each PNG has a tight rectangular image boundary and transparent pixels outside the polygon, with antialiased edges. Trace along an object's silhouette if you want to isolate it; this does not perform automatic object recognition or background removal.

## Save location and naming

The default world setting is:

Tokens/Mapmaking Tiles/Custom

On Forge this is relative to **My Assets Library**, matching the supplied screenshot. On a local installation it is relative to User Data. The folder must exist and be writable. Change it under Module Settings > TileMaker > Tile save folder.

Names retain spaces and Unicode. Do not enter a path or filename punctuation such as slashes, colons, or question marks. The PNG extension is added automatically. Existing names are compared without case sensitivity; duplicate names receive (2), (3), etc. The filename remains useful when browsing the library later, and the chosen name is also stored in the tile's TileMaker flags.

Uploads use Forge's augmented FilePicker when running on Forge. If saving succeeds but tile creation fails, the dialog preserves the saved path and allows another placement attempt without re-uploading. If the scene closes while uploading, the completed image stays in the library and tile placement is cancelled.

## Compatibility and validation

Intended targets: Foundry 13 (including build 348) and Foundry 14 (current stable release 14.367 at development time). System-independent; no HERO system dependency.

The manifest declares minimum 13 and maximum 14. It intentionally omits a verified version pending live testing. Forward compatibility beyond version 14 is not claimed.

Automated checks: nine passing Node tests covering geometry, transformed background coordinates, filename validation and collisions, scene-control registration, Forge picker selection, cleanup, and upload/placement retry behavior. Script syntax was checked.

Live Foundry/Forge testing has NOT been performed. The automated integration tests use mocks; they do not prove runtime pointer handling, pixel rendering, authenticated Forge uploads, or compatibility with other modules.

Before using during a session, make one triangular test cutout on your v13 world and verify:
- The preview has transparent corners.
- The named PNG appears in the Custom folder.
- The placed tile aligns with the source, including after zooming/panning.
- It can be dragged, rotated and reused.
- Cancel leaves no tile or new asset.
- A reused name gets a numbered filename.
Repeat on v14 before relying on it there.

## Scope and limits

- Captures the primary scene background, not additional v14 level textures or a composite of tiles.
- A video background is captured as a single still frame.
- Source image dimensions determine export detail, independent of zoom. Exports above 16,384 pixels on either side or 32 megapixels are rejected to limit browser memory use.
- Browser image-origin restrictions can prevent export of some external backgrounds. Such errors appear before upload.
- Filename collision checks protect normal sequential use; simultaneous uploads by multiple GMs are not an atomic reservation.

## Developer checks

Run from the workspace:

node --check tilemaker/scripts/tilemaker.js
node --test tilemaker/tests/tilemaker.test.mjs

Macro access:

game.modules.get("tilemaker").api.start();

## API references

- https://foundryvtt.com/api/v13/classes/foundry.canvas.groups.PrimaryCanvasGroup.html
- https://foundryvtt.com/api/v14/classes/foundry.canvas.groups.PrimaryCanvasGroup.html
- https://foundryvtt.com/api/v14/interfaces/foundry.SceneControlTool.html
- https://forums.forge-vtt.com/t/using-the-filepicker-to-interact-with-the-assets-library/98008
- https://foundryvtt.com/releases/

