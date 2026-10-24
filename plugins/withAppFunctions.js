const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require("@expo/config-plugins");

const appFunctionAssets = path.join(__dirname, "appfunctions");
const appFunctionService = "app.tinkerbox.kanakku.KanakkuAppFunctionServiceImpl";

module.exports = function withAppFunctions(config) {
  config = withProjectBuildGradle(config, (mod) => {
    const marker = "com.google.devtools.ksp:symbol-processing-gradle-plugin";
    if (!mod.modResults.contents.includes(marker)) {
      const dependenciesIndex = mod.modResults.contents.indexOf("dependencies {");
      if (dependenciesIndex < 0) {
        throw new Error("Kanakku AppFunctions needs a root buildscript dependencies block.");
      }
      const insertionPoint = dependenciesIndex + "dependencies {".length;
      mod.modResults.contents =
        mod.modResults.contents.slice(0, insertionPoint) +
        "\n    classpath('com.google.devtools.ksp:symbol-processing-gradle-plugin:2.2.10-2.0.2')" +
        mod.modResults.contents.slice(insertionPoint);
    }
    return mod;
  });

  config = withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (!gradle.includes('apply plugin: "com.google.devtools.ksp"')) {
      gradle = gradle.replace(
        'apply plugin: "org.jetbrains.kotlin.android"',
        'apply plugin: "org.jetbrains.kotlin.android"\napply plugin: "com.google.devtools.ksp"',
      );
    }
    if (!gradle.includes("androidx.appfunctions:appfunctions:1.0.0-alpha13")) {
      gradle = gradle.replace(
        "dependencies {",
        'dependencies {\n    implementation "androidx.appfunctions:appfunctions:1.0.0-alpha13"\n    ksp "androidx.appfunctions:appfunctions-compiler:1.0.0-alpha13"',
      );
    }
    mod.modResults.contents = gradle;
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error("Kanakku AppFunctions needs an application manifest.");
    application.property ??= [];
    if (!application.property.some((item) => item.$?.["android:name"] === "android.app.appfunctions.app_metadata")) {
      application.property.push({
        $: {
          "android:name": "android.app.appfunctions.app_metadata",
          "android:resource": "@xml/app_metadata",
        },
      });
    }
    application.service ??= [];
    if (!application.service.some((item) => item.$?.["android:name"] === ".KanakkuAppFunctionServiceImpl")) {
      application.service.push({
        $: {
          "android:name": ".KanakkuAppFunctionServiceImpl",
          "android:permission": "android.permission.BIND_APP_FUNCTION_SERVICE",
          "android:exported": "true",
          "tools:targetApi": "36",
        },
        property: [
          {
            $: {
              "android:name": "android.app.appfunctions.schema",
              "android:value": "app_functions_schema.xsd",
            },
          },
          {
            $: {
              "android:name": "android.app.appfunctions.v2",
              "android:value": "kanakku_app_functions.xml",
            },
          },
        ],
        "intent-filter": [
          { action: [{ $: { "android:name": "android.app.appfunctions.AppFunctionService" } }] },
        ],
      });
    }
    return mod;
  });

  config = withDangerousMod(config, ["android", async (mod) => {
    const projectRoot = mod.modRequest.platformProjectRoot;
    const kotlinDir = path.join(projectRoot, "app/src/main/java/app/tinkerbox/kanakku");
    const xmlDir = path.join(projectRoot, "app/src/main/res/xml");
    fs.mkdirSync(kotlinDir, { recursive: true });
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.copyFileSync(path.join(appFunctionAssets, "KanakkuAppFunctionService.kt"), path.join(kotlinDir, "KanakkuAppFunctionService.kt"));
    fs.copyFileSync(path.join(appFunctionAssets, "app_metadata.xml"), path.join(xmlDir, "app_metadata.xml"));
    return mod;
  }]);

  return config;
};
