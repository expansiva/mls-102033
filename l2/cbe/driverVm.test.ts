/// <mls fileReference="_102033_/l2/cbe/driverVm.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const MAX_BODY = 2 * 1024 * 1024;

class DriverIOBase {}
(globalThis as { mls: unknown }).mls = {
  istrace: false,
  stor: { others: { DriverIOBase } },
};

async function loadDriver(): Promise<typeof import('/_102033_/l2/cbe/driverVm.js').DriverVm> {
  const loaded = await import('/_102033_/l2/cbe/driverVm.js');
  return loaded.DriverVm;
}

interface IPostedFile {
  shortPath: string;
  content?: string;
  encoding?: string;
  uploadId?: string;
  sha256?: string;
}

interface IPostedBody {
  action?: string;
  files?: IPostedFile[];
  deletes?: string[];
  uploadId?: string;
  index?: number;
  total?: number;
  data?: string;
}

function fileOf(shortName: string, content: string, status = 'changed', extension = '.ts'): mls.stor.IFileInfo {
  return {
    project: 102047,
    level: 2,
    folder: 'm',
    shortName,
    extension,
    status,
    inLocalStorage: true,
    getContent: async () => content,
  } as mls.stor.IFileInfo;
}

/** High-entropy ASCII. Gzip of this stays near the original size, so base64 still exceeds 2 MB. */
function incompressibleText(bytes: number): string {
  const chunk = 8192;
  let out = '';
  let seed = 0x9e3779b9;
  while (out.length < bytes) {
    let part = '';
    const count = Math.min(chunk, bytes - out.length);
    for (let index = 0; index < count; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      part += String.fromCharCode(32 + (seed % 95));
    }
    out += part;
  }
  return out;
}

async function decodeGzipBase64(encoded: string): Promise<string> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const stream = new DecompressionStream('gzip');
  const done = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const plain = new Uint8Array(await done);
  return new TextDecoder().decode(plain);
}

function posted(body: string): IPostedBody {
  return JSON.parse(body) as IPostedBody;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** JSON of `bytes` whose payload does not repeat, so gzip stays near the original size. */
function incompressibleJson(bytes: number): string {
  const prefix = '{"blob":"';
  const suffix = '"}';
  const innerLen = bytes - prefix.length - suffix.length;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const raw = Buffer.allocUnsafe(innerLen);
  let seed = 0x9e3779b9;
  for (let index = 0; index < innerLen; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    raw[index] = alphabet.charCodeAt(seed % alphabet.length);
  }
  return prefix + raw.toString('latin1') + suffix;
}

const MAX_UPLOAD_CHARS = Math.ceil((64 * 1024 * 1024 * 4) / 3);

function withFetch(
  handler: (body: string, call: number) => Response | Promise<Response>,
): { bodies: string[]; restore: () => void } {
  const bodies: string[] = [];
  const previous = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    call += 1;
    const body = String(init?.body ?? '');
    bodies.push(body);
    return handler(body, call);
  }) as typeof fetch;
  return {
    bodies,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

function okResponse(): Response {
  return { ok: true, status: 200, json: async () => ({ statusCode: 200 }) } as Response;
}

test('st51: 457 arquivos de ~5 KB saem em lotes, todos de até 2 MB', async () => {
  const content = 'a'.repeat(5 * 1024);
  const files = Array.from({ length: 457 }, (_, index) => fileOf(`f${index}`, content));
  files.push(fileOf('gone', '', 'deleted'));
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, 'save');
    assert.equal(saved, true);
    assert.ok(fetchMock.bodies.length > 1, 'um pedido só não cabe');
    const seen = new Set<string>();
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      for (const file of payload.files) {
        assert.equal(seen.has(file.shortPath), false, file.shortPath);
        seen.add(file.shortPath);
        assert.equal(file.content.length, 5 * 1024);
      }
      if (index === 0) assert.deepEqual(payload.deletes, ['l2/m/gone.ts']);
      else assert.deepEqual(payload.deletes, []);
    });
    assert.equal(seen.size, 457);
  } finally {
    fetchMock.restore();
  }
});

test('st54: arquivo repetido acima do teto sai gzip-base64 junto dos pequenos', async () => {
  const big = 'b'.repeat((5 * 1024 * 1024) / 2);
  const files = [
    fileOf('before', 'x'),
    fileOf('huge', big),
    fileOf('after', 'y'),
  ];
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, null);
    assert.equal(saved, true);
    const seen = new Map<string, IPostedFile>();
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      for (const file of posted(body).files) seen.set(file.shortPath, file);
    });
    assert.equal(seen.get('l2/m/before.ts')?.content, 'x');
    assert.equal(seen.get('l2/m/before.ts')?.encoding, 'utf8');
    assert.equal(seen.get('l2/m/after.ts')?.content, 'y');
    const huge = seen.get('l2/m/huge.ts');
    assert.equal(huge?.encoding, 'gzip-base64');
    assert.ok(huge && huge.content.length < big.length);
    assert.equal(await decodeGzipBase64(huge.content), big);
  } finally {
    fetchMock.restore();
  }
});

