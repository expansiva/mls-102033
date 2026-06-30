/// <mls fileReference="_102033_/l2/cn.ts" enhancement="_blank"/>

export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}
