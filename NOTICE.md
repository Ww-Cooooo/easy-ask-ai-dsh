# Third-party notices

The plugin's original code is MIT licensed; see LICENSE. Bundled third-party code and fonts retain their own licenses. A dependency being used during the build does not remove the license obligations of code included in the output.

- Easy Ask AI Prompt Ready / Get Clear methodology: [original MIT-licensed repository](https://github.com/Ww-Cooooo/easy-ask-ai), source revision `663044f3ff78768d373ca7898297aa0c49b30b06`; its license is retained in [licenses/upstream/easy-ask-ai-LICENSE](licenses/upstream/easy-ask-ai-LICENSE). The runtime adapter implements its source/clarification/report/acceptance boundaries; it does not redistribute the developer's personal Skills or global instructions.
- DeepSeek Harness uses its installed React/Cordis runtime and official plugin APIs. Host SDK dependencies are external to the bundles.
- Ant Design and Ant Design Icons: MIT; AntV G6 and its included dependencies: license details in the inventory.
- Fabric.js, Lenis and react-markdown: MIT. GSAP and `@gsap/react`: [GSAP Standard License](https://gsap.com/community/standard-license/), not MIT. They animate this requirements interface; this plugin is not a visual animation authoring tool. Original bundled proprietary notices remain present.
- Noto Sans SC Variable: SIL Open Font License 1.1. Original font files are embedded locally without modification; no font service is needed at runtime. Fontsource packaging and font license texts are retained separately in the inventory.

[licenses/index.json](licenses/index.json) records the exact versions, declared licenses and text files for packages actually included by the bundler. Files copied from installed packages retain their original notices. [licenses/upstream/sources.json](licenses/upstream/sources.json) records supplemental texts and provenance.

The published `@antv/algorithm`, `@antv/event-emitter` and `@antv/g-lite` packages declare MIT but omit a standalone license file. Their actual package attribution metadata and the standard MIT permission/warranty terms are included; this is explicitly recorded rather than inventing a missing copyright statement. GSAP terms and the two other missing texts were retrieved from the official upstream sources on 2026-11-09.

Public UI examples were inspected for design ideas. No demonstration code, gallery images or unlicensed assets from those sites are included.
