export default class Wipe {
  static init() {
    console.log('wipe init');
    Wipe.x = 128;
    Wipe.active = false;
    Wipe.callback = null;
    Wipe.arg = null;
    Wipe.direction = 'out';
    Wipe.speed = 4;
  }

  static run(c, a) {
    if(!Wipe.active) {
      Wipe.x = 128;
      Wipe.active = true;
      Wipe.callback = c;
      Wipe.arg = a;
      Wipe.direction = 'out';
      player.freeze = true;
    }
  }

  static update() {
    if(Wipe.active) {
      
      if(Wipe.direction == 'out') {        
        Wipe.x -= Wipe.speed;

        if(Wipe.x <= -96) {
          Wipe.callback(Wipe.arg);
          Wipe.direction = 'in';
          Wipe.x = -(128 - 96);
        }
        //console.log(Wipe.direction + ' ' + Wipe.x);
      } else {
        Wipe.x -= Wipe.speed;
        if(Wipe.x < -256) {
          Wipe.active = false;
          player.freeze = false;
        }
      }
    }
  }

  static draw() {
    if(Wipe.active) draw(assets.atlas.wipe, Wipe.x, 0, Wipe.direction == 'in');
  }
}