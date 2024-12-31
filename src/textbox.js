var Texture = require('pixelbox/Texture');

// https://stackoverflow.com/questions/14484787/wrap-text-in-javascript
const wrap = (s, w) => s.replace(
  new RegExp(`(?![^\\n]{1,${w}}$)([^\\n]{1,${w}})\\s`, 'g'), '$1\n'
);

var TextBox = {
  visible: false,
  text: [],
  texture: null,
  showBox: true,
  map: null,
  eval: null,

  queue: function(text, e = null) {
    input.pressed.Y = false;
    var lines = wrap(text, 24).split("\n");
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

  init: function() {
    this.texture = new Texture(128, 128);
    this.map = getMap('Dialog');
  }
};

export default TextBox;
