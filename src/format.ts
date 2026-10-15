export const duration = (ms: number) => {
  const m = Math.floor(Math.abs(ms) / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const local = (n: number) => {
  const d = new Date(n);
  return new Date(n - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
