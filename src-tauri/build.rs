const WINDOWS_TEST_MANIFEST_ENV: &str = "CINETRACK_WINDOWS_TEST_MANIFEST";

fn main() {
    tauri_build::build();
    println!("cargo:rerun-if-env-changed={WINDOWS_TEST_MANIFEST_ENV}");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
        && std::env::var_os(WINDOWS_TEST_MANIFEST_ENV).is_some()
    {
        embed_manifest_for_windows_tests();
    }
}

fn embed_manifest_for_windows_tests() {
    let manifest = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR must be available from Cargo"),
    )
    .join("windows-app-manifest.xml");

    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
