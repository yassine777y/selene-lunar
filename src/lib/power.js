/**
 * power.js — the assumptions behind every energy number in the app.
 * The summary page does the arithmetic *and* prints the assumptions from these
 * constants, so the text can never drift away from the calculation.
 */
export const LOAD_KW = 1.0;        // continuous payload + avionics load
export const DEPTH_OF_DISCHARGE = 0.9; // usable fraction of a full pack
export const PACK_WH_PER_KG = 150;     // Li-ion pack-level specific energy

/**
 * Energy that has to survive the longest night of the window.
 * @param {number} nightHours longest contiguous run with no sunlight
 */
export function batteryForNight(nightHours) {
  const wh = LOAD_KW * 1000 * nightHours;
  const usableWh = wh / DEPTH_OF_DISCHARGE;
  return { wh, usableWh, massKg: usableWh / PACK_WH_PER_KG };
}
