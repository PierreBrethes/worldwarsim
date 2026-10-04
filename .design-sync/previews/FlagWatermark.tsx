import { FlagWatermark } from 'worldwarsim';
const desk = { background: 'var(--map-desk)', color: 'var(--paper)', height: 72, position: 'relative', width: 360 } as const;
export const OnBand = () => (
  <div style={desk}>
    <FlagWatermark nation="usa" />
  </div>
);
export const Soft = () => (
  <div style={desk}>
    <FlagWatermark nation="uk" opacity={0.45} />
  </div>
);
