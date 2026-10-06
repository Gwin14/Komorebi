//! Compare the user-supplied HEIC samples and generate a PS3 candidate without
//! re-encoding their primary image. Usage: <styles2> <working-ps3> <output>.
use std::{
    ffi::{CStr, CString},
    fs,
};
use xdremux_core::{isobmff, semantic_mattes, styles_bplist, texture_styles};
fn payload(data: &[u8], meta: &isobmff::ParsedMeta, id: u32) -> Vec<u8> {
    let loc = meta.iloc_entries.iter().find(|e| e.item_id == id).unwrap();
    let base = if loc.construction_method == 1 {
        let top = isobmff::parse_boxes(data, 0, data.len());
        let m = top.iter().find(|b| b.btype == *b"meta").unwrap();
        isobmff::parse_boxes(data, m.data_start + 4, m.data_end)
            .iter()
            .find(|b| b.btype == *b"idat")
            .unwrap()
            .data_start
    } else {
        0
    };
    loc.extents
        .iter()
        .flat_map(|(off, len)| {
            data[base + *off as usize..base + (*off + *len) as usize]
                .iter()
                .copied()
        })
        .collect()
}
fn styles_id(meta: &isobmff::ParsedMeta) -> u32 {
    let uri = b"tag:apple.com,2023:photo:metadata:styles\0";
    meta.items
        .iter()
        .find(|i| i.raw_infe.windows(uri.len()).any(|w| w == uri))
        .unwrap()
        .item_id
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert!(
        (4..=5).contains(&args.len()),
        "pass styles2, working PS3, output, optional broken PS3"
    );
    let source = fs::read(&args[1]).unwrap();
    let reference = fs::read(&args[2]).unwrap();
    let original = isobmff::parse_source_meta(&source).unwrap();
    let native = isobmff::parse_source_meta(&reference).unwrap();
    assert!(!styles_bplist::has_texture_schema(&payload(
        &source,
        &original,
        styles_id(&original)
    )));
    assert!(styles_bplist::has_texture_schema(&payload(
        &reference,
        &native,
        styles_id(&native)
    )));
    assert!(semantic_mattes::verify_semantic_mattes(&reference));
    if args.len() == 5 {
        let broken = fs::read(&args[4]).unwrap();
        let metadata = isobmff::parse_source_meta(&broken).unwrap();
        assert!(!styles_bplist::has_texture_schema(&payload(
            &broken,
            &metadata,
            styles_id(&metadata)
        )));
        assert!(!semantic_mattes::verify_semantic_mattes(&broken));
    }
    let texture = texture_styles::texture_info_payload(70);
    let input = CString::new(args[1].as_str()).unwrap();
    let output = CString::new(args[3].as_str()).unwrap();
    let result = xdremux_core::xdremux_inject_texture_styles_metadata_result(
        input.as_ptr(),
        output.as_ptr(),
        texture.as_ptr(),
        texture.len(),
    );
    assert!(!result.is_null());
    let status = unsafe { CStr::from_ptr(result) }
        .to_str()
        .unwrap()
        .to_owned();
    xdremux_core::xdremux_free_string(result);
    assert!(status.contains("\"success\":true"), "{status}");
    let fixed = fs::read(&args[3]).unwrap();
    let updated = isobmff::parse_source_meta(&fixed).unwrap();
    assert!(styles_bplist::has_texture_schema(&payload(
        &fixed,
        &updated,
        styles_id(&updated)
    )));
    assert!(semantic_mattes::verify_semantic_mattes(&fixed));
    assert!(texture_styles::verify_texture_styles(&fixed, &texture));
    for item in &original.items {
        if item.item_id != styles_id(&original) {
            assert_eq!(
                payload(&source, &original, item.item_id),
                payload(&fixed, &updated, item.item_id),
                "item {} changed",
                item.item_id
            );
        }
    }
    for r in &original.refs {
        assert!(updated
            .refs
            .iter()
            .any(|n| n.from == r.from && n.to == r.to && n.rtype == r.rtype));
    }
    for p in &original.props {
        assert!(updated
            .props
            .iter()
            .any(|n| n.index == p.index && n.raw == p.raw));
    }
    fs::write(
        format!("{}.styles.plist", args[3]),
        payload(&fixed, &updated, styles_id(&updated)),
    )
    .unwrap();
    println!("PS2 unchanged; PS3 schema 16 + texture + 12 auxiliary/XMP pairs match working reference. All original image, HDR, EXIF, XMP payloads and references preserved. Output: {}",args[3]);
}
