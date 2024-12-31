export default class AtlasItem {
  constructor(sprite, x, y) {
    this.x = x;
    this.y = y;
    this.sprite = sprite;
    console.log("New AtlasItem", this);
  }

  draw(offsetX, offsetY) {
    draw(this.sprite, this.x + offsetX, this.y + offsetY);
  }

  die() {
    atlasQueue = atlasQueue.filter(e => e !== this);
  }
}