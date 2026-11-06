/// <mls fileReference="_102033_/l2/cbe/driverVm.test.ts" enhancement="_blank" />
import assert from 'node:assert/strict';
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

interface IPostedBody {
  files: { shortPath: string; content: string }[];
  deletes: string[];
}

function fileOf(shortName: string, content: string, status = 'changed'): mls.stor.IFileInfo {
  return {
    project: 102047,
    level: 2,
    folder: 'm',
    shortName,
    extension: '.ts',
    status,
    inLocalStorage: true,
    getContent: async () => content,
  } as mls.stor.IFileInfo;
}

function posted(body: string): IPostedBody {
  return JSON.parse(body) as IPostedBody;
}

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

test('st51: um arquivo de 2,5 MB não sai, os outros saem, e a falha traz o caminho', async () => {
  const big = 'b'.repeat((5 * 1024 * 1024) / 2);
  const files = [
    fileOf('before', 'x'),
    fileOf('huge', big),
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
        assert.match(err.message, /l2\/m\/huge\.ts/);
        return true;
      },
    );
    assert.ok(fetchMock.bodies.length >= 1);
    const seen = new Set<string>();
    fetchMock.bodies.forEach((body, index) => {
      const bytes = new TextEncoder().encode(body).length;
      assert.ok(bytes <= MAX_BODY, `pedido ${index + 1} tem ${bytes} bytes`);
      const payload = posted(body);
      assert.equal(payload.files.some((file) => file.shortPath === 'l2/m/huge.ts'), false);
      for (const file of payload.files) seen.add(file.shortPath);
    });
    assert.deepEqual([...seen].sort(), ['l2/m/after.ts', 'l2/m/before.ts']);
    const logged = errors.map((args) => args.join(' ')).join('\n');
    const match = logged.match(/l2\/m\/huge\.ts is (\d+) bytes and exceeds the (\d+) byte limit/);
    assert.ok(match);
    assert.equal(Number(match[2]), MAX_BODY);
    assert.ok(Number(match[1]) > MAX_BODY);
  } finally {
    console.error = previousError;
    fetchMock.restore();
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
