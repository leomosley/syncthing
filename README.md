# syncthing

Sync a directory using GitHub as file storage and git for change detection.

## Commands

- `syncthing init` — set up a new directory to sync
- `syncthing sync [name]` — sync now (used by the scheduler); omit name to sync all
- `syncthing list` — list configured directories
- `syncthing status` — show live git state for each directory
- `syncthing remove [name]` — stop syncing a directory (files are kept)
- `syncthing service repair` — re-register all scheduled tasks
- `syncthing service uninstall` — remove all scheduled tasks
