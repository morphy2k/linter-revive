'use babel';

import { CompositeDisposable } from 'atom';
import { isConfig, normalizePath } from './helpers';

// Internal variables
let helpers;
let executablePath;
let configFile;
let exclude;
let scopes;

export function activate() {
  require('atom-package-deps').install('linter-revive');

  const linterName = 'linter-revive';

  this.subscriptions = new CompositeDisposable();

  this.subscriptions.add(
    atom.config.observe(`${linterName}.executablePath`, (value) => {
      executablePath = value;
    }),
    atom.config.observe(`${linterName}.configFile`, (value) => {
      configFile = value;
    }),
    atom.config.observe(`${linterName}.exclude`, (value) => {
      exclude = value;
    }),
    atom.config.observe(`${linterName}.scopes`, (value) => {
      scopes = value;
    }),
  );
}

export function deactivate() {
  this.subscriptions.dispose();
}

export function provideLinter() {
  return {
    name: 'Revive',
    scope: 'file',
    lintsOnChange: false,
    grammarScopes: scopes,
    lint: async (textEditor) => {
      if (!helpers) helpers = require('atom-linter');

      const regex = '(?<file>.+):(?<line>\\d+):(?<col>\\d+):\\s(?<message>.+)';
      const file = textEditor.getPath();
      const text = textEditor.getText();
      const args = ['-formatter=default'];
      const projectPath = atom.project.relativizePath(file)[0];
      const configPath = `${projectPath}/${configFile}`;

      if (isConfig(configPath)) args.push(`-config=${configPath}`);
      for (let i = 0; i < exclude.length; i += 1) {
        args.push(`-exclude=${normalizePath(`${projectPath}/${exclude[i]}`)}`);
      }
      args.push(file);

      return helpers.exec(executablePath, args, { stream: 'both' }).then((output) => {
        if (textEditor.getText() !== text) return null;

        const warnings = helpers.parse(output.stdout, regex).map((parsed) => {
          const message = {
            severity: 'warning',
            location: {
              file: parsed.filePath,
              position: helpers.generateRange(textEditor, parsed.range[0][0], parsed.range[0][1]),
            },
            excerpt: parsed.text,
          };

          return message;
        });

        const errors = helpers.parse(output.stderr, regex).map((parsed) => {
          const message = {
            severity: 'error',
            location: {
              file: parsed.filePath,
              position: helpers.generateRange(textEditor, parsed.range[0][0], parsed.range[0][1]),
            },
            excerpt: parsed.text,
          };

          return message;
        });

        return warnings.concat(errors);
      });
    },
  };
}
