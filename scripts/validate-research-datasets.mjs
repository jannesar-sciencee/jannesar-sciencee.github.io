import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const base = "https://jannesar-sciencee.github.io";
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
function ensure(test, message) {
  if (!test) throw new Error(message);
}
function checkDataset(slug, count, expectedSourceUrl) {
  const folder = "datasets/" + slug + "-site-metadata";
  const body = read(folder + "/" + slug + "-" + count + "-metadata.jsonl");
  const records = body.trimEnd().split("\n").map((line) => JSON.parse(line));
  ensure(records.length === count, slug + ": wrong JSONL record count");
  const ids = new Set();
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const expectedId = slug === "o-xx" ? index + 1 : index;
    ensure(record.id === expectedId, slug + ": nonconsecutive IDs");
    ensure(!ids.has(record.id), slug + ": duplicate ID");
    ids.add(record.id);
    ensure(record.source_url === expectedSourceUrl(expectedId), slug + ": incorrect source URL");
    ensure(typeof record.title === "string" && record.title.trim(), slug + ": empty title");
    ensure(typeof record.title_evidence === "string" && record.title_evidence.trim(), slug + ": missing provenance");
  }
  const csvLines = read(folder + "/" + slug + "-" + count + "-metadata.csv").trimEnd().split("\n");
  ensure(csvLines.length === count + 1, slug + ": CSV row count");
  ensure(csvLines[0] === "id,source_url,title,title_evidence", slug + ": CSV header");
  const html = read(folder + "/index.html");
  const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  ensure(scriptMatch, slug + ": missing JSON-LD");
  const json = JSON.parse(scriptMatch[1]);
  const nodes = json["@graph"] || [json];
  const dataset = nodes.find((node) => node["@type"] === "Dataset");
  ensure(dataset, slug + ": not marked Dataset");
  ensure(dataset.name && dataset.description.length >= 50, slug + ": incomplete metadata");
  ensure(dataset.distribution && dataset.distribution.length === 2, slug + ": missing downloads");
  for (const dist of dataset.distribution) {
    ensure(dist.contentUrl && dist.contentUrl.startsWith(base + "/" + folder + "/"), slug + ": wrong data download");
    ensure(dist["@type"] === "DataDownload", slug + ": wrong distribution type");
  }
  ensure(html.includes('rel="canonical"'), slug + ": missing canonical");
  const sitemap = read("sitemap-datasets.xml");
  ensure(sitemap.includes(base + "/" + folder + "/"), slug + ": missing dataset sitemap URL");
  console.log("OK:", slug, count, "unique, documented records.");
}

checkDataset("o-xx", 998, (id) => "https://o" + id + ".o-xx.chatgpt.site/");
checkDataset("x-oo", 820, (id) => "https://o" + String(id).padStart(3, "0") + ".x-oo.chatgpt.site/");
ensure(read("robots.txt").includes("sitemap-datasets.xml"), "dataset sitemap not announced");
ensure(read("llms.txt").includes("/datasets/o-xx-site-metadata/"), "O-XX absent from llms");
ensure(read("llms.txt").includes("/datasets/x-oo-site-metadata/"), "X-OO absent from llms");
console.log("All research metadata discovery checks passed.");
