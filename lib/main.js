'use babel';

import { CompositeDisposable } from 'atom';
import { isConfig, normalizePath, regex } from './helpers';
import execa from 'execa';
import readline from 'readline';

// Internal variables
let atomLinter;
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

async function readJSONStream(stream, severity, editor) {
  const messages = [];

  if (!stream) return messages;

  const rl = readline.createInterface({ input: stream });

  rl.on('line', input => {
    const failure = JSON.parse(input);
    const start = failure.Position.Start.Line > 0 ? failure.Position.Start.Line - 1: 0;
    const end = failure.Position.Start.Column > 0 ? failure.Position.Start.Column - 1: 0;
    messages.push({
      severity,
      location: {
        file: failure.Position.Start.Filename,
        position: atomLinter.generateRange(editor, start, end)
      },
      excerpt: `${failure.Failure} (${failure.RuleName})`
    });
  });

  await new Promise(resolve => rl.on('close', () => resolve()));

  return messages;
}

async function parseDefault(stream, severity, editor) {
  const messages = [];

  if (!stream) return messages;

  const rl = readline.createInterface({ input: stream });

  const reg = regex('(?<file>.+):(?<line>\\d+):(?<col>\\d+):\\s(?<message>.+)');
  rl.on('line', input => {
    const failure = reg.exec(input).groups();
    const start = failure.line > 0 ? failure.line - 1: 0;
    const end = failure.col > 0 ? failure.col - 1: 0;
    messages.push({
      severity,
      location: {
        file: failure.file,
        position: atomLinter.generateRange(editor, start, end)
      },
      excerpt: failure.message
    });
  });

  await new Promise(resolve => rl.on('close', () => resolve()));

  return messages;
}

export function provideLinter() {
  return {
    name: 'Revive',
    scope: 'file',
    lintsOnChange: false,
    grammarScopes: scopes,
    lint: async (textEditor) => {
      if (!atomLinter) atomLinter = require('atom-linter');

      const file = textEditor.getPath();
      const fileContent = textEditor.getText();
      const projectPath = atom.project.relativizePath(file)[0];
      const configPath = `${projectPath}/${configFile}`;
      const args = ['-formatter=json-stream'];

      if (isConfig(configPath)) args.push(`-config=${configPath}`);
      for (let i = 0, n = exclude.length; i < n; i += 1) {
        args.push(`-exclude=${normalizePath(`${projectPath}/${exclude[i]}`)}`);
      }
      args.push(file);

      try {
        const stream = execa(executablePath, args);

        if (textEditor.getText() !== fileContent) return null;

        const warnings = readJSONStream(stream.stdout, 'warning', textEditor);
        const errors = parseDefault(stream.stderr, 'error', textEditor);

        const messages = await Promise.all([warnings, errors]);

        return messages.reduce((a, b) => a.concat(b), []);
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}
