// Generic content registry. Content types (crops, tools, tractors, fertilizers)
// register records by id at boot; adding content = adding a file, not engine code.

export class Registry {
  constructor(name, validate) {
    this.name = name;
    this.validate = validate;
    this.items = new Map();
  }

  register(record) {
    if (this.validate) {
      const err = this.validate(record);
      if (err) {
        throw new Error(`[${this.name}] invalid record "${record?.id}": ${err}`);
      }
    }
    if (this.items.has(record.id)) {
      throw new Error(`[${this.name}] duplicate id "${record.id}"`);
    }
    this.items.set(record.id, Object.freeze(record));
    return record;
  }

  registerAll(records) {
    for (const r of records) this.register(r);
  }

  get(id) {
    return this.items.get(id);
  }

  has(id) {
    return this.items.has(id);
  }

  all() {
    return [...this.items.values()];
  }

  filter(fn) {
    return this.all().filter(fn);
  }
}

export const Crops = new Registry('crops', (r) =>
  !r?.id ? 'missing id'
    : !Array.isArray(r.seasons) ? 'missing seasons[]'
    : typeof r.daysWatered !== 'number' ? 'missing daysWatered'
    : null,
);

export const Tools = new Registry('tools', (r) =>
  !r?.id ? 'missing id' : !Array.isArray(r.tiers) ? 'missing tiers[]' : null,
);

export const Tractors = new Registry('tractors', (r) =>
  !r?.id ? 'missing id' : typeof r.fuelCap !== 'number' ? 'missing fuelCap' : null,
);

export const Fertilizers = new Registry('fertilizers', (r) =>
  !r?.id ? 'missing id' : typeof r.effects !== 'object' ? 'missing effects{}' : null,
);
