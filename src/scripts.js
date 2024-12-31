export default class Scripts {

  static init() {
    Scripts.maguffins = ['Big Bolt', 'Titanium Ore', 'Dilithium Crystal'];
  }

  static PlayerHasMaguffins() {
    for(var i of Scripts.maguffins) {
      if(!player.hasItem(i)) {
        return false;
      }
    }

    return true;
  }

  static MaguffinList() {
    var items = [];

    for(var i of Scripts.maguffins) {
      if(!player.hasItem(i)) {
        items.push(i);
      }
    }

    return items.join(', ');
  }

  static Ending() {
    patatracker.stop();
    hideUI = true;
    loadMap("Ending");
    patatracker.playSong(1);
    setTimeout(function() {
      say("Thanks to your help, the strange beings from the sky are able to repair their ship. They say their goodbyes and take off to resume their journey among the stars. Perhaps they will return some day...");
    }, 3000);
  }
}