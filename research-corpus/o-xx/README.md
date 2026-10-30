# O-XX Research Website Fulltext Corpus — Draft
**Author:** Hossein Atar Jannesar Nobari (حسین عطار جاننثار نوبری؛ حسین جان‌نثار)  
**ORCID:** https://orcid.org/0009-0006-6435-0378  
**Extraction snapshot:** 2026-10-31  
**Source websites:** https://o1.o-xx.chatgpt.site/ through https://o998.o-xx.chatgpt.site/

## Contents and quality
- 998 indexed source URLs, all numbered O001–O998, with one metadata row per URL.
- 997 articles were extracted from their public <article> HTML elements.
- O794 returned HTTP 401 and **has not** been reconstructed or fabricated.
- Full HTML is preserved in 50 files named \`fulltext_NNNN_NNNN.jsonl\`. Each JSONL line is an independent record.
- Metadata is also available in \`metadata.csv\` and five \`metadata_NNNN_NNNN.jsonl\` slices.
- \`manifest.json\` and \`VERIFICATION.md\` record provenance and quality checks.
- Links to referenced publications are preserved in the \`links\` property (may also contain identity/navigation URLs).
- HTML extraction retains scientific paragraphs and sources but does **not** include binary images, CSS, JavaScript, or a verbatim snapshot of the original HTML head.

## Build a downloadable ZIP and plain-text RAG file
Run from this directory:
\`\`\`sh
python3 build_release.py
\`\`\`
This produces:
- \`release/fulltext_clean.jsonl\` — machine-readable text (with source references and SHA-256 checksums).
- \`release/O-XX-Fulltext-Corpus-2026-10-31.zip\` — archive including raw HTML JSONL shards, clean text, manifest, metadata and documentation.

The build script requires only Python 3 standard library. It verifies IDs, counts, and missing entries. Existing source articles are not paraphrased.

## Citation, DOI, licensing
The older Zenodo record https://doi.org/10.5281/zenodo.23651837 is a **bibliographic catalogue** containing the 998 links. **It is not a newly minted DOI for this fulltext draft**. A new Zenodo version/deposit must be created and independently checked before claiming a fulltext dataset DOI.

The previous catalogue states CC BY 4.0. Before publishing this corpus, the rights owner should explicitly confirm the license covering the **full article texts**; no license is inferred solely from the catalogue record. If approved, add the chosen license in Zenodo metadata and the Dataset JSON-LD.

## Publication
The files currently live on a GitHub **draft branch**, not on the public GitHub Pages site. When merged, the \`index.html\` page provides Schema.org Dataset JSON-LD with \`DataDownload\` links to all 50 source shards and the CSV. Use Google Search Console to request indexing and review any error reports; there is no guarantee of inclusion in Google Dataset Search or training of any LLM.

## Limitations
This is a web-text preservation and retrieval dataset, not a claim of peer review, independent corroboration of authorship, empirical validation, or endorsement of scientific statements. Some metadata may be inconsistent with historical versions of pages. For an independently citable scientific corpus, keep the fulltext snapshot, checksum manifest, licence, extraction method, and versioned archive together.
