import { empty, startSession, type Field, type SetRow } from "./model";
export function demo() {
  const d = empty();
  d.settings.farmName = "Willow Creek · Fictional demo";
  d.sources = [
    {
      id: "canal",
      name: "Main Canal",
      maxConcurrentSets: 1,
      notes: "Fictional shared headgate",
      archived: false,
    },
    {
      id: "ditch",
      name: "Upper Ditch",
      maxConcurrentSets: 1,
      notes: "",
      archived: false,
    },
  ];
  for (const [i, name] of ["North 40", "South 20", "West Field"].entries()) {
    const f: Field = {
      id: "f" + i,
      name,
      acreage: [40, 20, 35][i],
      crop: ["Corn", "Alfalfa", "Small grains"][i],
      method: i === 1 ? "Flood irrigation" : "Furrow irrigation",
      sourceId: i === 2 ? "ditch" : "canal",
      duration: [300, 240, 360][i],
      notes: "Fictional sample field",
      archived: false,
    };
    d.fields.push(f);
    for (let j = 0; j < (i === 0 ? 3 : 2); j++) {
      const s: SetRow = {
        id: `s${i}${j}`,
        fieldId: f.id,
        name:
          i === 0
            ? ["West Furrows", "Center Furrows", "East Furrows"][j]
            : `Set ${String.fromCharCode(65 + j)}`,
        order: j,
        duration: f.duration,
        sourceId: f.sourceId,
        notes: "",
        archived: false,
      };
      d.sets.push(s);
    }
  }
  const now = Date.now();
  startSession(d, {
    setId: "s00",
    sourceId: "canal",
    start: now - 195 * 60000,
    target: 300,
    notes: "",
  });
  startSession(d, {
    setId: "s20",
    sourceId: "ditch",
    start: now - 390 * 60000,
    target: 360,
    notes: "Target exceeded; confirm field conditions manually.",
  });
  for (let i = 0; i < 4; i++) {
    const s = startSession(d, {
      setId: "s01",
      sourceId: "canal",
      start: now - (i + 2) * 86400000,
      target: 300,
      notes: "Fictional completed turn",
      planned: true,
      override: true,
    });
    s.status = "completed";
    s.end = s.start + (320 + i * 5) * 60000;
  }
  startSession(d, {
    setId: "s01",
    sourceId: "canal",
    start: now + 105 * 60000,
    target: 300,
    notes: "Next in rotation",
    planned: true,
  });
  startSession(d, {
    setId: "s10",
    sourceId: "canal",
    start: now + 150 * 60000,
    target: 240,
    notes: "Fictional conflict example",
    planned: true,
    override: true,
  });
  return d;
}
