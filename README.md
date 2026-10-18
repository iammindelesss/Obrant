# FilamentFlow

A free 3D-printing cost calculator. Enter filament, electricity and other costs, set a markup, and see the production cost, suggested selling price, gross profit and profit margin. It runs entirely in your browser: no backend, no account, no data uploaded.

**Not built yet:** saved profiles, multiple materials or printers, job history, downloadable quotes and CAD-file analysis. A CAD model's volume cannot give accurate filament use or print time (that depends on slicer settings), so version 1 uses figures from your slicer.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and form |
| `style.css` | All styling |
| `script.js` | Calculation functions (top) and page wiring (bottom) |

## Run locally

Double-click `index.html`. It opens in your browser and needs no server or install.

## Upload to GitHub

1. Create a free account at github.com and sign in.
2. Click **New repository**. Name it (for example `filamentflow`), keep it **Public**, and click **Create repository**.
3. On the empty repository page, click **uploading an existing file**.
4. Drag in `index.html`, `style.css`, `script.js` and `README.md` (the files themselves, not the folder).
5. Click **Commit changes**.

## Enable GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**, then click **Save**.
4. Wait a minute or two. The page shows your address: `https://YOUR-USERNAME.github.io/filamentflow/`.

## Update the site after changes

1. Edit the files on your computer and check them locally.
2. In the repository, click **Add file → Upload files**, drag in the changed files (same names replace the old ones), and click **Commit changes**.
3. Wait a minute or two, then hard-refresh the site (Ctrl+Shift+R, or Cmd+Shift+R on Mac).

## Formulas

- Cost per gram = spool price ÷ spool weight
- Filament cost = cost per gram × grams used
- Waste allowance = filament cost × allowance %
- Electricity = (watts ÷ 1000) × hours × price per kWh
- Total cost = filament + waste + electricity + maintenance + packaging + other
- Selling price = total cost × (1 + markup ÷ 100)
- Gross profit = selling price − total cost
- Margin = gross profit ÷ selling price × 100

Markup and margin are different: a 100% markup gives a 50% margin.

## Extending the code

The calculation functions at the top of `script.js` do not touch the page, so you can reuse them for saved profiles, quotes or other features. Saved inputs use the `localStorage` key `filamentflow.v1`.
