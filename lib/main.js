'use babel';

import { CompositeDisposable } from 'atom';

// Internal variables
const idleCallbacks = new Set();

const requestIdleCallback = fnc => {
  let callbackId;
  const callBack = () => {
    idleCallbacks.delete(callbackId);
    fnc();
  };
  callbackId = window.requestIdleCallback(callBack);
  idleCallbacks.add(callbackId);
};

// Dependencies
let atomLinter;
let helpers;
let execa;
let readline;

const loadDeps = () => {
  if (!atomLinter) atomLinter = require('atom-linter');
  if (!helpers) helpers = require('./helpers');
  if (!execa) execa = require('execa');
  if (!readline) readline = require('readline');
};

// Configuration
let executablePath;
let configFile;
let exclude;
let scopes;
let formatter;

const setFormatter = async () => {
  const def = 'default';
  const ndjson = 'ndjson';

  const output = await execa.sync(executablePath, [`-formatter=${ndjson}`], { timeout: 5*1000, reject: false });
  switch (output.code) {
  case 0:
    formatter = ndjson;
    break;
  case 1:
    console.warn('JSON Stream is not supported by this Revive version. Use default formatter as fallback');
    formatter = def;
    break;
  default:
    return Promise.reject(output);
  }

  return;
};

const parseNDJSON = async (stream, editor) => {
  if (!stream) return null;

  const tasks = [];
  const task = async data => {
    const failure = JSON.parse(data);
    const severity = failure.Severity;
    const start = failure.Position.Start.Line > 0 ? failure.Position.Start.Line - 1: 0;
    const end = failure.Position.Start.Column > 0 ? failure.Position.Start.Column - 1: 0;
    const range = atomLinter.generateRange(editor, start, end);
    return {
      severity,
      location: {
        file: failure.Position.Start.Filename,
        position: range
      },
      excerpt: `${failure.Failure} (${failure.RuleName})`
    };
  };

  return new Promise(resolve =>
    readline.createInterface({ input: stream })
      .on('line', input => tasks.push(task(input)))
      .on('close', () => resolve(Promise.all(tasks))));
};

const parseDefault = async (stream, severity, editor) => {
  if (!stream) return null;

  const tasks = [];
  const reg = helpers.regex('(?<file>.+):(?<line>\\d+):(?<col>\\d+):\\s(?<message>.+)');
  const task = async data => {
    const failure = reg.exec(data).groups();
    const start = failure.line > 0 ? failure.line - 1: 0;
    const end = failure.col > 0 ? failure.col - 1: 0;
    const range = atomLinter.generateRange(editor, start, end);
    return {
      severity,
      location: {
        file: failure.file,
        position: range
      },
      excerpt: failure.message
    };
  };

  return new Promise(resolve =>
    readline.createInterface({ input: stream })
      .on('line', input => tasks.push(task(input)))
      .on('close', () => resolve(Promise.all(tasks))));
};

module.exports = {

  provideLinter() {
    return {
      name: 'Revive',
      scope: 'file',
      lintsOnChange: false,
      grammarScopes: scopes,
      lint: async textEditor => {
        loadDeps();

        try {
          if (!formatter) await setFormatter();
        } catch (err) {
          return Promise.reject(err);
        }

        const filePath = textEditor.getPath();
        const fileContent = textEditor.getText();
        const projectPath = atom.project.relativizePath(filePath)[0];
        const configPath = `${projectPath}/${configFile}`;
        const args = [`-formatter=${formatter}`];

        if (helpers.isConfig(configPath)) args.push(`-config=${configPath}`);
        for (let i = 0, n = exclude.length; i < n; i += 1) {
          args.push(`-exclude=${helpers.normalizePath(`${projectPath}/${exclude[i]}`)}`);
        }
        args.push(filePath);

        try {
          const stream = execa(executablePath, args, { timeout: 10*1000 });

          if (textEditor.getText() !== fileContent) return null;

          const tasks = [];
          if (formatter === 'ndjson') {
            tasks.push(parseNDJSON(stream.stdout, textEditor));
          } else {
            tasks.push(parseDefault(stream.stdout, 'warning', textEditor));
          }
          tasks.push(parseDefault(stream.stderr, 'error', textEditor));

          const messages = await Promise.all(tasks);

          return messages.reduce((a, b) => a.concat(b), []);
        } catch (err) {
          return Promise.reject(err);
        }
      }
    };
  },

  activate() {
    const linterName = 'linter-revive';

    const installLinterPeerPackages = () => {
      if (!atom.inSpecMode()) require('atom-package-deps').install(linterName);
    };
    const loadDependencies = loadDeps;

    requestIdleCallback(installLinterPeerPackages);
    requestIdleCallback(loadDependencies);


    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(
      atom.config.observe(`${linterName}.executablePath`, value => {
        executablePath = value;
      }),
      atom.config.observe(`${linterName}.configFile`, value => {
        configFile = value;
      }),
      atom.config.observe(`${linterName}.exclude`, value => {
        exclude = value;
      }),
      atom.config.observe(`${linterName}.scopes`, value => {
        scopes = value;
      }),
    );
  },

  deactivate() {
    idleCallbacks.forEach(callbackID => window.cancelIdleCallback(callbackID));
    idleCallbacks.clear();
    this.subscriptions.dispose();
  }
};
