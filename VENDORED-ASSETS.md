# Local import assets

The import screen serves executable OCR and spreadsheet code from this deployment. It does not load scripts from a CDN at runtime.

| Asset | Upstream source | Version | SHA-256 |
| --- | --- | --- | --- |
| `public/ocr/worker.min.js` | `tesseract.js/dist/worker.min.js` (npm) | 7.0.0 | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `public/ocr/tesseract-core-*.wasm.js` and matching `.wasm` | `tesseract.js-core` (npm) | 7.0.0 | See Git history for individual assets |
| `public/ocr/ara.traineddata.gz` | `@tesseract.js-data/ara/4.0.0_best_int` (jsDelivr) | 4.0.0 | `f4746c44b02342dd5b3d4f0198000f47d7c49f1a229e63e0f436c0592dcd9639` |
| `public/ocr/eng.traineddata.gz` | `@tesseract.js-data/eng/4.0.0_best_int` (jsDelivr) | 4.0.0 | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |
| `public/vendor/xlsx.full.min.js` | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` | 0.20.3 | `cc015130aa8521e7f088f88898eba949ccdcfbfb38df0bd129b44b7273c3a6f41` |

The corresponding Tesseract and SheetJS license texts are stored beside these assets. When updating an asset, update this table, its license text, and the production dependency audit.
