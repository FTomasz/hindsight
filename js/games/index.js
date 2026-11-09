import draw from './draw.js';
import estimate from './estimate.js';
import { peak, battle, trend, match } from './wordgames.js';
import { timeline, first } from './history.js';
import siege from './siege.js';

// The first game is featured on the home page.
export const GAMES = [draw, estimate, siege, peak, battle, match, timeline, first, trend];
