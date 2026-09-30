plugins {
    id("com.android.application")
}

android {
    namespace = "es.funglass.bugsurvivors"
    compileSdk = 35

    defaultConfig {
        applicationId = "es.funglass.bugsurvivors"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // The game itself is the web build (node build-kits.mjs bug-survivors), packed as-is: dist/ is the assets root.
    sourceSets["main"].assets.srcDirs("../../bug-survivors/dist")

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so a release build installs for testing; swap in a real key to publish.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Fail early (and clearly) when the web build is missing, rather than shipping an empty app.
tasks.named("preBuild") {
    doFirst {
        val index = file("../../bug-survivors/dist/index.html")
        if (!index.exists()) throw GradleException("No web build: run `node build-kits.mjs bug-survivors` in the repo root first")
    }
}
