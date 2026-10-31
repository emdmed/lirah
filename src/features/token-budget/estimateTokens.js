// ~1 token per 4 characters, the usual rule of thumb for English and code.
export const CHARS_PER_TOKEN = 4;

export const toTokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);
