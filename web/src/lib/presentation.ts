/** Darker variants of the travel guide palette keep white labels readable. */
const dayColors = ["#b54b28", "#2e6ea0", "#4f722b", "#a33c18", "#99570c"];
export const dayColor = (day: number) =>
  dayColors[(Math.max(1, day) - 1) % dayColors.length];
