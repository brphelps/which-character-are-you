export const UHCI_SCALE = Object.freeze({
  minimum: 1,
  maximum: 10,
});

export const UHCI_DIMENSIONS = Object.freeze([
  Object.freeze({
    id: "ED",
    name: "Event Drive",
    lowAnchor: "Reactive",
    highAnchor: "Agentic",
  }),
  Object.freeze({
    id: "EC",
    name: "Emotional Containment",
    lowAnchor: "Explosive",
    highAnchor: "Regulated",
  }),
  Object.freeze({
    id: "SA",
    name: "Social Aim",
    lowAnchor: "Self-directed or oppositional",
    highAnchor: "Communal or nurturing",
  }),
  Object.freeze({
    id: "RL",
    name: "Reality Lens",
    lowAnchor: "Concrete or literal",
    highAnchor: "Absurd or surreal",
  }),
  Object.freeze({
    id: "SH",
    name: "Show-Awareness",
    lowAnchor: "Immersed",
    highAnchor: "Meta or performative",
  }),
  Object.freeze({
    id: "BS",
    name: "Behavioral Stability",
    lowAnchor: "Volatile",
    highAnchor: "Steady",
  }),
]);

export const UHCI_DIMENSION_IDS = Object.freeze(
  UHCI_DIMENSIONS.map(({ id }) => id),
);
