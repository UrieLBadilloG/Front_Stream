import assert from 'node:assert/strict';
import test from 'node:test';

import {
  certificateShareLink,
  facebookShareUrl,
  isPublicShareUrl,
  isShareCancel,
  linkedInShareUrl,
  nativeSharePayload,
  shareText,
  twitterShareUrl,
  whatsappShareUrl,
} from '../src/lib/share-links.js';

const URL_SHARE = 'https://api.example.mx/v/MLT-ABCD-EF23';

test('certificateShareLink arma /v/<código> y quita barras finales', () => {
  assert.equal(certificateShareLink('MLT-ABCD-EF23', 'https://api.example.mx'), URL_SHARE);
  assert.equal(certificateShareLink('MLT-ABCD-EF23', 'https://api.example.mx///'), URL_SHARE);
  assert.equal(certificateShareLink('A/B', 'http://localhost:3000'), 'http://localhost:3000/v/A%2FB');
});

test('facebookShareUrl codifica la URL completa en u=', () => {
  const url = facebookShareUrl(URL_SHARE);
  assert.ok(url.startsWith('https://www.facebook.com/sharer/sharer.php?u='));
  assert.ok(url.endsWith(encodeURIComponent(URL_SHARE)));
  assert.equal(new URL(url).searchParams.get('u'), URL_SHARE);
});

test('linkedInShareUrl usa share-offsite con url codificada', () => {
  const url = linkedInShareUrl(URL_SHARE);
  assert.ok(url.startsWith('https://www.linkedin.com/sharing/share-offsite/?url='));
  assert.equal(new URL(url).searchParams.get('url'), URL_SHARE);
});

test('whatsappShareUrl junta texto y enlace; tildes, ¡ y & se codifican', () => {
  const text = '¡Completé el curso Derecho & Tecnología!';
  const url = whatsappShareUrl(text, URL_SHARE);
  assert.ok(url.startsWith('https://wa.me/?text='));
  assert.equal(new URL(url).searchParams.get('text'), `${text} ${URL_SHARE}`);
  assert.ok(!url.slice('https://wa.me/?text='.length).includes('&'));
});

test('twitterShareUrl separa text y url', () => {
  const url = twitterShareUrl('¡Hola! #1', URL_SHARE);
  assert.ok(url.startsWith('https://twitter.com/intent/tweet?text='));
  const params = new URL(url).searchParams;
  assert.equal(params.get('text'), '¡Hola! #1');
  assert.equal(params.get('url'), URL_SHARE);
});

test('shareText menciona el curso y termina en dos puntos', () => {
  assert.equal(shareText('Mujer LegalTech'), '¡Completé el curso Mujer LegalTech de Mujer LegalTech en México! Verifica mi constancia aquí:');
  assert.ok(shareText('').includes('Mujer LegalTech'));
  assert.ok(shareText(null).endsWith(':'));
});

test('isPublicShareUrl: público vs localhost/loopback/IP privada', () => {
  for (const value of ['https://api.streamly.mx/v/X', 'http://203.0.113.9/v/X', 'https://172.32.0.1/x', 'https://8.8.8.8']) assert.equal(isPublicShareUrl(value), true, value);
  const local = [
    'http://localhost:3000/v/X', 'http://127.0.0.1:3112/v/X', 'http://[::1]:3000/v/X', 'http://10.0.0.5/v/X', 'http://172.16.4.2/v/X',
    'http://172.31.255.1/v/X', 'http://192.168.1.20:3000/v/X', 'http://169.254.1.1/v/X', 'http://miequipo/v/X', 'http://pc.local/v/X',
    'http://app.localhost/v/X', 'ftp://api.streamly.mx', 'no-es-url', '', null, undefined,
  ];
  for (const value of local) assert.equal(isPublicShareUrl(value), false, String(value));
});

test('nativeSharePayload adjunta el archivo solo si canShare lo permite', () => {
  const file = { name: 'insignia.png' };
  const base = { title: 'Constancia', text: 'Texto', url: URL_SHARE };
  assert.deepEqual(nativeSharePayload({ ...base, file, nav: { canShare: () => true } }), { ...base, files: [file] });
  assert.deepEqual(nativeSharePayload({ ...base, file, nav: { canShare: () => false } }), base);
  assert.deepEqual(nativeSharePayload({ ...base, file, nav: {} }), base);
  assert.deepEqual(nativeSharePayload({ ...base, file: null, nav: { canShare: () => true } }), base);
  assert.deepEqual(nativeSharePayload({ ...base, file, nav: { canShare: () => { throw new Error('x'); } } }), base);
  let asked;
  nativeSharePayload({ ...base, file, nav: { canShare: (data) => { asked = data; return true; } } });
  assert.deepEqual(asked, { files: [file] });
});

test('isShareCancel reconoce AbortError', () => {
  assert.equal(isShareCancel({ name: 'AbortError' }), true);
  assert.equal(isShareCancel({ name: 'NotAllowedError' }), false);
  assert.equal(isShareCancel(null), false);
});
