fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    if target_os == "ios" {
        // Komorebi supplies a public VideoToolbox encoder through a C ABI.
        // Keep the upstream subprocess/x265 implementation out of the binary.
        println!("cargo:rustc-cfg=xdremux_ffmpeg_fallback");
        println!("cargo:rustc-cfg=komorebi_videotoolbox");
        println!("cargo:rustc-link-lib=framework=VideoToolbox");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=CoreVideo");
    } else {
        println!("cargo:rustc-cfg=xdremux_ffmpeg_fallback");
    }
}
