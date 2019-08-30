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
let helpers;
let execa;
let readline;

const loadDeps = () => {
  if (!helpers) helpers = require('./helpers');
  if (!execa) execa = require('execa');
  if (!readline) readline = require('readline');
};

// Configuration
let executablePath;
let configFile;
let exclude;
let scopes;

const formatter = 'ndjson';

const parseNDJSON = async stream => {
  if (!stream) return null;

  const tasks = [];
  const task = async data => {
    const failure = JSON.parse(data);
    const severity = failure.Severity;
    const start = [
      failure.Position.Start.Line > 0 ? failure.Position.Start.Line - 1: 0,
      failure.Position.Start.Column > 0 ? failure.Position.Start.Column - 1: 0
    ];
    const end = [
      failure.Position.End.Line > 0 ? failure.Position.End.Line - 1: 0,
      failure.Position.End.Column > 0 ? failure.Position.End.Column - 1: 0
    ];
    return {
      severity,
      location: {
        file: failure.Position.Start.Filename,
        position: [start, end]
      },
      excerpt: `${failure.Failure} (${failure.RuleName})`
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
          const messages = await parseNDJSON(stream.stdout);
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
