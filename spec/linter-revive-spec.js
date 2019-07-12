'use babel';

import path from 'path';

const lint = require('../lib/main.js').provideLinter().lint;

const goodPath = path.join(__dirname, 'fixtures', 'good.go');
const errorsPath = path.join(__dirname, 'fixtures', 'errors.go');

describe('The revive provider for Linter', () => {
  beforeEach(() => {
    atom.workspace.destroyActivePaneItem();
    waitsForPromise(() => {
      atom.packages.activatePackage('linter-revive');
      return atom.packages.activatePackage('language-go').then(() => atom.workspace.open(goodPath));
    });
  });

  describe('checks a file with issues and', () => {
    let editor = null;
    beforeEach(() => {
      waitsForPromise(() => atom.workspace.open(errorsPath)
        .then((openEditor) => { editor = openEditor; }));
    });

    it('finds at least one message', () => {
      waitsForPromise(() => lint(editor)
        .then(messages => expect(messages.length).toBeGreaterThan(0)));
    });

    it('verifies the first message', () => {
      waitsForPromise(() => {
        return lint(editor).then((messages) => {
          expect(messages[0].severity).toBe('warning');
          expect(messages[0].html).not.toBeDefined();
          expect(messages[0].location.file).toBe(errorsPath);
        });
      });
    });
  });

  it('finds nothing wrong with a valid file', () => {
    waitsForPromise(() => atom.workspace.open(goodPath)
      .then(editor => lint(editor).then(messages => expect(messages.length).toBe(0))));
  });
});
