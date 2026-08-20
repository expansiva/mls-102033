/// <mls fileReference="_102033_/l2/core/bff-client.ts" enhancement="_blank" />

// SECOND COPY — NOT the one the generated pages use.
//
// The pages of a generated module import `/_102029_/l2/bffClient.js`; this file is imported only by
// itself and its own test. The two have diverged: the 102029 one stamps `meta.userId` with the logged
// user's EMAIL (read from the JS-readable `loginUser` cookie at request time — the standard set on
// 2026-08-18, because a display name is not unique), and this one sends no identity at all. If this copy
// ever goes back into use, mirror that; better, delete one of the two.
export * from '/_102029_/l2/bffClient.js';
