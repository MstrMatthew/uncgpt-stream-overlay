# Changelog
All notable changes to this project are documented here.

## [silver-20250928-1943] - 2025-09-28
### Added
- 5s staged -> queued moderation hold
- Admin "force" flow
- Overlay sequencing fix (ask -> short gap -> answer)

### Fixed
- StreamElements 30s disconnect (pong '3' to ping '2')
- EventSub reconnect with re-bound handlers
- Debounced queue persistence & boot restore

### Notes
- Tag marked as the new "silver" baseline.
- Overlay copy reflects $3 = HYPE, audio gate for Chrome/Safari, auto-clear ~60s.
