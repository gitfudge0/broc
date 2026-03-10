export function parseCleanArgs(argv: string[]): {
  all: boolean;
};

export function runClean(argv: string[], dependencyOverrides?: Record<string, unknown>): Promise<void>;
