import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
await build({
  entryPoints: ["src/presence-crypto.js"],
  bundle: true,
  format: "esm",
  target: ["safari16.4", "chrome110"],
  minify: true,
  legalComments: "eof",
  outfile: "dist/vendor/presence-crypto.js",
});
const name = "@noble/secp256k1";
const pkg = JSON.parse(
  await readFile(`node_modules/${name}/package.json`, "utf8"),
);
const license = await readFile(`node_modules/${name}/LICENSE`, "utf8");
await writeFile(
  "dist/vendor/realtime-LICENSE.txt",
  `${name} ${pkg.version}\nhttps://github.com/paulmillr/noble-secp256k1\n\n${license}`,
);
console.log("실시간 접속 라이브러리 빌드 완료");
