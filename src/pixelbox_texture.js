function getRuntime() {
  if (!window.__pbRuntime) {
    throw new Error('Pixelbox runtime is not initialized yet.');
  }
  return window.__pbRuntime;
}

export default class PixelboxTexture {
  constructor(width, height) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new Error(`Invalid texture size: ${width}x${height}`);
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.ctx.imageSmoothingEnabled = false;

    this.penColor = 1;
    this.paperColor = 0;
    this.tilesheet = null;
    this._isPixelboxTexture = true;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return this;
  }

  pen(color) {
    this.penColor = color;
    return this;
  }

  paper(color) {
    this.paperColor = color;
    return this;
  }

  setTilesheet(sheet) {
    this.tilesheet = sheet || null;
    return this;
  }

  rect(x, y, w, h) {
    const runtime = getRuntime();
    this.ctx.strokeStyle = runtime.resolveColor(this.penColor);
    this.ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  rectf(x, y, w, h) {
    const runtime = getRuntime();
    this.ctx.fillStyle = runtime.resolveColor(this.paperColor);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }

  print(text, x, y) {
    const runtime = getRuntime();
    runtime.drawBitmapTextToContext(this.ctx, text, x, y, this.penColor);
    return this;
  }

  draw(drawable, x, y, flipH = false, flipV = false, flipR = false) {
    const runtime = getRuntime();
    runtime.drawDrawableToContext(this.ctx, drawable, x, y, flipH, flipV, flipR);
    return this;
  }

  sprite(tile, x, y, flipH = false, flipV = false, flipR = false) {
    const runtime = getRuntime();
    const sheet = this.tilesheet || runtime.currentTilesheet;
    if (!sheet) {
      throw new Error('Cannot draw sprite: no tilesheet is active.');
    }
    runtime.drawTileToContext(this.ctx, sheet, tile, x, y, flipH, flipV, flipR);
    return this;
  }
}
