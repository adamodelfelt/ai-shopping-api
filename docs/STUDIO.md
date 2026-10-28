# Whool Studio — interactive sketch

Open `/studio.html` (or `/studio` locally). The page uses ten labeled public product examples, including dots, stripes, blank tops, and disputed colors. Prices and images are reference material from the example catalogue, not a current stock claim.

The sketch keeps drafts and proposals in the current tab's memory. Switching products preserves drafts; reloading loses them. Export saved proposals as JSON before closing. No account, catalogue, search result, or external retailer is updated. The **Kodare / Granskare** selector simulates roles and is not authorization.

## Coding model

- Keep imported color and current Whool color visible alongside the image. Confirm an imported color, report an error without inventing a correction, propose a replacement, or mark it uncertain. Corrections require a reason and can include a comment.
- Separate primary color, secondary/pattern colors, color coverage, and pattern. Burgundy is a separate shade that may participate in red search. Orange and brown remain separate.
- Subjective terms have a shared definition, explicit yes/no/uncertain judgments, strength, evidence, and a comment. Unreviewed is distinct from no. Dots and stripes can support “rolig”; a brand alone is not evidence. Add a custom term to discuss another interpretation.
- Save a proposal, inspect the comparison, and approve or request another assessment using the reviewer test role. Saved revisions preserve the definitions used at that time; adding a new term does not rewrite earlier judgments. History reflects only actions performed in this tab.

The JSON export uses `whool-review-sketch/1`, with `prototype: true` and `applied: false`. It contains saved revisions and their review events, not unsaved drafts.

## Before connecting a real catalogue

Replace test roles with authenticated staff permissions and server-side validation. Store color reports, proposed corrections, reviewer decisions, original supplier values, provenance, timestamps, and definition versions separately. Apply only approved overrides, scoped to the exact product/color variant. A later import must preserve human corrections and surface conflicting supplier changes for review. Record every actual change in an append-only audit history and allow reverting a reviewed override.

Subjective scores should become explicit, explainable search signals after agreement on the vocabulary; a dotted pattern alone is not universal truth about taste. The current sketch does not send any of these judgments to search or production storage.
