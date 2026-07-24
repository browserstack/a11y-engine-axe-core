# Reading visual content (images & Figma)

PRDs frequently put load-bearing detail — UI layouts, user flows, state machines, error states, even acceptance criteria — inside **embedded images** or **Figma frames** rather than prose. Treating those as opaque gaps under-reviews the PRD. This procedure tells you to *retrieve and read* that content before scoring, and to flag a gap only when retrieval genuinely fails or the spec exists *only* in the visual.

Run this during **Phase 2 (first read)**, after the text pass and before scoring.

## Step 1 — Inventory the visual references

Scan the fetched PRD body for:

- **Embedded images** — `<img>` tags, attachment/media macros, `blob:`/`media.*`/attachment URLs, "as shown below", "see diagram", screenshot thumbnails.
- **Figma links** — any `figma.com/file/...`, `figma.com/design/...`, `figma.com/proto/...` URL, or "see Figma", "prototype", "design link".

Classify each as **load-bearing** (it carries spec content — a flow, states, layout, copy, acceptance criteria, a decision table) or **decorative** (logo, banner, vibe shot). Only retrieve load-bearing visuals — this keeps the review focused and avoids wasted tokens.

## Step 2 — Read embedded images (multimodal)

For each load-bearing image:

1. **Get the actual pixels, not the URL.** A `blob:`/media reference in the page body is not readable. Resolve it to a real image:
   - Confluence: fetch the page's attachments / download the media, or open the page in a browser (Playwright MCP) and screenshot the figure.
   - Local/file PRDs: read the image file directly.
2. **View it** with the Read tool (it renders images visually) and extract everything review-relevant: text in the image, the flow/steps it depicts, states shown, fields/controls, and any numbers or thresholds.
3. **Score that content** as if it were prose — it counts toward Completeness, Clarity, Edge Cases, etc.

Do **not** guess what an image "probably" shows. If you retrieved it, review what you actually see; if you couldn't, that becomes a finding (Step 4).

## Step 3 — Resolve Figma via MCP

1. **Find the tool.** Use ToolSearch with query `figma` to load whatever Figma MCP tools are connected (e.g. file/node/frame fetchers). Authenticate if the MCP requires it.
2. **Fetch the referenced node/frame** (the link usually carries a `node-id`). Extract the same review-relevant content: screens, flow order, states, component labels, annotations, and any redlines/specs.
3. **Fallbacks, in order:**
   - No Figma MCP available → open the Figma link in a browser (Playwright MCP) and read/screenshot it.
   - Link requires access you don't have, or neither tool is available → flag as a gap (Step 4). Do not fabricate the design.

## Step 4 — When a gap is still a finding

Reading the visual does **not** dissolve every concern. Raise a finding when:

- **Unretrievable** — the image/Figma can't be fetched (permission, link rot, auth, unreadable). Severity scales with how core the content is: a blocked design for a core flow is **P0/P1**; a missing decorative asset is not a finding.
- **Spec lives *only* in the visual** — the requirement is shown in the image/Figma but never stated in text. This is a real defect: a developer or QA reading the document cannot act on a picture alone, and Figma frames drift from the written spec. Flag as **P1** (Clarity/Completeness) with the fix "restate the behavior in prose; keep the visual as the reference, not the source of truth."
- **Visual contradicts the text** — e.g. the prose says 3 states, the mockup shows 4. Flag as **P0/P1** (Logic & Consistency).

## Output hygiene

- **Cite what you saw.** When a finding rests on a visual, say so: "the Figma flow (frame *Checkout-error*) shows a retry state the text never mentions."
- **Don't over-read low-fidelity images.** If an image is too small/blurry to read confidently, say that and treat it as unretrievable rather than inventing detail.
- **Note coverage in the report.** In the executive summary, state which visuals were read and which couldn't be, so the author knows the review actually accounted for the design.
