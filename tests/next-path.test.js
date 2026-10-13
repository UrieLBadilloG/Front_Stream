import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLoginPath, parseAuthMode, safeNextPath } from '../src/lib/next-path.js';

test('safeNextPath acepta rutas de la lista blanca', () => {
  for (const path of ['/pago/mi-curso', '/curso/x?accion=inscribir', '/mi-aprendizaje', '/aprender/12', '/explorar?buscar=ia', '/mis-pagos', '/pago/resultado?ref=abc&status=approved', '/mi-aprendizaje/otra', '/curso/x#programa']) {
    assert.equal(safeNextPath(path), path, path);
  }
});

test('safeNextPath rechaza destinos peligrosos o fuera de la lista', () => {
  const bad = [
    '//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', '\\evil.com', '/pago/../administracion',
    '/%2F%2Fevil.com', '/curso/%5Cevil.com', '/administracion', '/login', '/pagox', '/mi-aprendizajeX',
    null, undefined, 42, [], {}, '', 'x'.repeat(400), `/pago/${'x'.repeat(400)}`, '/pago/x\n', ' /pago/x', '/pago/x y', '/pago/./x',
    '/pago/%2e%2e/x', '/curso/a/../../login', '/curso/\u0000x', 'pago/x', '/', 'data:text/html,hola',
  ];
  for (const value of bad) assert.equal(safeNextPath(value), null, JSON.stringify(value));
});

test('safeNextPath devuelve el fallback indicado', () => {
  assert.equal(safeNextPath('//evil.com', '/mi-aprendizaje'), '/mi-aprendizaje');
  assert.equal(safeNextPath(null, '/x'), '/x');
  assert.equal(safeNextPath('/pago/ok', '/x'), '/pago/ok');
});

test('buildLoginPath codifica la ruta de retorno', () => {
  assert.equal(buildLoginPath({ next: '/pago/mi-curso' }), '/login?modo=registro&siguiente=%2Fpago%2Fmi-curso');
  assert.equal(buildLoginPath({ next: '/curso/x?accion=inscribir' }), '/login?modo=registro&siguiente=%2Fcurso%2Fx%3Faccion%3Dinscribir');
});

test('buildLoginPath omite destinos inválidos y respeta el modo', () => {
  assert.equal(buildLoginPath({ next: '//evil.com' }), '/login?modo=registro');
  assert.equal(buildLoginPath({ mode: 'login', next: '/mis-pagos' }), '/login?modo=login&siguiente=%2Fmis-pagos');
  assert.equal(buildLoginPath({ mode: 'otro' }), '/login?modo=registro');
  assert.equal(buildLoginPath(), '/login?modo=registro');
});

test('parseAuthMode lee el parámetro modo', () => {
  assert.equal(parseAuthMode(new URLSearchParams('modo=registro')), 'register');
  assert.equal(parseAuthMode(new URLSearchParams('modo=login')), 'login');
  assert.equal(parseAuthMode(new URLSearchParams('modo=x')), null);
  assert.equal(parseAuthMode(new URLSearchParams('')), null);
});
