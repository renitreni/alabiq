# ---------------------------------------------------------------------
# R8 rules for the Capacitor shell.
#
# Capacitor never calls its plugins directly: the bridge scans for the
# @CapacitorPlugin annotation and invokes @PluginMethod members reflectively
# from JavaScript. R8 sees no caller for any of it and, left alone, strips or
# renames the lot — the app then launches to a white screen with no Java
# stack trace, because nothing actually threw on the native side.
#
# Anything reachable only from JavaScript has to be named here.
# ---------------------------------------------------------------------

# Annotations drive the plugin lookup, so they must survive minification.
-keepattributes *Annotation*

# Keep line numbers in release stack traces. Without SourceFile the traces
# Play Console shows are unreadable; renamesourcefileattribute hides the
# original filenames while keeping the numbers useful.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# The bridge itself and every plugin the bridge resolves by reflection.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}

# @capacitor/geolocation, and any plugin added later, land in these packages.
-keep class com.capacitorjs.plugins.** { *; }

# Cordova plugins bridged in through capacitor-cordova-android-plugins.
-keep class org.apache.cordova.** { *; }

# Anything the WebView calls straight into.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor parses plugin call payloads with these; both use reflection.
-keep class org.json.** { *; }
-dontwarn com.getcapacitor.**
