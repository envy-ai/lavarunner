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
    if(this.metadata.map !== undefined) {
      if(this.metadata.x !== undefined) {
        loadMap(this.metadata.map, this.metadata.x, this.metadata.y);
      } else {
        loadMap(this.metadata.map);
      }
    }
  }
}