test('st54: arquivo que continua acima de 2 MB depois do gzip sai em partes, no setContents só dele', async () => {
  const big = incompressibleText(3 * 1024 * 1024);
  const files = [
    fileOf('before', 'x'),
    fileOf('huge', big),
    fileOf('after', 'y'),
  ];
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, 'save');
    assert.equal(saved, true);
    const parts: IPostedBody[] = [];
    const saves: IPostedBody[] = [];
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      if (payload.action === 'setContentsPart') parts.push(payload);
      else saves.push(payload);
    });
    assert.ok(parts.length > 1);
    const bigSaves = saves.filter((body) => body.files?.some((file) => file.uploadId));
    assert.equal(bigSaves.length, 1);
    assert.equal(bigSaves[0].files?.length, 1);
    const huge = bigSaves[0].files?.[0];
    assert.equal(huge?.shortPath, 'l2/m/huge.ts');
    assert.equal(huge?.encoding, 'gzip-base64');
    assert.equal(huge?.content, undefined);
    assert.equal(huge?.sha256, sha256Hex(big));
    const ordered = parts.filter((part) => part.uploadId === huge?.uploadId);
    assert.equal(ordered.length, parts.length);
    assert.deepEqual(ordered.map((part) => part.index), ordered.map((_, index) => index));
    assert.ok(ordered.every((part) => part.total === ordered.length));
    const joined = ordered.map((part) => part.data ?? '').join('');
    assert.equal(await decodeGzipBase64(joined), big);
    const small = saves.filter((body) => body !== bigSaves[0]);
    const seen = new Set<string>();
    for (const body of small) {
      assert.equal(body.files?.some((file) => file.uploadId), false);
      for (const file of body.files ?? []) seen.add(file.shortPath);
    }
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
  } finally {
    fetchMock.restore();
  }
});

test('st54: parte recusada não grava o arquivo grande e os pequenos seguem', async () => {
  const big = incompressibleText(3 * 1024 * 1024);
  const files = [
    fileOf('before', 'x'),
    fileOf('huge', big),
    fileOf('after', 'y'),
  ];
  const fetchMock = withFetch((body) => {
    if (posted(body).action === 'setContentsPart') {
      return { ok: false, status: 400, json: async () => ({ statusCode: 400, msg: 'upload test: unknown' }) } as Response;
    }
    return okResponse();
  });
  try {
    const DriverVm = await loadDriver();
    await assert.rejects(
      () => new DriverVm().setContents(102047, files, null),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /l2\/m\/huge\.ts/);
        assert.match(err.message, /unknown/);
        return true;
      },
    );
    const seen = new Set<string>();
    let uploadSave = 0;
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      if (payload.files?.some((file) => file.uploadId)) uploadSave += 1;
      for (const file of payload.files ?? []) seen.add(file.shortPath);
    });
    assert.equal(uploadSave, 0);
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
  } finally {
    fetchMock.restore();
  }
});

test('st54: um JSON de 64 MB pouco repetitivo sai em partes de até 2 MB, no setContents só dele', { timeout: 180_000 }, async () => {
  const json = incompressibleJson(64 * 1024 * 1024);
  assert.equal(new TextEncoder().encode(json).length, 64 * 1024 * 1024);
  const files = [
    fileOf('before', 'x'),
    fileOf('undo', json, 'changed', '.json'),
    fileOf('after', 'y'),
  ];
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, 'save');
    assert.equal(saved, true);
    const parts: IPostedBody[] = [];
    const saves: IPostedBody[] = [];
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      if (payload.action === 'setContentsPart') parts.push(payload);
      else saves.push(payload);
    });
    const joined = parts.map((part) => part.data ?? '').join('');
    assert.ok(joined.length > MAX_BODY);
    assert.ok(joined.length <= MAX_UPLOAD_CHARS, `texto das partes tem ${joined.length} caracteres`);
    const bigSaves = saves.filter((body) => body.files?.some((file) => file.uploadId));
    assert.equal(bigSaves.length, 1);
    assert.equal(bigSaves[0].files?.length, 1);
    const undo = bigSaves[0].files?.[0];
    assert.equal(undo?.shortPath, 'l2/m/undo.json');
    assert.equal(undo?.sha256, sha256Hex(json));
    assert.equal(undo?.content, undefined);
    const text = undo?.encoding === 'gzip-base64' ? await decodeGzipBase64(joined) : joined;
    assert.equal(text, json);
    const seen = new Set<string>();
    for (const body of saves) {
      if (body === bigSaves[0]) continue;
      assert.equal(body.files?.some((file) => file.uploadId), false);
      for (const file of body.files ?? []) seen.add(file.shortPath);
    }
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
  } finally {
    fetchMock.restore();
  }
});

