import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLinkedInAddUrl, certificationName, resolveVerifyUrl } from '../src/lib/linkedin.js';

const base = {
  name: 'Constancia: Mujer LegalTech',
  organizationName: 'Mujer LegalTech en México',
  issuedAt: '2025-03-15T12:00:00Z', // mitad de mes: el mes/año no cambia con la zona horaria
  certUrl: 'https://app.example.mx/verificar/MLT-ABCD-EF23',
  certId: 'MLT-ABCD-EF23',
};

function params(url) {
  return new URL(url).searchParams;
}

test('la URL empieza por el endpoint de LinkedIn con startTask', () => {
  assert.ok(buildLinkedInAddUrl(base).startsWith('https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME'));
});

test('codifica tildes, espacios, & y # con encodeURIComponent (sin +)', () => {
  const url = buildLinkedInAddUrl({ ...base, name: 'Curso & Más #1 México', organizationName: 'Ñandú S.A.' });
  assert.ok(url.includes('name=Curso%20%26%20M%C3%A1s%20%231%20M%C3%A9xico'));
  assert.ok(url.includes('organizationName=%C3%91and%C3%BA%20S.A.'));
  assert.equal(url.includes('+'), false);
  assert.equal(params(url).get('name'), 'Curso & Más #1 México');
});

test('certUrl va codificada y se recupera íntegra', () => {
  const url = buildLinkedInAddUrl(base);
  assert.ok(url.includes('certUrl=https%3A%2F%2Fapp.example.mx%2Fverificar%2FMLT-ABCD-EF23'));
  assert.equal(params(url).get('certUrl'), base.certUrl);
  assert.equal(params(url).get('certId'), 'MLT-ABCD-EF23');
});

test('issueYear e issueMonth salen de issuedAt (mes 1-12)', () => {
  const query = params(buildLinkedInAddUrl(base));
  assert.equal(query.get('issueYear'), '2025');
  assert.equal(query.get('issueMonth'), '3');
});

test('organizationId es opcional', () => {
  assert.equal(params(buildLinkedInAddUrl(base)).has('organizationId'), false);
  assert.equal(params(buildLinkedInAddUrl({ ...base, organizationId: '' })).has('organizationId'), false);
  assert.equal(params(buildLinkedInAddUrl({ ...base, organizationId: '12345' })).get('organizationId'), '12345');
});

test('una fecha inválida o ausente omite issueYear e issueMonth', () => {
  for (const issuedAt of ['no-es-fecha', '', undefined, null]) {
    const query = params(buildLinkedInAddUrl({ ...base, issuedAt }));
    assert.equal(query.has('issueYear'), false);
    assert.equal(query.has('issueMonth'), false);
    assert.equal(query.get('certId'), 'MLT-ABCD-EF23');
  }
});

test('el orden de los parámetros es estable', () => {
  const url = buildLinkedInAddUrl({ ...base, organizationId: '99' });
  const keys = [...params(url).keys()];
  assert.deepEqual(keys, ['startTask', 'name', 'organizationName', 'organizationId', 'issueYear', 'issueMonth', 'certUrl', 'certId']);
});

test('certificationName y resolveVerifyUrl', () => {
  assert.equal(certificationName('Mujer LegalTech'), 'Constancia: Mujer LegalTech');
  assert.equal(resolveVerifyUrl({ verifyUrl: 'https://a.mx/verificar/X', certificateCode: 'X' }, 'http://o'), 'https://a.mx/verificar/X');
  assert.equal(resolveVerifyUrl({ certificateCode: 'MLT-ABCD-EF23' }, 'http://localhost:5173'), 'http://localhost:5173/verificar/MLT-ABCD-EF23');
});
