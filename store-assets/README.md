# Store Assets — organized by upload target

Drop finished screenshots/graphics into the folder matching the device slot in
App Store Connect. Folder names follow Apple's device slots exactly.

```
store-assets/
├── app-icon/
│   └── icon-1024x1024.png      → App Store icon (1024×1024, no alpha) — all devices
├── iphone-duo/
│   ├── iphone-6.7-inch-1290x2796/  → iPhone 6.7" Display slot (required)
│   │                                 PNG or JPEG, 1290×2796 px
│   └── iphone-6.5-inch-1242x2688/  → iPhone 6.5" Display slot (required)
│                                     PNG or JPEG, 1242×2688 px
└── apple-watch/
    └── screenshots/                → Apple Watch screenshots slot
                                      PNG or JPEG — confirm current accepted
                                      sizes in App Store Connect (they vary by
                                      watch case size)
```

Notes:

- `frontend/assets/` is left untouched — `@capacitor/assets` (`npm run mobile:assets`)
  reads fixed filenames from it to regenerate native icons/splash screens.
- The app icon in `app-icon/` is a copy of `frontend/assets/icon-only.png`.
- Splash screens are in-app only; App Store Connect does not use them.
- Max 10 screenshots per device slot; first image is the one users see in search.
