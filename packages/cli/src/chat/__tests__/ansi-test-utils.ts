const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

const osc8StartPattern = new RegExp(`${ESC}\\]8;;${BEL}`, "g");
const oscPattern = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");
const csiPattern = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");

export const stripAnsi = (value: string): string =>
  value.replace(osc8StartPattern, "").replace(oscPattern, "").replace(csiPattern, "");
