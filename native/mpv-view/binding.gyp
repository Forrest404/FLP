{
  "targets": [
    {
      "target_name": "mpv_view",
      "sources": ["src/addon.mm"],
      "include_dirs": [
        "<!(node -p \"require('node-addon-api').include_dir\")",
        "/opt/homebrew/include"
      ],
      "defines": ["NAPI_VERSION=8", "NAPI_DISABLE_CPP_EXCEPTIONS", "GL_SILENCE_DEPRECATION"],
      "libraries": ["-L/opt/homebrew/lib", "-lmpv", "-Wl,-rpath,/opt/homebrew/lib"],
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
        "MACOSX_DEPLOYMENT_TARGET": "12.0",
        "OTHER_LDFLAGS": ["-framework Cocoa", "-framework OpenGL", "-framework QuartzCore"]
      }
    }
  ]
}
