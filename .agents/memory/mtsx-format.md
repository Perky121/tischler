---
name: .mtsx format & KB import
description: How MegaTischler .mtsx files differ from .mac, the named-element reference syntax, and the dedup pitfall when merging them into knowledge_base.json
---

# .mtsx files

- **Clean UTF-8 XML** — unlike `.mac` (latin-1 + MTSXENC XOR). No decoding needed; only XML entity unescape (`&lt;` etc.). `fixMojibake` is a safe no-op on them.
- Tree shape: `<Mtsx><Description>..</Description><NodeData xsi:type="ComplexNode"><Name>MODULE</Name><Parameters>…</Parameters><CuboidNode>…children…</CuboidNode></NodeData></Mtsx>`.
- Node tags are open-ended: ComplexNode, CuboidNode, OperationNode, SweepNode, MultiplyComplexNode, DrawerComplexNode, ProfilNode, … **Parse any tag ending in `Node` (plus `NodeData`) generically** — never hardcode the list.
- Root `NodeData`'s `<Name>` = module; each child node's `<Name>` = element (e.g. `Stranica2`). Both params and the node use `<Name>`, so flat regex is not enough — needs structural/tree parsing.
- Zip layout: the immediate parent folder of each `.mtsx` is its category (Fronte, Korpusi, Ladice, …).

## Cross-reference syntax (durable domain knowledge)

Three distinct reference kinds inside `[...]`:
1. **Global** `[X]` — no leading dot AND no element name (e.g. `[KDT]`).
2. **Level** `[.X]`, `[..X]` … up to `[......X]` — leading dots count how many levels up (1 most common; 6 seen in practice).
3. **Named element** `[Name.suf]` or `[.Path.Name.suf]` — target an element by name, then read its suffix. **`[Stranica2.T]` has NO leading dot but is NOT global** — it reads thickness of element `Stranica2` (can point at a child or sibling).

## Dedup pitfall when merging into knowledge_base.json

**`mergeInto` dedup key must include `element`** (`formula||parameter||source||element`), or distinct .mtsx elements sharing the same formula+parameter collapse and their context is lost.
**Why:** many elements reuse identical positioning formulas like `[.X]`; keying on only formula+parameter+source discarded ~half the rows (e.g. VrataElgrad.mtsx 272 → 118).
**How to apply:** the element segment is empty for `.mac` so it is backward-compatible. The .mtsx import script is idempotent (strips prior `.mtsx` sources before re-importing) so it is safe to re-run.
