'use babel';

import fs from 'fs';
import Path from 'path';

import namedRegexp from 'named-js-regexp';

export const normalizePath = path => Path.normalize(path);

export const isConfig = configPath => fs.existsSync(normalizePath(configPath));

export const regex = reg => new namedRegexp(reg);