test('st54: acima de 64 MB a recusa traz o motivo e os outros saem', async () => {
  const big = `{"blob":"${'x'.repeat(64 * 1024 * 1024)}"}`;
  assert.ok(new TextEncoder().encode(big).length > 64 * 1024 * 1024);
  const files = [
    fileOf('before', 'x'),
    fileOf('huge', big, 'changed', '.json'),
    fileOf('after', 'y'),
  ];
  const errors: unknown[][] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    await assert.rejects(
      () => new DriverVm().setContents(102047, files, null),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err instanceof Error);
        assert.match(err.message, /^setContents: file exceeds the 67108864 byte limit: l2\/m\/huge\.json \(\d+ bytes\)$/);
        return true;
      },
    );
    const seen = new Set<string>();
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      assert.equal(payload.action === 'setContentsPart', false);
      assert.equal(payload.files?.some((file) => file.shortPath === 'l2/m/huge.json'), false);
      for (const file of payload.files ?? []) seen.add(file.shortPath);
    });
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
    const logged = errors.map((args) => args.join(' ')).join('\n');
    assert.match(logged, /setContents: file exceeds the 67108864 byte limit: l2\/m\/huge\.json \(\d+ bytes\)/);
  } finally {
    console.error = previousError;
    fetchMock.restore();
  }
});

test('st54: um JSON de 12 MB vai gzip-base64 num pedido de até 2 MB e a volta é igual', async () => {
  const row = JSON.stringify({ id: 0, name: 'task', status: 'done', note: 'x'.repeat(32) });
  const target = 12 * 1024 * 1024;
  const count = Math.ceil(target / (row.length + 1));
  const json = `[${new Array(count).fill(row).join(',')}]`;
  assert.ok(new TextEncoder().encode(json).length >= target);
  const files = [fileOf('small', 'export const n = 1;\n'), fileOf('undo', json, 'changed', '.json')];
  const fetchMock = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, 'save');
    assert.equal(saved, true);
    assert.equal(fetchMock.bodies.length, 1);
    const body = fetchMock.bodies[0];
    const bytes = new TextEncoder().encode(body).length;
    assert.ok(bytes <= MAX_BODY, `pedido tem ${bytes} bytes`);
    const payload = posted(body);
    const small = payload.files.find((file) => file.shortPath === 'l2/m/small.ts');
    const undo = payload.files.find((file) => file.shortPath === 'l2/m/undo.json');
    assert.equal(small?.encoding, 'utf8');
    assert.equal(small?.content, 'export const n = 1;\n');
    assert.ok(undo);
    assert.equal(undo.encoding, 'gzip-base64');
    assert.ok(undo.content.length < json.length);
    assert.equal(await decodeGzipBase64(undo.content), json);
  } finally {
    fetchMock.restore();
  }
});

interface IUploadNotice {
  project: number;
  shortPath: string;
  part: number;
  total: number;
  done: boolean;
  failed?: boolean;
}

/** Same sentence the draft panel matches, then each `path (bytes bytes)`. */
const OVERSIZED_SAVE = /^setContents: file exceeds the (\d+) byte limit: (.*)$/;

function withUploadWindow(): { events: IUploadNotice[]; restore: () => void } {
  const events: IUploadNotice[] = [];
  const host = globalThis as { window?: { dispatchEvent: (event: CustomEvent<IUploadNotice>) => boolean } };
  const previous = host.window;
  host.window = {
    dispatchEvent(event: CustomEvent<IUploadNotice>): boolean {
      events.push({ ...event.detail });
      return true;
    },
  };
  return {
    events,
    restore() {
      if (previous === undefined) delete host.window;
      else host.window = previous;
    },
  };
}

