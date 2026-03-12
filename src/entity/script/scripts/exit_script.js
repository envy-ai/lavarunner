import Script from '../script.js';

export default class Exit extends Script {
  constructor(spr) {
    super();
    this.entityName = 'Exit';
    this.mode = 'collide'

    this.bbox = {
      x1: 1,
      y1: 1,
      x2: 6,
      y2: 7,
    };
  }

  run() {
    if (typeof this.metadata.map !== 'string' || this.metadata.map.length === 0) {
      throw new Error(`Exit script at ${this.tx},${this.ty} on "${map._name}" is missing metadata.map.`);
    }

    if (this.metadata.x !== undefined) {
      if (!Number.isInteger(this.metadata.x) || !Number.isInteger(this.metadata.y)) {
        throw new Error(`Exit script at ${this.tx},${this.ty} on "${map._name}" has invalid metadata.x/y.`);
      }
      loadMap(this.metadata.map, this.metadata.x, this.metadata.y);
    } else {
      loadMap(this.metadata.map);
    }
  }
}
