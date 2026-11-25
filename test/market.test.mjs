import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QWEN_REPOSITORY_URL,
  buildMarket,
  composeMarket,
  loadQwenMarket,
  selectQwenMarket
} from "../scripts/build-market.mjs";
const release = (version, extra = {}) => ({ tag_name: `v${version}`, published_at: "2026-10-18T00:00:00Z", assets: [{ name: `dsh-purge-community-${version}.tgz` }], ...extra });
const git = (args) => args[0] === "show" ? JSON.stringify({ name: "dsh-purge-community", version: args[1].split(":")[0].slice(1), dsh: { bundle: { patch: "./cordis.patch.yml" } } }) : "a".repeat(40);
test("market includes only published stable qualified bundles, pinned to complete commits", () => {
  const index = buildMarket([release("1.6.5"), release("1.6.4"), release("1.6.6", { draft: true }), release("1.6.7", { prerelease: true }), release("1.6.8", { assets: [] })], git);
  assert.equal(index.format, 1); assert.equal(index.plugins[0].versions.length, 1);
  assert.equal(index.plugins[0].versions[0].version, "1.6.5");
  assert.equal(index.plugins[0].versions[0].source.commit, "a".repeat(40));
  assert.equal(index.plugins[0].versions[0].publishTimestamp, 1792281600);
});
test("market fails rather than publishing an empty index, mismatched package or invalid commit", () => {
  assert.throws(() => buildMarket([], git), /No published/);
  assert.throws(() => buildMarket([release("1.6.5")], () => "{}"), /Invalid bundle/);
  assert.throws(() => buildMarket([release("1.6.5")], (args) => args[0] === "show" ? git(args) : "master"), /identity/);
});
test('each release uses its own declared compatibility; historical absence keeps narrow fallback',()=>{
 const read=args=>args[0]==='show'?JSON.stringify({name:'dsh-purge-community',version:args[1].split(':')[0].slice(1),dsh:{bundle:{},...(args[1].startsWith('v1.6.74:')?{compatibility:{dsh:'>=0.2.1-rc.1 <0.3.0'}}:{})}}):'b'.repeat(40);
 const versions=buildMarket([release('1.6.74'),release('1.6.5')],read).plugins[0].versions;
 assert.equal(versions.find(v=>v.version==='1.6.74').engines.dsh,'>=0.2.1-rc.1 <0.3.0');
  assert.equal(versions.find(v=>v.version==='1.6.5').engines.dsh,'>=0.2.1-rc.1 <0.2.2-0');
});

const qwenPlugin = {
  name: "dsh-qwen-studio",
  repository: { url: QWEN_REPOSITORY_URL },
  versions: [{
    version: "3.1.3",
    source: { type: "git", url: QWEN_REPOSITORY_URL, commit: "c".repeat(40) }
  }]
};
const qwenMarket = { format: 1, metadata: { updated: "now" }, plugins: [qwenPlugin] };

test("the renamed Qwen market keeps its pinned repository identity", () => {
  const selected = selectQwenMarket(qwenMarket);
  assert.equal(selected.plugin.repository.url, QWEN_REPOSITORY_URL);
  assert.equal(selected.metadata.updated, "now");
});

test("an unavailable external market is skipped without blocking local plugins", async () => {
  const warnings = [];
  const disabled = await loadQwenMarket(async () => ({ ok: false, status: 404 }), message => warnings.push(message));
  assert.equal(disabled, null);
  assert.match(warnings[0], /Qwen market skipped: HTTP 404/);

  const own = buildMarket([release("1.6.94")], git);
  const voice = { name: "dsh-breeze-voice", versions: [] };
  const h3 = { name: "dsh-h3-video", versions: [] };
  const combined = composeMarket(own, disabled, voice, h3);
  assert.deepEqual(combined.plugins.map(plugin => plugin.name), ["dsh-purge-community", "dsh-breeze-voice", "dsh-h3-video"]);
});

test("an invalid external market is skipped rather than inconsistent", async () => {
  const warnings = [];
  const invalid = structuredClone(qwenMarket);
  invalid.plugins[0].repository.url = "https://github.com/example/fork";
  const loaded = await loadQwenMarket(async () => ({ ok: true, json: async () => invalid }), message => warnings.push(message));
  assert.equal(loaded, null);
  assert.match(warnings[0], /identity or pinned sources invalid/);
});

test("the install manifest pins the package archive to its own release tag", async () => {
  const {readFile} = await import("node:fs/promises");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dsh.install.tarball,
    `https://github.com/liuma3995-dot/dsh-purge/releases/download/v${pkg.version}/${pkg.name}-${pkg.version}.tgz`);
});