test('st54: cada parte avisa o painel; teto e parte recusada saem no mesmo Error', { timeout: 120_000 }, async () => {
  const wide = incompressibleText(3 * 1024 * 1024);
  const windowMock = withUploadWindow();
  try {
  const sent = withFetch(() => okResponse());
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, [fileOf('huge', wide)], 'save');
    assert.equal(saved, true);
    const partCount = sent.bodies.filter((body) => posted(body).action === 'setContentsPart').length;
    assert.ok(partCount > 1);
    assert.equal(windowMock.events.length, partCount + 1);
    windowMock.events.forEach((event, index) => {
      const last = index === partCount;
      assert.equal(event.project, 102047);
      assert.equal(event.shortPath, 'l2/m/huge.ts');
      assert.equal(event.total, partCount);
      assert.equal(event.part, last ? partCount : index + 1);
      assert.equal(event.done, last);
      assert.equal(event.failed, undefined);
    });
  } finally {
    sent.restore();
  }

  const over = `{"blob":"${'x'.repeat(64 * 1024 * 1024)}"}`;
  windowMock.events.length = 0;
  let refusedPart = false;
  const refused = withFetch((body) => {
    const payload = posted(body);
    if (payload.action === 'setContentsPart' && !refusedPart && (payload.index ?? 0) >= 1) {
      refusedPart = true;
      return { ok: false, status: 400, json: async () => ({ statusCode: 400, msg: 'missing part 2' }) } as Response;
    }
    return okResponse();
  });
  try {
    const DriverVm = await loadDriver();
    await assert.rejects(
      () => new DriverVm().setContents(102047, [
        fileOf('before', 'x'),
        fileOf('hugeA', over, 'changed', '.json'),
        fileOf('hugeB', over, 'changed', '.json'),
        fileOf('wide', wide),
        fileOf('after', 'y'),
      ], null),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        const phrases = err.message.split('; ');
        const ceiling = phrases[0] ?? '';
        const match = OVERSIZED_SAVE.exec(ceiling);
        assert.ok(match?.[1] && match[2]);
        assert.equal(match[1], '67108864');
        const files: { path: string; bytes: number }[] = [];
        for (const piece of match[2].split(', ')) {
          const file = /^(.*) \((\d+) bytes\)$/.exec(piece);
          assert.ok(file?.[1] && file[2]);
          files.push({ path: file[1], bytes: Number(file[2]) });
        }
        assert.deepEqual(files.map((file) => file.path), ['l2/m/hugeA.json', 'l2/m/hugeB.json']);
        assert.ok(files.every((file) => file.bytes > 64 * 1024 * 1024));
        assert.match(phrases.slice(1).join('; '), /l2\/m\/wide\.ts part \d+\/\d+ refused: .*missing part 2/);
        return true;
      },
    );
    const wideEvents = windowMock.events.filter((event) => event.shortPath === 'l2/m/wide.ts');
    assert.ok(wideEvents.length >= 2);
    assert.equal(wideEvents[0].part, 1);
    assert.equal(wideEvents[0].done, false);
    assert.equal(wideEvents[0].failed, undefined);
    const failed = wideEvents[wideEvents.length - 1];
    assert.equal(failed.part, 2);
    assert.equal(failed.total, wideEvents[0].total);
    assert.equal(failed.done, true);
    assert.equal(failed.failed, true);
    assert.equal(windowMock.events.some((event) => event.shortPath !== 'l2/m/wide.ts'), false);
    const seen = new Set<string>();
    for (const body of refused.bodies) {
      const payload = posted(body);
      if (payload.files?.some((file) => file.uploadId)) assert.fail('setContents do arquivo grande não devia sair');
      for (const file of payload.files ?? []) seen.add(file.shortPath);
    }
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
  } finally {
    refused.restore();
  }
  } finally {
    windowMock.restore();
  }
});

test('st49: falha no 2º lote devolve falso e o 2º lote em diante fica pendente', async () => {
  const content = 'c'.repeat(1024 * 1024);
  const files = [fileOf('a', content), fileOf('b', content), fileOf('c', content)];
  const errors: unknown[][] = [];
  const previousError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  const fetchMock = withFetch((_body, call) => {
    if (call === 2) return { ok: false, status: 413, json: async () => ({}) } as Response;
    return okResponse();
  });
  try {
    const DriverVm = await loadDriver();
    const saved = await new DriverVm().setContents(102047, files, null);
    assert.equal(saved, false);
    assert.equal(fetchMock.bodies.length, 2, 'parou no lote que falhou');
    const sent = new Set(posted(fetchMock.bodies[0]).files.map((file) => file.shortPath));
    const pending = ['l2/m/a.ts', 'l2/m/b.ts', 'l2/m/c.ts'].filter((path) => !sent.has(path));
    assert.deepEqual(pending, ['l2/m/b.ts', 'l2/m/c.ts']);
    assert.equal(posted(fetchMock.bodies[1]).files[0]?.shortPath, 'l2/m/b.ts');
    assert.match(errors.map((args) => args.join(' ')).join('\n'), /413/);
  } finally {
    console.error = previousError;
    fetchMock.restore();
  }
});
