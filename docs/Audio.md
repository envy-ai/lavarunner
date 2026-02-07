# Audio

## Manifest

Audio is configured in `audio/manifest.json`.

Example structure:

```json
{
  "bgm": {
    "0": { "file": "bgm/main.ogg", "loop": true, "volume": 0.8 },
    "1": { "file": "bgm/ending.ogg", "loop": true, "volume": 0.8 }
  },
  "sfx": {
    "jump": { "file": "sfx/jump.ogg", "volume": 1.0 }
  }
}
```

`file` paths are resolved relative to `audio/manifest.json`.

## Runtime Mapping

- `patatracker.playSong(0)` -> `manifest.bgm["0"]`
- `patatracker.playSong(1)` -> `manifest.bgm["1"]`
- `sfx("name")` -> `manifest.sfx["name"]`

## Failure Behavior

- Missing manifest entries: logs an error to console.
- Missing/unreadable audio files: logs an error to console.
- Audio failures do **not** crash or abort gameplay.
