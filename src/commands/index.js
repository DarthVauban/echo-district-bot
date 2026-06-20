import * as clear from './clear.js';
import * as nowplaying from './nowplaying.js';
import * as pause from './pause.js';
import * as play from './play.js';
import * as queue from './queue.js';
import * as resume from './resume.js';
import * as skip from './skip.js';
import * as start from './start.js';
import * as stop from './stop.js';
import * as volume from './volume.js';

export const commands = [
  play,
  volume,
  queue,
  clear,
  start,
  stop,
  skip,
  pause,
  resume,
  nowplaying,
];
