'use babel';

import fs from 'fs';
import Path from 'path';

export const normalizePath = path => Path.normalize(path);

export const isConfig = configPath => fs.existsSync(normalizePath(configPath));
