import PixelboxTexture from './pixelbox_texture.js';

function getRuntime() {
  if (!window.__pbRuntime) {
    throw new Error('Pixelbox runtime is not initialized yet.');
  }
  return window.__pbRuntime;
}

function measureLineWidth(line) {
  const runtime = getRuntime();
  return runtime.measureBitmapTextWidth(line);
}

function splitLongWord(word, maxWidth) {
  if (typeof word !== 'string' || word.length === 0) {
    return [];
  }
  if (!Number.isInteger(maxWidth) || maxWidth <= 0) {
    throw new Error(`Invalid textbox width ${maxWidth} while splitting long word.`);
  }

  const parts = [];
  let chunk = '';
  for (const char of word) {
    const candidate = chunk + char;
    if (chunk.length === 0 || measureLineWidth(candidate) <= maxWidth) {
      chunk = candidate;
      continue;
    }
    parts.push(chunk);
    chunk = char;
  }

  if (chunk.length > 0) {
    parts.push(chunk);
  }
  return parts;
}

function wrapToPixelWidth(text, maxWidth) {
  if (!Number.isInteger(maxWidth) || maxWidth <= 0) {
    throw new Error(`Textbox wrap width must be a positive integer. Received: ${maxWidth}`);
  }

  const wrappedLines = [];
  const sourceLines = String(text).split('\n');
  for (const sourceLine of sourceLines) {
    const words = sourceLine.trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      wrappedLines.push('');
      continue;
    }

    let current = words.shift();
    if (measureLineWidth(current) > maxWidth) {
      const chunks = splitLongWord(current, maxWidth);
      if (chunks.length === 0) {
        throw new Error(`Failed to split long word "${current}" for textbox wrapping.`);
      }
      wrappedLines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1];
    }

    for (const word of words) {
      const candidate = `${current} ${word}`;
      if (measureLineWidth(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      wrappedLines.push(current);
      if (measureLineWidth(word) <= maxWidth) {
        current = word;
        continue;
      }

      const chunks = splitLongWord(word, maxWidth);
      if (chunks.length === 0) {
        throw new Error(`Failed to split long word "${word}" for textbox wrapping.`);
      }
      wrappedLines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1];
    }

    wrappedLines.push(current);
  }

  return wrappedLines;
}

var TextBox = {
  visible: false,
  text: [],
  texture: null,
  showBox: true,
  map: null,
  eval: null,

  queue: function(text, e = null) {
    input.pressed.Y = false;
    var lines = wrapToPixelWidth(text, this.getTextWidthLimit());
    this.text = this.text.concat(lines);
    this.eval = e;
  },

  show: function() {
    this.visible = true;
    this.render();
  },

  update: function() {
    if(this.visible && (input.pressed.A || input.pressed.Y)) {
      //console.log(input);
      if(this.text.length > 0) {
        this.render();
      } else {
        this.visible = false;
        if(this.eval) eval(this.eval);
        this.eval = null;
      }
    }
  },

  render: function() {
    this.texture.clear();
    if(this.showBox) {
      this.texture.draw(this.map, 0, 0);
    }
    //console.log(this.text);
    for(var i = 0; i < 3; i++) {
      var x = 2 * tileSize;
      var y = (2 + i) * tileSize + 1;
      if(this.text.length > 0) {
        var string = this.text.shift();
        this.texture.print(string, x, y);
      }
    }
    //console.log(this.text);
  },

  draw: function() {
    if(!this.visible) return;
    draw(this.texture, 0, 0);
  },

  setColor: function(color) {
    this.texture.pen(color);
  },

  isVisible: function() {
    return this.visible;
  },

  getTextWidthLimit: function() {
    if (!this.map || !Number.isInteger(this.map.width) || this.map.width <= 0) {
      throw new Error('Textbox map is not initialized or has an invalid width.');
    }
    if (!Number.isInteger(tileSize) || tileSize <= 0) {
      throw new Error(`Global tileSize is invalid for textbox wrapping: ${tileSize}`);
    }

    const horizontalMarginTiles = 2;
    const width = (this.map.width - (horizontalMarginTiles * 2)) * tileSize;
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Textbox computed non-positive text width: ${width}`);
    }

    // Keep a 1px safety margin from the interior border.
    return width - 1;
  },

  init: function() {
    this.texture = new PixelboxTexture(128, 128);
    this.map = getMap('Dialog');
  }
};

export default TextBox;
