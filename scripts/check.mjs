import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), `배포 폴더의 심볼릭 링크: ${path}`);
    if (entry.isDirectory()) await collect(path);
    else files.push(path);
  }
}
await collect(root);

let checkedReferences = 0;
async function checkReference(reference, from) {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(reference)) return;
  assert(
    !reference.startsWith("/"),
    `${relative(root, from)}: 하위 경로 배포를 깨는 절대 경로 ${reference}`,
  );
  const pathname = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!pathname) return;
  const target = resolve(dirname(from), pathname);
  const local = relative(root, target);
  assert(
    local !== ".." && !local.startsWith(`..${sep}`),
    `${reference}: 배포 폴더 밖 파일`,
  );
  const result = await stat(target).catch(() => null);
  assert(result, `${relative(root, from)}: 로컬 파일 누락 ${reference}`);
  if (result.isDirectory()) {
    assert(
      await stat(resolve(target, "index.html")).catch(() => null),
      `${reference}: index.html 누락`,
    );
  }
  checkedReferences++;
}

for (const file of files) {
  const extension = extname(file);
  if (![".html", ".css", ".js", ".mjs"].includes(extension)) continue;
  const source = await readFile(file, "utf8");
  if ([".js", ".mjs"].includes(extension)) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    assert.equal(
      result.status,
      0,
      `${relative(root, file)} 문법 오류\n${result.stderr}`,
    );
    // Static relative imports and literal fetches are the app's local module/data boundary.
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\bfetch\s*\(\s*)['"](\.[^'"]+)['"]/g,
    )) {
      await checkReference(match[1], file);
    }
  } else if (extension === ".html") {
    for (const match of source.matchAll(
      /\b(?:src|href)\s*=\s*['"]([^'"]*)['"]/g,
    )) {
      await checkReference(match[1], file);
    }
  } else {
    for (const match of source.matchAll(
      /url\(\s*['"]?([^\s'"()]+)['"]?\s*\)/g,
    )) {
      await checkReference(match[1], file);
    }
  }
}

const catalog = JSON.parse(
  await readFile(resolve(root, "catalog.json"), "utf8"),
);
assert(
  Array.isArray(catalog.rooms) && catalog.rooms.length > 0,
  "상영관 목록 누락",
);
assert(
  catalog.sources && typeof catalog.sources === "object",
  "출처 목록 누락",
);
const sourceIds = new Set(Object.keys(catalog.sources));
const roomIds = new Set();
const isWebURL = (value) => {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

for (const [id, source] of Object.entries(catalog.sources)) {
  assert(isWebURL(source.url), `${id}: 올바르지 않은 출처 URL`);
}

function checkSources(value, path) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkSources(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (["sources", "info_sources"].includes(key) && Array.isArray(child)) {
      for (const id of child) {
        assert(
          sourceIds.has(id) || isWebURL(id),
          `${path}: 찾을 수 없는 출처 ${id}`,
        );
      }
    } else checkSources(child, `${path}.${key}`);
  }
}

for (const room of catalog.rooms) {
  assert(
    typeof room.id === "string" && room.id && !roomIds.has(room.id),
    `상영관 ID 누락 또는 중복: ${room.id}`,
  );
  roomIds.add(room.id);
  for (const key of ["name", "region", "format", "status"]) {
    assert(
      typeof room[key] === "string" && room[key].trim(),
      `${room.id}: ${key} 누락`,
    );
  }
  for (const key of ["capacity", "row_count"]) {
    const value = room[key]?.value;
    assert(
      value == null || (Number.isInteger(value) && value > 0),
      `${room.id}: 잘못된 ${key}`,
    );
  }
  const dimensions = room.screen_m?.value;
  assert(
    dimensions == null ||
      (Array.isArray(dimensions) &&
        dimensions.length === 2 &&
        dimensions.every((n) => Number.isFinite(n) && n > 0)),
    `${room.id}: 잘못된 스크린 크기`,
  );
  checkSources(room, room.id);

  const map = room.seat_map?.value;
  if (map?.rows) {
    assert(
      Array.isArray(map.rows) && map.rows.length > 0,
      `${room.id}: 빈 좌석 배치`,
    );
    let count = 0;
    for (const row of map.rows) {
      const columns = row.occupied_grid_columns_zero_based;
      assert(Array.isArray(columns), `${room.id}: 좌석 열 누락`);
      assert.equal(
        columns.length,
        row.count,
        `${room.id}: 행별 좌석 수 불일치`,
      );
      assert.equal(
        new Set(columns).size,
        columns.length,
        `${room.id}: 중복된 좌석 위치`,
      );
      assert(
        columns.every((n) => Number.isInteger(n) && n >= 0),
        `${room.id}: 올바르지 않은 좌석 위치`,
      );
      count += columns.length;
    }
    if (map.capacity != null)
      assert.equal(
        count,
        map.capacity,
        `${room.id}: 관찰한 좌석 배치의 총합 불일치`,
      );
  }
}

console.log(
  `검증 통과: 정적 파일 ${files.length}개, 로컬 참조 ${checkedReferences}개, 상영관 ${roomIds.size}개, 출처 ${sourceIds.size}개`,
);
