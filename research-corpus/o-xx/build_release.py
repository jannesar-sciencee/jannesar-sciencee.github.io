#!/usr/bin/env python3
"""Assemble O-XX research corpus from 50 JSONL source shards (Python stdlib only)."""
from __future__ import annotations

import csv
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "release"
SHARDS = sorted(ROOT.glob("fulltext_????_????.jsonl"))
EXPECTED = 998
EXPECTED_FULL = 997
VERSION = "2026-10-31"

class ArticleText(HTMLParser):
    """Keep prose and section boundaries without rewriting the original wording."""
    SECTIONS = {"article", "h1", "h2", "h3", "h4", "p", "div", "ul", "ol",
                "li", "blockquote", "section", "pre", "table", "tr"}
    SKIP = {"script", "style", "noscript"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.fragments = []
        self.skip_depth = 0
    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip_depth += 1
        if self.skip_depth:
            return
        if tag in self.SECTIONS:
            self.fragments.append("\n")
        if tag == "li":
            self.fragments.append("- ")
        if tag == "br":
            self.fragments.append("\n")
    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
            return
        if not self.skip_depth and tag in self.SECTIONS:
            self.fragments.append("\n")
    def handle_data(self, data):
        if not self.skip_depth:
            self.fragments.append(data)
    def result(self):
        text = html.unescape("".join(self.fragments))
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = re.sub(r"[\t ]+", " ", text)
        text = re.sub(r" *\n *", "\n", text)
        return re.sub(r"\n{3,}", "\n\n", text).strip()

def sha256_string(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def main():
    if len(SHARDS) != 50:
        raise RuntimeError(f"Expected 50 JSONL source shards; found {len(SHARDS)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    clean_file = OUTPUT / "fulltext_clean.jsonl"
    checksums_file = OUTPUT / "CHECKSUMS.sha256"
    seen = set()
    rows = 0
    full = 0
    checksums = []
    with clean_file.open("w", encoding="utf-8") as clean:
        for shard in SHARDS:
            checksums.append((hashlib.sha256(shard.read_bytes()).hexdigest(), shard.name))
            for line in shard.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                source = json.loads(line)
                ident = source["id"]
                if ident in seen or not 1 <= ident <= EXPECTED:
                    raise RuntimeError(f"Duplicate/invalid ID: {ident}")
                seen.add(ident)
                rows += 1
                raw_html = source.get("article_html", "")
                is_full = source.get("extraction_status") == "fulltext_extracted"
                if is_full and not raw_html.startswith("<article"):
                    raise RuntimeError(f"Unexpected source HTML for O{ident}")
                if is_full:
                    full += 1
                    extractor = ArticleText()
                    extractor.feed(raw_html)
                    text = extractor.result()
                    if len(text) < 100:
                        raise RuntimeError(f"Suspiciously short article O{ident}")
                else:
                    text = None
                record = {
                    "id": ident,
                    "source_url": source["url"],
                    "title": source.get("title"),
                    "description": source.get("description"),
                    "author": source.get("author"),
                    "language": source.get("language", "fa"),
                    "body_text": text,
                    "source_html_sha256": sha256_string(raw_html) if raw_html else None,
                    "text_sha256": sha256_string(text) if text else None,
                    "references_and_related_links": source.get("links", []),
                    "extraction_status": source.get("extraction_status"),
                    "retrieval_date": source.get("retrieval_date"),
                }
                clean.write(json.dumps(record, ensure_ascii=False) + "\n")
    if seen != set(range(1, EXPECTED + 1)) or rows != EXPECTED:
        raise RuntimeError("IDs are not complete from O1 through O998")
    if full != EXPECTED_FULL:
        raise RuntimeError(f"Expected {EXPECTED_FULL} full texts, found {full}")
    for name in ["metadata.csv", "manifest.json", "VERIFICATION.md", "README.md", "index.html"]:
        if not (ROOT / name).exists():
            raise RuntimeError(f"Missing required file: {name}")
    checksums.append((hashlib.sha256(clean_file.read_bytes()).hexdigest(), clean_file.name))
    checksums_file.write_text(
        "\n".join(f"{checksum}  {name}" for checksum, name in checksums) + "\n",
        encoding="utf-8"
    )
    zip_path = OUTPUT / f"O-XX-Fulltext-Corpus-{VERSION}.zip"
    with ZipFile(zip_path, "w", compression=ZIP_DEFLATED, compresslevel=8) as z:
        for shard in SHARDS:
            z.write(shard, f"source/{shard.name}")
        for name in ["metadata.csv", "manifest.json", "VERIFICATION.md", "README.md", "index.html", "build_release.py"]:
            z.write(ROOT / name, name)
        z.write(clean_file, clean_file.name)
        z.write(checksums_file, checksums_file.name)
    print(json.dumps({
        "records": rows, "full_texts": full, "unavailable": rows - full,
        "zip": str(zip_path), "zip_bytes": zip_path.stat().st_size,
        "plain_text_jsonl": str(clean_file)
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
