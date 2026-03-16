import path from 'path';

export const ROOT_DIR = (() => {
  const fromEnv = process.env.ROOT_DIR;
  const fromArg = process.argv[2];
  const dir = fromEnv ?? fromArg;

  if (!dir) {
    throw new Error(
      'ROOT_DIR must be set via ROOT_DIR environment variable or as the first CLI argument'
    );
  }

  return path.resolve(dir);
})();

export const MAX_FILE_SIZE_BYTES = 100_000; // 100 KB
export const MAX_SEARCH_RESULTS = 50;
export const CONTEXT_LINES = 2;
