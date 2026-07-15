export const CONSTANTS = Object.freeze({
  c: 299792458,
  h: 6.62607015e-34,
  kB: 1.380649e-23,
  eV: 1.602176634e-19,
  electronRadius: 2.8179403262e-15,
  sodiumMass: 22.98976928 * 1.6605390666e-27,
  wavelength: 589.16e-9,
  A: 6.15e7,
  oscillatorStrength: 0.961,
  upperLowerDegeneracy: 3,
});

export function lteUpperFraction(temperatureK) {
  const { eV, kB, upperLowerDegeneracy: g } = CONSTANTS;
  const ratio = g * Math.exp(-(2.104 * eV) / (kB * temperatureK));
  return ratio / (1 + ratio);
}

export function lineModeDensity(temperatureK, pressurePa = 101325) {
  const { c, wavelength, sodiumMass, kB } = CONSTANTS;
  const nu = c / wavelength;
  const doppler = (nu / c) * Math.sqrt((2 * kB * temperatureK) / sodiumMass);
  const pressureWidth = 30.4e6 * (pressurePa / 133.322368) * Math.sqrt(450 / temperatureK);
  const width = Math.max(doppler, pressureWidth);
  return { nu, width, modesPerM3: (8 * Math.PI * nu * nu * width) / (c * c * c) };
}

export function rateBalance({ temperatureK, pressurePa, upperFraction, photonDensity, reaction, pumpMax, quenchCoefficient }) {
  const { A, upperLowerDegeneracy: g, kB } = CONSTANTS;
  const modes = lineModeDensity(temperatureK, pressurePa).modesPerM3;
  const occupation = Math.max(0, photonDensity / modes);
  const nBuffer = pressurePa / (kB * temperatureK);
  const lower = 1 - upperFraction;
  return {
    occupation,
    pump: pumpMax * reaction * lower,
    absorption: g * A * occupation * lower,
    spontaneous: A * upperFraction,
    stimulated: A * occupation * upperFraction,
    quench: quenchCoefficient * nBuffer * upperFraction,
    lte: lteUpperFraction(temperatureK),
  };
}

export function checkRateBalance(rates) {
  const gain = rates.pump + rates.absorption;
  const loss = rates.spontaneous + rates.stimulated + rates.quench;
  return { gain, loss, relativeResidual: Math.abs(gain - loss) / Math.max(gain, loss, 1) };
}
