// Network and file plumbing: fetch cms-hpt.txt, download an MRF to a local
// cache (outside the repo), and open it as a decompressed text stream.
//
// Downloaded files are untrusted data: they are only ever parsed, never run.

import { createHash } from "crypto";
import { once } from "events";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { mkdir, open, rename, rm, stat } from "fs/promises";
import { basename, join } from "path";
import { PassThrough, Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { createGunzip } from "zlib";
import { Unzip, UnzipInflate } from "fflate";

import { hptTxtUrl, parseHptTxt, type HptTxtEntry } from "./hpt-txt";

const USER_AGENT =
  "ClearCostCrawler/0.1 (hospital price transparency research; +https://www.clearcost.live)";

export async function discoverMrfs(
  domain: string
): Promise<{ url: string; entries: HptTxtEntry[] }> {
  const url = hptTxtUrl(domain);
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return { url, entries: parseHptTxt(await res.text()) };
}

export interface Download {
  path: string;
  bytes: number;
  fromCache: boolean;
}

/**
 * Download `url` into `cacheDir` (reused on later runs unless `refresh`).
 * Aborts once more than `maxBytes` arrive, so one huge file can't fill a disk.
 */
export async function downloadMrf(
  url: string,
  cacheDir: string,
  opts: { maxBytes: number; refresh: boolean }
): Promise<Download> {
  await mkdir(cacheDir, { recursive: true });
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
  const name = basename(new URL(url).pathname).replace(/[^\w.-]/g, "_");
  const path = join(cacheDir, `${hash}-${name}`.slice(0, 200));
  if (!opts.refresh && existsSync(path)) {
    return { path, bytes: (await stat(path)).size, fromCache: true };
  }

  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30 * 60_000),
  });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > opts.maxBytes) {
    await res.body.cancel();
    throw new Error(
      `${url}: ${(declared / 1e6).toFixed(0)} MB is over the --max-mb limit`
    );
  }

  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      if (bytes > opts.maxBytes) {
        done(new Error(`${url}: download passed the --max-mb limit`));
      } else {
        done(null, chunk);
      }
    },
  });
  const tmp = `${path}.part`;
  try {
    await pipeline(
      Readable.fromWeb(res.body as WebReadableStream),
      limit,
      createWriteStream(tmp)
    );
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  await rename(tmp, path);
  return { path, bytes, fromCache: false };
}

type Container = "plain" | "gzip" | "zip";
type MrfFormat = "json" | "csv";

async function magic(path: string): Promise<Buffer> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Stream the first .json/.csv entry of a zip archive, with backpressure. */
function unzipFirstEntry(path: string): Readable {
  const out = new PassThrough();
  let picked = false;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (picked || !/\.(json|csv)$/i.test(file.name)) return;
    picked = true;
    file.ondata = (err, data, final) => {
      if (err) return out.destroy(err);
      out.write(Buffer.from(data));
      if (final) out.end();
    };
    file.start();
  };
  (async () => {
    for await (const chunk of createReadStream(path)) {
      if (out.destroyed) return;
      unzip.push(chunk as Buffer);
      if (out.writableNeedDrain) await once(out, "drain");
    }
    unzip.push(new Uint8Array(0), true);
    if (!picked) out.destroy(new Error("zip has no .json or .csv entry"));
  })().catch((err) => out.destroy(err));
  return out;
}

/** Resolve with the stream's first chunk, put back so readers still see it. */
function peek(stream: Readable): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off("readable", onReadable);
      stream.off("end", onEnd);
      stream.off("error", reject);
    };
    const onReadable = () => {
      const chunk = stream.read() as Buffer | null;
      if (chunk === null) return;
      cleanup();
      resolve(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(null);
    };
    stream.on("readable", onReadable);
    stream.on("end", onEnd);
    stream.on("error", reject);
  });
}

/**
 * Open a downloaded MRF as a text stream (gzip and zip are unpacked on the
 * fly, a UTF-8 BOM is dropped) and tell JSON from CSV by its first byte.
 */
export async function openMrf(
  path: string
): Promise<{ stream: Readable; format: MrfFormat; container: Container }> {
  const head = await magic(path);
  let container: Container = "plain";
  let stream: Readable;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    container = "gzip";
    stream = createReadStream(path).pipe(createGunzip());
  } else if (head.toString("latin1") === "PK\u0003\u0004") {
    container = "zip";
    stream = unzipFirstEntry(path);
  } else {
    stream = createReadStream(path);
  }

  let first = await peek(stream);
  if (!first) throw new Error("MRF is empty");
  if (first[0] === 0xef && first[1] === 0xbb && first[2] === 0xbf) {
    first = first.subarray(3);
  }
  stream.unshift(first);
  const firstChar = first.toString("utf8").trimStart()[0];
  return { stream, format: firstChar === "{" ? "json" : "csv", container };
}
