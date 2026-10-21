/** `n` and the word, with an s unless n is 1: plural(2, 'file') → '2 files'. */
export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
