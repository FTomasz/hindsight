import draw from './draw.js';
import estimate from './estimate.js';
import siege from './siege.js';
import { peak, battle, trend, match } from './wordgames.js';
import { timeline, first, when } from './history.js';

export const SECTIONS = [
  { id: 'words', title: 'Words in books', note: 'Built on how often English books used each word, year by year, from the Google Books Ngram Viewer' },
  { id: 'numbers', title: 'Numbers', note: 'No word data here: sourced estimates, and arithmetic against the clock' },
  { id: 'history', title: 'History', note: 'Dated moments, checked against encyclopedias and official sources' },
];

// The featured game goes first on the home page; the rest are grouped by section.
export const GAMES = [draw, peak, battle, match, trend, estimate, siege, when, timeline, first];
