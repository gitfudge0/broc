export function planRepoCli(argv: string[]): {
  command: string;
  args: string[];
  needsBuild: boolean;
  needsDist: boolean;
};

export function runRepoCli(argv: string[]): Promise<void>;
